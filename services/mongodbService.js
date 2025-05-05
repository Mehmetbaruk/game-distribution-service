const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Try to load environment variables from both .env and .env.local
try {
  require('dotenv').config();
  // Explicitly try to load from .env.local if it exists
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    require('dotenv').config({ path: envLocalPath });
  }
} catch (err) {
  console.error('Error loading environment variables:', err);
}

class MongoDBService {
  constructor() {
    this.isConnecting = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryInterval = 5000; // 5 seconds
    
    // Load environment variables if not already loaded
    this.loadEnvironmentVariables();
    
// Improve the connection options with longer timeouts
this.connectionOptions = {
    serverSelectionTimeoutMS: 30000, // Increase to 30 seconds (from 10)
    socketTimeoutMS: 60000, // Increase to 60 seconds (from 45)
    connectTimeoutMS: 30000, // Increase to 30 seconds (from 10)
    keepAlive: true,
    useNewUrlParser: true,
    useUnifiedTopology: true // Add this option for better connection stability
  };
    
    // Connection state constants
    this.states = {
      disconnected: 0,
      connected: 1,
      connecting: 2,
      disconnecting: 3,
    };
    
    // Cache for collections information to improve performance
    this.collectionsCache = {
      data: null,
      timestamp: null,
      maxAge: 60000 // 1 minute cache expiry
    };
    
    // Setup event handlers
    this.setupEventHandlers();
  }
  
  // Helper method to ensure environment variables are loaded
  loadEnvironmentVariables() {
    // If MONGODB_URI is not defined, try to load it properly through dotenv
    if (!process.env.MONGODB_URI) {
      console.log('MONGODB_URI not found in environment, attempting to load from .env files');
      
      try {
        // Try standard .env file
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          console.log('.env file found, loading environment variables');
          require('dotenv').config({ path: envPath });
        }
        
        // Also try .env.local which takes precedence
        const envLocalPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envLocalPath)) {
          console.log('.env.local file found, loading environment variables');
          require('dotenv').config({ path: envLocalPath });
        }
        
