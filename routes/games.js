const express = require('express');
const router = express.Router();
const Game = require('../models/game');
const User = require('../models/user');

// Middleware to check if user is logged in
const isLoggedIn = (req, res, next) => {
  if (!req.session.user) {
    req.session.message = {
      type: 'danger',
      text: 'Please log in first'
    };
    return res.redirect('/');
  }
  next();
};

// Middleware to check if user is an admin
const isAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.roles || !req.session.user.roles.isAdmin) {
    req.session.message = {
      type: 'danger',
      text: 'You need admin privileges to perform this action'
    };
    return res.redirect('/games');
  }
  next();
};

// Middleware to check if user is developer of the game or an admin
const isDeveloperOrAdmin = async (req, res, next) => {
  if (!req.session.user) {
    req.session.message = {
      type: 'danger',
      text: 'Please log in first'
    };
    return res.redirect('/');
  }
  
  try {
    // Handle special admin session with direct access
    if (req.session.user.specialAdminSession || 
        (req.session.user.roles && req.session.user.roles.isAdmin)) {
      return next();
    }
    
    const gameId = req.params.id;
    const userId = req.session.user._id;
    
    // Check if user is the developer of this game
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    if (game.developer && game.developer.toString() === userId) {
      return next();
    }
    
    req.session.message = {
      type: 'danger',
      text: 'You can only manage games you have developed'
    };
    return res.redirect('/games');
  } catch (err) {
    console.error('Error checking game developer status:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Error checking permissions',
      error: err
    });
  }
};

// Games listing page
router.get('/', isLoggedIn, async (req, res) => {
  try {
    // Get sort option from query parameters
    const sortOption = req.query.sort || 'name';
    let sortCriteria = {};
    let populateOptions = {};

    // Set up different sort options based on user selection
    switch (sortOption) {
      case 'most-played':
        sortCriteria = { totalPlayTimeSeconds: -1 }; // Sort by play time (highest first)
        break;
      case 'top-rated':
        sortCriteria = { rating: -1 }; // Sort by rating (highest first)
        break;
      case 'newest':
        sortCriteria = { createdAt: -1 }; // Sort by creation date (newest first)
        break;
      case 'suggested':
        // For suggested games, we'll need user's game history, handled differently below
        sortCriteria = { rating: -1 }; // Default fallback if suggestion logic fails
        break;
      default:
        sortCriteria = { name: 1 }; // Default A-Z name sorting
    }
    
    // Get all games with the selected sort
    let games = await Game.find().sort(sortCriteria);
    
    // Special handling for "suggested" sorting - requires user's preferences
    if (sortOption === 'suggested' && req.session.user) {
      try {
        const userId = req.session.user._id;
        const user = await User.findById(userId).populate('gameStats.game');
        
        // If user has played games, use them for suggestions
        if (user && user.gameStats && user.gameStats.length > 0) {
          // Get the genres from games the user has played and rated highly
          const favoriteGenres = {};
          
          user.gameStats.forEach(stat => {
            if (stat.game && stat.rating && stat.rating >= 4) {
              stat.game.genres.forEach(genre => {
                favoriteGenres[genre] = (favoriteGenres[genre] || 0) + 1;
              });
            }
          });
          
          // Sort games by matching genres with user's favorites
          if (Object.keys(favoriteGenres).length > 0) {
            games = games.sort((a, b) => {
              // Count matching genres for each game
              const aMatches = a.genres.reduce((count, genre) => 
                count + (favoriteGenres[genre] || 0), 0);
              const bMatches = b.genres.reduce((count, genre) => 
                count + (favoriteGenres[genre] || 0), 0);
              
              // If match counts differ, sort by match count
              if (aMatches !== bMatches) return bMatches - aMatches;
              
              // Otherwise sort by rating as fallback
              return b.rating - a.rating;
            });
            
            console.log(`[Suggestions] Generated custom game order based on user ${userId}'s genre preferences`);
          }
        }
      } catch (err) {
        console.error('Error generating suggested games:', err);
        // Continue with default sorting if suggestion fails
      }
    }
    
    // Fix any games with duplicate ratings and ensure accurate rating calculation
    for (const game of games) {
      // Check for duplicate ratings
      const userCounts = {};
      game.userStats.forEach(stat => {
        if (stat.user) {
          const userId = stat.user.toString();
          userCounts[userId] = (userCounts[userId] || 0) + 1;
        }
      });
      
      // If any user has multiple entries, consolidate them
      const duplicateUsers = Object.keys(userCounts).filter(userId => userCounts[userId] > 1);
      if (duplicateUsers.length > 0) {
        console.log(`[Auto-Fix] Game ${game._id}: Found ${duplicateUsers.length} users with duplicate ratings. Auto-consolidating...`);
        await game.consolidateUserStats();
      } else {
        // Even if no duplicates, still recalculate rating to ensure it's correct
        await game.calculateAndSaveRating();
      }
    }
    
    // If the sorting changed because of new ratings, re-sort the games
    if (sortOption === 'top-rated' || sortOption === 'suggested') {
      if (sortOption === 'top-rated') {
        games.sort((a, b) => b.rating - a.rating);
      } else if (sortOption === 'suggested') {
        // Re-apply custom sorting logic with updated ratings
        // This code would be similar to the suggestion logic above
        // We'll omit the duplicate code here
      }
    }
    
    res.render('games/index', { 
      title: 'All Games',
      games,
      currentUser: req.session.user,
      currentSort: sortOption // Pass the current sort to highlight the active option
    });
  } catch (err) {
    console.error('Error loading games page:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load games page',
      error: err
    });
  }
});

