const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Game = require('../models/game');
const translationService = require('../services/translationService');

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

// User profile page
router.get('/:id', isLoggedIn, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Special handling for admin user with non-ObjectId _id
    if (req.session.user.specialAdminSession && userId === 'admin') {
      req.session.message = {
        type: 'info',
        text: 'Admin users don\'t have a regular profile. Please use the admin dashboard.'
      };
      return res.redirect('/admin');
    }
    
    // Check if logged-in user matches the requested profile
    // Use string comparison instead of direct object comparison
    if (req.session.user._id.toString() !== userId.toString()) {
      req.session.message = {
        type: 'danger',
        text: 'You can only view your own profile'
      };
      return res.redirect(`/users/${req.session.user._id}`);
    }
    
    console.log(`[ProfileAccess] Loading profile for user ${userId}`);
    
    // Load the fully populated user data directly without recalculating
    // This avoids double-counting the play time
    const populatedUser = await User.findById(userId).populate({
      path: 'mostPlayedGame',
      select: 'name photo _id'  // Select only the fields we need
    });
    
    if (!populatedUser) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User not found',
        error: {}
      });
    }
    
    console.log(`[ProfileStats] User ${userId}:`, {
      totalPlayTime: populatedUser.totalPlayTime,
      totalPlayTimeSeconds: populatedUser.totalPlayTimeSeconds,
      formattedTime: populatedUser.getFormattedPlayTime(),
      mostPlayedGame: populatedUser.mostPlayedGame ? populatedUser.mostPlayedGame._id : 'None'
    });
    
    // Update session with fresh data - properly preserve role information
    req.session.user = {
      _id: populatedUser._id.toString(),
      name: populatedUser.name,
      isDeveloper: populatedUser.roles && populatedUser.roles.isDeveloper === true,
      isAdmin: populatedUser.roles && populatedUser.roles.isAdmin === true,
      email: populatedUser.email,
      avatar: populatedUser.avatar
    };
    await new Promise(resolve => req.session.save(resolve));
    
    // Get ALL game stats - populate game details for each game stat
    await populatedUser.populate({
      path: 'gameStats.game',
      select: 'name photo _id'
    });
    
    // Prepare complete game stats data for client
    const fullGameStats = populatedUser.gameStats.map(stat => ({
      id: stat.game._id,
      name: stat.game.name,
      image: stat.game.photo,
      playTime: 0, // Set to 0 to avoid double-counting
      playTimeSeconds: stat.playTimeSeconds || (stat.playTime * 3600), // Use only one source of truth
      totalSeconds: stat.playTimeSeconds || (stat.playTime * 3600) // Simplified calculation
    }));
    
    // Sort by most played for easy debugging
    fullGameStats.sort((a, b) => b.totalSeconds - a.totalSeconds);
    
    // Get user comments from games they've played
    const comments = await populatedUser.getComments();
    
    // Get all games for displaying in dropdowns
    const games = await Game.find().sort({ name: 1 });
    
    // Get playable games (games the user has played)
    const playableGames = await Game.find({ 
      _id: { $in: populatedUser.gameStats.map(stat => stat.game) } 
    }).sort({ name: 1 });
    
    // Get ratable games (games the user has played for at least 10 seconds and not disabled)
    const ratableGames = await Game.find({ 
      _id: { $in: populatedUser.gameStats.filter(stat => {
        // Use single source of truth for play time
        const totalSeconds = stat.playTimeSeconds || (stat.playTime * 3600);
        return totalSeconds >= 10; // 10 seconds
      }).map(stat => stat.game) },
      ratingDisabled: false 
    }).sort({ name: 1 });
    
    // Get commentable games (games the user has played for at least 10 seconds and not disabled)
    const commentableGames = await Game.find({ 
      _id: { $in: populatedUser.gameStats.filter(stat => {
        // Use single source of truth for play time
        const totalSeconds = stat.playTimeSeconds || (stat.playTime * 3600);
        return totalSeconds >= 10; // 10 seconds
      }).map(stat => stat.game) },
      commentDisabled: false 
    }).sort({ name: 1 });
    
    res.render('users/profile', { 
      title: `${populatedUser.name}'s Profile`,
      user: populatedUser,
      fullGameStats: JSON.stringify(fullGameStats), // Pass ALL game stats to the view
      comments,
      games,
      ratableGames,
      commentableGames,
      currentUser: req.session.user // Pass current user with role info from session
    });
  } catch (err) {
    console.error('Error loading user profile:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load user profile',
      error: err
    });
  }
});