        if (process.env.MONGODB_URI) {
          console.log('Successfully loaded MONGODB_URI from .env file');
        } else {
          console.error('Failed to load MONGODB_URI from .env files');
          // No manual file reading - this is a security risk
          console.error('Please ensure MONGODB_URI is properly set in your environment variables');
        }
      } catch (error) {
        console.error('Error loading environment variables:', error);
      }
    }
  }
  
  setupEventHandlers() {
    mongoose.connection.on('connected', () => {
      console.log('MongoDB connection established successfully');
      this.connectionRetries = 0;
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      // Try to reconnect if not already connecting and not at max retries
      if (!this.isConnecting && this.connectionRetries < this.maxRetries) {
        this.reconnect();
      }
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
      this.closeConnection();
    });
  }
  
  async connect() {
    if (this.isConnected()) {
      console.log('MongoDB is already connected');
      
      // Ensure the connection is actually working with a ping test
      try {
        await mongoose.connection.db.admin().ping();
        console.log('MongoDB connection verified with ping test');
        return mongoose.connection;
      } catch (pingErr) {
        console.warn('MongoDB connection appears to be disconnected despite status. Reconnecting...');
        // Force a reconnection since the ping failed
        try {
          await this.forceReconnect();
          return mongoose.connection;
        } catch (reconnErr) {
          throw new Error(`Connection verification failed: ${reconnErr.message}`);
        }
      }
    }
    
    if (this.isConnecting) {
      console.log('MongoDB connection is in progress');
      // Return a promise that resolves when the connection is established
      return new Promise((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (this.isConnected()) {
            clearInterval(checkConnection);
            resolve(mongoose.connection);
          } else if (!this.isConnecting) {
            clearInterval(checkConnection);
            reject(new Error('Connection attempt failed'));
          }
        }, 500);
        
        // Add a timeout to avoid hanging forever
        setTimeout(() => {
          if (!this.isConnected()) {
            clearInterval(checkConnection);
            this.isConnecting = false;
            reject(new Error('Connection attempt timed out'));
          }
        }, 15000); // 15 second timeout
      });
    }
    
    this.isConnecting = true;
    
    try {
      // Make sure we have the MongoDB URI
      this.loadEnvironmentVariables();
      
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        this.isConnecting = false;
        throw new Error('MONGODB_URI is not defined in environment variables');
      }
      
      console.log('Connecting to MongoDB...');
      await mongoose.connect(uri, this.connectionOptions);
      this.isConnecting = false;
      
      // Perform a test query to ensure the connection is working
      try {
        const connectionStatus = await mongoose.connection.db.admin().ping();
        console.log('MongoDB ping test:', connectionStatus);
      } catch (pingErr) {
        console.warn('MongoDB ping test failed:', pingErr.message);
        // If ping fails, throw an error to trigger a retry
        throw new Error(`Connection established but ping test failed: ${pingErr.message}`);
      }
      
      return mongoose.connection;
    } catch (error) {
      this.isConnecting = false;
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }
  
  async forceReconnect() {
    console.log('Forcing MongoDB reconnection...');
    // Close any existing connection
    try {
      if (mongoose.connection.readyState !== this.states.disconnected) {
        await mongoose.connection.close();
        console.log('Closed existing MongoDB connection for reconnection');
      }
    } catch (closeErr) {
      console.error('Error closing MongoDB connection:', closeErr);
      // Continue anyway - we'll try to reconnect
    }
    
    // Reset connection state
    this.isConnecting = false;
    
    // Clear cache when reconnecting
    this.clearCollectionsCache();
    
    // Reconnect
    return this.connect();
  }
  
  async reconnect() {
    if (this.isConnecting) return;
    
    this.connectionRetries++;
    console.log(`Attempting to reconnect to MongoDB (${this.connectionRetries}/${this.maxRetries})...`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error(`Reconnection attempt ${this.connectionRetries} failed:`, error);
        // If we've reached max retries, stop trying
        if (this.connectionRetries >= this.maxRetries) {
          console.error(`Reached maximum reconnection attempts (${this.maxRetries}). Giving up.`);
        }
      }
    }, this.retryInterval);
  }
  
  isConnected() {
    return mongoose.connection.readyState === this.states.connected;
  }
  
  getConnectionState() {
    const state = mongoose.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return {
      code: state,
      status: stateMap[state] || 'unknown'
    };
  }
  
  async closeConnection() {
    if (mongoose.connection.readyState !== this.states.disconnected) {
      console.log('Closing MongoDB connection...');
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    }
  }
  
  // Cache management for collections
  clearCollectionsCache() {
    this.collectionsCache = {
      data: null,
      timestamp: null,
      maxAge: this.collectionsCache.maxAge
    };
  }
  
  isCacheValid() {
    return (
      this.collectionsCache.data !== null &&
      this.collectionsCache.timestamp !== null &&
      Date.now() - this.collectionsCache.timestamp < this.collectionsCache.maxAge
    );
  }
  
  // Helper method to get the native MongoDB driver's db object
  getDB() {
    if (!this.isConnected()) {
      throw new Error('Cannot get database: MongoDB is not connected');
    }
    return mongoose.connection.db;
  }
  
  // Helper method to get a collection
  getCollection(collectionName) {
    if (!this.isConnected()) {
      throw new Error(`Cannot get collection ${collectionName}: MongoDB is not connected`);
    }
    return mongoose.connection.db.collection(collectionName);
  }
  
  // Count total collections in the database
  async countCollections() {
    if (!this.isConnected()) {
      await this.connect();
    }
    
    try {
      // If we have a valid cache, use the count from there
      if (this.isCacheValid()) {
        return this.collectionsCache.data.length;
      }
      
      // Try multiple approaches to count collections
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        return collections.length;
      } catch (error) {
        console.error('Error counting collections with standard approach:', error);
        
        // Fallback to command-based approach
        try {
          const result = await mongoose.connection.db.command({ listCollections: 1 });
          if (result && result.cursor && result.cursor.firstBatch) {
            return result.cursor.firstBatch.length;
          }
        } catch (cmdError) {
          console.error('Command-based approach for counting collections failed:', cmdError);
        }
        
        throw error; // If all approaches fail, throw the original error
      }
    } catch (error) {
      console.error('Failed to count collections:', error);
      throw error;
    }
  }
  
  // List all collections in the database with pagination support
  async listCollections(options = {}) {
    console.log('listCollections called with options:', options);
    
    const { limit = 100, skip = 0, forceRefresh = false } = options;
    
    // Make sure we're connected
    if (!this.isConnected()) {
      console.log('Not connected, attempting to connect before listing collections');
      try {
        await this.connect();
      } catch (err) {
        console.error('Failed to connect when listing collections:', err);
        throw new Error(`Cannot list collections: MongoDB connection failed - ${err.message}`);
      }
    }
    
    // Verify the connection is actually ready for queries
    try {
      console.log('Testing connection with ping before listing collections');
      await mongoose.connection.db.admin().ping();
      console.log('Ping successful, connection is ready');
    } catch (pingError) {
      console.error('Ping failed before listing collections, reconnecting:', pingError);
      // Force a reconnection
      try {
        await this.forceReconnect();
        console.log('Reconnected after ping failure');
      } catch (reconnErr) {
        console.error('Failed to reconnect:', reconnErr);
        throw new Error(`Cannot list collections: Reconnection failed - ${reconnErr.message}`);
      }
    }
    
    // Check if we can use the cache
    if (!forceRefresh && this.isCacheValid()) {
      console.log('Using cached collection data');
      const total = this.collectionsCache.data.length;
      const paginatedData = this.collectionsCache.data.slice(skip, skip + limit);
      
      return {
        collections: paginatedData,
        total,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(total / limit),
        limit,
        skip
      };
    }
    
    // Try multiple approaches to list collections, with fallbacks
    let collections = null;
    let lastError = null;
    
    // Approach 1: Standard listCollections method
    if (!collections) {
      try {
        console.log('Trying standard listCollections approach...');
        collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`Standard approach found ${collections.length} collections`);
      } catch (error) {
        console.error('Standard listCollections approach failed:', error);
        lastError = error;
      }
    }
    
    // Approach 2: Command-based approach
    if (!collections) {
      try {
        console.log('Trying command-based approach for listCollections...');
        const db = mongoose.connection.db;
        const result = await db.command({ listCollections: 1 });
        
        if (result && result.cursor && result.cursor.firstBatch) {
          collections = result.cursor.firstBatch;
          console.log(`Command approach found ${collections.length} collections`);
        }
      } catch (error) {
        console.error('Command-based listCollections approach failed:', error);
        lastError = error;
      }
    }
    
    // Approach 3: Try to get collection names directly
    if (!collections) {
      try {
        console.log('Trying to get collection names directly...');
        const db = mongoose.connection.db;
        const adminDb = db.admin();
        const dbInfo = await adminDb.listDatabases();
        const currentDbName = db.databaseName;
        
        // Find current database in the list
        const dbEntry = dbInfo.databases.find(d => d.name === currentDbName);
        
        if (dbEntry) {
          // Connect directly to that database to list collections
          const collectionNames = await db.collections();
          collections = collectionNames.map(coll => ({
            name: coll.collectionName,
            type: 'collection',
            info: {}
          }));
          console.log(`Direct approach found ${collections.length} collections`);
        }
      } catch (error) {
        console.error('Direct collection names approach failed:', error);
        lastError = error;
        
        // If all approaches fail, we'll throw the last error
        throw new Error(`Failed to list collections after trying multiple approaches: ${lastError.message}`);
      }
    }
    
    // Format and process the results
    if (collections && collections.length > 0) {
      // Process collection data to a standard format
      const formattedCollections = collections.map(collection => ({
        name: collection.name || collection.collectionName,
        type: 'collection',
        info: collection.options || {}
      }));
      
      // Store in cache
      this.collectionsCache = {
        data: formattedCollections,
        timestamp: Date.now(),
        maxAge: this.collectionsCache.maxAge
      };
      
      // Handle pagination
      const total = formattedCollections.length;
      const paginatedData = formattedCollections.slice(skip, skip + limit);
      
      return {
        collections: paginatedData,
        total,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(total / limit),
        limit,
        skip
      };
    } else {
      // No collections found but no error occurred - return empty array with pagination info
      console.log('No collections found in database');
      return {
        collections: [],
        total: 0,
        page: 1,
        totalPages: 1,
        limit,
        skip
      };
    }
  }
  
  // Get documents from a collection with pagination
  async getDocumentsFromCollection(collectionName, options = {}) {
    const { limit = 20, skip = 0, sort = { _id: -1 } } = options;
    
    if (!this.isConnected()) {
      await this.connect();
    }
    
    try {
      console.log(`Fetching documents from collection '${collectionName}' with options:`, options);
      const collection = this.getCollection(collectionName);
      
      // Get total count with timeout
      console.log(`Starting document count for '${collectionName}'...`);
      const startCountTime = Date.now();
      const countPromise = Promise.race([
        collection.countDocuments(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Count operation timed out')), 10000)
        )
      ]);
      
      const count = await countPromise.catch(err => {
        console.warn(`Count operation failed for ${collectionName}, using estimate:`, err);
        // Fallback to estimated count which is much faster but less accurate
        return collection.estimatedDocumentCount();
      });
      
      console.log(`Count completed in ${Date.now() - startCountTime}ms: ${count} documents found in '${collectionName}'`);
      
      // Get documents with projection to limit data size
      console.log(`Starting document fetch for '${collectionName}'...`);
      const startFetchTime = Date.now();
      const documents = await collection
        .find({})
        .project({ _id: 1, name: 1, title: 1, createdAt: 1, updatedAt: 1 }) // Limit fields
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();
      
      console.log(`Fetch completed in ${Date.now() - startFetchTime}ms: ${documents.length} documents retrieved`);
      
      return {
        collection: collectionName,
        count,
        documents,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(count / limit),
        limit,
        skip
      };
    } catch (error) {
      console.error(`Error fetching documents from ${collectionName}:`, error);
      
      // If there was an error, try to reconnect and try again with a simplified approach
      try {
        console.log(`Attempting simplified retry for ${collectionName}...`);
        await this.forceReconnect();
        
        const collection = this.getCollection(collectionName);
        
        // Use a simpler approach - just get some documents without count
        const documents = await collection
          .find({})
          .project({ _id: 1 }) // Even more minimal projection
          .sort(sort)
          .limit(limit)
          .toArray();
        
        return {
          collection: collectionName,
          count: documents.length, // Approximate count
          documents,
          page: 1,
          totalPages: 1,
          limit,
          skip: 0
        };
      } catch (retryError) {
        console.error(`Retry attempt failed for ${collectionName}:`, retryError);
        throw retryError;
      }
    }
  }
  
  // Get stats for a specific collection
  async getCollectionStats(collectionName) {
    if (!this.isConnected()) {
      await this.connect();
    }
    
    try {
      const db = mongoose.connection.db;
      const stats = await db.command({ collStats: collectionName });
      return stats;
    } catch (error) {
      console.error(`Error getting stats for collection ${collectionName}:`, error);
      throw error;
    }
  }

  // Get only collection names more efficiently
  async getCollectionNames() {
    if (!this.isConnected()) {
      await this.connect();
    }

    // Simple optimized approach to just get names without extra metadata
    try {
      console.log('Getting collection names directly...');
      const db = mongoose.connection.db;
      // Get just the collection names using the command approach which is more efficient
      const result = await db.command({ listCollections: 1, nameOnly: true });
      
      if (result && result.cursor && result.cursor.firstBatch) {
        const collectionNames = result.cursor.firstBatch.map(col => col.name);
        console.log(`Found ${collectionNames.length} collections`);
        return collectionNames;
      }
      
      return [];
    } catch (error) {
      console.error('Error getting collection names:', error);
      throw error;
    }
  }

  // Enhanced method to check database connection health
  async checkHealth() {
    const health = {
      connected: false,
      connectionState: this.getConnectionState(),
      pingSuccess: false,
      databaseStats: null,
      responseTime: 0,
      error: null
    };
    
    try {
      // Check if we're connected
      health.connected = this.isConnected();
      
      if (!health.connected) {
        try {
          console.log('Not connected, attempting to connect for health check');
          const startTime = Date.now();
          await this.connect();
          health.responseTime = Date.now() - startTime;
          health.connected = true;
        } catch (connError) {
          health.error = `Connection failed: ${connError.message}`;
          return health;
        }
      }
      
      // Test ping
      try {
        const startTime = Date.now();
        const pingResult = await mongoose.connection.db.admin().ping();
        health.responseTime = Date.now() - startTime;
        health.pingSuccess = !!pingResult.ok;
      } catch (pingError) {
        health.error = `Ping failed: ${pingError.message}`;
        return health;
      }
      
      // Get database stats if ping successful
      if (health.pingSuccess) {
        try {
          const db = mongoose.connection.db;
          health.databaseStats = await db.stats();
        } catch (statsError) {
          console.warn('Failed to get database stats:', statsError);
          // Don't fail the entire health check for this
        }
      }
      
      return health;
    } catch (error) {
      health.error = `Health check failed: ${error.message}`;
      return health;
    }
  }
}

// Create and export a singleton instance
const mongoDBService = new MongoDBService();
module.exports = mongoDBService;