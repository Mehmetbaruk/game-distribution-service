/**
 * AI Assistant routes
 */

const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistantController');
const translationService = require('../services/translationService');
const logger = require('../services/loggerService');

// Middleware to ensure a user is logged in
const isLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Authentication required' });
};

// Middleware to ensure user is an admin
const isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  res.status(403).json({ success: false, error: 'Admin privileges required' });
};

// Chat endpoint - available to all users
router.post('/chat', assistantController.chat);

// Image generation endpoints
router.post('/generate-image', isLoggedIn, assistantController.generateImage);
router.post('/generate-game-image', isLoggedIn, assistantController.generateGameImage);

// Admin-only endpoints
router.get('/status', isAdmin, assistantController.getStatus);
router.get('/logs', isAdmin, assistantController.getLogs);
router.post('/clear-logs', isAdmin, assistantController.clearLogs);
router.post('/test-connection', isAdmin, assistantController.testConnection);

/**
 * @route POST /api/translate/text
 * @desc Translate a single text string
 * @access Public
 */
router.post('/api/translate/text', async (req, res) => {
  const { text, sourceLanguage, targetLanguage, pageKey, elementKey } = req.body;
  
  if (!text || !sourceLanguage || !targetLanguage) {
    return res.status(400).json({
      success: false,
      message: 'Text, source language, and target language are required'
    });
  }
  
  try {
    const translatedText = await translationService.translateText(
      text,
      sourceLanguage,
      targetLanguage,
      pageKey || null,
      elementKey || null
    );
    
    return res.json({
      success: true,
      sourceText: text,
      translatedText,
      sourceLanguage,
      targetLanguage
    });
  } catch (error) {
    logger.error(`Translation error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Translation error: ${error.message}`
    });
  }
});

/**
 * @route POST /api/translate/bulk
 * @desc Translate multiple texts at once
 * @access Public
 */
router.post('/api/translate/bulk', async (req, res) => {
  const { texts, sourceLanguage, targetLanguage, pageKey } = req.body;
  
  if (!Array.isArray(texts) || !sourceLanguage || !targetLanguage) {
    return res.status(400).json({
      success: false,
      message: 'Texts array, source language, and target language are required'
    });
  }
  
  try {
    const translatedTexts = await translationService.bulkTranslateTexts(
      texts,
      sourceLanguage,
      targetLanguage,
      pageKey || null
    );
    
    return res.json({
      success: true,
      sourceTexts: texts,
      translatedTexts,
      sourceLanguage,
      targetLanguage
    });
  } catch (error) {
    logger.error(`Bulk translation error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Bulk translation error: ${error.message}`
    });
  }
});

/**
 * @route POST /api/translate/page
 * @desc Translate an entire page or object
 * @access Public
 */
router.post('/api/translate/page', async (req, res) => {
  const { page, sourceLanguage, targetLanguage } = req.body;
  
  if (!page || typeof page !== 'object' || !sourceLanguage || !targetLanguage) {
    return res.status(400).json({
      success: false,
      message: 'Page object, source language, and target language are required'
    });
  }
  
  try {
    const translatedPage = await translationService.translatePage(
      page,
      sourceLanguage,
      targetLanguage
    );
    
    return res.json({
      success: true,
      translatedPage,
      sourceLanguage,
      targetLanguage
    });
  } catch (error) {
    logger.error(`Page translation error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Page translation error: ${error.message}`
    });
  }
});

/**
 * @route GET /api/translate/stats
 * @desc Get translation service statistics
 * @access Admin
 */
router.get('/api/translate/stats', async (req, res) => {
  try {
    const stats = await translationService.getStats();
    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error(`Stats retrieval error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Error retrieving stats: ${error.message}`
    });
  }
});

/**
 * @route POST /api/translate/cleanup
 * @desc Clean up old translations
 * @access Admin
 */
router.post('/api/translate/cleanup', async (req, res) => {
  const { olderThanDays } = req.body;
  
  try {
    const deletedCount = await translationService.cleanupOldTranslations(olderThanDays || 90);
    return res.json({
      success: true,
      message: `Deleted ${deletedCount} old translations`
    });
  } catch (error) {
    logger.error(`Cleanup error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Cleanup error: ${error.message}`
    });
  }
});

module.exports = router;