// Simple script to test MongoDB connection and environment variables
require('dotenv').config();

console.log('----- ENVIRONMENT VARIABLES CHECK -----');
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('MONGODB_URI value:', process.env.MONGODB_URI ? 
  process.env.MONGODB_URI.substring(0, 20) + '...' : 'undefined');
console.log('ENV file path:', require('path').resolve('.env'));
console.log('Current directory:', process.cwd());

// Check if .env file exists
const fs = require('fs');
if (fs.existsSync('.env')) {
  console.log('\n----- .ENV FILE CHECK -----');
  console.log('.env file exists.');
  const envContent = fs.readFileSync('.env', 'utf8');
  // Hide sensitive information
  const safeContent = envContent
    .replace(/MONGODB_URI=.*?(\n|$)/g, 'MONGODB_URI=[HIDDEN]$1')
    .replace(/SESSION_SECRET=.*?(\n|$)/g, 'SESSION_SECRET=[HIDDEN]$1');
  console.log('Content:', safeContent);
} else {
  console.log('\n.env file not found!');
}

// Try connecting to MongoDB
console.log('\n----- MONGODB CONNECTION TEST -----');
const mongoose = require('mongoose');
const mongodbService = require('./services/mongodbService');

// Check connection state
const connState = mongodbService.getConnectionState();
console.log('Initial connection state:', connState);

// Try to connect
console.log('Attempting to connect to MongoDB...');
mongodbService.connect()
  .then(() => {
    console.log('Connection successful!');
    console.log('New connection state:', mongodbService.getConnectionState());
    
    // List collections to verify connection
    return mongodbService.listCollections();
  })
  .then((collections) => {
    console.log(`Found ${collections.length} collections:`, 
      collections.map(col => col.name));
    
    // Close connection
    return mongodbService.closeConnection();
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    
    // Try manual connection with uri directly from .env
    if (fs.existsSync('.env')) {
      console.log('\nTrying manual connection from .env file...');
      const envFile = fs.readFileSync('.env', 'utf8');
      const uriMatch = envFile.match(/MONGODB_URI=(.*?)(\n|$)/);
      
      if (uriMatch && uriMatch[1]) {
        const directUri = uriMatch[1].trim();
        console.log(`Connecting directly with URI from .env file...`);
        
        mongoose.connect(directUri, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 5000
        })
        .then(() => {
          console.log('Manual connection successful!');
          console.log('MongoDB connection state:', mongoose.connection.readyState);
          return mongoose.connection.close();
        })
        .catch(directErr => {
          console.error('Manual connection failed too:', directErr.message);
          
          if (directErr.message.includes('authentication failed')) {
            console.log('\nPossible authentication issue! Check username/password in your connection string.');
          }
          if (directErr.message.includes('timed out')) {
            console.log('\nConnection timed out. Check network connectivity and MongoDB server status.');
          }
        });
      }
    }
  });