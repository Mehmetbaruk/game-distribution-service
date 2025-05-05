const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const mongodbService = require('../services/mongodbService');
const translationService = require('../services/translationService');
const AIAgentService = require('../services/aiAgentService');
const LoggerService = require('../services/loggerService');

// Authentication middleware
const isAdmin = (req, res, next) => {
  // Use NODE_ENV to determine authentication behavior
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
    console.warn('WARNING: Admin authentication bypassed in development mode');
    return next();
  }
  
  // Proper authentication for production
  if (req.session && req.session.user && req.session.user.roles && req.session.user.roles.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'Access denied. Admin privileges required.' });
};

// Middleware to check if user is admin or developer for game management features
const isAdminOrDeveloper = (req, res, next) => {
  // Use NODE_ENV to determine authentication behavior
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
    console.warn('WARNING: Admin/Developer authentication bypassed in development mode');
    return next();
  }
  
  // Check if user is either admin or developer
  if (req.session && req.session.user && 
      ((req.session.user.roles && req.session.user.roles.isAdmin) || 
       (req.session.user.isDeveloper === true) ||
       (req.session.user.roles && req.session.user.roles.isDeveloper === true))) {
    return next();
  }
  res.status(403).json({ error: 'Access denied. Admin or Developer privileges required.' });
};

// Add a more permissive auth check for AI queries that can be accessed by regular users too
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required.' });
};

