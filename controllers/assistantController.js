/**
 * AI Assistant Controller
 * Handles chat requests from both admin and regular users
 */

const axios = require('axios');
const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const User = mongoose.model('User');
const LoggerService = require('../services/loggerService');
const AIAgentService = require('../services/aiAgentService');
const TranslationService = require('../services/translationService');
const rateLimiter = require('../services/rateLimiterService');
require('dotenv').config();

// Zero2Launch API configuration
const ZERO2LAUNCH_API_KEY = process.env.ZERO2LAUNCH_API_KEY || '85893358efc8f14e104bdef22d77f32743aea21c3b39c6a10a6b91e4cb3fa7d6';
const ZERO2LAUNCH_TEXT_API = 'https://api.zero2launch.com/generate-text';
const ZERO2LAUNCH_IMAGE_API = 'https://api.zero2launch.com/download-image/url';
const ZERO2LAUNCH_IMAGE_DATA_API = 'https://api.zero2launch.com/download-image/data';
const ZERO2LAUNCH_ANALYZE_IMAGE_API = 'https://api.zero2launch.com/analyze-image';

// ImgBB API configuration
const IMGBB_API_KEY = 'd67c3002aac4216fa4c16bfe8ce4e952';
const IMGBB_UPLOAD_API = 'https://api.imgbb.com/1/upload';

// Store logs for admin monitoring
const assistantLogs = [];
const MAX_LOGS = 100;

/**
 * Handle chat request from any user
 */
exports.chat = async (req, res) => {
  try {
    // Extract message from request
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    // Determine userRole and userId from session
    const sessionUser = req.session.user;
    const userRole = sessionUser && sessionUser.isAdmin ? 'admin' : 'user';
    const userId = sessionUser && sessionUser._id ? sessionUser._id.toString() : 'anonymous';
    const preferredLanguage = sessionUser && sessionUser.preferredLanguage ? sessionUser.preferredLanguage : 'en';

    // Check if this is a translation request
    const isTranslationRequest = checkIfTranslationRequest(message);
    
    // If it's a translation request, handle it separately
    if (isTranslationRequest) {
      return await handleTranslationRequest(req, res, message, userId, preferredLanguage);
    }

    // Log the request
    const requestLog = {
      timestamp: new Date(),
      event: 'chat_request',
      userRole,
      userId,
      message,
      status: 'success'
    };
    
    assistantLogs.unshift(requestLog);
    
    // Trim logs to prevent memory issues
    if (assistantLogs.length > MAX_LOGS) {
      assistantLogs.length = MAX_LOGS;
    }
    
    // Add to system logs - only pass userId if it's a valid ObjectId
    let logUserId = userId;
    if (userId === 'anonymous' || !mongoose.Types.ObjectId.isValid(userId)) {
      logUserId = null; // LoggerService will handle null userId properly
    }
    
    await LoggerService.info(
      'ai', 
      'chat_request', 
      `Chat request from ${userRole || 'user'}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
      { message },
      logUserId
    );

    // Start inner monologue for reasoning steps
    const thoughtSteps = [];
    thoughtSteps.push(`Thinking: Received user message: "${message}"`);
    thoughtSteps.push('Thinking: Determining if special data access is required');

    // Parse the message to detect specific queries that need agent functionality
    thoughtSteps.push('Thinking: Identifying query type...');
    const queryType = detectQueryType(message);
    thoughtSteps.push(`Thinking: Detected query type => ${queryType || 'none/general'}`);

    // Decide on agent data retrieval
    let agentResponse = null;
    if (queryType) {
      thoughtSteps.push(`Thinking: Will invoke agent function for ${queryType}`);
      agentResponse = await handleAgentQuery(queryType, message, userRole, userId);
      thoughtSteps.push('Thinking: Retrieved agentResponse, evaluating data sufficiency');
      if (!agentResponse || agentResponse.error || Object.keys(agentResponse).length === 0) {
        thoughtSteps.push('Thinking: Agent data insufficient or error, planning fallback or informing user');
      } else {
        thoughtSteps.push('Thinking: Agent data sufficient, proceeding');
      }
    } else {
      thoughtSteps.push('Thinking: No agent function needed for this request');
    }

    // Log the inner monologue
    await LoggerService.info(
      'ai',
      'thinking_steps',
      'AI inner thought process',
      { steps: thoughtSteps },
      logUserId
    );
    console.log('[AI] Inner thoughts:', thoughtSteps);

    // Generate context based on user role and any agent responses
    const context = await generateContext(userRole, userId, agentResponse);
    // Log generated context
    console.log(`[AI] Generated context for ${userRole}:${userId}:`, context);

    // Create system prompt based on user role
    let systemPrompt = userRole === 'admin' ? 
      `You are an administrative assistant for a Game Distribution Service platform. You can help admins understand platform statistics, user activity, and provide insights about the platform. 
      
      Here's some context about the platform: ${context}
      
      Keep responses professional and focused on helping admins manage and understand the platform. Always reference the context provided when applicable. When providing statistics or reports, format the information in a clear, easy-to-read manner.` : 
      `You are a helpful assistant for a Game Distribution Service platform that helps users find and play games. You can suggest games, provide information about the platform, and help users with general questions.
      
      Here's some context about the user and the platform: ${context}
      
      Keep responses friendly and focused on enhancing the gaming experience. Always reference the context provided when applicable. When suggesting games, provide a brief description of why the user might enjoy them.`;
    // Log system prompt summary (truncated)
    console.log('[AI] System prompt (truncated):', systemPrompt.substring(0, 200));

    // Add agent capabilities to system prompt if available
    if (agentResponse) {
      systemPrompt += `\n\nI've fetched some specific data for your question: ${JSON.stringify(agentResponse)}`;
      systemPrompt += `\n\nPlease use this data to provide an informed and detailed response. If the data seems insufficient, you can explain that as well.`;
    }

    // Add translation capabilities to the system prompt
    systemPrompt += "\n\nIf the user asks about language translation or changing the display language, inform them they can click the language button in the navigation bar or ask you directly to change their preferred language.";
    
    // Add agent function capabilities list for the model
    systemPrompt += '\n\nI have the following data-fetching functions available for use when answering:';
    systemPrompt += '\n- getDailyReport(date)';
    systemPrompt += '\n- getTopGames(criteria, days, limit)';
    systemPrompt += '\n- getSignificantUsers(days, limit)';
    systemPrompt += '\n- getRareGames(limit)';
    systemPrompt += '\n- getRandomUsers(limit, days)';
    systemPrompt += '\n- getPlatformOverview()';
    systemPrompt += '\n- getGameRecommendations(userId, limit)';
    systemPrompt += '\n- getNewUserRecommendations(userId, limit)';
    systemPrompt += '\n- searchDatabase({collection, query, sort, limit})';
    systemPrompt += '\n- getDatabaseSchema()';
    systemPrompt += '\n- translateText(text, sourceLanguage, targetLanguage)';
    systemPrompt += '\nUse these functions to retrieve precise platform data before formulating your response.';

    // Log before sending request
    console.log('[AI] Sending request to Zero2Launch API...');

    // Send chat request to Zero2Launch API using rate limiter
    const response = await rateLimiter.execute('text', async () => {
      return await axios.post(
        ZERO2LAUNCH_TEXT_API,
        {
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: message
            }
          ],
          model: "openai" // Using Zero2Launch's default model
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ZERO2LAUNCH_API_KEY
          }
        }
      );
    }, 5100); // At least 5.1 seconds between calls (the API allows 1 request per 5 seconds)
    
    const aiResponse = response.data.text;
    // Log AI response from API
    console.log('[AI] AI response received:', aiResponse);

    // Log the response
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'chat_response',
      userRole: userRole || 'user',
      userId: userId,
      message: aiResponse.substring(0, 100) + (aiResponse.length > 100 ? '...' : ''),
      status: 'success'
    });
    
    // Add to system logs - only pass userId if it's a valid ObjectId
    await LoggerService.info(
      'ai', 
      'chat_response', 
      `AI response to ${userRole || 'user'}: "${aiResponse.substring(0, 50)}${aiResponse.length > 50 ? '...' : ''}"`,
      { response: aiResponse },
      logUserId
    );
    
    // If we have structured agent data, format and return directly, bypass LLM
    const direct = queryType && agentResponse && !agentResponse.error ? formatAgentResponse(queryType, agentResponse) : null;
    if (direct) {
      await LoggerService.info('ai', 'direct_response', `Direct response for ${queryType}`, { response: direct }, logUserId);
      console.log('[AI] Direct response:', direct);
      return res.json({ success: true, response: direct });
    }

    // Bypass the LLM for structured queries: format and return immediately if we have valid agent data
    const directEarly = queryType && agentResponse && !agentResponse.error ? formatAgentResponse(queryType, agentResponse) : null;
    if (directEarly) {
      await LoggerService.info('ai', 'direct_response', `Direct early response for ${queryType}`, { response: directEarly }, logUserId);
      console.log('[AI] Direct early response:', directEarly);
      return res.json({ success: true, response: directEarly });
    }

    // If user has a preferred language other than English and the response is in English,
    // translate the response to their preferred language
    let finalResponse = aiResponse;
    if (preferredLanguage && preferredLanguage !== 'en') {
      try {
        finalResponse = await TranslationService.translateText(aiResponse, 'en', preferredLanguage);
        console.log('[AI] Response translated to', preferredLanguage);
      } catch (translationError) {
        console.error('Error translating response:', translationError);
        // Use original response if translation fails
        finalResponse = aiResponse;
      }
    }

    return res.json({
      success: true,
      response: finalResponse
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    
    // Safely extract userId and userRole from request
    const userId = req.body.userId || 'anonymous';
    const userRole = req.body.userRole || 'user';
    
    // Log the error
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'chat_error',
      userRole: userRole,
      userId: userId,
      message: error.message,
      status: 'error'
    });
    
    // Add to system logs - with null userId to prevent further errors
    await LoggerService.error(
      'ai', 
      'chat_error', 
      `Error processing chat request: ${error.message}`,
      { error: error.message, stack: error.stack },
      null // Always use null for error logs to prevent further issues
    );
    
    return res.status(500).json({
      success: false,
      error: 'Error processing chat request',
      details: error.message
    });
  }
};