// Edit profile page
router.get('/:id/edit', isLoggedIn, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Special handling for admin user with non-ObjectId _id
    if (req.session.user.specialAdminSession && userId === 'admin') {
      req.session.message = {
        type: 'info',
        text: 'Admin users don\'t have a regular profile to edit. Please use the admin dashboard.'
      };
      return res.redirect('/admin');
    }
    
    const isAdmin = req.session.user && req.session.user.isAdmin === true;
    const isOwnProfile = req.session.user._id === userId;
    
    // Check if logged-in user is allowed to edit this profile (must be owner or admin)
    if (!isAdmin && !isOwnProfile) {
      req.session.message = {
        type: 'danger',
        text: 'You can only edit your own profile'
      };
      return res.redirect(`/users/${req.session.user._id}`);
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User not found',
        error: {}
      });
    }
    
    res.render('users/edit-profile', { 
      title: `Edit Profile: ${user.name}`,
      user,
      isAdmin,
      isOwnProfile
    });
  } catch (err) {
    console.error('Error loading edit profile page:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load edit profile page',
      error: err
    });
  }
});

// Update profile
router.post('/:id/update', isLoggedIn, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Special handling for admin user with non-ObjectId _id
    if (req.session.user.specialAdminSession && userId === 'admin') {
      req.session.message = {
        type: 'info',
        text: 'Admin users don\'t have a regular profile to update. Please use the admin dashboard.'
      };
      return res.redirect('/admin');
    }
    
    const isAdmin = req.session.user && req.session.user.isAdmin === true;
    const isOwnProfile = req.session.user._id === userId;
    
    // Check if logged-in user is allowed to edit this profile (must be owner or admin)
    if (!isAdmin && !isOwnProfile) {
      req.session.message = {
        type: 'danger',
        text: 'You can only update your own profile'
      };
      return res.redirect(`/users/${req.session.user._id}`);
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User not found',
        error: {}
      });
    }
    
    // Update basic profile info
    user.name = req.body.name;
    user.email = req.body.email || '';
    user.biography = req.body.biography || '';
    user.avatar = req.body.avatar || '/images/default-avatar.png';
    
    // Admin can update user roles
    if (isAdmin && !isOwnProfile) {
      user.roles = {
        isDeveloper: req.body.isDeveloper === 'on',
        isAdmin: req.body.isAdmin === 'on'
      };
    }
    
    await user.save();
    
    // Update session user data if it's the logged-in user
    if (isOwnProfile) {
      req.session.user = {
        _id: user._id.toString(),
        name: user.name,
        isDeveloper: user.roles && user.roles.isDeveloper === true,
        isAdmin: user.roles && user.roles.isAdmin === true,
        email: user.email,
        avatar: user.avatar
      };
      await new Promise(resolve => req.session.save(resolve));
    }
    
    req.session.message = {
      type: 'success',
      text: `Profile has been updated successfully`
    };
    
    // Redirect admins back to admin page if they were editing another user
    if (isAdmin && !isOwnProfile) {
      return res.redirect('/admin');
    }
    
    res.redirect(`/users/${userId}`);
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not update profile',
      error: err
    });
  }
});