// New AI Query endpoint that can handle different types of platform questions
router.post('/api/ai-query', isAuthenticated, async (req, res) => {
  try {
    const { queryType, limit = 5 } = req.body;
    const userId = req.session.user._id;
    const userRole = req.session.user.roles && req.session.user.roles.isAdmin ? 'admin' : 'user';
    
    console.log(`AI Query received: ${queryType} from ${userRole} (${userId})`);
    
    // Log this query for analytics
    await LoggerService.info('ai', 'query', `AI query: ${queryType}`, { queryType }, userId);
    
    let result;
    
    // Handle different query types
    switch(queryType) {
      case 'randomGames': 
        // Get random games from the platform - useful for discovery
        const games = await Game.aggregate([{ $sample: { size: limit } }]);
        result = { 
          success: true, 
          games: games.map(g => ({
            id: g._id,
            name: g.name,
            description: g.description || 'No description available',
            genre: g.genres || [],
            rating: g.rating || 0
          }))
        };
        break;
        
      case 'randomUsers':
        // Get random users with their statistics - limited to admin role for privacy
        if (userRole !== 'admin') {
          return res.status(403).json({ success: false, error: 'Access denied. Admin role required.' });
        }
        result = { 
          success: true, 
          users: await AIAgentService.getRandomUsers({ limit }) 
        };
        break;
        
      case 'rareGames':
        // Get games with lowest engagement
        result = { 
          success: true, 
          games: await AIAgentService.getRareGames({ limit }) 
        };
        break;
        
      case 'topGames':
        // Get top games by plays or ratings
        const { criteria = 'plays', days = 7 } = req.body;
        result = { 
          success: true, 
          games: await AIAgentService.getTopGames({ criteria, days, limit }) 
        };
        break;
        
      case 'mostPlayedGame':
        // Get the single most played game
        const mostPlayed = await AIAgentService.getMostPlayedGame();
        result = { 
          success: true, 
          game: mostPlayed 
        };
        break;
        
      case 'platformOverview':
        // For admins only - get full platform statistics
        if (userRole !== 'admin') {
          return res.status(403).json({ success: false, error: 'Access denied. Admin role required.' });
        }
        result = { 
          success: true, 
          overview: await AIAgentService.getPlatformOverview() 
        };
        break;
        
      case 'gameRecommendations':
        // Get personalized recommendations for the current user
        result = { 
          success: true, 
          recommendations: await AIAgentService.getGameRecommendations(userId, limit) 
        };
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Unknown query type',
          availableQueries: ['randomGames', 'randomUsers', 'rareGames', 'topGames', 
                            'mostPlayedGame', 'platformOverview', 'gameRecommendations']
        });
    }
    
    return res.json(result);
  } catch (error) {
    console.error('Error processing AI query:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all collection names with pagination
router.get('/api/collections', isAdmin, async (req, res) => {
  try {
    console.log('Collections API endpoint called with query params:', req.query);
    
    // Parse pagination parameters
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;  // Default to 10 collections per page
    const page = req.query.page ? parseInt(req.query.page) : 1;      // Default to page 1
    const skip = (page - 1) * limit;
    const forceRefresh = req.query.refresh === 'true';
    
    console.log(`Pagination params: limit=${limit}, page=${page}, skip=${skip}, refresh=${forceRefresh}`);
    
    // Enhanced error handling with retry logic
    let maxRetries = 3;
    let retryCount = 0;
    let result = null;
    let lastError = null;
    
    while (retryCount < maxRetries) {
      try {
        // Check connection state first
        const connectionState = mongodbService.getConnectionState();
        console.log(`Attempt ${retryCount + 1}: MongoDB connection state:`, connectionState);
        
        if (connectionState.code !== 1) {
          console.log(`Attempt ${retryCount + 1}: MongoDB not connected, attempting to connect...`);
          try {
            await mongodbService.connect();
            console.log(`Attempt ${retryCount + 1}: Connected to MongoDB for collections request`);
          } catch (connError) {
            console.error(`Attempt ${retryCount + 1}: Failed to connect to MongoDB:`, connError);
            lastError = connError;
            retryCount++;
            continue; // Skip to next retry attempt
          }
        }
        
        // Even if connection state indicates we're connected, try a ping to verify
        try {
          await mongoose.connection.db.admin().ping();
          console.log(`Attempt ${retryCount + 1}: MongoDB ping successful`);
        } catch (pingError) {
          console.error(`Attempt ${retryCount + 1}: MongoDB ping failed:`, pingError);
          // Try to reconnect explicitly
          await mongodbService.closeConnection();
          await mongodbService.connect();
          console.log(`Attempt ${retryCount + 1}: Reconnected after ping failure`);
        }
        
        console.log(`Attempt ${retryCount + 1}: Fetching collections with pagination...`);
        
        // Use our MongoDB service with pagination options
        result = await mongodbService.listCollections({
          limit,
          skip,
          forceRefresh
        });
        
        console.log(`Attempt ${retryCount + 1}: Retrieved ${result.collections.length} of ${result.total} collections (page ${result.page} of ${result.totalPages})`);
        
        // If we got here, we succeeded
        break;
      } catch (attemptError) {
        console.error(`Attempt ${retryCount + 1}: Error listing collections:`, attemptError);
        lastError = attemptError;
        retryCount++;
        
        // Add a small delay between retries
        if (retryCount < maxRetries) {
          console.log(`Waiting 1 second before retry ${retryCount + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (result) {
      // Success - send a well-formatted response with collections array and pagination info
      return res.json({
        success: true,
        collections: result.collections,
        pagination: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          limit: result.limit,
          skip: result.skip
        }
      });
    } else {
      // All retries failed
      console.error(`All ${maxRetries} attempts to fetch collections failed.`);
      return res.status(500).json({
        success: false,
        error: `Failed to list collections after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
        retries: retryCount
      });
    }
  } catch (error) {
    console.error('Error in collections endpoint:', error);
    // Send detailed error information
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get documents from a collection with pagination
router.get('/api/collections/:collectionName', isAdmin, async (req, res) => {
  try {
    const { collectionName } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    const sort = req.query.sort ? 
      (typeof req.query.sort === 'string' ? JSON.parse(req.query.sort) : req.query.sort) : 
      { _id: -1 };
    
    console.log(`Fetching ${collectionName} with limit: ${limit}, skip: ${skip}`);
    
    // Handle with retry mechanism for robustness
    let maxRetries = 3;
    let retryCount = 0;
    let result = null;
    let lastError = null;
    
    while (retryCount < maxRetries) {
      try {
        // Check connection state first
        const connectionState = mongodbService.getConnectionState();
        console.log(`Attempt ${retryCount + 1}: MongoDB connection state:`, connectionState);
        
        if (connectionState.code !== 1) {
          console.log(`Attempt ${retryCount + 1}: MongoDB not connected, attempting to connect...`);
          try {
            await mongodbService.connect();
            console.log(`Attempt ${retryCount + 1}: Connected to MongoDB for documents request`);
          } catch (connError) {
            console.error(`Attempt ${retryCount + 1}: Failed to connect to MongoDB:`, connError);
            lastError = connError;
            retryCount++;
            continue; // Skip to next retry attempt
          }
        }
        
        // Use our MongoDB service to get documents
        result = await mongodbService.getDocumentsFromCollection(
          collectionName,
          { limit, skip, sort }
        );
        console.log(`Attempt ${retryCount + 1}: Fetched ${result.documents.length} documents from ${collectionName}`);
        
        // If we got here, we succeeded
        break;
      } catch (attemptError) {
        console.error(`Attempt ${retryCount + 1}: Error fetching documents:`, attemptError);
        lastError = attemptError;
        retryCount++;
        
        // Add a small delay between retries
        if (retryCount < maxRetries) {
          console.log(`Waiting 1 second before retry ${retryCount + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (result) {
      // Success - send a well-formatted response with documents
      return res.json({
        success: true,
        collection: result.collection,
        count: result.count,
        documents: result.documents
      });
    } else {
      // All retries failed
      console.error(`All ${maxRetries} attempts to fetch documents failed.`);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch documents after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
        retries: retryCount
      });
    }
  } catch (error) {
    console.error(`Error fetching documents from ${req.params.collectionName}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add MongoDB status endpoint for health checks and reconnection attempts
router.get('/api/mongodb-status', isAdmin, async (req, res) => {
  try {
    // Restrict to development environment only
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available in development environment'
      });
    }
    
    const mongodbService = require('../services/mongodbService');
    
    // First check current connection state
    const initialState = mongodbService.getConnectionState();
    
    // If already connected, just return the status
    if (initialState.code === 1) {
      return res.json({ 
        success: true, 
        connected: true,
        message: 'MongoDB is already connected',
        state: initialState
      });
    }
    
    console.log('Trying to reconnect to MongoDB...');
    
    // Try to manually load env file first
    try {
      require('dotenv').config({ path: require('path').resolve('.env') });
    } catch (err) {
      console.log('Error loading .env file:', err);
    }
    
    // Force a connection attempt
    try {
      await mongodbService.connect();
      const newState = mongodbService.getConnectionState();
      
      return res.json({ 
        success: true, 
        connected: newState.code === 1,
        message: newState.code === 1 ? 
          'Successfully connected to MongoDB' : 
          'Failed to connect to MongoDB',
        state: newState
      });
    } catch (err) {
      return res.status(500).json({ 
        success: false, 
        connected: false,
        error: err.message, 
        state: mongodbService.getConnectionState()
      });
    }
  } catch (error) {
    console.error('Error in mongodb-status endpoint:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint for MongoDB connection - comprehensive diagnostics
router.get('/api/debug-mongodb', isAdmin, async (req, res) => {
  try {
    // Restrict to development environment only
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available in development environment'
      });
    }
    
    const mongodbService = require('../services/mongodbService');
    const mongoose = require('mongoose');
    const fs = require('fs');
    
    // Don't expose env file contents in production
    let envFileContent = 'Redacted for security';
    
    // Load connection info
    const connectionState = mongodbService.getConnectionState();
    let dbTest = null;
    let databases = [];
    
    // If connected, try a ping
    if (connectionState.code === 1) {
      try {
        await mongoose.connection.db.admin().ping();
        dbTest = 'successful';
        
        // Try to list databases
        const dbList = await mongoose.connection.db.admin().listDatabases();
        databases = dbList.databases.map(db => db.name);
      } catch (err) {
        dbTest = `failed: ${err.message}`;
      }
    }
    
    const connectionInfo = {
      readyState: mongoose.connection.readyState,
      status: connectionState.status,
      uri: process.env.MONGODB_URI ? 'URI defined but hidden for security' : 'Not defined in environment',
      mongooseVersion: mongoose.version,
      dbTest,
      databases
    };
    
    return res.json({
      success: true, 
      connection: connectionInfo,
      env: {
        exists: fs.existsSync('.env'),
        path: require('path').resolve('.env')
      },
      envVars: {
        MONGODB_URI: !!process.env.MONGODB_URI,
        NODE_ENV: process.env.NODE_ENV || 'not set'
      }
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Add a logging endpoint to diagnose collection issues
router.get('/api/debug-collections', isAdmin, async (req, res) => {
  try {
    // Restrict to development environment only
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available in development environment'
      });
    }
    
    console.log('Debug collections endpoint called');
    const mongodbService = require('../services/mongodbService');
    
    // Check connection state first
    const connectionState = mongodbService.getConnectionState();
    console.log('MongoDB connection state:', connectionState);
    
    // Try to get collections directly
    if (connectionState.code !== 1) {
      // Try to connect first
      console.log('MongoDB not connected, attempting to connect...');
      try {
        await mongodbService.connect();
        console.log('Connected to MongoDB');
      } catch (connError) {
        console.error('Failed to connect to MongoDB:', connError);
        return res.status(500).json({
          success: false,
          error: 'Connection failed: ' + connError.message,
          connectionState: mongodbService.getConnectionState()
        });
      }
    }
    
    console.log('Attempting to list collections...');
    
    // Get collections with direct error handling
    try {
      const mongoose = require('mongoose');
      // Try direct Mongoose approach
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      console.log(`Found ${collections.length} collections via direct mongoose call`);
      
      // Try service approach for comparison
      let serviceCollections = [];
      try {
        serviceCollections = await mongodbService.listCollections();
        console.log(`Found ${serviceCollections.length} collections via service`);
      } catch (serviceErr) {
        console.error('Service listCollections error:', serviceErr);
      }
      
      return res.json({
        success: true,
        connectionState: mongodbService.getConnectionState(),
        directCollections: collections.map(c => c.name),
        serviceCollections: serviceCollections.map(c => c.name),
        databaseName: mongoose.connection.db.databaseName
      });
    } catch (error) {
      console.error('Error listing collections in debug endpoint:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        connectionState: mongodbService.getConnectionState()
      });
    }
  } catch (error) {
    console.error('Unexpected error in debug-collections endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add a new endpoint using our optimized collection names method
router.get('/api/collection-names', isAdmin, async (req, res) => {
  try {
    console.log('Collection names API endpoint called');
    
    // Simple collection names retrieval with retry mechanism
    let maxRetries = 3;
    let retryCount = 0;
    let collectionNames = null;
    let lastError = null;
    
    while (retryCount < maxRetries) {
      try {
        // Check connection first
        if (!mongodbService.isConnected()) {
          console.log(`Attempt ${retryCount + 1}: MongoDB not connected, connecting...`);
          await mongodbService.connect();
        }
        
        // Get collection names using optimized method
        console.log(`Attempt ${retryCount + 1}: Fetching collection names...`);
        collectionNames = await mongodbService.getCollectionNames();
        console.log(`Attempt ${retryCount + 1}: Retrieved ${collectionNames.length} collection names`);
        break; // Success, exit loop
      } catch (error) {
        lastError = error;
        retryCount++;
        console.error(`Attempt ${retryCount}: Failed to get collection names:`, error);
        
        // Wait before retry
        if (retryCount < maxRetries) {
          console.log(`Waiting 1 second before retry ${retryCount + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (collectionNames) {
      return res.json({
        success: true,
        collections: collectionNames.map(name => ({ name, type: 'collection' })),
        total: collectionNames.length
      });
    } else {
      return res.status(500).json({
        success: false,
        error: `Failed to retrieve collection names after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
      });
    }
  } catch (error) {
    console.error('Error in collection-names endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add an enhanced database health check endpoint that provides detailed diagnostics
router.get('/api/db-health', isAdmin, async (req, res) => {
  try {
    console.log('Database health check API endpoint called');
    
    // Get detailed health information
    const health = await mongodbService.checkHealth();
    
    // Add performance metrics if possible
    let performanceMetrics = null;
    if (health.connected && health.pingSuccess) {
      try {
        const db = mongoose.connection.db;
        performanceMetrics = {
          serverStatus: await db.admin().serverStatus(),
        };
      } catch (metricErr) {
        console.warn('Could not get performance metrics:', metricErr);
      }
    }
    
    return res.json({
      success: true,
      health,
      performanceMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in db-health endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete user route
router.post('/users/:id/delete', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const User = require('../models/user');
    const Game = require('../models/game');
    
    // Delete the user
    await User.findByIdAndDelete(userId);
    
    // Get list of games that had user stats before we remove them
    const gamesWithUserStats = await Game.find({ 'userStats.user': userId });
    
    // Remove user stats from games
    await Game.updateMany(
      {},
      { $pull: { userStats: { user: userId } } }
    );
    
    // Get updated game data for real-time updates
    const updatedGames = await Promise.all(gamesWithUserStats.map(async (game) => {
      const updatedGame = await Game.findById(game._id);
      return {
        _id: updatedGame._id,
        name: updatedGame.name,
        totalPlayTime: updatedGame.totalPlayTime || 0,
        uniquePlayers: updatedGame.userStats ? updatedGame.userStats.length : 0
      };
    }));
    
    // If it's an AJAX request, return JSON
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({
        success: true,
        message: 'User deleted successfully',
        updatedGames: updatedGames
      });
    }
    
    // For regular form submissions, redirect back to admin dashboard
    return res.redirect('/admin');
  } catch (error) {
    console.error('Error deleting user:', error);
    
    // If it's an AJAX request, return JSON error
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        error: error.message
      });
    }
    
    // For regular form submissions, render error page
    return res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to delete user',
      error
    });
  }
});

// Admin dashboard render route
router.get('/', isAdminOrDeveloper, async (req, res) => {
  try {
    // Fetch all users for the admin dashboard
    const User = require('../models/user');
    const Game = require('../models/game');
    
    const users = await User.find({});
    const games = await Game.find({});
    
    // Generate common languages list to replace the removed SUPPORTED_LANGUAGES
    const commonLanguages = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'nl': 'Dutch',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'tr': 'Turkish'
    };
    
    // Determine if the user is a developer only (not admin)
    const isDeveloperOnly = req.session && req.session.user && 
                            ((req.session.user.isDeveloper === true) ||
                             (req.session.user.roles && req.session.user.roles.isDeveloper === true)) &&
                            !(req.session.user.roles && req.session.user.roles.isAdmin === true) &&
                            !(req.session.user.isAdmin === true);
    
    res.render('admin-dashboard', { 
      title: isDeveloperOnly ? 'Developer Dashboard' : 'Admin Dashboard',
      users,
      games,
      translationService,
      commonLanguages,
      isDeveloperOnly // Pass this to the template to customize UI for developers
    });
  } catch (error) {
    console.error('Error rendering admin dashboard:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load admin dashboard',
      error: error
    });
  }
});

module.exports = router;