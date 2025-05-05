const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  biography: {
    type: String,
    default: ''
  },
  avatar: {
    type: String,
    default: '/images/default-avatar.png'
  },
  preferredLanguage: {
    type: String,
    default: 'en', // Default to English
    trim: true
  },
  // User roles
  roles: {
    isDeveloper: {
      type: Boolean,
      default: false
    },
    isAdmin: {
      type: Boolean,
      default: false
    }
  },
  // Games developed by this user
  developedGames: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  }],
  totalPlayTime: {
    type: Number,
    default: 0
  },
  totalPlayTimeSeconds: {
    type: Number,
    default: 0
  },
  // Average of all ratings given by this user
  avgRatings: {
    type: Number,
    default: 0
  },
  // Reference to the most played game
  mostPlayedGame: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  },
  // Games played by the user with playtime and rating
  gameStats: [
    {
      game: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game'
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

// Method to get user's comments with game details
UserSchema.methods.getComments = async function() {
  await this.populate({
    path: 'gameStats.game',
    select: 'name photo _id'
  });

  return this.gameStats
    .filter(stat => {
      // Use single source of truth for play time
      const totalSeconds = stat.playTimeSeconds || (stat.playTime * 3600);
      return stat.comment && totalSeconds >= 10; // 10 seconds
    })
    .map(stat => ({
      // Structure that matches the template's expectations
      game: {
        _id: stat.game._id,
        name: stat.game.name,
        photo: stat.game.photo
      },
      comment: stat.comment,
      playTime: 0, // Set to zero to avoid double counting
      playTimeSeconds: stat.playTimeSeconds || (stat.playTime * 3600) // Single source of truth
    }));
};

// Method to update the user's most played game
UserSchema.methods.updateMostPlayedGame = function() {
  if (this.gameStats.length === 0) {
    this.mostPlayedGame = null;
    return null;
  }

  // Find the game with the highest play time using just one source of truth for seconds
  let maxPlayTimeGameStat = this.gameStats.reduce((max, stat) => {
    // Use playTimeSeconds if available, or convert playTime to seconds if not
    const currentStatTotalSeconds = stat.playTimeSeconds || (stat.playTime * 3600);
    const maxStatTotalSeconds = max.playTimeSeconds || (max.playTime * 3600);
    
    return currentStatTotalSeconds > maxStatTotalSeconds ? stat : max;
  }, this.gameStats[0]);

  this.mostPlayedGame = maxPlayTimeGameStat.game;
  return this.mostPlayedGame;
};

// Static method to update most played game by user ID
UserSchema.statics.updateMostPlayedGameById = async function(userId) {
  const User = mongoose.model('User');
  
  // First get all user data
  const user = await User.findById(userId);
  if (!user || user.gameStats.length === 0) {
    return null;
  }
  
  // Find the game with the highest play time using a single source of truth
  let maxPlayTimeGameId = null;
  let maxTotalSeconds = 0;
  
  for (const stat of user.gameStats) {
    // Use playTimeSeconds if available, otherwise convert playTime to seconds
    const currentStatTotalSeconds = stat.playTimeSeconds || (stat.playTime * 3600);
    
    if (currentStatTotalSeconds > maxTotalSeconds) {
      maxTotalSeconds = currentStatTotalSeconds;
      maxPlayTimeGameId = stat.game;
    }
  }
  
  // Update the user document directly in the database
  await User.updateOne(
    { _id: userId },
    { $set: { mostPlayedGame: maxPlayTimeGameId } }
  );
  
  return maxPlayTimeGameId;
};

// Method to calculate average rating given by the user
UserSchema.methods.calculateAvgRating = function() {
  const ratedGames = this.gameStats.filter(stat => stat.rating != null);
  
  if (ratedGames.length === 0) {
    this.avgRatings = 0;
    return 0;
  }

  const totalRating = ratedGames.reduce((sum, stat) => sum + stat.rating, 0);
  this.avgRatings = totalRating / ratedGames.length;
  return this.avgRatings;
};

// Format total play time to human-readable format
UserSchema.methods.getFormattedPlayTime = function() {
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

// Static method to recalculate total play time from all game stats
UserSchema.statics.recalculateTotalPlayTime = async function(userId) {
  const User = mongoose.model('User');
  
  // Get user with all game stats
  const user = await User.findById(userId);
  if (!user) return null;
  
  // Calculate total seconds from all game stats
  let totalSeconds = 0;
  for (const stat of user.gameStats) {
    // Important: Don't multiply playTime by 3600 if playTimeSeconds already includes the total seconds
    // Add only the playTimeSeconds field (which should already be the total)
    // OR fall back to converting playTime from hours to seconds if playTimeSeconds doesn't exist
    totalSeconds += stat.playTimeSeconds || (stat.playTime * 3600);
  }
  
  // Convert to hours for the legacy totalPlayTime field
  const hours = Math.floor(totalSeconds / 3600);
  
  // Update the user document directly in the database
  await User.updateOne(
    { _id: userId },
    { 
      $set: { 
        totalPlayTime: hours,
        totalPlayTimeSeconds: totalSeconds 
      }
    }
  );
  
  return { totalPlayTime: hours, totalPlayTimeSeconds: totalSeconds };
};

// Method to check if user is a developer of a specific game
UserSchema.methods.isDeveloperOf = function(gameId) {
  return this.developedGames.some(game => game.toString() === gameId.toString());
};

// Method to add a game to user's developed games list and update developer status
UserSchema.methods.addDevelopedGame = async function(gameId) {
  // Check if the game is already in the user's developed games
  if (!this.developedGames.some(game => game.toString() === gameId.toString())) {
    this.developedGames.push(gameId);
  }
  
  // Set developer role to true
  this.roles.isDeveloper = true;
  
  await this.save();
  return this;
};

// Method to remove a game from user's developed games list
UserSchema.methods.removeDevelopedGame = async function(gameId) {
  this.developedGames = this.developedGames.filter(game => game.toString() !== gameId.toString());
  
  // If no more developed games, remove developer role
  if (this.developedGames.length === 0) {
    this.roles.isDeveloper = false;
  }
  
  await this.save();
  return this;
};

const User = mongoose.model('User', UserSchema);

module.exports = User;