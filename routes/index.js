const express = require('express');
const router = express.Router();
const Game = require('../models/game');
const User = require('../models/user');

// Landing page - First entry point of the application
router.get('/', async (req, res) => {
  try {
    res.render('landing', { 
      title: 'Welcome to Game Distribution Service',
      isLoggedIn: !!req.session.user
    });
  } catch (err) {
    console.error('Error loading landing page:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load landing page',
      error: err
    });
  }
});

// Home page - After landing, shows featured games and login options
router.get('/home', async (req, res) => {
  try {
    // For all users, show the home page with featured games
    const featuredGames = await Game.find()
      .sort({ rating: -1 })
      .limit(6);
    
    const popularGames = await Game.find()
      .sort({ totalPlayTime: -1 })
      .limit(3);
    
    const isLoggedIn = !!req.session.user;
    const users = isLoggedIn ? [] : await User.find().sort({ name: 1 }).limit(4);
    
    res.render('home', { 
      title: 'Game Distribution Service - Home',
      featuredGames,
      popularGames,
      users,
      isLoggedIn,
      currentUser: req.session.user || null
    });
  } catch (err) {
    console.error('Error loading home page:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load home page',
      error: err
    });
  }
});

// User Login page
router.get('/user-login', async (req, res) => {
  try {
    // If user is already logged in, redirect to home
    if (req.session.user) {
      return res.redirect('/home');
    }
    
    const users = await User.find().sort({ name: 1 });
    
    res.render('users/login', { 
      title: 'Login as User',
      users
    });
  } catch (err) {
    console.error('Error loading login page:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load login page',
      error: err
    });
  }
});

// Register new user page
router.get('/register', (req, res) => {
  // If user is already logged in, redirect to home
  if (req.session.user) {
    return res.redirect('/home');
  }
  
  res.render('users/register', { title: 'Register New User' });
});

// Process user registration
router.post('/register', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Basic validation
    if (!name || name.trim() === '') {
      req.session.message = {
        type: 'danger',
        text: 'Username is required'
      };
      return res.redirect('/register');
    }
    
    // Check if username already exists
    const existingUser = await User.findOne({ name: name.trim() });
    if (existingUser) {
      req.session.message = {
        type: 'danger',
        text: 'Username already exists. Please choose another name.'
      };
      return res.redirect('/register');
    }
    
    // Create new user
    const newUser = new User({
      name: name.trim(),
      email: email ? email.trim() : undefined
    });
    
    await newUser.save();
    
    // Log user in after registration
    req.session.user = {
      _id: newUser._id.toString(),
      name: newUser.name
    };
    
    req.session.message = {
      type: 'success',
      text: `Welcome, ${newUser.name}! Your account has been created.`
    };
    
    res.redirect('/home');
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not register user',
      error: err
    });
  }
});

// Admin Login page
router.get('/admin-login', (req, res) => {
  // If user is already logged in as admin, redirect to admin dashboard
  if (req.session.user && req.session.user.isAdmin) {
    return res.redirect('/admin');
  }
  
  res.render('admin-login', { title: 'Admin Login' });
});

// Process admin login
router.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple admin authentication for demo purposes
  // In a real application, you'd use proper authentication with encrypted passwords
  if (username === 'admin' && password === 'admin') {
    // Create a session without an actual MongoDB ObjectId
    // Use a special flag to indicate this is an admin-only session
    req.session.user = {
      _id: 'admin',
      name: 'Administrator',
      isAdmin: true,
      specialAdminSession: true // Add this flag to identify admin sessions
    };
    
    req.session.message = {
      type: 'success',
      text: 'Logged in as administrator'
    };
    
    res.redirect('/admin');
  } else {
    req.session.message = {
      type: 'danger',
      text: 'Invalid admin credentials'
    };
    
    res.redirect('/admin-login');
  }
});

// Admin Dashboard page
router.get('/admin', async (req, res) => {
  try {
    // Check if user is logged in as admin
    if (!req.session.user || !req.session.user.isAdmin) {
      req.session.message = {
        type: 'danger',
        text: 'You do not have permission to access the admin dashboard'
      };
      return res.redirect('/admin-login');
    }
    
    const games = await Game.find().sort({ name: 1 });
    const users = await User.find().sort({ name: 1 });
    
    res.render('admin-dashboard', { 
      title: 'Admin Dashboard',
      games,
      users,
      isAdmin: true,
      isLoggedIn: true,
      currentUser: req.session.user
    });
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not load admin dashboard',
      error: err
    });
  }
});

// Admin-only middleware
const isAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.isAdmin !== true) {
    req.session.message = {
      type: 'danger',
      text: 'You do not have permission to perform this action'
    };
    return res.redirect('/');
  }
  next();
};

// Admin or Developer middleware for game management
const isAdminOrDeveloper = (req, res, next) => {
  if (!req.session.user || (req.session.user.isAdmin !== true && req.session.user.isDeveloper !== true)) {
    req.session.message = {
      type: 'danger',
      text: 'You do not have permission to perform this action'
    };
    return res.redirect('/');
  }
  next();
};

