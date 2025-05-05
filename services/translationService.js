/**
 * Translation Service
 * Provides translation functionality with MongoDB caching
 * and AI translation capabilities for all internationalized elements
 */

const Translation = require('../models/translation');
const axios = require('axios');
const logger = require('./loggerService');
const crypto = require('crypto');

// Statistics for monitoring translation service
const stats = {
  totalCalls: 0,
  cacheHits: 0,
  apiCalls: 0,
  errors: 0,
  dailyApiCalls: {}, // Format: { "YYYY-MM-DD": count }
  dailyCacheHits: {}, // Format: { "YYYY-MM-DD": count }
  lastReset: new Date()
};

/**
 * Get language name from language code
 * @param {string} languageCode - ISO 639-1 language code
 * @returns {string} Language name or the code if not found
 */
const getLanguageName = (languageCode) => {
  // Dynamic language resolution instead of relying on fixed object
  const languages = {
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
    'tr': 'Turkish',
    'pl': 'Polish',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'hu': 'Hungarian',
    // This is just for display purposes, we accept ANY language code
  };
  
  return languages[languageCode] || languageCode;
};

/**
 * Detect language from input text or language name
 * Always returns a usable language code for translation
 * @param {string} input - User input text or language name
 * @returns {Promise<string>} Valid language code to use
 */
const detectLanguage = async (input) => {
  if (!input) return 'en';
  
  // Clean and normalize input
  const cleanInput = input.toString().trim().toLowerCase();
  
  // If it already looks like a language code (e.g., "en" or "en-US"), return as-is
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(cleanInput)) {
    return cleanInput.substring(0, 2).toLowerCase();
  }
  
  // If the input is more than 20 characters, it's probably a sentence, not a language name
  // In a real system, we'd use AI to detect the language of the text
  if (cleanInput.length > 20) {
    log('warning', `Input too long for language detection: ${cleanInput.substring(0, 20)}...`);
    return 'en'; // Default to English if we can't determine
  }

  // For unknown languages, normalize and create a code from the first two chars
  // This is a fallback so we always return something usable
  const normalizedCode = cleanInput
    .replace(/[^a-z]/g, '') // Remove anything that's not a-z
    .substring(0, 2) // Take first two chars
    .padEnd(2, 'x'); // Pad to ensure 2 chars
    
  log('info', `Creating fallback language code "${normalizedCode}" for unknown language "${cleanInput}"`);
  return normalizedCode;
};

/**
 * Check if a language is supported by our translation system
 * Implementation is permissive to allow any valid code
 * @param {string} languageCode - Language code to check
 * @returns {boolean} True if the language can be used (always true)
 */
const isLanguageSupported = (languageCode) => {
  // We support all language codes to be inclusive
  // Valid language code format: xx or xx-XX
  return !!languageCode && /^[a-z]{2}(-[A-Z]{2})?$/.test(languageCode);
};

/**
 * Get supported languages
 * This is mainly for display in UI elements, but we accept any language
 * @returns {Object} Key-value pairs of language codes and names
 */
const getSupportedLanguages = () => {
  // Return a dictionary of common languages
  return {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'tr': 'Turkish',
    'nl': 'Dutch',
    'sv': 'Swedish',
    'pl': 'Polish',
    'vi': 'Vietnamese',
    'th': 'Thai',
    'id': 'Indonesian',
    'sw': 'Swahili'
    // Note: The UI shows these options, but our API accepts any language code
  };
};

/**
 * Record the current date in YYYY-MM-DD format
 * @returns {string} Current date in YYYY-MM-DD format
 */
const getCurrentDate = () => {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
};

/**
 * Log to terminal and logger service
 * @param {string} level - Log level (info, debug, error, warn)
 * @param {string} message - Message to log
 */