// Play a game
router.post('/:id/play', isLoggedIn, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Special handling for admin user with non-ObjectId _id
    if (req.session.user.specialAdminSession && userId === 'admin') {
      req.session.message = {
        type: 'info',
        text: 'Admin users don\'t have a regular profile to play games with. Please login as a regular user to play games.'
      };
      return res.redirect('/admin');
    }
    
    const { gameId, playTime } = req.body;
    
    // Check if logged-in user matches the requested profile
    // Use string comparison instead of direct object comparison
    if (req.session.user._id.toString() !== userId.toString()) {
      req.session.message = {
        type: 'danger',
        text: 'You can only play games as yourself'
      };
      return res.redirect(`/users/${req.session.user._id}`);
    }
    
    // Convert playTime to a number
    const hours = parseInt(playTime, 10);
    if (isNaN(hours) || hours <= 0) {
      req.session.message = {
        type: 'danger',
        text: 'Play time must be a positive number'
      };
      return res.redirect(`/users/${userId}`);
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
    
    // Check if user already has stats for this game
    let userGameStat = user.gameStats.find(stat => stat.game.toString() === gameId);
    if (!userGameStat) {
      // Add new game stat for the user
      user.gameStats.push({
        game: gameId,
        playTime: hours
      });
      userGameStat = user.gameStats[user.gameStats.length - 1];
    } else {
      // Increment play time
      userGameStat.playTime += hours;
    }
    
    // Update user's total play time
    user.totalPlayTime += hours;
    
    // Update user's most played game
    user.updateMostPlayedGame();
    
    await user.save();
    
    // Update game stats
    let gameUserStat = game.userStats.find(stat => stat.user.toString() === userId);
    if (!gameUserStat) {
      // Add new user stat for the game
      game.userStats.push({
        user: userId,
        playTime: hours
      });
      gameUserStat = game.userStats[game.userStats.length - 1];
    } else {
      // Increment play time
      gameUserStat.playTime += hours;
    }
    
    // Update game's total play time
    game.totalPlayTime += hours;
    
    // Recalculate game rating
    game.calculateRating();
    
    await game.save();
    
    req.session.message = {
      type: 'success',
      text: `You played "${game.name}" for ${hours} hours`
    };
    
    res.redirect(`/users/${userId}`);
  } catch (err) {
    console.error('Error playing game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not play game',
      error: err
    });
  }
});

// Rate a game
router.post('/:id/rate', isLoggedIn, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Special handling for admin user with non-ObjectId _id
    if (req.session.user.specialAdminSession && userId === 'admin') {
      req.session.message = {
        type: 'info',
        text: 'Admin users don\'t have a regular profile to rate games with. Please login as a regular user to rate games.'
      };
      return res.redirect('/admin');
    }
    
    const { gameId, rating } = req.body;
    
    // Check if logged-in user matches the requested profile
    // Use string comparison instead of direct object comparison
    if (req.session.user._id.toString() !== userId.toString()) {
      req.session.message = {
        type: 'danger',
        text: 'You can only rate games as yourself'
      };
      return res.redirect(`/users/${req.session.user._id}`);
    }
    
    // Validate rating
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      req.session.message = {
        type: 'danger',
        text: 'Rating must be between 1 and 5'
      };
      return res.redirect(`/users/${userId}`);
    }
    
    // Get user and game from database
    const user = await User.findById(userId);
    const game = await Game.findById(gameId);
    
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
      return res.redirect(`/users/${userId}`);
    }
    
    // Check if the user has played the game for at least 10 seconds
    const userGameStatIndex = user.gameStats.findIndex(stat => stat.game.toString() === gameId);
    if (userGameStatIndex === -1 || (user.gameStats[userGameStatIndex].playTimeSeconds || 0) < 10) {
      req.session.message = {
        type: 'danger',
        text: 'You must play a game for at least 10 seconds before rating it'
      };
      return res.redirect(`/users/${userId}`);
    }
    
    // Update the user's rating directly in the database
    await User.updateOne(
      { _id: userId, "gameStats.game": gameId },
      { $set: { "gameStats.$.rating": ratingNum } }
    );
    
    // Calculate and update average rating for this user
    const updatedUser = await User.findById(userId);
    updatedUser.calculateAvgRating();
    await updatedUser.save();
    
    // Update the game's rating directly in the database
    const gameUserStatIndex = game.userStats.findIndex(stat => stat.user.toString() === userId);
    if (gameUserStatIndex !== -1) {
      await Game.updateOne(
        { _id: gameId, "userStats.user": userId },
        { $set: { "userStats.$.rating": ratingNum } }
      );
    } else {
      // If somehow the game doesn't have a record of this user, add one
      const userGameStat = user.gameStats[userGameStatIndex];
      await Game.updateOne(
        { _id: gameId },
        { 
          $push: { 
            userStats: {
              user: userId,
              playTime: userGameStat.playTime,
              playTimeSeconds: userGameStat.playTimeSeconds || 0,
              rating: ratingNum
            }
          }
        }
      );
    }
    
    // Recalculate and update game rating (using the new method that saves)
    const updatedGame = await Game.findById(gameId);
    const oldRating = updatedGame.rating;
    const newRating = await updatedGame.calculateAndSaveRating();
    
    console.log(`Game rating updated: ${oldRating} → ${newRating}`);
    
    req.session.message = {
      type: 'success',
      text: `Your ${ratingNum}-star rating for "${game.name}" has been recorded. Game rating updated to ${newRating.toFixed(1)}.`
    };
    
    res.redirect(`/users/${userId}`);
  } catch (err) {
    console.error('Error rating game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not rate game',
      error: err
    });
  }
});