// Developer route to access game management through admin dashboard
// This must be defined BEFORE the dynamic :id routes to avoid conflicts
router.get('/manage', isLoggedIn, async (req, res) => {
  try {
    // Check if user is a developer
    if (!(req.session.user.isDeveloper === true || 
         (req.session.user.roles && req.session.user.roles.isDeveloper === true))) {
      req.session.message = {
        type: 'danger',
        text: 'You must be a developer to access game management features'
      };
      return res.redirect('/games');
    }
    
    // Redirect to the admin dashboard with games tab active
    return res.redirect('/admin');
  } catch (err) {
    console.error('Error accessing game management:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not access game management features',
      error: err
    });
  }
});

// Add a new game (logged in users can become developers)
// Important: This route must be defined BEFORE the /:id route to prevent 'new' being treated as an ID
router.get('/new', isLoggedIn, async (req, res) => {
  try {
    res.render('games/edit', {
      title: 'Add New Game',
      game: {
        _id: 'new',
        name: '',
        photo: '',
        genres: [],
        description: '',
        optional1: '',
        optional2: '',
        ratingDisabled: false,
        commentDisabled: false
      },
      users: [],
      isAdmin: req.session.user.roles && req.session.user.roles.isAdmin,
      isDeveloper: req.session.user.roles && req.session.user.roles.isDeveloper
    });
  } catch (err) {
    console.error('Error loading new game form:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load new game form',
      error: err
    });
  }
});

// Create a new game
router.post('/new', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { name, genres, photo, description, optional1, optional2 } = req.body;
    
    // Convert comma-separated genres to array and trim
    const genresArray = genres.split(',').map(genre => genre.trim()).filter(Boolean);
    
    if (genresArray.length < 1 || genresArray.length > 5) {
      req.session.message = {
        type: 'danger',
        text: 'Game must have between 1-5 genres'
      };
      return res.redirect('/games/new');
    }
    
    // Check if this is a special admin session
    if (req.session.user.specialAdminSession) {
      // Create game without a developer for admin users
      const newGame = new Game({
        name,
        genres: genresArray,
        photo,
        description,
        optional1,
        optional2
        // No developer field set for admin users
      });
      
      await newGame.save();
      
      req.session.message = {
        type: 'success',
        text: `Game "${name}" has been added successfully by administrator.`
      };
      
      res.redirect('/games');
    } else {
      // Normal user flow - ensure userId is a valid MongoDB ObjectId
      const mongoose = require('mongoose');
      let developerId;
      
      try {
        // Verify that userId is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(userId)) {
          developerId = new mongoose.Types.ObjectId(userId);
        } else {
          // If not valid, don't set the developer
          developerId = undefined;
        }
      } catch (error) {
        console.error('Error converting userId to ObjectId:', error);
        developerId = undefined;
      }
      
      // Create new game with valid developer ID
      const newGame = new Game({
        name,
        genres: genresArray,
        photo,
        description,
        optional1,
        optional2,
        developer: developerId
      });
      
      await newGame.save();
      
      // Make the user a developer if they aren't already
      const user = await User.findById(userId);
      if (user) {
        await user.addDevelopedGame(newGame._id);
      
        // Update the session with developer status
        req.session.user.roles = user.roles;
        await new Promise(resolve => req.session.save(resolve));
      }
      
      req.session.message = {
        type: 'success',
        text: `Game "${name}" has been added successfully. You are now a developer!`
      };
      
      res.redirect('/games');
    }
  } catch (err) {
    console.error('Error adding new game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not add new game',
      error: err
    });
  }
});