const log = (level, message) => {
  // Log to console for terminal visibility
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Translation:${level.toUpperCase()}] ${message}`);
  
  // Also log to logger service with proper parameters
  if (logger && typeof logger[level] === 'function') {
    try {
      if (level === 'error') {
        logger.error('system', 'translation_error', message);
      } else if (level === 'warn' || level === 'warning') {
        logger.warning('system', 'translation_warning', message);
      } else {
        logger.info('system', 'translation_info', message);
      }
    } catch (err) {
      console.error(`Error logging translation message: ${err.message}`);
    }
  }
};

/**
 * Record a cache hit for statistics
 */
const recordCacheHit = () => {
  stats.cacheHits++;
  stats.totalCalls++;
  
  const today = getCurrentDate();
  stats.dailyCacheHits[today] = (stats.dailyCacheHits[today] || 0) + 1;
  
  // Clean up old entries (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oldDateThreshold = thirtyDaysAgo.toISOString().split('T')[0];
  
  Object.keys(stats.dailyCacheHits).forEach(date => {
    if (date < oldDateThreshold) {
      delete stats.dailyCacheHits[date];
    }
  });
};

/**
 * Record an API call for statistics
 */
const recordApiCall = () => {
  stats.apiCalls++;
  stats.totalCalls++;
  
  const today = getCurrentDate();
  stats.dailyApiCalls[today] = (stats.dailyApiCalls[today] || 0) + 1;
  
  // Clean up old entries (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oldDateThreshold = thirtyDaysAgo.toISOString().split('T')[0];
  
  Object.keys(stats.dailyApiCalls).forEach(date => {
    if (date < oldDateThreshold) {
      delete stats.dailyApiCalls[date];
    }
  });
};

/**
 * Record an error for statistics
 */
const recordError = () => {
  stats.errors++;
};

/**
 * Basic fallback translation when API is unavailable
 * @param {string} text - Text to translate
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} Simple translated text or original text
 */
const fallbackTranslate = async (text, targetLanguage) => {
  if (!text) return '';
  
  try {
    // Attempt to find a similar translation in MongoDB
    const cachedTranslation = await Translation.findSimilarTranslation(
      text, 
      'en', 
      targetLanguage
    );
    
    if (cachedTranslation && cachedTranslation.translatedText) {
      log('info', `Found similar translation in MongoDB for fallback: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
      return cachedTranslation.translatedText;
    }
  } catch (error) {
    log('warning', `Error finding fallback translation: ${error.message}`);
  }
  
  // If we can't find anything in MongoDB, just return the original text
  return text;
};

/**
 * Translate text using the Zero2Launch AI translation API
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} Translated text
 */