/**
 * Get assistant status information for admin
 */
exports.getStatus = async (req, res) => {
  try {
    // Only allow admins to access this endpoint
    if (!req.session.user || !req.session.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    // Get platform stats for context
    const totalUsers = await User.countDocuments();
    const totalGames = await Game.countDocuments();
    
    // Get today's log stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const logStats = await LoggerService.getStats(today, tomorrow);
    
    // Check API connection by making a simple request
    let connectionStatus = true;
    let connectionResponse = null;
    
    try {
      // Use rate limiter for connection test
      const testResponse = await rateLimiter.execute('text', async () => {
        return await axios.post(
          ZERO2LAUNCH_TEXT_API,
          {
            messages: [
              {
                role: "system",
                content: "Respond with 'OK' for connection test."
              },
              {
                role: "user",
                content: "Connection test"
              }
            ],
            model: "openai"
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': ZERO2LAUNCH_API_KEY
            }
          }
        );
      }, 5100); // At least 5.1 seconds between calls
      
      connectionResponse = testResponse.data.text;
    } catch (error) {
      connectionStatus = false;
      console.error('Zero2Launch connection test failed:', error);
    }
    
    // Count request types
    const chatRequests = assistantLogs.filter(log => log.event === 'chat_request').length;
    const adminRequests = assistantLogs.filter(log => log.userRole === 'admin').length;
    const userRequests = assistantLogs.filter(log => log.userRole === 'user').length;
    const errorRequests = assistantLogs.filter(log => log.status === 'error').length;
    
    // Get latest request timestamp
    const lastRequest = assistantLogs.length > 0 ? 
      assistantLogs[0].timestamp : null;
    
    // Log this admin request
    await LoggerService.info(
      'admin', 
      'ai_status_check', 
      'Admin requested AI assistant status',
      {},
      req.session.user._id.toString() // Convert ObjectId to string for safety
    );
    
    return res.json({
      success: true,
      status: {
        apiKey: ZERO2LAUNCH_API_KEY ? ZERO2LAUNCH_API_KEY.substring(0, 15) + '...' + ZERO2LAUNCH_API_KEY.substring(ZERO2LAUNCH_API_KEY.length - 10) : null,
        apiKeyMasked: ZERO2LAUNCH_API_KEY ? ZERO2LAUNCH_API_KEY.substring(0, 15) + '...' : null,
        provider: "Zero2Launch",
        model: "openai",
        connected: connectionStatus,
        active: connectionStatus,
        connectionResponse,
        lastRequest,
        totalRequests: chatRequests,
        requestStats: {
          admin: adminRequests,
          user: userRequests,
          errors: errorRequests
        },
        platformStats: {
          totalUsers,
          totalGames,
          todayStats: logStats
        }
      }
    });
  } catch (error) {
    console.error('Error getting AI status:', error);
    
    // Log the error
    await LoggerService.error(
      'admin', 
      'ai_status_error', 
      `Error getting AI assistant status: ${error.message}`,
      { error: error.message, stack: error.stack },
      req.session.user ? req.session.user._id.toString() : null
    );
    
    return res.status(500).json({
      success: false,
      error: 'Error getting AI status',
      details: error.message
    });
  }
};

