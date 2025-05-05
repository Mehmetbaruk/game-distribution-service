/**
 * Script to clean up empty translations in the database
 */

// Load environment variables
require('dotenv').config();
const mongoose = require('mongoose');
const Translation = require('./models/translation');

console.log('Starting translation cleanup script...');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    runCleanup();
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

async function runCleanup() {
  try {
    console.log('Finding empty or identical translations...');
    
    // Find and delete translations where the translated text is empty or identical to source text
    const result = await Translation.deleteMany({
      $or: [
        { translatedText: "" },
        { translatedText: null },
        { $expr: { $eq: ["$sourceText", "$translatedText"] } }
      ]
    });
    
    console.log(`Deleted ${result.deletedCount} empty or identical translations`);
    
    // Find Turkish translations that need attention
    console.log('\nFinding Turkish translations needing attention...');
    const turkishCount = await Translation.countDocuments({
      targetLanguage: 'tr',
      $or: [
        { translatedText: { $exists: false } },
        { translatedText: "" },
        { translatedText: null }
      ]
    });
    
    console.log(`Found ${turkishCount} Turkish translations that need attention`);
    
    if (turkishCount > 0) {
      console.log('To fix these translations, you need to restart your application');
      console.log('Now that you have set up your OPENAI_API_KEY, the translations will be generated automatically');
    }
    
    console.log('\nCleanup completed successfully!');
    
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}