const translateWithAPI = async (text, sourceLanguage, targetLanguage) => {
  // Prevent null text from being sent to the API
  if (!text || typeof text !== 'string' || text.trim() === '') {
    log('warning', 'Attempted to translate null or empty text');
    return '';
  }
  
  try {
    if (!process.env.ZERO2LAUNCH_API_KEY) {
      log('warning', 'Zero2Launch API key not found in environment variables. Using fallback translation.');
      return fallbackTranslate(text, targetLanguage);
    }

    recordApiCall();
    log('info', `Translating text from ${sourceLanguage} to ${targetLanguage}: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
    
    // Using Zero2Launch API for translation
    const response = await axios.post('https://api.zero2launch.com/generate-text', {
      messages: [
        { 
          role: "system", 
          content: `You are a professional translator. Translate the provided text from ${getLanguageName(sourceLanguage)} to ${getLanguageName(targetLanguage)}. Only provide the translation, no explanations.` 
        },
        { 
          role: "user", 
          content: text
        }
      ],
      model: "openai" // Using the default model
    }, {
      headers: {
        'X-API-Key': process.env.ZERO2LAUNCH_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    // Extract the translated text from the response
    const translatedText = response.data.text.trim();
    log('info', `Successfully translated text to ${targetLanguage}`);
    
    return translatedText;
  } catch (error) {
    recordError();
    
    // Log with proper category and action parameters
    log('error', `Translation API error: ${error.message}`);
    
    if (error.response) {
      log('error', `API Error details: ${JSON.stringify(error.response.data)}`);
    }
    
    // Try fallback translation
    log('info', `Attempting fallback translation for "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
    return fallbackTranslate(text, targetLanguage);
  }
};

/**
 * Directly store a translation in MongoDB without API call
 * Useful for batch operations where translations are already obtained
 * @param {string} sourceText - Original text 
 * @param {string} translatedText - Translated text
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @param {string} pageKey - Optional page identifier
 * @returns {Promise<Object>} Stored translation document
 */
const storeTranslation = async (sourceText, translatedText, sourceLanguage, targetLanguage, pageKey = null) => {
  if (!sourceText || !translatedText) return null;
  
  try {
    // Generate an element key based on text content for consistent lookup
    const elementKey = pageKey ? `${pageKey}_${crypto.createHash('md5').update(sourceText).digest('hex').substring(0, 8)}` : null;
    
    // Use our new conflict-resistant method
    return await Translation.findOrCreateTranslation(
      sourceText,
      translatedText,
      sourceLanguage,
      targetLanguage,
      pageKey,
      elementKey
    );
  } catch (error) {
    log('error', `Error storing translation: ${error.message}`);
    return null;
  }
};

/**
 * Translate multiple texts in a single API call with rate limit handling
 * @param {string[]} textArray - Array of texts to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string[]>} Array of translated texts
 */
const batchTranslateWithAPI = async (textArray, sourceLanguage, targetLanguage) => {
  if (!textArray || !textArray.length) return [];
  
  // Filter out empty or null values
  const validTexts = textArray.filter(text => 
    text && typeof text === 'string' && text.trim() !== ''
  );
  
  if (validTexts.length === 0) return [];
  
  try {
    if (!process.env.ZERO2LAUNCH_API_KEY) {
      log('warning', 'Zero2Launch API key not found for batch translation. Using fallback translations.');
      return Promise.all(validTexts.map(text => fallbackTranslate(text, targetLanguage)));
    }
    
    recordApiCall(); // Only count as one API call regardless of batch size
    log('info', `Batch translating ${validTexts.length} texts from ${sourceLanguage} to ${targetLanguage}`);
    
    // Join all texts with a unique delimiter that's unlikely to appear in regular text
    const delimiter = "§§§";
    
    // Break into smaller batches if necessary to avoid exceeding request size limits
    const MAX_BATCH_SIZE = 20;
    const results = [];
    
    for (let i = 0; i < validTexts.length; i += MAX_BATCH_SIZE) {
      const batchTexts = validTexts.slice(i, i + MAX_BATCH_SIZE);
      const batchedText = batchTexts.join(delimiter);
      
      try {
        // Check for existing translations in MongoDB first to reduce API calls
        const existingTranslations = await Promise.all(
          batchTexts.map(text => Translation.findTranslation(text, sourceLanguage, targetLanguage))
        );
        
        // Filter out texts that already have translations
        const textsNeedingTranslation = [];
        const translatedBatch = new Array(batchTexts.length);
        let needsApiCall = false;
        
        batchTexts.forEach((text, index) => {
          if (existingTranslations[index] && existingTranslations[index].translatedText) {
            translatedBatch[index] = existingTranslations[index].translatedText;
            recordCacheHit();
          } else {
            textsNeedingTranslation.push({index, text});
            needsApiCall = true;
          }
        });
        
        // Only call the API if there are texts without existing translations
        if (needsApiCall) {
          // Use small batches for API requests to handle rate limiting
          // Implement retry with exponential backoff
          let apiTexts = textsNeedingTranslation.map(item => item.text);
          let apiResult;
          let retries = 0;
          const MAX_RETRIES = 3;
          let waitTime = 1000; // Start with 1 second
          
          while (retries <= MAX_RETRIES) {
            try {
              const apiText = apiTexts.join(delimiter);
              
              // Using Zero2Launch API for translation
              const response = await axios.post('https://api.zero2launch.com/generate-text', {
                messages: [
                  { 
                    role: "system", 
                    content: `You are a professional translator. Translate each text segment from ${getLanguageName(sourceLanguage)} to ${getLanguageName(targetLanguage)}. 
                             The text segments are separated by "${delimiter}". 
                             Your response should contain ONLY the translated segments in the same order, also separated by "${delimiter}".
                             Do not add any explanations or additional text.` 
                  },
                  { 
                    role: "user", 
                    content: apiText
                  }
                ],
                model: "openai" // Using the default model
              }, {
                headers: {
                  'X-API-Key': process.env.ZERO2LAUNCH_API_KEY,
                  'Content-Type': 'application/json'
                }
              });
              
              apiResult = response.data.text.trim();
              break; // Success, exit retry loop
            } catch (error) {
              retries++;
              
              // Check if it's a rate limit error
              if (error.response && error.response.status === 429) {
                log('warning', `Rate limit hit (${retries}/${MAX_RETRIES}), waiting ${waitTime}ms before retry`);
                // Wait using setTimeout wrapped in a promise
                await new Promise(resolve => setTimeout(resolve, waitTime));
                waitTime *= 2; // Exponential backoff
              } else {
                // For other errors, don't retry
                log('error', `API error in batch translation: ${error.message}`);
                if (error.response) {
                  log('error', `API Error details: ${JSON.stringify(error.response.data)}`);
                }
                break;
              }
            }
          }
          
          if (apiResult) {
            // Split the response by our delimiter
            const apiTranslations = apiResult.split(delimiter);
            
            // Fill in the translations that came from the API
            textsNeedingTranslation.forEach((item, idx) => {
              if (idx < apiTranslations.length) {
                translatedBatch[item.index] = apiTranslations[idx].trim();
              } else {
                // Fallback if API returned fewer segments than expected
                translatedBatch[item.index] = batchTexts[item.index];
              }
            });
          } else {
            // If API failed after retries, use fallback translations
            textsNeedingTranslation.forEach(item => {
              translatedBatch[item.index] = batchTexts[item.index]; // Use original as fallback
            });
          }
        }
        
        // Add this batch's results to overall results
        results.push(...translatedBatch);
        
        // If we have multiple batches, wait a bit between API calls to respect rate limits
        if (i + MAX_BATCH_SIZE < validTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between batches
        }
      } catch (error) {
        log('error', `Error processing batch ${i}-${i+MAX_BATCH_SIZE}: ${error.message}`);
        // Use fallback for this batch
        const fallbackResults = await Promise.all(
          batchTexts.map(text => fallbackTranslate(text, targetLanguage))
        );
        results.push(...fallbackResults);
      }
    }
    
    // Store all successful translations in MongoDB for future use
    results.forEach((translatedText, index) => {
      if (translatedText && translatedText !== validTexts[index]) {
        try {
          // Don't await to avoid blocking
          storeTranslation(
            validTexts[index],
            translatedText,
            sourceLanguage,
            targetLanguage
          );
        } catch (error) {
          log('error', `Failed to store batch translation: ${error.message}`);
        }
      }
    });
    
    log('info', `Successfully batch translated ${results.length} texts to ${targetLanguage}`);
    return results;
  } catch (error) {
    recordError();
    
    log('error', `Batch translation overall error: ${error.message}`);
    
    // Try fallback translation for each text
    log('info', `Falling back to individual translations after batch error`);
    return Promise.all(validTexts.map(text => fallbackTranslate(text, targetLanguage)));
  }
};

/**
 * Translate text with caching support
 * First checks the database cache, then falls back to AI
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @param {string} pageKey - Optional page identifier for better caching
 * @param {string} elementKey - Optional element identifier for better caching
 * @returns {Promise<string>} Translated text
 */
const translateText = async (text, sourceLanguage, targetLanguage, pageKey = null, elementKey = null) => {
  if (!text || typeof text !== 'string' || text.trim() === '') return '';
  if (sourceLanguage === targetLanguage) return text;
  
  try {
    // Clean up the text to make it consistent for caching
    const cleanText = text.trim();
    
    let cachedTranslation;
    
    // If page and element keys are provided, check for specific element translation
    if (pageKey && elementKey) {
      log('debug', `Looking for cached page element: ${pageKey}/${elementKey} in ${targetLanguage}`);
      cachedTranslation = await Translation.findPageElementTranslation(
        pageKey,
        elementKey,
        targetLanguage
      );
      
      if (cachedTranslation) {
        log('debug', `Found cached page element: ${pageKey}/${elementKey}`);
      }
    }
    
    // If not found by page/element, check by text content
    if (!cachedTranslation) {
      log('debug', `Looking for cached text in ${targetLanguage}: "${cleanText.substring(0, 30)}${cleanText.length > 30 ? '...' : ''}"`);
      cachedTranslation = await Translation.findTranslation(
        cleanText, 
        sourceLanguage, 
        targetLanguage
      );
    }
    
    if (cachedTranslation) {
      // Update usage statistics
      await Translation.incrementUsage(cachedTranslation._id);
      recordCacheHit();
      
      // Enhanced logging to show what's actually being returned
      const translatedContent = cachedTranslation.translatedText || 'EMPTY_TRANSLATION';
      log('debug', `Cache hit for ${sourceLanguage} to ${targetLanguage}: "${cleanText.substring(0, 30)}${cleanText.length > 30 ? '...' : ''}" => "${translatedContent.substring(0, 30)}${translatedContent.length > 30 ? '...' : ''}"`);
      
      // Validate that we actually have a translation
      if (!cachedTranslation.translatedText || 
          cachedTranslation.translatedText.trim() === '' || 
          cachedTranslation.translatedText === cleanText) {
        
        log('warning', `Empty or identical translation found in cache for "${cleanText.substring(0, 30)}${cleanText.length > 30 ? '...' : ''}" - will generate new translation`);
        
        // If translation is empty or identical to source, we should generate a new one
        const newTranslatedText = await translateWithAPI(cleanText, sourceLanguage, targetLanguage);
        
        if (newTranslatedText && newTranslatedText !== cleanText) {
          // Update the existing record with the new translation
          cachedTranslation.translatedText = newTranslatedText;
          cachedTranslation.updatedAt = new Date();
          await cachedTranslation.save();
          log('info', `Updated empty translation: "${newTranslatedText.substring(0, 30)}${newTranslatedText.length > 30 ? '...' : ''}"`);
          return newTranslatedText;
        }
      }
      
      return cachedTranslation.translatedText;
    }
    
    // If not in cache, use AI translation
    const translatedText = await translateWithAPI(cleanText, sourceLanguage, targetLanguage);
    
    // Only store in MongoDB cache if we have valid text and it's not identical to source
    if (cleanText && translatedText && translatedText !== cleanText) {
      try {
        await Translation.createOrUpdateTranslation(
          cleanText,
          translatedText,
          sourceLanguage,
          targetLanguage,
          pageKey,
          elementKey
        );
        log('debug', `Cached new translation for ${sourceLanguage} to ${targetLanguage}: "${cleanText.substring(0, 30)}${cleanText.length > 30 ? '...' : ''}" => "${translatedText.substring(0, 30)}${translatedText.length > 30 ? '...' : ''}"`);
      } catch (cacheError) {
        // Log but don't fail the translation request if caching fails
        log('error', `Failed to cache translation: ${cacheError.message}`);
      }
    } else {
      log('warning', `Not caching translation because translation is empty or identical to source: "${cleanText.substring(0, 30)}${cleanText.length > 30 ? '...' : ''}"`);
    }
    
    return translatedText;
  } catch (error) {
    recordError();
    log('error', `Error in translateText: ${error.message}`);
    
    // Return fallback translation when all else fails
    return fallbackTranslate(text, targetLanguage);
  }
};

/**
 * Optimized bulk translate with batching to minimize API calls
 * @param {string[]} texts - Array of texts to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @param {string} pageKey - Optional page identifier
 * @param {number} batchSize - Optional batch size (default: 20)
 * @returns {Promise<string[]>} Array of translated texts
 */
const optimizedBulkTranslate = async (texts, sourceLanguage, targetLanguage, pageKey = null, batchSize = 20) => {
  if (!texts || !texts.length) return [];
  if (sourceLanguage === targetLanguage) return texts;
  
  log('info', `Optimized bulk translating ${texts.length} items for ${pageKey || 'unknown page'}`);
  
  // First check cache for all texts
  const results = new Array(texts.length);
  const missingIndices = [];
  const missingTexts = [];
  
  // Check cache for each text first
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text || typeof text !== 'string' || text.trim() === '') {
      results[i] = '';
      continue;
    }
    
    const elementKey = pageKey ? `${pageKey}_element_${i}` : null;
    
    try {
      // First try the cache
      let cachedTranslation;
      
      // If page and element keys are provided, check for specific element translation
      if (pageKey && elementKey) {
        cachedTranslation = await Translation.findPageElementTranslation(
          pageKey,
          elementKey,
          targetLanguage
        );
      }
      
      // If not found by page/element, check by text content
      if (!cachedTranslation) {
        cachedTranslation = await Translation.findTranslation(
          text.trim(), 
          sourceLanguage, 
          targetLanguage
        );
      }
      
      if (cachedTranslation && 
          cachedTranslation.translatedText && 
          cachedTranslation.translatedText.trim() !== '' &&
          cachedTranslation.translatedText !== text) {
        
        // We have a valid cached translation
        await Translation.incrementUsage(cachedTranslation._id);
        recordCacheHit();
        results[i] = cachedTranslation.translatedText;
        
        log('debug', `Cache hit in bulk translate for item #${i}: "${text}" => "${cachedTranslation.translatedText}"`);
      } else {
        // Cache miss or invalid translation, mark for translation
        missingIndices.push(i);
        missingTexts.push(text);
        
        log('debug', `Cache miss in bulk translate for item #${i}: "${text}"`);
      }
    } catch (error) {
      log('error', `Error checking cache for bulk translate item #${i}: ${error.message}`);
      // On error, fallback to translation
      missingIndices.push(i);
      missingTexts.push(text);
    }
  }
  
  // If we have missing texts, translate them
  if (missingTexts.length > 0) {
    log('info', `Translating ${missingTexts.length} missing texts in bulk`);
    
    // Translate in batches to avoid rate limits
    const batchSize = 20;
    for (let i = 0; i < missingTexts.length; i += batchSize) {
      const batch = missingTexts.slice(i, i + batchSize);
      try {
        const translatedBatch = await batchTranslateWithAPI(batch, sourceLanguage, targetLanguage);
        
        // Fill in the results for this batch
        for (let j = 0; j < translatedBatch.length; j++) {
          const index = missingIndices[i + j];
          results[index] = translatedBatch[j];
        }
      } catch (error) {
        log('error', `Error translating batch in bulk translate: ${error.message}`);
        // Fallback to individual translation for this batch
        for (let j = 0; j < batch.length; j++) {
          const text = batch[j];
          const index = missingIndices[i + j];
          results[index] = fallbackTranslate(text, targetLanguage);
        }
      }
    }
  }
  
  log('info', `Successfully optimized bulk translated ${results.length} texts to ${targetLanguage}`);
  return results;
};

