/**
 * Translation Model
 * Handles translation caching in MongoDB
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// Schema for translation documents
const translationSchema = new mongoose.Schema({
  // Define both field names to handle the inconsistency
  sourceText: {
    type: String,
    required: true,
    trim: true
  },
  originalText: {
    type: String,
    trim: true
  },
  translatedText: {
    type: String,
    required: true
  },
  sourceLanguage: {
    type: String,
    required: true,
    trim: true
  },
  targetLanguage: {
    type: String,
    required: true,
    trim: true
  },
  // Add hash field for content hashing
  hash: {
    type: String,
    trim: true,
    default: function() {
      // Generate hash from source text if available
      if (this.sourceText) {
        return crypto.createHash('md5').update(this.sourceText).digest('hex');
      }
      return null;
    }
  },
  // Legacy field name for backwards compatibility
  translationHash: {
    type: String,
    trim: true
  },
  pageKey: {
    type: String,
    trim: true,
    index: true
  },
  elementKey: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  usageCount: {
    type: Number,
    default: 1
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
});

// Create compound indexes for fast lookup but with better uniqueness constraints
translationSchema.index({ 
  sourceText: 1, 
  sourceLanguage: 1, 
  targetLanguage: 1 
}, { 
  unique: false, // Changed from unique:true to avoid constraint errors
  sparse: true,  // Only index non-null values
  background: true // Allow other operations during index creation
});

// Create index for originalText without uniqueness constraint
translationSchema.index({ 
  originalText: 1, 
  sourceLanguage: 1, 
  targetLanguage: 1 
}, { 
  unique: false, // Changed from unique:true to avoid constraint errors
  sparse: true,  // Only index non-null values
  background: true
});

// Use a composite index with all fields for better uniqueness management
translationSchema.index({ 
  sourceLanguage: 1, 
  targetLanguage: 1,
  hash: 1,
  createdAt: 1 // Added createdAt for better uniqueness
}, { 
  unique: false, // We'll handle uniqueness in code instead
  sparse: true,  // Only index non-null values
  background: true
});

// Remove the problematic unique constraints from legacy field index
translationSchema.index({ 
  sourceLanguage: 1, 
  targetLanguage: 1,
  translationHash: 1
}, { 
  unique: false, // Changed from unique:true
  sparse: true,
  background: true
});

// Rest of the indexes
translationSchema.index({
  pageKey: 1,
  elementKey: 1,
  targetLanguage: 1
}, {
  background: true
});

// Find a translation based on text and languages
translationSchema.statics.findTranslation = async function(sourceText, sourceLanguage, targetLanguage) {
  if (!sourceText) return null;
  
  // Generate hash for lookup
  const textHash = sourceText ? crypto.createHash('md5').update(sourceText).digest('hex') : null;
  
  // Try with both field names and hash
  const bySourceText = await this.findOne({
    $or: [
      { sourceText, sourceLanguage, targetLanguage },
      { originalText: sourceText, sourceLanguage: targetLanguage },
      { hash: textHash, sourceLanguage: targetLanguage },
      { translationHash: textHash, sourceLanguage: targetLanguage } // Add support for legacy field
    ]
  });
  
  return bySourceText;
};

// Find a translation based on page and element keys (unchanged)
translationSchema.statics.findPageElementTranslation = async function(pageKey, elementKey, targetLanguage) {
  if (!pageKey || !elementKey) return null;
  
  return this.findOne({
    pageKey,
    elementKey,
    targetLanguage
  });
};

// Find all translations for a specific page (unchanged)
translationSchema.statics.findPageTranslations = async function(pageKey, targetLanguage) {
  if (!pageKey) return [];
  
  return this.find({
    pageKey,
    targetLanguage
  });
};

// Create or update a translation
translationSchema.statics.createOrUpdateTranslation = async function(
  sourceText, 
  translatedText, 
  sourceLanguage, 
  targetLanguage,
  pageKey = null,
  elementKey = null
) {
  // Stronger validation to prevent storing null/empty values
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim() === '') {
    console.warn('Attempted to store empty or null sourceText, skipping database operation');
    return null;
  }
  
  if (!translatedText || typeof translatedText !== 'string') {
    console.warn('Attempted to store empty or null translatedText, skipping database operation');
    return null;
  }
  
  // Ensure we have valid language codes
  if (!sourceLanguage || !targetLanguage) {
    console.warn('Missing language codes, skipping database operation');
    return null;
  }
  
  try {
    // Clean up the inputs
    const cleanSourceText = sourceText.trim();
    const cleanTranslatedText = translatedText.trim();
    
    // Generate hash for the source text
    const textHash = cleanSourceText ? crypto.createHash('md5').update(cleanSourceText).digest('hex') : null;
    
    // First check if translation already exists (this is safer than upsert with our indexes)
    const existingTranslation = await this.findOne({
      $or: [
        { sourceText: cleanSourceText, sourceLanguage, targetLanguage },
        { hash: textHash, sourceLanguage, targetLanguage }
      ]
    });
    
    if (existingTranslation) {
      // Update existing translation
      existingTranslation.translatedText = cleanTranslatedText;
      existingTranslation.updatedAt = new Date();
      existingTranslation.usageCount += 1;
      existingTranslation.lastUsed = new Date();
      
      // Make sure all fields are properly set
      existingTranslation.sourceText = cleanSourceText; 
      existingTranslation.originalText = cleanSourceText;
      existingTranslation.sourceLanguage = sourceLanguage;
      existingTranslation.targetLanguage = targetLanguage;
      existingTranslation.hash = textHash;
      existingTranslation.translationHash = textHash;
      
      if (pageKey) existingTranslation.pageKey = pageKey;
      if (elementKey) existingTranslation.elementKey = elementKey;
      
      return existingTranslation.save();
    }
    
    // Create new translation document with known-good values
    try {
      // Generate a unique hash with timestamp to avoid collisions
      const uniqueTime = Date.now();
      const uniqueRandom = Math.random().toString(36).substring(2, 10);
      const uniqueHash = `${uniqueTime}-${uniqueRandom}`;
      
      return await this.create({
        sourceText: cleanSourceText,
        originalText: cleanSourceText,
        translatedText: cleanTranslatedText,
        sourceLanguage,
        targetLanguage,
        hash: textHash || uniqueHash,
        translationHash: textHash || uniqueHash,
        pageKey,
        elementKey,
        createdAt: new Date(uniqueTime),
        updatedAt: new Date(uniqueTime),
        usageCount: 1,
        lastUsed: new Date(uniqueTime)
      });
    } catch (createError) {
      // If we get duplicate key error on create, try one more time with a different hash
      if (createError.code === 11000) {
        console.warn('Duplicate key during creation, retrying with different hash');
        
        const fallbackUniqueHash = `retry-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        
        return await this.create({
          sourceText: cleanSourceText,
          originalText: cleanSourceText,
          translatedText: cleanTranslatedText,
          sourceLanguage,
          targetLanguage,
          hash: fallbackUniqueHash,
          translationHash: fallbackUniqueHash,
          pageKey,
          elementKey,
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 1,
          lastUsed: new Date()
        });
      } else {
        throw createError; // Re-throw if not a duplicate key error
      }
    }
  } catch (error) {
    console.error('Error storing translation:', error.message);
    return null;
  }
};

// Increment usage count for a translation
translationSchema.statics.incrementUsage = async function(id) {
  return this.findByIdAndUpdate(
    id, 
    {
      $inc: { usageCount: 1 },
      lastUsed: new Date()
    }
  );
};

// Get statistics about stored translations
translationSchema.statics.getStats = async function() {
  // Get total count
  const totalCount = await this.countDocuments();
  
  // Get language counts
  const languagePipeline = [
    {
      $group: {
        _id: {
          source: "$sourceLanguage",
          target: "$targetLanguage"
        },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        sourceLanguage: "$_id.source",
        targetLanguage: "$_id.target",
        count: 1
      }
    }
  ];
  
  const languageCounts = await this.aggregate(languagePipeline);
  
  // Get page counts
  const pagePipeline = [
    {
      $match: {
        pageKey: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: "$pageKey",
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        pageKey: "$_id",
        count: 1
      }
    }
  ];
  
  const pageCounts = await this.aggregate(pagePipeline);
  
  // Get most frequently used translations
  const topTranslations = await this.find()
    .sort({ usageCount: -1 })
    .limit(10)
    .select('sourceText translatedText sourceLanguage targetLanguage usageCount');
  
  return {
    totalCount,
    languageCounts: languageCounts.reduce((acc, item) => {
      const key = `${item.sourceLanguage}-${item.targetLanguage}`;
      acc[key] = item.count;
      return acc;
    }, {}),
    pageCounts: pageCounts.reduce((acc, item) => {
      acc[item.pageKey] = item.count;
      return acc;
    }, {}),
    topTranslations
  };
};

// Delete old unused translations (older than specified days)
translationSchema.statics.cleanupOldTranslations = async function(olderThanDays = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  const result = await this.deleteMany({
    lastUsed: { $lt: cutoffDate },
    usageCount: { $lt: 5 } // Only delete rarely used translations
  });
  
  return result.deletedCount;
};

// Migration helper to fix existing translations with null hashes
translationSchema.statics.fixNullHashes = async function() {
  const result = await this.updateMany(
    { $or: [{ hash: null }, { hash: { $exists: false } }] },
    [
      { 
        $set: { 
          hash: { 
            $cond: [
              { $ne: ["$sourceText", null] },
              { $function: {
                body: function(text) { 
                  return require('crypto').createHash('md5').update(text).digest('hex');
                },
                args: ["$sourceText"],
                lang: "js"
              }},
              "default-hash-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000000)
            ]
          },
          translationHash: { 
            $cond: [
              { $ne: ["$sourceText", null] },
              { $function: {
                body: function(text) { 
                  return require('crypto').createHash('md5').update(text).digest('hex');
                },
                args: ["$sourceText"],
                lang: "js"
              }},
              "default-hash-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000000)
            ]
          }
        }
      }
    ]
  );
  
  return result.modifiedCount;
};

// Find a similar translation for fallback functionality (without using $where)
translationSchema.statics.findSimilarTranslation = async function(sourceText, sourceLanguage, targetLanguage) {
  if (!sourceText || !targetLanguage) return null;
  
  try {
    // First try exact match
    const exactMatch = await this.findTranslation(sourceText, sourceLanguage, targetLanguage);
    if (exactMatch) return exactMatch;
    
    // If no exact match, try case-insensitive match on sourceText
    // This uses regex instead of $where which is not supported in some MongoDB tiers
    const normalizedSourceText = sourceText.toLowerCase().trim();
    
    const similarMatch = await this.findOne({
      targetLanguage: targetLanguage,
      sourceText: new RegExp('^' + normalizedSourceText + '$', 'i')
    });
    
    return similarMatch;
  } catch (error) {
    console.error('Error finding similar translation:', error.message);
    return null;
  }
};

// Find or create a translation with robust conflict handling
translationSchema.statics.findOrCreateTranslation = async function(
  sourceText,
  translatedText,
  sourceLanguage, 
  targetLanguage,
  pageKey = null,
  elementKey = null
) {
  if (!sourceText || !translatedText) return null;
  
  // Clean inputs
  const cleanSourceText = sourceText.trim();
  const cleanTranslatedText = translatedText.trim();
  
  try {
    // Generate hash for lookup
    const textHash = cleanSourceText ? crypto.createHash('md5').update(cleanSourceText).digest('hex') : null;
    
    // Create a unique session ID to prevent conflicts
    const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // First try to find by exact match with both field and hash
    const existing = await this.findOne({
      $or: [
        { sourceText: cleanSourceText, sourceLanguage, targetLanguage },
        { hash: textHash, sourceLanguage, targetLanguage }
      ]
    });
    
    if (existing) {
      // Update and return existing
      existing.translatedText = cleanTranslatedText;
      existing.updatedAt = new Date();
      existing.usageCount += 1;
      existing.lastUsed = new Date();
      if (pageKey) existing.pageKey = pageKey;
      if (elementKey) existing.elementKey = elementKey;
      
      await existing.save();
      return existing;
    }
    
    // If we get here, we need to create a new one with unique fields to avoid conflicts
    const newTranslation = new this({
      sourceText: cleanSourceText,
      originalText: cleanSourceText,
      translatedText: cleanTranslatedText,
      sourceLanguage,
      targetLanguage,
      // Use session ID to make hash unique
      hash: `${textHash}-${sessionId}`,
      translationHash: `${textHash}-${sessionId}`,
      pageKey,
      elementKey,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 1,
      lastUsed: new Date()
    });
    
    // Save with retry mechanism for conflict resolution
    try {
      await newTranslation.save();
      return newTranslation;
    } catch (saveError) {
      if (saveError.code === 11000) {
        // If we get a duplicate error, try one more time with even more unique hash
        console.log(`Translation conflict detected, retrying with more unique identifier for "${cleanSourceText.substring(0, 30)}..."`);
        
        // Try to find again in case a concurrent process created it since our last check
        const retryFind = await this.findOne({
          $or: [
            { sourceText: cleanSourceText, sourceLanguage, targetLanguage },
            { hash: textHash, sourceLanguage, targetLanguage }
          ]
        });
        
        if (retryFind) {
          // Update and return if found on retry
          retryFind.translatedText = cleanTranslatedText;
          retryFind.updatedAt = new Date();
          retryFind.usageCount += 1;
          retryFind.lastUsed = new Date();
          if (pageKey) retryFind.pageKey = pageKey;
          if (elementKey) retryFind.elementKey = elementKey;
          await retryFind.save();
          return retryFind;
        }
        
        // Create a new document with ultra-unique hash
        const ultraUniqueHash = `retry2-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const fallbackTranslation = new this({
          sourceText: cleanSourceText,
          originalText: cleanSourceText,
          translatedText: cleanTranslatedText,
          sourceLanguage,
          targetLanguage,
          hash: ultraUniqueHash, // Completely random hash
          translationHash: ultraUniqueHash,
          pageKey,
          elementKey,
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 1,
          lastUsed: new Date()
        });
        
        await fallbackTranslation.save();
        return fallbackTranslation;
      } else {
        // Re-throw non-duplicate errors
        throw saveError;
      }
    }
  } catch (error) {
    console.error(`Failed to find or create translation: ${error.message}`);
    return null;
  }
};

const Translation = mongoose.model('Translation', translationSchema);

module.exports = Translation;