/**
 * Get assistant logs for admin
 */
exports.getLogs = async (req, res) => {
  try {
    // Only allow admins to access this endpoint
    if (!req.session.user || !req.session.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    // Get filters if provided
    const filter = req.query.filter;
    const limit = parseInt(req.query.limit) || 100;
    
    // Prepare query for MongoDB logs
    const mongoQuery = { category: 'ai' }; // Base query for AI-related logs
    
    // Apply additional filtering if needed
    if (filter === 'admin') {
      mongoQuery.details = { $regex: /admin/i };
    } else if (filter === 'user') {
      mongoQuery.details = { $regex: /user/i };
    } else if (filter === 'error') {
      mongoQuery.level = 'error';
    }
    
    // Get logs from MongoDB (primary source)
    const systemLogs = await LoggerService.getLogs({
      category: 'ai',
      limit: limit,
      ...mongoQuery
    });
    
    // Apply filters to in-memory logs too (as a backup)
    let memoryLogs = [...assistantLogs];
    
    if (filter) {
      if (filter === 'admin' || filter === 'user') {
        memoryLogs = memoryLogs.filter(log => log.userRole === filter);
      } else if (['chat_request', 'chat_response', 'chat_error'].includes(filter)) {
        memoryLogs = memoryLogs.filter(log => log.event === filter);
      } else if (filter === 'error') {
        memoryLogs = memoryLogs.filter(log => log.status === 'error');
      }
    }
    
    // Apply limit to memory logs
    memoryLogs = memoryLogs.slice(0, limit);
    
    // Log this admin request - ensure userId is valid or null
    try {
      await LoggerService.info(
        'admin', 
        'ai_logs_view', 
        'Admin accessed AI assistant logs',
        { filter: req.query.filter, limit },
        req.session.user?._id ? req.session.user._id.toString() : null
      );
    } catch (logError) {
      console.warn('Non-critical error logging admin action:', logError.message);
    }
    
    return res.json({
      success: true,
      logs: memoryLogs,
      systemLogs
    });
  } catch (error) {
    console.error('Error getting AI logs:', error);
    
    // Log the error - ensure userId is valid or null
    try {
      await LoggerService.error(
        'admin', 
        'ai_logs_error', 
        `Error getting AI logs: ${error.message}`,
        { error: error.message, stack: error.stack },
        req.session.user && mongoose.isValidObjectId(req.session.user._id) ? 
          req.session.user._id.toString() : null
      );
    } catch (logError) {
      console.warn('Non-critical error logging error:', logError.message);
    }
    
    return res.status(500).json({
      success: false,
      error: 'Error getting AI logs',
      details: error.message
    });
  }
};

/**
 * Clear assistant logs (admin only)
 */
exports.clearLogs = async (req, res) => {
  try {
    // Only allow admins to access this endpoint
    if (!req.session.user || !req.session.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    // Clear in-memory logs
    assistantLogs.length = 0;
    
    // Also clear MongoDB logs related to AI activities
    // This ensures we clear both in-memory and persistent logs
    const SystemLog = mongoose.model('SystemLog');
    await SystemLog.deleteMany({ category: 'ai' });
    
    // Log this admin action
    try {
      await LoggerService.info(
        'admin', 
        'ai_logs_clear', 
        'Admin cleared AI assistant logs',
        {},
        req.session.user._id ? req.session.user._id.toString() : null
      );
    } catch (logError) {
      console.warn('Non-critical error logging admin action:', logError.message);
    }
    
    return res.json({
      success: true,
      message: 'Logs cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing AI logs:', error);
    
    // Log the error
    try {
      await LoggerService.error(
        'admin', 
        'ai_logs_clear_error', 
        `Error clearing AI logs: ${error.message}`,
        { error: error.message, stack: error.stack },
        req.session.user && req.session.user._id ? req.session.user._id.toString() : null
      );
    } catch (logError) {
      console.warn('Non-critical error logging error:', logError.message);
    }
    
    return res.status(500).json({
      success: false,
      error: 'Error clearing AI logs',
      details: error.message
    });
  }
};

/**
 * Test connection to Zero2Launch API
 */
exports.testConnection = async (req, res) => {
  try {
    // Only allow admins to access this endpoint
    if (!req.session.user || !req.session.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    // Test connection with a simple request using rate limiter
    const testResponse = await rateLimiter.execute('text', async () => {
      return await axios.post(
        ZERO2LAUNCH_TEXT_API,
        {
          messages: [
            {
              role: "system",
              content: "Respond with 'API Connection Successful' for connection test."
            },
            {
              role: "user",
              content: "Test connection"
            }
          ],
          model: "openai"
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ZERO2LAUNCH_API_KEY
          }
        }
      );
    }, 5100); // At least 5.1 seconds between calls
    
    const response = testResponse.data.text;
    
    // Log the test
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'connection_test',
      userRole: 'admin',
      userId: req.session.user?._id || null,
      message: 'Connection test successful',
      status: 'success'
    });
    
    // Log to system logs
    try {
      await LoggerService.info(
        'admin', 
        'ai_connection_test', 
        'Admin tested AI assistant connection',
        { response },
        req.session.user?._id ? req.session.user._id.toString() : null
      );
    } catch (logError) {
      console.warn('Non-critical error logging test connection:', logError.message);
    }
    
    return res.json({
      success: true,
      connected: true,
      message: 'Zero2Launch API connection successful',
      response
    });
  } catch (error) {
    console.error('Error testing AI connection:', error);
    
    // Log the error
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'connection_test',
      userRole: 'admin',
      userId: req.session.user?._id || null,
      message: `Connection test failed: ${error.message}`,
      status: 'error'
    });
    
    // Log to system logs
    try {
      await LoggerService.error(
        'admin', 
        'ai_connection_test_error', 
        `Error testing AI assistant connection: ${error.message}`,
        { error: error.message, stack: error.stack },
        req.session.user?._id ? req.session.user._id.toString() : null
      );
    } catch (logError) {
      console.warn('Non-critical error logging connection error:', logError.message);
    }
    
    return res.status(500).json({
      success: false,
      connected: false,
      error: 'Error connecting to Zero2Launch API',
      details: error.message
    });
  }
};

/**
 * Generate image based on prompt
 */