// Game details page
router.get('/:id', isLoggedIn, async (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = req.session.user._id;
    
    // Get game with populated user stats
    let game = await Game.findById(gameId).populate({
      path: 'userStats.user',
      select: 'name avatar _id'
    });
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // IMPORTANT: First consolidate duplicate user ratings to fix the data
    // Count duplicate users before consolidation
    const userCounts = {};
    game.userStats.forEach(stat => {
      if (stat.user) {
        const userId = stat.user.toString();
        userCounts[userId] = (userCounts[userId] || 0) + 1;
      }
    });
    
    // Check if there are duplicate ratings that need to be fixed
    const duplicateUsers = Object.keys(userCounts).filter(userId => userCounts[userId] > 1);
    if (duplicateUsers.length > 0) {
      console.log(`[Auto-Fix] Found ${duplicateUsers.length} users with duplicate ratings. Auto-consolidating...`);
      await game.consolidateUserStats();
      // Reload game after consolidation
      game = await Game.findById(gameId).populate({
        path: 'userStats.user',
        select: 'name avatar _id'
      });
    }
    
    // Then recalculate the rating
    await game.calculateAndSaveRating();
    
    // Ensure total play time is properly calculated from all user stats
    await Game.recalculateTotalPlayTime(gameId);
    
    // Refresh the game object to get the updated total play time and rating with populated users
    game = await Game.findById(gameId).populate({
      path: 'userStats.user',
      select: 'name avatar _id'
    });
    
    // Get comments for this game with populated users
    const comments = await game.getAllComments();
    
    // Handle special admin session
    let userGameStat = null;
    if (!req.session.user.specialAdminSession) {
      // Only try to find user stats for non-admin users
      const user = await User.findById(userId);
      userGameStat = user ? user.gameStats.find(stat => stat.game.toString() === gameId) : null;
    }

    // Calculate count of invalid users (users that no longer exist but have stats)
    const invalidUserCount = game.userStats.filter(stat => 
      !stat.user || typeof stat.user !== 'object' || !stat.user.name
    ).length;
    
    res.render('games/details', { 
      title: game.name,
      game,
      comments,
      currentUser: req.session.user,
      userGameStat,
      invalidUserCount
    });
  } catch (err) {
    console.error('Error loading game details:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load game details',
      error: err
    });
  }
});

