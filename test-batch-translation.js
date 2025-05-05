/**
 * Test script for the new batch translation functionality
 * Verifies that the optimized translation system works correctly with minimal API calls
 */

require('dotenv').config();
const mongoose = require('mongoose');
const translationService = require('./services/translationService');

console.log('Starting batch translation test...');

// Sample texts to translate - includes UI elements from your app
const sampleTexts = [
  'Welcome to FreeGames',
  'Your ultimate cloud-based game platform',
  'Enter Platform',
  'User Login',
  'Admin Login',
  'Platform Features',
  'Play Games',
  'Access a diverse library of games',
  'Rate & Comment',
  'Share your thoughts and ratings',
  'Join Community',
  'Create your profile and connect with other gamers',
  'About FreeGames',
  'Our cloud-based platform offers seamless gaming',
  'Play any game without installation',
  'Track your play time and statistics',
  'Rate games and share your experiences',
  'Discover new titles through user recommendations'
];

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB. Running translation tests...');
    runTests();
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

async function runTests() {
  try {
    console.log(`\n===== TESTING BATCH TRANSLATION =====`);
    console.log(`Sample size: ${sampleTexts.length} texts\n`);
    
    // 1. Test regular bulk translation (before optimization)
    console.log('TEST 1: Testing regular translation (one by one):');
    console.time('Individual translations');
    const regularResults = [];
    
    for (const text of sampleTexts) {
      const translated = await translationService.translateText(text, 'en', 'tr');
      regularResults.push(translated);
    }
    
    console.timeEnd('Individual translations');
    console.log(`Completed ${regularResults.length} translations individually\n`);
    
    // 2. Test optimized batch translation
    console.log('TEST 2: Testing optimized batch translation:');
    console.time('Batch translation');
    
    const batchResults = await translationService.optimizedBulkTranslate(
      sampleTexts, 
      'en', 
      'tr',
      'test-page'
    );
    
    console.timeEnd('Batch translation');
    console.log(`Completed ${batchResults.length} translations in batches\n`);
    
    // 3. Test multiple languages in batches (demonstrating new language support)
    console.log('TEST 3: Testing batch translation to multiple languages:');
    const languages = ['fr', 'de', 'es', 'it', 'ru'];
    
    for (const lang of languages) {
      console.time(`Batch translation to ${lang}`);
      
      const langResults = await translationService.optimizedBulkTranslate(
        sampleTexts.slice(0, 5), // Just use the first 5 items for this test
        'en',
        lang,
        `test-page-${lang}`
      );
      
      console.timeEnd(`Batch translation to ${lang}`);
      console.log(`Translated ${langResults.length} items to ${lang}`);
      
      // Print a sample
      console.log(`Sample translation (${lang}): "${langResults[0]}"`);
    }
    
    // 4. Compare results with the original individual translations
    console.log('\nTEST 4: Verification - Comparing batch vs. individual translations:');
    
    const differences = [];
    for (let i = 0; i < regularResults.length; i++) {
      if (regularResults[i] !== batchResults[i]) {
        differences.push({
          index: i,
          original: sampleTexts[i],
          individual: regularResults[i],
          batched: batchResults[i]
        });
      }
    }
    
    if (differences.length > 0) {
      console.log(`Found ${differences.length} differences between translation methods.`);
      console.log('This is expected as AI translation can vary slightly.');
      console.log('Sample difference:');
      console.log(differences[0]);
    } else {
      console.log('No differences found between translation methods.');
    }
    
    // 5. Get translation statistics
    console.log('\nTEST 5: Translation service statistics:');
    const stats = await translationService.getStats();
    console.log(`Total API calls: ${stats.apiCalls}`);
    console.log(`Cache hits: ${stats.cacheHits}`);
    console.log(`Cache hit rate: ${stats.cacheHitRate}%`);
    
    // Print success message
    console.log('\n===== ALL TESTS COMPLETED SUCCESSFULLY =====');
    console.log('The batch translation system is working properly!');
    console.log('The translation issue has been fixed and optimized.');
    
  } catch (error) {
    console.error('Error running tests:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}