exports.generateImage = async (req, res) => {
  try {
    const { prompt, width, height } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Image prompt is required'
      });
    }

    // Send image generation request to Zero2Launch API using rate limiter
    const response = await rateLimiter.execute('image', async () => {
      return await axios.post(
        ZERO2LAUNCH_IMAGE_API,
        {
          prompt,
          width: width || 1024,
          height: height || 1024,
          model: 'flux' // Default model
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ZERO2LAUNCH_API_KEY
          }
        }
      );
    }, 5100); // At least 5.1 seconds between calls
    
    let imageUrl = response.data.url;
    
    // If the generated image URL is undefined or not valid, try a different approach
    if (!imageUrl || imageUrl === 'undefined') {
      console.log('Zero2Launch URL is undefined, fetching image data directly...');
      
      // Try to get the actual image data instead of a URL
      const imageDataResponse = await rateLimiter.execute('image', async () => {
        return await axios.post(
          ZERO2LAUNCH_IMAGE_DATA_API,
          {
            prompt,
            width: width || 1024,
            height: height || 1024,
            model: 'flux' // Default model
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': ZERO2LAUNCH_API_KEY
            },
            responseType: 'arraybuffer'
          }
        );
      }, 5100);
      
      // Upload the image data to ImgBB
      const imageName = `ai-generated-${Date.now()}`;
      const imageData = Buffer.from(imageDataResponse.data);
      imageUrl = await uploadToImgBB(imageData, imageName);
    } else {
      // Even if we got a URL, let's upload to ImgBB for permanence
      try {
        console.log('Uploading Zero2Launch image to ImgBB for permanent storage...');
        const imageName = `ai-generated-${Date.now()}`;
        const permanentUrl = await uploadToImgBB(imageUrl, imageName);
        imageUrl = permanentUrl;
      } catch (uploadError) {
        console.error('Failed to upload to ImgBB, using original URL:', uploadError);
        // We'll continue using the original URL if ImgBB upload fails
      }
    }
    
    // Log the request in memory
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'image_generation',
      userRole: req.session.user?.isAdmin ? 'admin' : 'user',
      userId: req.session.user?._id || 'anonymous',
      message: `Generated image with prompt: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
      status: 'success'
    });
    
    // Log to system logs
    await LoggerService.info(
      'ai', 
      'image_generation', 
      `Generated image with prompt: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
      { prompt, width, height, imageUrl: imageUrl },
      req.session.user ? req.session.user._id.toString() : null
    );
    
    return res.json({
      success: true,
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error('Error generating image:', error);
    
    // Log the error in memory
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'image_generation_error',
      userRole: req.session.user?.isAdmin ? 'admin' : 'user',
      userId: req.session.user?._id || 'anonymous',
      message: `Failed to generate image: ${error.message}`,
      status: 'error'
    });
    
    // Log to system logs
    await LoggerService.error(
      'ai', 
      'image_generation_error', 
      `Failed to generate image: ${error.message}`,
      { error: error.message, stack: error.stack, prompt: req.body.prompt },
      req.session.user ? req.session.user._id.toString() : null
    );
    
    return res.status(500).json({
      success: false,
      error: 'Error generating image',
      details: error.message
    });
  }
};

/**
 * Auto-generate image based on game details
 */
exports.generateGameImage = async (req, res) => {
  try {
    const { name, genre, description } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        error: 'Game name and description are required'
      });
    }

    // Create a prompt based on game details
    const prompt = `Create a high-quality, professional game banner image for a ${genre || 'video'} game titled "${name}". The game is described as: "${description.substring(0, 200)}". Make the image vibrant, eye-catching, and representative of the game theme. Include the game title in an attractive font.`;

    // Send image generation request to Zero2Launch API using rate limiter
    const response = await rateLimiter.execute('image', async () => {
      return await axios.post(
        ZERO2LAUNCH_IMAGE_API,
        {
          prompt,
          width: 1280,
          height: 720, // 16:9 aspect ratio for game banner
          model: 'flux' // Default model
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ZERO2LAUNCH_API_KEY
          }
        }
      );
    }, 5100); // At least 5.1 seconds between calls
    
    let imageUrl = response.data.url;
    
    // If the generated image URL is undefined or not valid, try a different approach
    if (!imageUrl || imageUrl === 'undefined') {
      console.log('Zero2Launch URL is undefined, fetching image data directly...');
      
      // Try to get the actual image data instead of a URL
      const imageDataResponse = await rateLimiter.execute('image', async () => {
        return await axios.post(
          ZERO2LAUNCH_IMAGE_DATA_API,
          {
            prompt,
            width: 1280,
            height: 720, // 16:9 aspect ratio for game banner
            model: 'flux' // Default model
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': ZERO2LAUNCH_API_KEY
            },
            responseType: 'arraybuffer'
          }
        );
      }, 5100);
      
      // Upload the image data to ImgBB
      const imageName = `game-${name.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
      const imageData = Buffer.from(imageDataResponse.data);
      imageUrl = await uploadToImgBB(imageData, imageName);
    } else {
      // Even if we got a URL, let's upload to ImgBB for permanence
      try {
        console.log('Uploading Zero2Launch game image to ImgBB for permanent storage...');
        const imageName = `game-${name.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
        const permanentUrl = await uploadToImgBB(imageUrl, imageName);
        imageUrl = permanentUrl;
      } catch (uploadError) {
        console.error('Failed to upload to ImgBB, using original URL:', uploadError);
        // We'll continue using the original URL if ImgBB upload fails
      }
    }
    
    // Log the request in memory
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'game_image_generation',
      userRole: req.session.user?.isAdmin ? 'admin' : 'user',
      userId: req.session.user?._id || 'anonymous',
      message: `Generated game banner for: ${name}`,
      status: 'success'
    });
    
    // Log to system logs
    await LoggerService.info(
      'ai', 
      'game_image_generation', 
      `Generated game banner for game: ${name}`,
      { name, genre, description, prompt, imageUrl },
      req.session.user ? req.session.user._id.toString() : null
    );
    
    return res.json({
      success: true,
      imageUrl: imageUrl,
      prompt
    });
  } catch (error) {
    console.error('Error generating game image:', error);
    
    // Log the error in memory
    assistantLogs.unshift({
      timestamp: new Date(),
      event: 'game_image_generation_error',
      userRole: req.session.user?.isAdmin ? 'admin' : 'user',
      userId: req.session.user?._id || 'anonymous',
      message: `Failed to generate game banner: ${error.message}`,
      status: 'error'
    });
    
    // Log to system logs
    await LoggerService.error(
      'ai', 
      'game_image_generation_error', 
      `Failed to generate game banner: ${error.message}`,
      { error: error.message, stack: error.stack, gameDetails: req.body },
      req.session.user ? req.session.user._id.toString() : null
    );
    
    return res.status(500).json({
      success: false,
      error: 'Error generating game banner',
      details: error.message
    });
  }
};