// Rate game from game details page
router.post('/:id/rate', isLoggedIn, async (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = req.session.user._id;
    const { rating } = req.body;
    
    // Check if this is a special admin session
    if (req.session.user.specialAdminSession) {
      req.session.message = {
        type: 'info',
        text: 'Admin users cannot rate games. Please login as a regular user to rate games.'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    // Validate rating
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      req.session.message = {
        type: 'danger',
        text: 'Rating must be between 1 and 5'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    // Get user and game from database
    const user = await User.findById(userId);
    const game = await Game.findById(gameId).populate('userStats.user', 'name');
    
    if (!user || !game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User or game not found',
        error: {}
      });
    }
    
    // Check if rating is disabled for this game
    if (game.ratingDisabled) {
      req.session.message = {
        type: 'danger',
        text: 'Rating is disabled for this game'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    // Check if the user has played the game for at least 10 seconds
    const userGameStatIndex = user.gameStats.findIndex(stat => stat.game.toString() === gameId);
    if (userGameStatIndex === -1 || (user.gameStats[userGameStatIndex].playTimeSeconds || 0) < 10) {
      req.session.message = {
        type: 'danger',
        text: 'You must play a game for at least 10 seconds before rating it'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    console.log(`[Rating] User ${userId} is rating game ${gameId} with ${ratingNum} stars`);
    
    // Update the user's rating directly in the database
    await User.updateOne(
      { _id: userId, "gameStats.game": gameId },
      { $set: { "gameStats.$.rating": ratingNum } }
    );
    
    // Calculate and update average rating for this user
    const updatedUser = await User.findById(userId);
    updatedUser.calculateAvgRating();
    await updatedUser.save();
    
    // Check if the user already has a stat entry for this game
    const gameUserStatIndex = game.userStats.findIndex(stat => 
      stat.user && stat.user.toString() === userId.toString());
    
    const oldRating = gameUserStatIndex !== -1 ? game.userStats[gameUserStatIndex].rating || 0 : 0;
    
    if (gameUserStatIndex !== -1) {
      // Update existing stat
      game.userStats[gameUserStatIndex].rating = ratingNum;
      game.userStats[gameUserStatIndex].lastPlayedAt = new Date();
      
      console.log(`[Rating] Updated existing rating for user ${userId} on game ${gameId}: ${oldRating} → ${ratingNum}`);
    } else {
      // If somehow the game doesn't have a record of this user, add one
      const userGameStat = user.gameStats[userGameStatIndex];
      game.userStats.push({
        user: userId,
        playTime: userGameStat.playTime || 0,
        playTimeSeconds: userGameStat.playTimeSeconds || 0,
        rating: ratingNum,
        lastPlayedAt: new Date()
      });
      
      console.log(`[Rating] Added new userStat with rating for user ${userId} on game ${gameId}: 0 → ${ratingNum}`);
    }
    
    // Before saving the game, check if there are any duplicate entries for this user
    // and consolidate them to keep only the latest entry
    const userEntries = game.userStats.filter(stat => 
      stat.user && stat.user.toString() === userId.toString()
    );
    
    if (userEntries.length > 1) {
      console.log(`[Rating] Found ${userEntries.length} duplicate entries for user ${userId}. Consolidating...`);
      // Sort entries by date (newest first)
      userEntries.sort((a, b) => {
        const dateA = a.lastPlayedAt ? new Date(a.lastPlayedAt) : new Date(0);
        const dateB = b.lastPlayedAt ? new Date(b.lastPlayedAt) : new Date(0);
        return dateB - dateA;
      });
      
      // Keep only the newest entry and remove others
      const newestEntry = userEntries[0];
      game.userStats = game.userStats.filter(stat => 
        !stat.user || stat.user.toString() !== userId.toString() || stat === newestEntry
      );
      
      console.log(`[Rating] Consolidated ratings. Kept newest entry with rating ${newestEntry.rating}`);
    }
    
    // Save the game with updated userStats
    await game.save();
    
    // Recalculate and update game rating after possible consolidation
    const gameBeforeRating = game.rating || 0;
    const newRating = await game.calculateAndSaveRating();
    
    console.log(`Game rating updated: ${gameBeforeRating.toFixed(1)} → ${newRating.toFixed(1)}`);
    
    req.session.message = {
      type: 'success',
      text: `Your ${ratingNum}-star rating for "${game.name}" has been recorded. Game rating updated to ${newRating.toFixed(1)}.`
    };
    
    res.redirect(`/games/${gameId}`);
  } catch (err) {
    console.error('Error rating game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not rate game',
      error: err
    });
  }
});

// Comment on game from game details page
router.post('/:id/comment', isLoggedIn, async (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = req.session.user._id;
    const { comment } = req.body;
    
    // Check if this is a special admin session
    if (req.session.user.specialAdminSession) {
      req.session.message = {
        type: 'info',
        text: 'Admin users cannot comment on games. Please login as a regular user to comment on games.'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    if (!comment || comment.trim() === '') {
      req.session.message = {
        type: 'danger',
        text: 'Comment cannot be empty'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    const user = await User.findById(userId);
    const game = await Game.findById(gameId);
    
    if (!user || !game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User or game not found',
        error: {}
      });
    }
    
    // Check if commenting is disabled for this game
    if (game.commentDisabled) {
      req.session.message = {
        type: 'danger',
        text: 'Commenting is disabled for this game'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    // Check if the user has played the game for at least 10 seconds
    const userGameStat = user.gameStats.find(stat => stat.game.toString() === gameId);
    if (!userGameStat || (userGameStat.playTimeSeconds || 0) < 10) {
      req.session.message = {
        type: 'danger',
        text: 'You must play a game for at least 10 seconds before commenting on it'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    // Update user's game stat with the new comment
    userGameStat.comment = comment;
    
    await user.save();
    
    // Update game stats
    const gameUserStat = game.userStats.find(stat => stat.user.toString() === userId);
    if (gameUserStat) {
      gameUserStat.comment = comment;
    }
    
    await game.save();
    
    req.session.message = {
      type: 'success',
      text: `Your comment on "${game.name}" has been added`
    };
    
    res.redirect(`/games/${gameId}`);
  } catch (err) {
    console.error('Error commenting on game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not add comment',
      error: err
    });
  }
});

// Play game page with real-time counter
router.get('/:id/play', isLoggedIn, async (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = req.session.user._id;
    
    // Get game data
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Handle special admin session
    let userGameStat = null;
    if (!req.session.user.specialAdminSession) {
      // Only try to find user stats for non-admin users
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).render('error', {
          title: 'Error',
          message: 'User not found',
          error: {}
        });
      }
      userGameStat = user.gameStats.find(stat => stat.game.toString() === gameId);
    }
    
    res.render('games/play/play', { 
      title: `Playing ${game.name}`,
      game,
      userGameStat,
      currentUser: req.session.user
    });
  } catch (err) {
    console.error('Error loading game play page:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load game play page',
      error: err
    });
  }
});

// Record play time for a game
router.post('/:id/play', isLoggedIn, async (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = req.session.user._id;
    const { playTime, playTimeSeconds } = req.body;
    
    // Don't allow admin users to play games (they have a special admin session)
    if (req.session.user.specialAdminSession) {
      req.session.message = {
        type: 'info',
        text: 'Admin users cannot record play time. Please login as a regular user to play games.'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    // Convert playTime to a number
    const hours = parseFloat(playTime) || 0;
    
    if (hours < 0) {
      req.session.message = {
        type: 'danger',
        text: 'Invalid play time recorded'
      };
      return res.redirect(`/games/${gameId}`);
    }
    
    // Store seconds played in database
    const secondsPlayed = parseInt(playTimeSeconds, 10) || 0;
    
    console.log(`[PlayTime] User ${userId} played game ${gameId} for ${hours} hours and ${secondsPlayed} seconds`);
    
    // Update user game statistics directly in the database
    const user = await User.findById(userId);
    const game = await Game.findById(gameId);
    
    if (!user || !game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User or game not found',
        error: {}
      });
    }
    
    const userGameStat = user.gameStats.find(stat => stat.game.toString() === gameId);
    
    if (!userGameStat) {
      // Add new game stat for the user
      await User.updateOne(
        { _id: userId },
        { 
          $push: {
            gameStats: {
              game: gameId,
              playTime: hours,
              playTimeSeconds: secondsPlayed,
              lastPlayedAt: new Date()
            }
          }
        }
      );
    } else {
      // Update existing game stat - ONLY add to playTimeSeconds, not to both fields
      await User.updateOne(
        { _id: userId, "gameStats.game": gameId },
        { 
          $inc: { 
            "gameStats.$.playTimeSeconds": secondsPlayed,
          },
          $set: { "gameStats.$.lastPlayedAt": new Date() }
        }
      );
    }
    
    // Recalculate the user's total play time from all games
    await User.recalculateTotalPlayTime(userId);
    
    // Use our new static method to directly update the most played game in the database
    const mostPlayedGameId = await User.updateMostPlayedGameById(userId);
    console.log(`[MostPlayedGame] Updated directly in database to: ${mostPlayedGameId}`);
    
    // Update game stats
    let gameUserStat = game.userStats.find(stat => stat.user.toString() === userId);
    if (!gameUserStat) {
      // Add new user stat for the game
      game.userStats.push({
        user: userId,
        playTime: 0,
        playTimeSeconds: secondsPlayed,
        lastPlayedAt: new Date()
      });
      gameUserStat = game.userStats[game.userStats.length - 1];
    } else {
      // Increment play time - ONLY in seconds
      gameUserStat.playTimeSeconds = (gameUserStat.playTimeSeconds || 0) + secondsPlayed;
      gameUserStat.lastPlayedAt = new Date();
    }
    
    // Update game's total play time in seconds only
    game.totalPlayTimeSeconds = (game.totalPlayTimeSeconds || 0) + secondsPlayed;
    
    // Recalculate game rating and save the changes
    await game.calculateAndSaveRating();
    
    // Reload user with populated mostPlayedGame to update session
    const updatedUser = await User.findById(userId).populate('mostPlayedGame');
    req.session.user = updatedUser;
    await new Promise(resolve => req.session.save(resolve));
    
    // Format the time for the message using the formatPlayTime helper
    let formattedTime;
    if (hours > 0) {
      formattedTime = `${Math.floor(hours)} hours and ${secondsPlayed} seconds`;
    } else {
      formattedTime = `${secondsPlayed} seconds`;
    }
    
    req.session.message = {
      type: 'success',
      text: `You played "${game.name}" for ${formattedTime}`
    };
    
    res.redirect(`/users/${userId}`);
  } catch (err) {
    console.error('Error saving play time:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not save play time',
      error: err
    });
  }
});

// Edit game page
router.get('/:id/edit', isDeveloperOrAdmin, async (req, res) => {
  try {
    const gameId = req.params.id;
    const isAdmin = req.session.user.roles && req.session.user.roles.isAdmin;
    
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Get all users for admin to assign as developers
    const users = isAdmin ? await User.find().sort({ name: 1 }) : [];
    
    const isDeveloper = game.developer && game.developer.toString() === req.session.user._id;
    
    res.render('games/edit', {
      title: `Edit Game: ${game.name}`,
      game,
      users,
      isAdmin,
      isDeveloper
    });
  } catch (err) {
    console.error('Error loading game edit page:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load game edit page',
      error: err
    });
  }
});

