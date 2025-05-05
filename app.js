const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const methodOverride = require('method-override');
const path = require('path');
const bodyParser = require('body-parser');
const ejsLayouts = require('express-ejs-layouts');
const mongodbService = require('./services/mongodbService');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import routes
const indexRoutes = require('./routes/index');
const userRoutes = require('./routes/users');
const gameRoutes = require('./routes/games');
const adminRoutes = require('./routes/admin'); 
const assistantRoutes = require('./routes/assistant'); 

const app = express();

// Verify MongoDB URI is available
if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set!');
  console.error('Make sure you have a .env file with MONGODB_URI defined.');
  console.error('Example: MONGODB_URI=mongodb://localhost:27017/gamedistribution');
  console.error('Current environment variables:', Object.keys(process.env));
  // We'll continue execution but warn that MongoDB features won't work
}

// Connect to MongoDB using our service
(async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    await mongodbService.connect();
    console.log('Connected to MongoDB via mongodbService');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    console.error('Application will continue but database features may not work.');
    // Don't exit process, allow application to run with degraded functionality
  }
})();

// Session store setup - only if MongoDB URI is available
let store;
if (process.env.MONGODB_URI) {
  store = new MongoDBStore({
    uri: process.env.MONGODB_URI,
    collection: 'sessions',
    connectionOptions: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000
    }
  });

  store.on('error', function(error) {
    console.log('Session store error:', error);
  });
} else {
  console.warn('WARNING: Using memory session store as MONGODB_URI is not available.');
  // Use memory store as fallback
}

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// EJS Layouts
app.use(ejsLayouts);
app.set('layout', 'layout');

// Session middleware
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  },
  resave: false,
  saveUninitialized: false
};

// Check if session secret exists
if (!process.env.SESSION_SECRET) {
  console.error('ERROR: SESSION_SECRET is not defined in environment variables!');
  console.error('This is a security risk. Please define SESSION_SECRET in your .env file.');
}

if (store) {
  sessionConfig.store = store;
}

app.use(session(sessionConfig));

// Middleware to make the user available to all templates
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Translation middleware - translate page content based on user preference
app.use((req, res, next) => {
  try {
    const originalRender = res.render;
    
    res.render = function(view, options = {}, callback) {
      // Get user's preferred language from session or query parameter
      const userLanguage = 
        (req.query.lang) || 
        (req.session && req.session.user && req.session.user.preferredLanguage) || 
        'en';
      
      // Only process translations for non-English languages
      if (userLanguage !== 'en') {
        console.log(`[ServerTranslation] Applying server-side translation for language: ${userLanguage}`);
        
        // Add language info to the options
        options.currentLanguage = userLanguage;
        
        const translationService = require('./services/translationService');
        options.languageName = translationService.getLanguageName(userLanguage);
        
        // Initialize the translations cache if it doesn't exist
        if (!req.app.locals.translations) {
          req.app.locals.translations = {};
        }
        
        // Create a collector for texts that need translation
        const textsToTranslate = [];
        const originalTextsMap = {}; // To map translated text back to its position
        
        // Add translation function to options - this collects texts for batch translation
        options.t = function(text) {
          if (!text || userLanguage === 'en') return text;
          
          // Check app-level cache first for immediate response
          const cacheKey = userLanguage + ":" + text;
          if (req.app.locals.translations[cacheKey]) {
            return req.app.locals.translations[cacheKey];
          }
          
          // Add to the list of texts to translate
          if (textsToTranslate.indexOf(text) === -1) {
            textsToTranslate.push(text);
            originalTextsMap[text] = text;
          }
          
          return text; // Return original text for first render
        };
        
        // After rendering is complete, translate all texts in batch in the background
        const originalEnd = res.end;
        res.end = function(chunk, encoding) {
          // Call the original end first to send the response
          const result = originalEnd.call(this, chunk, encoding);
          
          // Then start the background translation process
          if (textsToTranslate.length > 0) {
            setTimeout(async () => {
              try {
                console.log(`[BatchTranslation] Translating ${textsToTranslate.length} texts in batch for language: ${userLanguage}`);
                
                // Use the batch translation API with all collected texts
                const translatedTexts = await translationService.bulkTranslateTexts(
                  textsToTranslate, 
                  'en', 
                  userLanguage,
                  view // Use current view as page key
                );
                
                // Store all translations in app-level cache and MongoDB
                translatedTexts.forEach((translatedText, index) => {
                  const originalText = textsToTranslate[index];
                  if (translatedText && originalText !== translatedText) {
                    const cacheKey = userLanguage + ":" + originalText;
                    req.app.locals.translations[cacheKey] = translatedText;
                    
                    // No need to await here as we're in a background process
                    try {
                      translationService.storeTranslation(
                        originalText, 
                        translatedText, 
                        'en', 
                        userLanguage,
                        view
                      );
                    } catch (err) {
                      console.error('[BatchTranslation] Error storing translation:', err.message);
                    }
                  }
                });
                
                console.log(`[BatchTranslation] Successfully translated and cached ${translatedTexts.length} texts for ${userLanguage}`);
              } catch (err) {
                console.error(`[BatchTranslation] Background translation error: ${err.message}`);
              }
            }, 0);
          }
          
          return result;
        };
      }
      
      // Proceed with rendering regardless of translation
      return originalRender.call(this, view, options, callback);
    };
    
    next();
  } catch (error) {
    console.error(`[ServerTranslation] Error in translation middleware: ${error.message}`);
    next();
  }
});

// Routes
app.use('/', indexRoutes);
app.use('/users', userRoutes);
app.use('/games', gameRoutes);
app.use('/admin', adminRoutes);
app.use('/assistant', assistantRoutes);

// Error handling middleware
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { 
    title: 'Error', 
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;