/**
 * Cache translations for a page or component
 * @param {Object} elements - Key-value pairs of element keys and text to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @param {string} pageKey - Page identifier
 * @returns {Promise<Object>} Translated elements object
 */
const cachePageTranslations = async (elements, sourceLanguage, targetLanguage, pageKey) => {
  if (!elements || typeof elements !== 'object' || !Object.keys(elements).length) {
    log('info', `No elements to translate for page: ${pageKey}`);
    return {};
  }
  
  log('info', `Caching page translations for ${pageKey}: ${Object.keys(elements).length} elements`);
  
  const translations = {};
  
  for (const [key, text] of Object.entries(elements)) {
    if (!text) {
      translations[key] = '';
      continue;
    }
    
    const translatedText = await translateText(
      text,
      sourceLanguage,
      targetLanguage,
      pageKey,
      key
    );
    
    translations[key] = translatedText;
  }
  
  return translations;
};

/**
 * Get all cached translations for a page
 * @param {string} pageKey - Page identifier
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<Object>} Object with cached translations
 */
const getPageTranslations = async (pageKey, targetLanguage) => {
  log('info', `Getting cached translations for page: ${pageKey} in ${targetLanguage}`);
  
  const translations = await Translation.findPageTranslations(pageKey, targetLanguage);
  
  // Convert to key-value object
  return translations.reduce((result, item) => {
    if (item.elementKey) {
      result[item.elementKey] = item.translatedText;
    }
    return result;
  }, {});
};