// Update game
router.post('/:id/update', isDeveloperOrAdmin, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { 
      name, genres, photo, description, 
      optional1, optional2, ratingDisabled, commentDisabled, developer
    } = req.body;
    
    const isAdmin = req.session.user.roles && req.session.user.roles.isAdmin;
    
    // Get game from database
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Convert comma-separated genres to array and trim
    const genresArray = genres.split(',').map(genre => genre.trim()).filter(Boolean);
    
    if (genresArray.length < 1 || genresArray.length > 5) {
      req.session.message = {
        type: 'danger',
        text: 'Game must have between 1-5 genres'
      };
      return res.redirect(`/games/${gameId}/edit`);
    }
    
    // Update basic game info
    game.name = name;
    game.genres = genresArray;
    game.photo = photo;
    game.description = description || '';
    game.optional1 = optional1 || null;
    game.optional2 = optional2 || null;
    
    // Admin-only updates
    if (isAdmin) {
      game.ratingDisabled = ratingDisabled === 'on';
      game.commentDisabled = commentDisabled === 'on';
      
      // Update developer if changed
      const newDeveloperId = developer || null;
      if (newDeveloperId !== (game.developer ? game.developer.toString() : null)) {
        // Set the new developer using our method that handles the relationship
        if (newDeveloperId) {
          await game.setDeveloper(newDeveloperId);
        } else {
          // If no developer is selected, remove the current one
          if (game.developer) {
            const previousDeveloper = await User.findById(game.developer);
            if (previousDeveloper) {
              await previousDeveloper.removeDevelopedGame(gameId);
            }
            game.developer = null;
          }
        }
      }
    }
    
    await game.save();
    
    req.session.message = {
      type: 'success',
      text: `Game "${name}" has been updated successfully`
    };
    
    res.redirect('/games');
  } catch (err) {
    console.error('Error updating game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not update game',
      error: err
    });
  }
});