/**
 * Detect what type of query the user is making that might need agent functionality
 * @param {string} message - User's message
 * @returns {string|null} The type of query or null if no specific type detected
 */
function detectQueryType(message) {
  if (!message) return null;
  const lowerMessage = message.toLowerCase();

  // Random game queries (robust detection)
  if (
    lowerMessage.includes('random game') ||
    lowerMessage.includes('suggest me a game') ||
    lowerMessage.includes('suggest a game') ||
    lowerMessage.includes('game suggestion') ||
    lowerMessage.match(/what('s| is) a .*game/) ||
    lowerMessage.includes('recommend me a game randomly') ||
    lowerMessage.includes('pick a game for me') ||
    lowerMessage.includes('give me a random game') ||
    lowerMessage.includes('any game to try')
  ) {
    return 'randomGames';
  }

  // Rare or underplayed games queries
  if (
    lowerMessage.includes('rare game') ||
    lowerMessage.includes('rare games') ||
    lowerMessage.includes('niche game') ||
    lowerMessage.includes('underplayed') ||
    lowerMessage.includes('obscure game') ||
    lowerMessage.includes('least played') ||
    lowerMessage.includes('less played') ||
    lowerMessage.includes('uncommon game')
  ) {
    return 'rareGames';
  }

  // Top games queries
  if (
    lowerMessage.includes('top games') ||
    lowerMessage.includes('most played') ||
    lowerMessage.includes('highest rated games') ||
    lowerMessage.includes('best games') ||
    lowerMessage.includes('trending games')
  ) {
    return 'topGames';
  }

  // Random users queries
  if (
    lowerMessage.includes('random users') ||
    lowerMessage.includes('some random users') ||
    lowerMessage.includes('random users with') ||
    lowerMessage.includes('show me some users') ||
    lowerMessage.includes('which users')
  ) {
    return 'randomUsers';
  }

  // Game recommendation queries
  if (
    lowerMessage.includes('what should i play') ||
    lowerMessage.includes('recommend me') ||
    lowerMessage.includes('recommend games') ||
    lowerMessage.includes('game suggestions') ||
    lowerMessage.includes('games like') ||
    lowerMessage.includes("i don't know what to play") ||
    lowerMessage.includes('suggest some games') ||
    lowerMessage.includes('what games') ||
    lowerMessage.includes('what to play')
  ) {
    return 'gameRecommendations';
  }

  // New user queries
  if (
    lowerMessage.includes('just registered') ||
    lowerMessage.includes('new user') ||
    lowerMessage.includes('first time here') ||
    lowerMessage.includes('newbie') ||
    lowerMessage.includes('getting started')
  ) {
    return 'newUserRecommendations';
  }

  // Platform overview queries
  if (
    lowerMessage.includes('platform overview') ||
    lowerMessage.includes('overview') ||
    lowerMessage.includes('platform analytics') ||
    lowerMessage.includes('give me an overview')
  ) {
    return 'platformOverview';
  }

  // User statistics or significant users
  if (
    lowerMessage.includes('active users') ||
    lowerMessage.includes('significant users') ||
    lowerMessage.includes('user growth') ||
    lowerMessage.includes('user activity') ||
    lowerMessage.includes('top users') ||
    lowerMessage.includes('who is playing')
  ) {
    return 'significantUsers';
  }

  // Fallback: no specific type detected
  return null;
}

/**
 * Handle agent-specific queries by fetching relevant data
 * @param {string} queryType - Type of query detected
 * @param {string} message - User's original message
 * @param {string} userRole - User's role (admin or user)
 * @param {string} userId - User's ID
 * @returns {Promise<Object|null>} Data for the response or null if no data needed
 */
async function handleAgentQuery(queryType, message, userRole, userId) {
  try {
    // Only admins can access certain query types
    if (['dailyReport', 'significantUsers'].includes(queryType) && userRole !== 'admin') {
      return null;
    }
    
    // Validate userId before using it with database queries
    const isValidObjectId = userId && mongoose.Types.ObjectId.isValid(userId) && userId !== 'anonymous';
    
    console.log(`[AI] Executing agent query for ${queryType}`);
    
    switch (queryType) {
      case 'randomGames': {
        // Extract number of games requested (default to 3 if not specified)
        const limitMatch = message.match(/(\d+)\s*(random\s*)?games?/i);
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 3;
        
        console.log(`[AI] Fetching ${limit} random games from database`);
        const games = await AIAgentService.getRandomGames({ limit });
        
        // Log the actual game data being retrieved
        console.log(`[AI] Retrieved ${games.length} random games from database`);
        
        // Return the data in a structured format so the controller knows it's a direct response
        return {
          games: games,
          queryType: 'randomGames',
          directResponse: true
        };
      }
      
      case 'dailyReport': {
        // Parse the message to see if they're asking for a specific date
        const dateMatch = message.match(/report (?:for|on) (yesterday|today|last week|\d+ days ago|\d{4}-\d{2}-\d{2})/i);
        let dateExpression = 'today';
        
        if (dateMatch) {
          dateExpression = dateMatch[1].toLowerCase();
        }
        
        const date = AIAgentService.parseDateExpression(dateExpression);
        return await AIAgentService.getDailyReport(date);
      }
      
      case 'topGames': {
        // Parse if they want ratings or plays, and for what period
        const isRatings = message.toLowerCase().includes('rated') || 
                          message.toLowerCase().includes('rating') || 
                          message.toLowerCase().includes('best');
        
        const daysMatch = message.match(/(\d+) days?/i);
        const days = daysMatch ? parseInt(daysMatch[1], 10) : 7;
        
        const games = await AIAgentService.getTopGames({
          criteria: isRatings ? 'ratings' : 'plays',
          days,
          limit: 5
        });
        
        return {
          games,
          queryType: 'topGames',
          criteria: isRatings ? 'ratings' : 'plays',
          directResponse: true
        };
      }
      
      case 'significantUsers': {
        const daysMatch = message.match(/(\d+) days?/i);
        const days = daysMatch ? parseInt(daysMatch[1], 10) : 7;
        
        return await AIAgentService.getSignificantUsers({ days, limit: 5 });
      }
      
      case 'rareGames': {
        const limitMatch = message.match(/(\d+)\s*rare\s*games?/i);
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 3;
        
        console.log(`[AI] Fetching ${limit} rare games from database`);
        const games = await AIAgentService.getRareGames({ limit });
        
        console.log(`[AI] Retrieved ${games.length} rare games from database`);
        
        return {
          games,
          queryType: 'rareGames',
          directResponse: true
        };
      }
      
      case 'gameRecommendations': {
        // Only make personalized recommendations if we have a valid userId
        if (isValidObjectId) {
          try {
            const isNew = await AIAgentService.isNewUser(userId);
            
            if (!isNew) {
              return await AIAgentService.getGameRecommendations(userId, 5);
            } else {
              return await AIAgentService.getNewUserRecommendations(userId, 5);
            }
          } catch (err) {
            console.log(`Error getting recommendations: ${err.message} - falling back to generic recommendations`);
            return await AIAgentService.getNewUserRecommendations(null, 5);
          }
        } else {
          // Generic recommendations for anonymous users
          return await AIAgentService.getNewUserRecommendations(null, 5);
        }
      }
      
      case 'newUserRecommendations': {
        // Only use userId if it's a valid MongoDB ObjectId
        const safeUserId = isValidObjectId ? userId : null;
        return await AIAgentService.getNewUserRecommendations(safeUserId, 5);
      }

      case 'randomUsers': {
        const stats = await AIAgentService.getRandomUsers({ limit: 3, days: 7 });
        return { 
          users: stats,
          queryType: 'randomUsers',
          directResponse: true 
        };
      }
      
      case 'mostRecentGame': {
        const game = await AIAgentService.getMostRecentGame();
        return { mostRecentGame: game };
      }
      
      case 'recentReleases': {
        const releases = await AIAgentService.getRecentReleases({ limit: 5 });
        return { recentReleases: releases };
      }
      
      case 'mostPlayedGame': {
        const game = await AIAgentService.getMostPlayedGame();
        return { mostPlayedGame: game };
      }
      
      case 'platformOverview': {
        // Fetch full platform overview combining all analytics
        const overview = await AIAgentService.getPlatformOverview();
        return { 
          overview,
          queryType: 'platformOverview',
          directResponse: true 
        };
      }
      
      case 'databaseSchema': {
        const schema = await AIAgentService.getDatabaseSchema();
        return { databaseSchema: schema };
      }
      case 'generalQuery': {
        // Provide schema overview for general database questions
        const schema = await AIAgentService.getDatabaseSchema();
        return { databaseSchema: schema };
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Error handling agent query of type ${queryType}:`, error);
    return {
      error: true,
      message: `I tried to fetch data for your query but encountered an error: ${error.message}`
    };
  }
}

// Helper to format agent data responses for known query types
function formatAgentResponse(queryType, data) {
  console.log(`[AI] Formatting direct response for ${queryType}`, data);
  
  switch (queryType) {
    case 'randomGames': {
      if (!data.games || !data.games.length) return 'I couldn\'t find any games to suggest at the moment.';
      
      const randomGamesList = data.games;
      let response = 'Here are some random games from our platform:\n\n';
      
      randomGamesList.forEach((game, index) => {
        response += `${index + 1}. **${game.name}**\n`;
        if (game.genre && game.genre.length > 0) {
          const genres = Array.isArray(game.genre) ? game.genre.join(', ') : game.genre;
          response += `   Genre: ${genres}\n`;
        }
        if (game.description) {
          response += `   ${game.description.substring(0, 150)}${game.description.length > 150 ? '...' : ''}\n`;
        }
        if (typeof game.rating === 'number') {
          response += `   Rating: ${game.rating.toFixed(1)}/5.0\n`;
        }
        response += '\n';
      });
      
      response += `Would you like more information about any of these games?`;
      return response;
    }
    
    case 'rareGames': {
      const list = data.games || [];
      if (!list.length) return 'No underplayed games found.';
      
      let response = 'Here are some underplayed gems from our platform that you might want to check out:\n\n';
      
      list.forEach((game, index) => {
        response += `${index + 1}. **${game.name}**\n`;
        if (game.genre && game.genre.length > 0) {
          const genres = Array.isArray(game.genre) ? game.genre.join(', ') : game.genre;
          response += `   Genre: ${genres}\n`;
        }
        response += `   Plays: ${game.playCount}\n`;
        if (typeof game.rating === 'number') {
          response += `   Rating: ${game.rating.toFixed(1)}/5.0\n`;
        }
        if (game.description) {
          response += `   ${game.description.substring(0, 100)}${game.description.length > 100 ? '...' : ''}\n`;
        }
        response += '\n';
      });
      
      response += 'These games haven\'t been played much yet - why not be one of the first to try them out?';
      return response;
    }
    
    case 'topGames': {
      const list = data.games || [];
      if (!list.length) return 'No game data available.';
      
      const criteria = data.criteria || 'plays';
      const title = criteria === 'ratings' ? 'Top Rated Games' : 'Most Played Games';
      let response = `**${title} on our platform:**\n\n`;
      
      list.forEach((game, index) => {
        response += `${index + 1}. **${game.name}**\n`;
        if (game.genre && game.genre.length > 0) {
          const genres = Array.isArray(game.genre) ? game.genre.join(', ') : game.genre;
          response += `   Genre: ${genres}\n`;
        }
        
        if (criteria === 'ratings') {
          response += `   Rating: ${(game.averageRating || game.rating || 0).toFixed(1)}/5.0`;
          if (game.ratingCount) response += ` (${game.ratingCount} ratings)`;
          response += '\n';
        } else {
          response += `   Plays: ${game.playCount || 0}\n`;
          if (game.totalPlayTime) {
            const hours = (game.totalPlayTime / 3600).toFixed(1);
            response += `   Total Play Time: ${hours} hours\n`;
          }
        }
        
        if (game.description) {
          response += `   ${game.description.substring(0, 100)}${game.description.length > 100 ? '...' : ''}\n`;
        }
        response += '\n';
      });
      
      return response;
    }
    
    case 'randomUsers': {
      const users = data.users || [];
      if (!users.length) return 'No user activity data available.';
      
      let response = 'Here are some random users and their activity from our platform:\n\n';
      
      users.forEach((user, index) => {
        response += `${index + 1}. **${user.name}**\n`;
        response += `   Hours Played: ${user.totalHours}\n`;
        response += `   Games Played: ${user.gamesPlayed}\n`;
        response += `   Status: ${user.isActive ? 'Active' : 'Inactive'}\n\n`;
      });
      
      return response;
    }
    
    case 'platformOverview': {
      const overview = data.overview;
      if (!overview) return 'Platform overview data not available.';
      
      let response = '**Platform Overview**\n\n';
      response += `Total Users: ${overview.totalUsers}\n`;
      response += `Total Games: ${overview.totalGames}\n\n`;
      
      if (overview.dailyReport) {
        const report = overview.dailyReport;
        response += `**Today's Activity**\n`;
        response += `Games Played: ${report.summary?.gamesPlayed || 0}\n`;
        response += `Active Users: ${report.summary?.activeUsers || 0}\n`;
        response += `New Registrations: ${report.summary?.newUsers || 0}\n`;
        response += `Ratings Submitted: ${report.summary?.ratingsSubmitted || 0}\n\n`;
      }
      
      if (overview.topGamesByPlays && overview.topGamesByPlays.length > 0) {
        response += `**Most Played Game:** ${overview.topGamesByPlays[0].name} (${overview.topGamesByPlays[0].playCount} plays)\n\n`;
      }
      
      if (overview.topGamesByRatings && overview.topGamesByRatings.length > 0) {
        response += `**Top Rated Game:** ${overview.topGamesByRatings[0].name} (${overview.topGamesByRatings[0].averageRating.toFixed(1)}/5.0)\n\n`;
      }
      
      response += 'Would you like more detailed statistics on any specific aspect of the platform?';
      return response;
    }
    
    case 'mostPlayedGame': {
      const game = data.mostPlayedGame || data;
      if (!game) return 'No play data available.';
      
      let response = `**Most Played Game on the Platform**\n\n`;
      response += `**${game.name}**\n`;
      response += `Plays: ${game.playCount}\n`;
      response += `Rating: ${game.rating.toFixed(1)}/5.0\n`;
      
      if (game.description) {
        response += `\nDescription: ${game.description}\n`;
      }
      
      if (game.genre) {
        response += `Genre: ${game.genre}\n`;
      }
      
      return response;
    }
    
    case 'recentReleases': {
      const list = data.recentReleases || [];
      if (!list.length) return 'No recent releases found.';
      
      let response = '**Recent Game Releases:**\n\n';
      
      list.forEach((game, index) => {
        const releaseDate = new Date(game.releaseDate).toLocaleDateString();
        response += `${index + 1}. **${game.name}** (Released: ${releaseDate})\n`;
        
        if (game.genre) {
          response += `   Genre: ${game.genre}\n`;
        }
        
        if (typeof game.rating === 'number') {
          response += `   Rating: ${game.rating.toFixed(1)}/5.0\n`;
        }
        
        if (game.description) {
          response += `   ${game.description.substring(0, 100)}${game.description.length > 100 ? '...' : ''}\n`;
        }
        
        response += '\n';
      });
      
      return response;
    }
    
    default:
      return null;
  }
}

/**
 * Generate context for the AI based on user role, ID, and any agent query results
 */
async function generateContext(userRole, userId, agentResponse = null) {
  try {
    // Base context for all users
    let context = "This is a Game Distribution Service platform where users can discover, play, and rate games.";
    
    // Add platform statistics
    const totalUsers = await User.countDocuments();
    const totalGames = await Game.countDocuments();
    context += ` The platform currently has ${totalUsers} users and ${totalGames} games.`;
    
    // Add agent response data if available
    if (agentResponse) {
      if (agentResponse.error) {
        context += ` I tried to fetch some data for you but encountered an error: ${agentResponse.message}`;
      } else if (agentResponse.summary) {
        context += ` I have access to a daily report showing ${agentResponse.summary.newUsers} new users and ${agentResponse.summary.gamesPlayed} games played today.`;
      } else if (agentResponse.trending || agentResponse.topRated) {
        context += ` I have access to trending and top-rated games on the platform.`;
      } else if (agentResponse.rareGames) {
        context += ` I can provide information about rare or niche games that are not commonly played.`;
      }
    }
    
    // If admin, provide admin-specific context with system logs data
    if (userRole === 'admin') {
      // Get today's logs for admin insights
      const todayLogs = await LoggerService.getToday();
      const todayStats = await LoggerService.getStats(new Date(new Date().setHours(0, 0, 0, 0)), new Date());
      
      // Get most active users
      const topUsers = await User.find()
        .sort({ totalPlayTime: -1 })
        .limit(5);
      
      // Get top rated games
      const topGames = await Game.find({ rating: { $gt: 0 } })
        .sort({ rating: -1 })
        .limit(5);
      
      context += ` Today there have been ${todayLogs.length} activities logged on the platform.`;
      context += ` The system has logged ${todayStats.errorCount} errors today.`;
      context += ` The most active user is ${topUsers[0]?.name || 'unknown'} with ${topUsers[0]?.totalPlayTime || 0} hours.`;
      context += ` The top rated game is ${topGames[0]?.name || 'unknown'} with a rating of ${topGames[0]?.rating?.toFixed(1) || 0}.`;
      context += " As an admin, you can view statistics, manage users and games, and monitor the platform.";
      
      // Add recent activities
      if (todayLogs.length > 0) {
        context += " Recent platform activities include: ";
        const recentActivities = todayLogs.slice(0, 5).map(log => 
          `${log.message} (${new Date(log.timestamp).toLocaleTimeString()})`
        );
        context += recentActivities.join('; ');
      }
      
      // Add specific context based on detected query
      context += " As an AI assistant, I can help you analyze platform data, generate reports, and identify trends.";
      context += " You can ask me about user activity, game performance, or general platform health.";
    }
    // If regular user with ID, provide personalized context
    else if (userId && userId !== 'anonymous' && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        // Get user details
        const user = await User.findById(userId);
        
        if (user) {
          context += ` You're speaking to ${user.name} who has played for ${user.totalPlayTime || 0} hours.`;
          
          // Get user's play history and logs
          const userLogs = await LoggerService.getLogs({ userId, limit: 20 });
          
          // Only process favorite game if it exists and is valid
          if (user.favoriteGame && mongoose.Types.ObjectId.isValid(user.favoriteGame)) {
            try {
              const favoriteGame = await Game.findById(user.favoriteGame);
              if (favoriteGame) {
                context += ` Their favorite game appears to be ${favoriteGame.name}.`;
              }
            } catch (gameErr) {
              console.log(`Error finding favorite game: ${gameErr.message}`);
            }
          }
          
          // Get recommendations based on play history
          const userGenres = user.favoriteGenres || [];
          if (userGenres.length > 0) {
            try {
              const recommendations = await Game.find({ genres: { $in: userGenres } })
                .sort({ rating: -1 })
                .limit(3);
              
              if (recommendations && recommendations.length > 0) {
                context += ` Based on their play history, they might enjoy these games: ${recommendations.map(g => g.name).join(', ')}.`;
              }
            } catch (recErr) {
              console.log(`Error getting recommendations: ${recErr.message}`);
            }
          }
          
          // Add recent user activities
          if (userLogs && userLogs.length > 0) {
            const gamePlayLogs = userLogs.filter(log => log.category === 'game' && log.action === 'play');
            if (gamePlayLogs.length > 0 && gamePlayLogs[0].gameId) {
              context += ` The user recently played: ${gamePlayLogs[0].gameId.name || 'unknown game'}.`;
            }
          }
          
          // Check if user is new
          try {
            const isNewUser = await AIAgentService.isNewUser(userId);
            if (isNewUser) {
              context += " This user is relatively new to our platform. You should focus on helping them discover games and platform features.";
            } else {
              context += " This user is a returning player who knows our platform. You can provide more advanced recommendations and platform tips.";
            }
          } catch (userErr) {
            context += " This user has played on our platform before.";
          }
        } else {
          context += " You're speaking to a user whose profile is not found.";
        }
      } catch (error) {
        console.error(`Error getting user context: ${error.message}`);
        context += " You're speaking to a user for whom we couldn't retrieve details.";
      }
    } else {
      // Generic context for non-logged in or invalid users
      context += " You're speaking to a visitor or anonymous user. Consider recommending popular games and explaining platform features.";
    }
    
    return context;
  } catch (error) {
    console.error('Error generating context:', error);
    return "This is a Game Distribution Service platform. (Error retrieving detailed context data)";
  }
}

/**
 * Upload image to ImgBB
 * @param {string|Buffer} imageData - Image data as URL, base64 string, or buffer
 * @param {string} imageName - Optional name for the image
 * @returns {Promise<string>} - URL of the uploaded image
 */
async function uploadToImgBB(imageData, imageName = 'game-cover') {
  try {
    console.log('Uploading image to ImgBB...');
    
    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('key', IMGBB_API_KEY);
    
    // Handle different image data formats
    if (typeof imageData === 'string' && imageData.startsWith('http')) {
      // If it's a URL, pass it directly
      formData.append('image', imageData);
    } else if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
      // If it's a base64 data URI, extract just the base64 part
      const base64Data = imageData.split(',')[1];
      formData.append('image', base64Data);
    } else if (Buffer.isBuffer(imageData)) {
      // If it's a buffer, convert to base64
      formData.append('image', imageData.toString('base64'));
    } else if (typeof imageData === 'string') {
      // Assume it's already base64
      formData.append('image', imageData);
    } else {
      throw new Error('Unsupported image data format');
    }
    
    // Add optional parameters
    formData.append('name', imageName);
    // Set expiration to 0 (never expire) or specific time in seconds (e.g., 86400 for 1 day)
    formData.append('expiration', '0');
    
    // Send request to ImgBB API
    const response = await axios({
      method: 'post',
      url: IMGBB_UPLOAD_API,
      data: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Check response
    if (response.data && response.data.success && response.data.data && response.data.data.url) {
      console.log('Image successfully uploaded to ImgBB:', response.data.data.url);
      return response.data.data.url;
    } else {
      console.error('ImgBB upload response format unexpected:', response.data);
      throw new Error('Unexpected ImgBB response format');
    }
  } catch (error) {
    console.error('Error uploading image to ImgBB:', error.message);
    throw error;
  }
}

/**
 * Check if a user message is a translation request
 * @param {string} message - User message
 * @returns {boolean} - True if message is a translation request
 */
function checkIfTranslationRequest(message) {
  if (!message) return false;
  
  const lowerMessage = message.toLowerCase();
  const translationKeywords = [
    'translate', 'translation', 'change language', 'switch language',
    'language preference', 'preferred language', 'set language'
  ];
  
  return translationKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Handle a translation request from a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} message - User message
 * @param {string} userId - User ID
 * @param {string} currentLanguage - Current language preference
 * @returns {Promise<Object>} - Response object
 */
async function handleTranslationRequest(req, res, message, userId, currentLanguage) {
  try {
    // Check if this is a simple request for language options
    const isLanguageListRequest = message.toLowerCase().includes('language') && 
                                 (message.toLowerCase().includes('what') || 
                                  message.toLowerCase().includes('list') ||
                                  message.toLowerCase().includes('available') ||
                                  message.toLowerCase().includes('supported'));
    
    if (isLanguageListRequest) {
      const languages = TranslationService.getSupportedLanguages();
      const languageList = Object.entries(languages)
        .map(([code, name]) => `${name} (${code})`)
        .join(', ');
      
      return res.json({
        success: true,
        response: `I can help you change the page language to any of these supported languages: ${languageList}. What language would you prefer?`
      });
    }
    
    // Default response if no specific language is detected
    const promptResponse = `What's your preferred language? Please specify. You can say a language like "Spanish" or "French" and I'll help update your language preference.`;
    
    // Check if message might specify a language
    for (const [code, name] of Object.entries(TranslationService.SUPPORTED_LANGUAGES)) {
      if (message.toLowerCase().includes(name.toLowerCase()) || 
          message.toLowerCase().includes(code.toLowerCase())) {
        
        // If user is not authenticated, we can't update their preference in the database
        if (userId === 'anonymous' || !mongoose.Types.ObjectId.isValid(userId)) {
          return res.json({
            success: true,
            response: `I can help you change the language to ${name}, but you'll need to be logged in to save this preference. Please log in first, then ask me again or use the language button in the navigation bar.`
          });
        }
        
        // User is authenticated, update their preference
        try {
          await User.findByIdAndUpdate(userId, { preferredLanguage: code });
          
          // Update session
          if (req.session.user) {
            req.session.user.preferredLanguage = code;
            await new Promise(resolve => req.session.save(resolve));
          }
          
          return res.json({
            success: true,
            response: `I've updated your language preference to ${name} (${code}). The page should now be translated to ${name}. If you want to change it again, just let me know!`,
            languageUpdated: true,
            languageCode: code
          });
        } catch (dbError) {
          console.error('Error updating user language preference:', dbError);
          
          return res.json({
            success: true,
            response: `I tried to update your language preference to ${name}, but encountered an error. You can change your language using the language button in the navigation bar.`
          });
        }
      }
    }
    
    // If we get here, no specific language was detected
    return res.json({
      success: true,
      response: promptResponse
    });
  } catch (error) {
    console.error('Error handling translation request:', error);
    
    return res.json({
      success: true,
      response: 'I encountered an error while processing your language request. Please try using the language button in the navigation bar instead.'
    });
  }
}