/**
 * Translate a page or component dynamically
 * Used for server-side rendering with MongoDB caching
 * @param {Object} page - Page object with content to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<Object>} Translated page object
 */
const translatePage = async (page, sourceLanguage, targetLanguage) => {
  if (sourceLanguage === targetLanguage) return page;
  if (!page) return {};
  
  const pageKey = page.id || page.key || page.url || 'unknown_page';
  log('info', `Translating page: ${pageKey} from ${sourceLanguage} to ${targetLanguage}`);
  
  const translatedPage = { ...page };
  
  // First try to get cached translations for the whole page
  const cachedTranslations = await getPageTranslations(pageKey, targetLanguage);
  
  // Recursive function to translate nested objects
  const translateObject = async (obj, parentKey = '') => {
    const result = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const elementKey = parentKey ? `${parentKey}.${key}` : key;
      
      if (typeof value === 'string') {
        // Check if we have a cached translation for this element
        if (cachedTranslations[elementKey]) {
          result[key] = cachedTranslations[elementKey];
          recordCacheHit();
          log('debug', `Using cached translation for ${elementKey}`);
        } else {
          // Otherwise translate and cache it
          result[key] = await translateText(
            value,
            sourceLanguage,
            targetLanguage,
            pageKey,
            elementKey
          );
        }
      } else if (Array.isArray(value)) {
        result[key] = await Promise.all(
          value.map(async (item, index) => {
            if (typeof item === 'string') {
              const arrayElementKey = `${elementKey}[${index}]`;
              if (cachedTranslations[arrayElementKey]) {
                recordCacheHit();
                return cachedTranslations[arrayElementKey];
              } else {
                return translateText(
                  item,
                  sourceLanguage,
                  targetLanguage,
                  pageKey,
                  arrayElementKey
                );
              }
            } else if (typeof item === 'object' && item !== null) {
              return translateObject(item, `${elementKey}[${index}]`);
            }
            return item;
          })
        );
      } else if (typeof value === 'object' && value !== null) {
        result[key] = await translateObject(value, elementKey);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  };
  
  // Translate all content using the recursive function
  const translatedContent = await translateObject(page);
  Object.assign(translatedPage, translatedContent);
  
  return translatedPage;
};

/**
 * Cleanup old translations to prevent database bloat
 * @param {number} olderThanDays - Remove translations older than this many days
 * @returns {Promise<number>} Number of deleted translations
 */
const cleanupOldTranslations = async (olderThanDays = 90) => {
  log('info', `Cleaning up translations older than ${olderThanDays} days`);
  const deletedCount = await Translation.cleanupOldTranslations(olderThanDays);
  log('info', `Deleted ${deletedCount} old translations`);
  return deletedCount;
};

/**
 * Get translation service statistics
 * @returns {Object} Statistics about the translation service
 */
const getStats = async () => {
  // Get MongoDB stats
  const mongoStats = await Translation.getStats();
  
  // Calculate cache hit rate
  const cacheHitRate = stats.totalCalls > 0 
    ? Math.round((stats.cacheHits / stats.totalCalls) * 100) 
    : 0;
  
  // Get today's API calls
  const today = getCurrentDate();
  const apiCallsToday = stats.dailyApiCalls[today] || 0;
  
  // Get daily stats for the last 7 days
  const dailyStats = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    
    dailyStats.unshift({
      date: dateKey,
      apiCalls: stats.dailyApiCalls[dateKey] || 0,
      cacheHits: stats.dailyCacheHits[dateKey] || 0
    });
  }
  
  // Calculate memory cache usage estimate
  const memoryCacheUsage = {
    count: Object.keys(stats.dailyCacheHits).length + Object.keys(stats.dailyApiCalls).length,
    usagePercentage: Math.min(Math.round((mongoStats.totalCount / 10000) * 100), 100) // Arbitrary max of 10,000 translations
  };
  
  return {
    totalCalls: stats.totalCalls,
    cacheHits: stats.cacheHits,
    apiCalls: stats.apiCalls,
    errors: stats.errors,
    cacheHitRate,
    apiCallsToday,
    lastReset: stats.lastReset,
    mongoStats,
    dailyStats,
    memoryCache: memoryCacheUsage,
    languageCount: Object.keys(mongoStats.languageCounts).length,
    totalTranslations: mongoStats.totalCount
  };
};