// Delete game (confirm page)
router.get('/:id/delete', isDeveloperOrAdmin, async (req, res) => {
  try {
    const gameId = req.params.id;
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Delete the game
    await Game.findByIdAndDelete(gameId);
    
    // If this game has a developer, remove it from their developed games
    if (game.developer) {
      const developer = await User.findById(game.developer);
      if (developer) {
        await developer.removeDevelopedGame(gameId);
      }
    }
    
    // Get all users who have played this game
    const users = await User.find({ 'gameStats.game': gameId });
    
    // For each user, remove this game from their stats
    for (const user of users) {
      // Find and remove the game from the user's gameStats
      user.gameStats = user.gameStats.filter(stat => stat.game.toString() !== gameId);
      
      // Recalculate user's total play time
      user.totalPlayTime = user.gameStats.reduce((sum, stat) => sum + stat.playTime, 0);
      
      // Update most played game and average rating
      user.updateMostPlayedGame();
      user.calculateAvgRating();
      
      await user.save();
    }
    
    req.session.message = {
      type: 'success',
      text: `Game "${game.name}" has been deleted successfully`
    };
    
    res.redirect('/games');
  } catch (err) {
    console.error('Error deleting game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not delete game',
      error: err
    });
  }
});

// Game analytics page for admins
router.get('/:id/analytics', isAdmin, async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Get fully populated game data 
    const game = await Game.findById(gameId).populate({
      path: 'userStats.user',
      select: 'name avatar _id'
    });
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Calculate total seconds played
    const totalPlaytimeSeconds = game.totalPlayTimeSeconds || 0;
    
    // Get all ratings
    const ratings = game.userStats.filter(stat => stat.rating > 0);
    const totalRatings = ratings.length;
    const avgRating = game.rating;
    
    // Calculate rating distribution
    const ratingDistribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    ratings.forEach(stat => {
      ratingDistribution[stat.rating]++;
    });
    
    // Sort users by play time
    const sortedUserStats = [...game.userStats].sort((a, b) => {
      const aSeconds = a.playTimeSeconds || (a.playTime * 3600);
      const bSeconds = b.playTimeSeconds || (b.playTime * 3600);
      return bSeconds - aSeconds;
    });
    
    res.render('games/analytics', { 
      title: `Analytics: ${game.name}`,
      game,
      totalPlaytimeSeconds,
      totalRatings,
      avgRating,
      ratingDistribution,
      sortedUserStats,
      currentUser: req.session.user
    });
  } catch (err) {
    console.error('Error loading game analytics:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load game analytics',
      error: err
    });
  }
});