// Add a new game (admin and developer)
router.post('/games', isAdminOrDeveloper, async (req, res) => {
  try {
    const { name, genres, photo, optional1, optional2 } = req.body;
    
    // Convert comma-separated genres to array and trim
    const genresArray = genres.split(',').map(genre => genre.trim()).filter(Boolean);
    
    if (genresArray.length < 1 || genresArray.length > 5) {
      return res.status(400).render('error', {
        title: 'Error',
        message: 'Game must have between 1-5 genres',
        error: {}
      });
    }
    
    const newGame = new Game({
      name,
      genres: genresArray,
      photo,
      optional1,
      optional2
    });
    
    // If the user is a developer, set them as the developer of the game
    if (req.session.user && req.session.user.isDeveloper && !req.session.user.isAdmin) {
      // Associate the game with the developer
      newGame.developer = req.session.user._id;
      
      // After saving the game, we need to update the user's developed games list
      await newGame.save();
      const developer = await User.findById(req.session.user._id);
      if (developer) {
        await developer.addDevelopedGame(newGame._id);
      }
    } else {
      // Just save the game without developer association (admin or other case)
      await newGame.save();
    }
    
    req.session.message = {
      type: 'success',
      text: `Game "${name}" has been added successfully`
    };
    
    // Redirect to appropriate page based on user role
    if (req.session.user && req.session.user.isAdmin) {
      res.redirect('/admin');
    } else {
      res.redirect('/users/' + req.session.user._id);
    }
  } catch (err) {
    console.error('Error adding game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not add game',
      error: err
    });
  }
});

// Remove a game (admin only)
router.delete('/games/:id', isAdmin, async (req, res) => {
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
    
    // Delete the game
    await Game.findByIdAndDelete(gameId);
    
    req.session.message = {
      type: 'success',
      text: `Game "${game.name}" has been removed successfully`
    };
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Error removing game:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not remove game',
      error: err
    });
  }
});

// Disable rating and comments for a game (admin only)
router.put('/games/:id/disable', isAdmin, async (req, res) => {
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
    
    game.ratingDisabled = true;
    game.commentDisabled = true;
    
    await game.save();
    
    req.session.message = {
      type: 'success',
      text: `Rating and comments have been disabled for "${game.name}"`
    };
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Error disabling rating and comments:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not disable rating and comments',
      error: err
    });
  }
});

// Enable rating and comments for a game (admin only)
router.put('/games/:id/enable', isAdmin, async (req, res) => {
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
    
    game.ratingDisabled = false;
    game.commentDisabled = false;
    
    await game.save();
    
    req.session.message = {
      type: 'success',
      text: `Rating and comments have been enabled for "${game.name}"`
    };
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Error enabling rating and comments:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not enable rating and comments',
      error: err
    });
  }
});

// Add a new user (admin only)
router.post('/users', isAdmin, async (req, res) => {
  try {
    const { name, email, avatar, isDeveloper, isAdmin: makeAdmin } = req.body;
    
    const newUser = new User({
      name,
      email: email || undefined,
      avatar: avatar || '/images/default-avatar.png',
      roles: {
        isDeveloper: isDeveloper === 'on',
        isAdmin: makeAdmin === 'on'
      }
    });
    
    await newUser.save();
    
    req.session.message = {
      type: 'success',
      text: `User "${name}" has been added successfully${isDeveloper === 'on' ? ' as a developer' : ''}`
    };
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Error adding user:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not add user',
      error: err
    });
  }
});

// Remove a user (admin only)
router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User not found',
        error: {}
      });
    }
    
    console.log(`[UserDeletion] Removing user ${userId} with ${user.gameStats.length} game interactions`);
    
    // Update all games this user has interacted with
    for (const stat of user.gameStats) {
      const gameId = stat.game;
      const game = await Game.findById(gameId);
      
      if (game) {
        // Find and remove user stats from the game
        const userStatIndex = game.userStats.findIndex(s => s.user.toString() === userId);
        if (userStatIndex !== -1) {
          // Get the user's play time and rating before removing
          const userStat = game.userStats[userStatIndex];
          const playTime = userStat.playTime || 0;
          const playTimeSeconds = userStat.playTimeSeconds || (playTime * 3600);
          
          // Remove the user stats from the game
          game.userStats.splice(userStatIndex, 1);
          
          // Update the game's total play time
          game.totalPlayTime = Math.max(0, game.totalPlayTime - playTime);
          game.totalPlayTimeSeconds = Math.max(0, game.totalPlayTimeSeconds - playTimeSeconds);
          
          // Recalculate and save rating after removing this user's rating
          await game.calculateAndSaveRating();
          
          console.log(`[UserDeletion] Removed stats from game ${gameId}: -${playTimeSeconds} seconds, recalculated rating: ${game.rating}`);
          
          await game.save();
        }
      }
    }
    
    // If this user is logged in, log them out
    if (req.session.user && req.session.user._id === userId.toString()) {
      req.session.user = null;
    }
    
    // Delete the user
    await User.findByIdAndDelete(userId);
    
    req.session.message = {
      type: 'success',
      text: `User "${user.name}" has been removed successfully`
    };
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Error removing user:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not remove user',
      error: err
    });
  }
});

// Login as a user
router.get('/login/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'User not found',
        error: {}
      });
    }
    
    // Store user in session with roles information
    req.session.user = {
      _id: user._id.toString(), // Store as string to avoid comparison issues
      name: user.name,
      isDeveloper: user.roles && user.roles.isDeveloper === true,
      isAdmin: user.roles && user.roles.isAdmin === true
    };
    
    req.session.message = {
      type: 'success',
      text: `Logged in as "${user.name}"`
    };
    
    // Redirect to home page
    res.redirect('/home');
  } catch (err) {
    console.error('Error logging in as user:', err);
    res.status(500).render('error', { 
      title: 'Error', 
      message: 'Could not log in as user',
      error: err
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.user = null;
  
  req.session.message = {
    type: 'success',
    text: 'Logged out successfully'
  };
  
  res.redirect('/');
});

module.exports = router;