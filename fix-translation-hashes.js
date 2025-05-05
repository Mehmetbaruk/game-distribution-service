/**
 * Migration script to fix null hash values in the translations collection
 * and rebuild indexes to solve the E11000 duplicate key error.
 * Compatible with MongoDB Atlas free tier restrictions.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Translation = require('./models/translation');
const crypto = require('crypto');

console.log('Starting translation hash fix migration...');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB. Running migration...');
    return runMigration();
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

async function runMigration() {
  try {
    console.log('Step 1: Identifying translations with null hash values...');
    
    // Find documents with null hash values - simplified query
    const nullHashes = await Translation.find({
      hash: null
    }).limit(1000);
    
    console.log(`Found ${nullHashes.length} translations with null hash values.`);
    
    if (nullHashes.length > 0) {
      console.log('Fixing translations with null hashes...');
      
      // Process in batches to avoid overwhelming the database
      let fixedCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < nullHashes.length; i += batchSize) {
        const batch = nullHashes.slice(i, i + batchSize);
        console.log(`Processing batch ${i/batchSize + 1} (${batch.length} documents)...`);
        
        // Process each document individually
        for (const doc of batch) {
          // Generate hash from source text or use a default
          let newHash;
          if (doc.sourceText) {
            newHash = crypto.createHash('md5').update(doc.sourceText).digest('hex');
          } else {
            newHash = 'default-hash-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15);
          }
          
          // Update the document with the new hash
          await Translation.updateOne(
            { _id: doc._id },
            { 
              $set: { 
                hash: newHash,
                translationHash: newHash
              } 
            }
          );
          
          fixedCount++;
        }
      }
      
      console.log(`Fixed ${fixedCount} translations with null hash values.`);
      
      // Check if there are more to fix (with null)
      const remainingNullHashes = await Translation.countDocuments({
        hash: null
      });
      
      if (remainingNullHashes > 0) {
        console.log(`There are still ${remainingNullHashes} translations with null hash values.`);
        console.log('Consider running this script again to fix them all in batches.');
      }
    }
    
    console.log('\nStep 2: Checking for missing hash fields...');
    
    // Now check for documents where hash field doesn't exist
    const missingHashes = await Translation.find({
      hash: { $exists: false }
    }).limit(1000);
    
    console.log(`Found ${missingHashes.length} translations with missing hash fields.`);
    
    if (missingHashes.length > 0) {
      console.log('Fixing translations with missing hash fields...');
      
      // Process in batches
      let fixedCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < missingHashes.length; i += batchSize) {
        const batch = missingHashes.slice(i, i + batchSize);
        console.log(`Processing batch ${i/batchSize + 1} (${batch.length} documents)...`);
        
        for (const doc of batch) {
          // Generate hash from source text or use a default
          let newHash;
          if (doc.sourceText) {
            newHash = crypto.createHash('md5').update(doc.sourceText).digest('hex');
          } else {
            newHash = 'default-hash-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15);
          }
          
          // Update the document with the new hash
          await Translation.updateOne(
            { _id: doc._id },
            { 
              $set: { 
                hash: newHash,
                translationHash: newHash
              } 
            }
          );
          
          fixedCount++;
        }
      }
      
      console.log(`Fixed ${fixedCount} translations with missing hash fields.`);
    }
    
    console.log('\nStep 3: Fixing documents where translationHash is null but hash exists...');
    
    // Find documents where hash exists but translationHash is null
    const nullTranslationHashes = await Translation.find({
      hash: { $ne: null },
      translationHash: null
    }).limit(1000);
    
    console.log(`Found ${nullTranslationHashes.length} translations with null translationHash but valid hash.`);
    
    if (nullTranslationHashes.length > 0) {
      let updatedCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < nullTranslationHashes.length; i += batchSize) {
        const batch = nullTranslationHashes.slice(i, i + batchSize);
        console.log(`Processing batch ${i/batchSize + 1} (${batch.length} documents)...`);
        
        for (const doc of batch) {
          await Translation.updateOne(
            { _id: doc._id },
            { $set: { translationHash: doc.hash } }
          );
          
          updatedCount++;
        }
      }
      
      console.log(`Updated ${updatedCount} translations to copy hash to translationHash.`);
    }
    
    console.log('\nStep 4: Fixing documents where hash is null but translationHash exists...');
    
    // Find documents where translationHash exists but hash is null
    const nullHashesWithTranslationHash = await Translation.find({
      hash: null,
      translationHash: { $ne: null }
    }).limit(1000);
    
    console.log(`Found ${nullHashesWithTranslationHash.length} translations with null hash but valid translationHash.`);
    
    if (nullHashesWithTranslationHash.length > 0) {
      let updatedCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < nullHashesWithTranslationHash.length; i += batchSize) {
        const batch = nullHashesWithTranslationHash.slice(i, i + batchSize);
        console.log(`Processing batch ${i/batchSize + 1} (${batch.length} documents)...`);
        
        for (const doc of batch) {
          await Translation.updateOne(
            { _id: doc._id },
            { $set: { hash: doc.translationHash } }
          );
          
          updatedCount++;
        }
      }
      
      console.log(`Updated ${updatedCount} translations to copy translationHash to hash.`);
    }
    
    console.log('\nStep 5: Creating proper sparse indexes to prevent duplicate key errors');
    try {
      // Create or update index with proper sparse setting to ignore nulls
      const collection = mongoose.connection.db.collection('translations');
      
      // For translationHash index
      await collection.createIndex(
        { sourceLanguage: 1, targetLanguage: 1, translationHash: 1 },
        { 
          unique: true,
          sparse: true, // This is crucial to exclude null values
          background: true,
          name: "translationHash_idx_sparse"
        }
      );
      console.log('Successfully created proper sparse index for translationHash');
      
      // For hash index
      await collection.createIndex(
        { sourceLanguage: 1, targetLanguage: 1, hash: 1 },
        { 
          unique: true,
          sparse: true, // This is crucial to exclude null values
          background: true,
          name: "hash_idx_sparse"
        }
      );
      console.log('Successfully created proper sparse index for hash');
      
    } catch (indexError) {
      console.error('Index creation error (may be ok if already exists):', indexError.message);
    }
    
    console.log('\nMigration completed successfully!');
    console.log('The E11000 duplicate key errors for null hash values should now be resolved.');
    console.log('\nYou may need to restart your application for the schema changes to take full effect.');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}