// Game statistics page for all users
router.get('/:id/statistics', isLoggedIn, async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Get fully populated game data 
    const game = await Game.findById(gameId).populate({
      path: 'userStats.user',
      select: 'name avatar _id'
    });
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Calculate total seconds played
    const totalPlaytimeSeconds = game.totalPlayTimeSeconds || 0;
    
    // Get all ratings
    const ratings = game.userStats.filter(stat => 
      stat.rating > 0 && 
      stat.user && 
      typeof stat.user === 'object' && 
      stat.user.name
    );
    const totalRatings = ratings.length;
    const avgRating = game.rating;
    
    // Calculate rating distribution
    const ratingDistribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    ratings.forEach(stat => {
      ratingDistribution[stat.rating]++;
    });
    
    // Sort users by play time
    const sortedUserStats = [...game.userStats]
      .filter(stat => stat.user && typeof stat.user === 'object' && stat.user.name)
      .sort((a, b) => {
        const aSeconds = a.playTimeSeconds || (a.playTime * 3600);
        const bSeconds = b.playTimeSeconds || (b.playTime * 3600);
        return bSeconds - aSeconds;
      });
    
    res.render('games/analytics', { 
      title: `Statistics: ${game.name}`,
      game,
      totalPlaytimeSeconds,
      totalRatings,
      avgRating,
      ratingDistribution,
      sortedUserStats,
      currentUser: req.session.user,
      isAdminView: false
    });
  } catch (err) {
    console.error('Error loading game statistics:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load game statistics',
      error: err
    });
  }
});