// Comment on a game
router.post('/:id/comment', isLoggedIn, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Special handling for admin user with non-ObjectId _id
    if (req.session.user.specialAdminSession && userId === 'admin') {
      req.session.message = {
        type: 'info',
        text: 'Admin users don\'t have a regular profile to comment with. Please login as a regular user to comment on games.'
      };
      return res.redirect('/admin');
    }
    
    const { gameId, comment } = req.body;
    
    // Check if logged-in user matches the requested profile
    if (req.session.user._id !== userId) {
      req.session.message = {
        type: 'danger',
        text: 'You can only comment on games as yourself'
      };
      return res.redirect(`/users/${req.session.user._id}`);
    }
    
    if (!comment || comment.trim() === '') {
      req.session.message = {
        type: 'danger',
        text: 'Comment cannot be empty'
      };
      return res.redirect(`/users/${userId}`);
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
      return res.redirect(`/users/${userId}`);
    }
    
    // Check if the user has played the game for at least 10 seconds
    const userGameStat = user.gameStats.find(stat => stat.game.toString() === gameId);
    if (!userGameStat || (userGameStat.playTimeSeconds || 0) < 10) {
      req.session.message = {
        type: 'danger',
        text: 'You must play a game for at least 10 seconds before commenting on it'
      };
      return res.redirect(`/users/${userId}`);
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
    
    res.redirect(`/users/${userId}`);
  } catch (err) {
    console.error('Error commenting on game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not add comment',
      error: err
    });
  }
});

// Language validation endpoint
router.post('/validate-language', async (req, res) => {
  try {
    const { languageInput } = req.body;
    
    if (!languageInput) {
      return res.status(400).json({
        success: false,
        message: 'Language input is required'
      });
    }
    
    console.log(`[LanguageValidation] Validating language input: ${languageInput}`);
    
    // Get the standard supported languages (for display purposes)
    const supportedLanguages = translationService.getSupportedLanguages();
    
    // First check for direct matches with our known languages
    const input = languageInput.toLowerCase().trim();
    
    // Check for exact match with language code
    if (supportedLanguages[input]) {
      console.log(`[LanguageValidation] Direct code match: ${input}`);
      return res.json({
        success: true,
        languageCode: input,
        languageName: supportedLanguages[input]
      });
    }
    
    // Check for exact match with language name
    for (const [code, name] of Object.entries(supportedLanguages)) {
      if (name.toLowerCase() === input) {
        console.log(`[LanguageValidation] Direct name match: ${code}`);
        return res.json({
          success: true,
          languageCode: code,
          languageName: name
        });
      }
    }
    
    // If no direct match, use the language detection service
    // This will work for any language now, not just predefined ones
    try {
      const matchedLanguage = await translationService.detectLanguage(languageInput);
      const languageName = translationService.getLanguageName(matchedLanguage);
      
      console.log(`[LanguageValidation] Detected input "${languageInput}" as language code: ${matchedLanguage}`);
      
      // Always return success since we're accepting any language
      return res.json({
        success: true,
        languageCode: matchedLanguage,
        languageName: languageName || languageInput // Use original input as name if no standard name found
      });
    } catch (aiError) {
      console.error('[LanguageValidation] Detection error:', aiError);
      
      // Even if detection fails, accept the language with a fallback code
      // Create a safe language code from the first two chars of the input
      const safeLanguageCode = input.replace(/[^a-z]/g, '').substring(0, 2).padEnd(2, 'x');
      console.log(`[LanguageValidation] Using fallback language code: ${safeLanguageCode}`);
      
      return res.json({
        success: true,
        languageCode: safeLanguageCode,
        languageName: languageInput,
        warning: "Language was accepted but may have limited support."
      });
    }
    
  } catch (err) {
    console.error('Error validating language:', err);
    res.status(500).json({
      success: false,
      message: 'Could not validate language'
    });
  }
});

