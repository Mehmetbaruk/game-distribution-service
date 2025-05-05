const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GameSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  genres: {
    type: [String],
    required: true,
    validate: [
      {
        validator: function(genres) {
          return genres.length > 0 && genres.length <= 5;
        },
        message: 'Game must have between 1-5 genres'
      }
    ]
  },
  photo: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: 'No description available.'
  },
  developer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  totalPlayTime: {
    type: Number,
    default: 0
  },
  totalPlayTimeSeconds: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  ratingDisabled: {
    type: Boolean,
    default: false
  },
  commentDisabled: {
    type: Boolean,
    default: false
  },
  // Optional fields - can store any type of data
  optional1: {
    type: Schema.Types.Mixed,
    default: null
  },
  optional2: {
    type: Schema.Types.Mixed,
    default: null
  },
  // User play times and ratings for this game
  userStats: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      playTime: {
        type: Number,
        default: 0
      },
      playTimeSeconds: {
        type: Number,
        default: 0
      },
      lastPlayedAt: {
        type: Date,
        default: Date.now
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
      },
      comment: {
        type: String,
        default: null
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Method to get all comments for the game, sorted by play time
GameSchema.methods.getAllComments = async function() {
  const Game = mongoose.model('Game');
  const populatedGame = await Game.findById(this._id)
    .populate({
      path: 'userStats.user',
      select: 'name'
    });

  // Only include comments from users with at least 10 seconds of play time
  return populatedGame.userStats
    .filter(stat => {
      // Use playTimeSeconds if available, otherwise convert playTime to seconds
      const totalSeconds = stat.playTimeSeconds || (stat.playTime * 3600);
      return stat.comment && totalSeconds >= 10; // 10 seconds
    })
    .sort((a, b) => {
      // Sort by total seconds (highest first)
      const aTotalSeconds = a.playTimeSeconds || (a.playTime * 3600);
      const bTotalSeconds = b.playTimeSeconds || (b.playTime * 3600);
      return bTotalSeconds - aTotalSeconds;
    })
    .map(stat => ({
      user: stat.user,
      comment: stat.comment,
      playTime: 0, // Set traditional hours to 0
      playTimeSeconds: stat.playTimeSeconds || (stat.playTime * 3600), // Use one source of truth
      game: {
        _id: this._id,
        name: this.name,
        photo: this.photo
      }
    }));
};

// Method to calculate weighted average rating
GameSchema.methods.calculateRating = function() {
  // Get only valid ratings (from users that still exist in the database)
  // A valid user has a proper user object, not just an ID
  const validUserStats = this.userStats.filter(stat => 
    stat.rating && Number(stat.rating) >= 1 && Number(stat.rating) <= 5 &&
    stat.user && (
      (typeof stat.user === 'object' && stat.user.name) || 
      (typeof stat.user === 'string' || stat.user instanceof mongoose.Types.ObjectId)
    )
  );
  
  // Extract valid ratings
  if (validUserStats.length === 0) {
    this.rating = 0;
    return 0;
  }

  // Calculate correct average rating from valid user ratings
  // Sum all ratings and divide by the number of ratings
  let totalRating = 0;
  let ratingCount = 0;
  
  validUserStats.forEach(stat => {
    const ratingValue = Number(stat.rating);
    if (!isNaN(ratingValue) && ratingValue >= 1 && ratingValue <= 5) {
      totalRating += ratingValue;
      ratingCount++;
    }
  });
  
  if (ratingCount === 0) {
    this.rating = 0;
    return 0;
  }
  
  const averageRating = totalRating / ratingCount;
  // Round to 2 decimal places for precision
  this.rating = Math.round(averageRating * 100) / 100;
  
  console.log(`[Rating Calculation] Raw average: ${averageRating}, Rounded: ${this.rating}, From ${ratingCount} ratings, Total: ${totalRating}`);
  
  return this.rating;
};

// Method to calculate weighted average rating - fallback method when user objects aren't populated
GameSchema.methods.calculateRatingFromIds = function() {
  // Use a Map to keep track of the latest rating from each user
  const userRatingsMap = new Map();
  
  // Iterate through all stats with ratings
  this.userStats.filter(stat => {
    // A valid rating is any number between 1-5
    return stat.rating && Number(stat.rating) >= 1 && Number(stat.rating) <= 5;
  })
  .forEach(stat => {
    // For each user, store only their latest rating (overwrite previous entries)
    if (stat.user) {
      userRatingsMap.set(stat.user.toString(), Number(stat.rating));
    }
  });
  
  // Extract the unique ratings
  const uniqueRatings = Array.from(userRatingsMap.values());
  
  if (uniqueRatings.length === 0) {
    this.rating = 0;
    return 0;
  }

  // Calculate simple average rating from unique user ratings
  const totalRating = uniqueRatings.reduce((sum, rating) => sum + rating, 0);
  const averageRating = totalRating / uniqueRatings.length;
  
  // Round to 2 decimal places for precision
  this.rating = Math.round(averageRating * 100) / 100;
  
  console.log(`[Rating Calculation (IDs)] Raw average: ${averageRating}, Rounded: ${this.rating}, From ${uniqueRatings.length} unique ratings, Total: ${totalRating}`);
  
  return this.rating;
};

// Method to calculate rating and save to database
GameSchema.methods.calculateAndSaveRating = async function() {
  // Try to use the main calculation method first (requires populated user objects)
  if (this.userStats.length > 0 && this.userStats[0].user && typeof this.userStats[0].user === 'object') {
    this.calculateRating();
  } else {
    // Fallback to ID-based calculation if users aren't populated
    this.calculateRatingFromIds();
  }
  
  await this.save();
  return this.rating;
};

// Format total play time to human-readable format
GameSchema.methods.getFormattedPlayTime = function() {
  const totalSeconds = this.totalPlayTimeSeconds || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

// Remove a user from this game's stats
GameSchema.methods.removeUser = function(userId) {
  const userStatIndex = this.userStats.findIndex(stat => stat.user.toString() === userId.toString());
  
  if (userStatIndex !== -1) {
    // Get the user's play time and other stats before removing
    const userStat = this.userStats[userStatIndex];
    const playTime = userStat.playTime || 0;
    const playTimeSeconds = userStat.playTimeSeconds || (playTime * 3600);
    
    // Remove the user stats
    this.userStats.splice(userStatIndex, 1);
    
    // Update the total play time (both legacy and seconds)
    this.totalPlayTime = Math.max(0, this.totalPlayTime - playTime);
    this.totalPlayTimeSeconds = Math.max(0, this.totalPlayTimeSeconds - playTimeSeconds);
    
    // Recalculate the game rating
    this.calculateRating();
    
    return true;
  }
  
  return false;
};

// Static method to recalculate total play time from all user stats
GameSchema.statics.recalculateTotalPlayTime = async function(gameId) {
  const Game = mongoose.model('Game');
  
  // Get game with all user stats and populate users to filter out deleted users
  const game = await Game.findById(gameId).populate('userStats.user', 'name');
  if (!game) return null;
  
  // Calculate total seconds from valid user stats only
  let totalSeconds = 0;
  
  // Only include stats from users that still exist in the database
  for (const stat of game.userStats) {
    // Skip if user doesn't exist anymore
    if (!stat.user || typeof stat.user !== 'object' || !stat.user.name) {
      continue;
    }
    
    // Use playTimeSeconds if available, or convert playTime to seconds if not
    totalSeconds += stat.playTimeSeconds || (stat.playTime * 3600);
  }
  
  // Convert to hours for the legacy totalPlayTime field
  const hours = totalSeconds / 3600;
  
  // Update both time fields
  game.totalPlayTimeSeconds = totalSeconds;
  game.totalPlayTime = Number(hours.toFixed(2)); // More precise hours value
  
  // Save the changes directly to the game object
  await game.save();
  
  // Also update the database directly for safety
  await Game.updateOne(
    { _id: gameId },
    { 
      $set: { 
        totalPlayTime: game.totalPlayTime,
        totalPlayTimeSeconds: totalSeconds 
      }
    }
  );
  
  return { 
    totalPlayTime: game.totalPlayTime, 
    totalPlayTimeSeconds: totalSeconds,
    formattedPlayTime: game.getFormattedPlayTime() 
  };
};

// Method to check if user is the developer of this game
GameSchema.methods.isDevelopedBy = function(userId) {
  return this.developer && this.developer.toString() === userId.toString();
};

// Set a user as this game's developer
GameSchema.methods.setDeveloper = async function(userId) {
  const User = mongoose.model('User');
  
  // Find the user
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // If game already has a different developer, remove it from their developed games
  if (this.developer && this.developer.toString() !== userId.toString()) {
    const previousDeveloper = await User.findById(this.developer);
    if (previousDeveloper) {
      await previousDeveloper.removeDevelopedGame(this._id);
    }
  }
  
  // Set this user as the developer
  this.developer = userId;
  await this.save();
  
  // Add this game to user's developed games
  await user.addDevelopedGame(this._id);
  
  return this;
};

// Method to clean up and consolidate duplicate user entries in userStats
GameSchema.methods.consolidateUserStats = async function() {
  // Use a Map to keep track of the latest entry for each user
  const latestUserStatsMap = new Map();
  
  // Sort userStats by lastPlayedAt date (descending) to get the most recent first
  const sortedStats = [...this.userStats].sort((a, b) => {
    const dateA = a.lastPlayedAt ? new Date(a.lastPlayedAt) : new Date(0);
    const dateB = b.lastPlayedAt ? new Date(b.lastPlayedAt) : new Date(0);
    return dateB - dateA; // Most recent first
  });
  
  // For each user, keep only their most recent entry
  for (const stat of sortedStats) {
    // Skip entries without valid user references
    if (!stat.user) continue;
    
    const userId = stat.user.toString();
    
    // If we haven't seen this user yet, keep this entry
    if (!latestUserStatsMap.has(userId)) {
      latestUserStatsMap.set(userId, stat);
    }
  }
  
  // Replace the userStats array with the consolidated entries
  this.userStats = Array.from(latestUserStatsMap.values());
  
  // Recalculate rating with consolidated stats
  if (this.userStats.length > 0 && this.userStats[0].user && typeof this.userStats[0].user === 'object') {
    this.calculateRating();
  } else {
    this.calculateRatingFromIds();
  }
  
  // Save the changes
  await this.save();
  
  return this.userStats.length;
};

const Game = mongoose.model('Game', GameSchema);

module.exports = Game;