// Clean up game data (remove stats from deleted users)
router.get('/:id/cleanup', isAdmin, async (req, res) => {
  try {
    const gameId = req.params.id;
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Count stats before cleanup
    const totalStatsBefore = game.userStats.length;
    const totalPlaytimeSecondsBefore = game.totalPlayTimeSeconds || 0;
    const ratingBefore = game.rating;
    
    // Filter out stats for users that don't exist anymore
    const validUserStats = [];
    const invalidUserIds = [];
    
    // Check each user stat to see if the user still exists
    for (const stat of game.userStats) {
      try {
        const userId = stat.user;
        
        // Skip if user ID is not valid
        if (!userId) {
          continue;
        }
        
        // Check if user exists
        const user = await User.findById(userId);
        
        if (user) {
          // User still exists, keep this stat
          validUserStats.push(stat);
        } else {
          // User doesn't exist, track the ID for logging
          invalidUserIds.push(userId.toString());
        }
      } catch (err) {
        console.error('Error checking user existence:', err);
        // If there's an error, assume the user doesn't exist
        continue;
      }
    }
    
    // Replace the userStats array with only valid stats
    game.userStats = validUserStats;
    
    // Recalculate total play time (in seconds)
    game.totalPlayTimeSeconds = game.userStats.reduce((sum, stat) => {
      return sum + (stat.playTimeSeconds || (stat.playTime * 3600));
    }, 0);
    
    // Recalculate average rating
    await game.calculateAndSaveRating();
    
    // Log the cleanup results
    console.log(`[GameDataCleanup] Game ${gameId}:`, {
      removedUsers: invalidUserIds,
      statsBefore: totalStatsBefore,
      statsAfter: game.userStats.length,
      removed: totalStatsBefore - game.userStats.length,
      totalPlaytimeSecondsBefore,
      totalPlaytimeSecondsAfter: game.totalPlayTimeSeconds,
      ratingBefore,
      ratingAfter: game.rating
    });
    
    await game.save();
    
    req.session.message = {
      type: 'success',
      text: `Game data cleaned up successfully. Removed ${totalStatsBefore - game.userStats.length} invalid user statistics.`
    };
    
    res.redirect(`/games/${gameId}/analytics`);
  } catch (err) {
    console.error('Error cleaning up game data:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not clean up game data',
      error: err
    });
  }
});

// Consolidate duplicate user ratings in game stats
router.get('/:id/consolidate', isAdmin, async (req, res) => {
  try {
    const gameId = req.params.id;
    const game = await Game.findById(gameId).populate({
      path: 'userStats.user',
      select: 'name'
    });
    
    if (!game) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Game not found',
        error: {}
      });
    }
    
    // Count stats before consolidation
    const statsBefore = game.userStats.length;
    const ratingBefore = game.rating;

    // Count duplicate users
    const userCounts = {};
    game.userStats.forEach(stat => {
      if (stat.user) {
        const userId = stat.user.toString();
        userCounts[userId] = (userCounts[userId] || 0) + 1;
      }
    });
    
    // Count users with multiple ratings
    const duplicateUsers = Object.keys(userCounts).filter(userId => userCounts[userId] > 1);
    const duplicateCount = duplicateUsers.length;
    
    // Run the consolidation method to keep only the latest rating for each user
    const newStatsCount = await game.consolidateUserStats();
    
    // Get updated game with new rating
    const updatedGame = await Game.findById(gameId);
    const ratingAfter = updatedGame.rating;
    
    console.log(`[Rating Consolidation] Game ${gameId}: Entries before: ${statsBefore}, after: ${newStatsCount}, duplicate users fixed: ${duplicateCount}, rating changed: ${ratingBefore.toFixed(1)} → ${ratingAfter.toFixed(1)}`);
    
    req.session.message = {
      type: 'success',
      text: `Game ratings consolidated. Fixed ${duplicateCount} users with duplicate ratings. Rating updated from ${ratingBefore.toFixed(1)} to ${ratingAfter.toFixed(1)}.`
    };
    
    res.redirect(`/games/${gameId}/analytics`);
  } catch (err) {
    console.error('Error consolidating game ratings:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not consolidate game ratings',
      error: err
    });
  }
});

// Helper function to format play time
function formatPlayTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  let timeString = '';
  
  if (hrs > 0) {
    timeString += `${hrs} hour${hrs !== 1 ? 's' : ''}`;
  }
  
  if (mins > 0) {
    if (timeString) timeString += ', ';
    timeString += `${mins} minute${mins !== 1 ? 's' : ''}`;
  }
  
  if (secs > 0 || (hrs === 0 && mins === 0)) {
    if (timeString) timeString += ' and ';
    timeString += `${secs} second${secs !== 1 ? 's' : ''}`;
  }
  
  return timeString;
}

module.exports = router;