/**
 * Reset translation service statistics
 */
const resetStats = () => {
  stats.totalCalls = 0;
  stats.cacheHits = 0;
  stats.apiCalls = 0;
  stats.errors = 0;
  stats.dailyApiCalls = {};
  stats.dailyCacheHits = {};
  stats.lastReset = new Date();
  
  log('info', 'Translation service statistics reset');
};

/**
 * Bulk translate an array of texts
 * @param {string[]} texts - Array of texts to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @param {string} pageKey - Optional page identifier
 * @returns {Promise<string[]>} Array of translated texts
 */
const bulkTranslateTexts = async (texts, sourceLanguage, targetLanguage, pageKey = null) => {
  if (!texts || !texts.length) return [];
  if (sourceLanguage === targetLanguage) return texts;
  
  log('info', `Bulk translating ${texts.length} items for ${pageKey || 'unknown page'}`);
  
  // Use our optimized method with default batch size of 20
  return optimizedBulkTranslate(texts, sourceLanguage, targetLanguage, pageKey);
};

/**
 * Get hardcoded translation for key phrases
 * This acts as a fallback for critical UI elements that should have consistent translations
 * @param {string} text - Original text to translate
 * @param {string} targetLanguage - Target language code
 * @returns {string|null} Hardcoded translation if available, null otherwise
 */