// Update user's language preference
router.post('/:id/language', async (req, res) => {
  try {
    const userId = req.params.id;
    const { preferredLanguage } = req.body;
    
    // Special handling for admin user with non-ObjectId _id
    if (userId === 'admin') {
      // For admin users, just store the preference in session and localStorage
      if (req.session && req.session.user) {
        req.session.user.preferredLanguage = preferredLanguage;
        await new Promise(resolve => req.session.save(resolve));
      }
      
      console.log(`[LanguageUpdate] Admin user changed language to ${preferredLanguage}`);
      
      return res.json({
        success: true,
        message: 'Admin language preference updated in session',
        preferredLanguage
      });
    }
    
    // Normal users - check if logged-in user matches the requested profile
    if (req.session && req.session.user && req.session.user._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own language preferences'
      });
    }
    
    // Accept any valid language code (2-letter code or 2-letter-hyphen-2-letter)
    if (!preferredLanguage || !(/^[a-z]{2}(-[A-Za-z]{2,})?$/.test(preferredLanguage))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language code format. Use format like "en", "hu", "zh-CN"'
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update language preference
    user.preferredLanguage = preferredLanguage.toLowerCase();
    await user.save();
    
    // Update session data
    if (req.session && req.session.user) {
      req.session.user.preferredLanguage = preferredLanguage.toLowerCase();
      await new Promise(resolve => req.session.save(resolve));
    }
    
    console.log(`[LanguageUpdate] User ${userId} changed language to ${preferredLanguage}`);
    
    res.json({
      success: true,
      message: 'Language preference updated successfully',
      preferredLanguage: preferredLanguage.toLowerCase()
    });
  } catch (err) {
    console.error('Error updating language preference:', err);
    res.status(500).json({
      success: false,
      message: 'Could not update language preference'
    });
  }
});

// Translate texts
router.post('/translate', async (req, res) => {
  try {
    const { text, texts, targetLanguage, sourceLanguage = 'en' } = req.body;
    
    // Validate required fields
    if ((!text && !texts) || !targetLanguage) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Validate language support
    if (!translationService.isLanguageSupported(targetLanguage)) {
      return res.status(400).json({
        success: false,
        message: 'Target language not supported'
      });
    }
    
    // Handle single text translation
    if (text) {
      const translatedText = await translationService.translateText(text, sourceLanguage, targetLanguage);
      
      return res.json({
        success: true,
        translatedText,
        sourceLanguage,
        targetLanguage
      });
    }
    
    // Handle batch translation
    if (Array.isArray(texts)) {
      const translatedTexts = await translationService.batchTranslate(texts, sourceLanguage, targetLanguage);
      
      return res.json({
        success: true,
        translatedTexts,
        sourceLanguage,
        targetLanguage
      });
    }
    
    // If we get here, something went wrong with the input format
    return res.status(400).json({
      success: false,
      message: 'Invalid input format'
    });
  } catch (err) {
    console.error('Error translating text:', err);
    return res.status(500).json({
      success: false,
      message: 'Translation failed'
    });
  }
});

// Get available languages
router.get('/languages', (req, res) => {
  try {
    const languages = translationService.getSupportedLanguages();
    
    return res.json({
      success: true,
      languages
    });
  } catch (err) {
    console.error('Error getting languages:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve languages'
    });
  }
});

module.exports = router;