const getHardcodedTranslation = (text, targetLanguage) => {
  if (!text || !targetLanguage) return null;
  
  // Common translations dictionary grouped by language code
  // These are hardcoded for critical UI elements that need consistent translations
  const hardcodedTranslations = {
    'es': {
      'Game Distribution Service': 'Servicio de Distribución de Juegos',
      'Welcome to FreeGames platform. Browse our collection of games, play them online, and share your experience!': 'Bienvenido a la plataforma FreeGames. ¡Explora nuestra colección de juegos, juega en línea y comparte tu experiencia!',
      'Login': 'Iniciar Sesión',
      'Register': 'Registrarse',
      'Profile': 'Perfil',
      'Admin Dashboard': 'Panel de Administración',
      'Logout': 'Cerrar Sesión'
    },
    'fr': {
      'Game Distribution Service': 'Service de Distribution de Jeux',
      'Welcome to FreeGames platform. Browse our collection of games, play them online, and share your experience!': 'Bienvenue sur la plateforme FreeGames. Parcourez notre collection de jeux, jouez en ligne et partagez votre expérience !',
      'Login': 'Connexion',
      'Register': 'Inscription',
      'Profile': 'Profil',
      'Admin Dashboard': 'Tableau de Bord Admin',
      'Logout': 'Déconnexion'
    },
    'de': {
      'Game Distribution Service': 'Spielevertriebsdienst',
      'Welcome to FreeGames platform. Browse our collection of games, play them online, and share your experience!': 'Willkommen auf der FreeGames Plattform. Durchstöbern Sie unsere Spielesammlung, spielen Sie online und teilen Sie Ihre Erfahrung!',
      'Login': 'Anmelden',
      'Register': 'Registrieren',
      'Profile': 'Profil',
      'Admin Dashboard': 'Admin-Dashboard',
      'Logout': 'Abmelden'
    },
    'tr': {
      'Game Distribution Service': 'Oyun Dağıtım Servisi',
      'Welcome to FreeGames platform. Browse our collection of games, play them online, and share your experience!': 'FreeGames platformuna hoş geldiniz. Oyun koleksiyonumuza göz atın, çevrimiçi oynayın ve deneyiminizi paylaşın!',
      'Login': 'Giriş Yap',
      'Register': 'Kaydol',
      'Profile': 'Profil',
      'Admin Dashboard': 'Yönetici Paneli',
      'Logout': 'Çıkış Yap'
    },
    'rw': {
      'Game Distribution Service': 'Serivisi yo Gutanga Imikino',
      'Welcome to FreeGames platform. Browse our collection of games, play them online, and share your experience!': 'Murakaza neza kuri FreeGames. Reba ikusanyirizo ryacu ry\'imikino, kina online, hanyuma usangize uburambe bwawe!',
      'Login': 'Kwinjira',
      'Register': 'Kwiyandikisha',
      'Profile': 'Umwirondoro',
      'Admin Dashboard': 'Ikibaho cy\'Ubutegetsi',
      'Logout': 'Gusohoka'
    }
  };
  
  // Check if we have translations for this language
  if (!hardcodedTranslations[targetLanguage]) {
    return null;
  }
  
  // Return the hardcoded translation or null if not found
  return hardcodedTranslations[targetLanguage][text] || null;
};

// Export all necessary functions
module.exports = {
  translateText,
  bulkTranslateTexts,
  optimizedBulkTranslate,
  batchTranslateWithAPI,
  translatePage,
  cachePageTranslations,
  getPageTranslations,
  cleanupOldTranslations,
  getStats,
  resetStats,
  getLanguageName,
  detectLanguage,
  isLanguageSupported,
  getSupportedLanguages,
  storeTranslation  // Add storeTranslation to exports
};