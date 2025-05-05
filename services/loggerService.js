/**
 * Logger Service
 * Centralized logging utility for the platform
 */

const SystemLog = require('../models/systemLog');
const mongoose = require('mongoose');

class LoggerService {
  /**
   * Create a new log entry
   * 
   * @param {Object} logData - Log data object
   * @param {string} logData.level - Log level (info, warning, error, success)
   * @param {string} logData.category - Log category (user, game, auth, admin, system, ai)
   * @param {string} logData.action - The action that was performed
   * @param {string} logData.message - Human-readable message describing what happened
   * @param {Object} [logData.details] - Additional details about the log (optional)
   * @param {string|mongoose.Types.ObjectId} [logData.userId] - ID of the associated user (optional)
   * @param {string|mongoose.Types.ObjectId} [logData.gameId] - ID of the associated game (optional)
   * @param {Object} [logData.metadata] - Any additional metadata (optional)
   * @returns {Promise<Object>} The created log entry
   */
  static async createLog(logData) {
    try {
      // Convert string IDs to ObjectIds or set to null if invalid
      let userId = null;
      if (logData.userId) {
        if (mongoose.Types.ObjectId.isValid(logData.userId)) {
          // Valid ObjectId string or already an ObjectId
          userId = new mongoose.Types.ObjectId(logData.userId);
        } else {
          // Invalid ObjectId - just set to null and continue
          console.warn(`Invalid userId (will be set to null): ${logData.userId}`);
        }
      }

      let gameId = null;
      if (logData.gameId) {
        if (mongoose.Types.ObjectId.isValid(logData.gameId)) {
          // Valid ObjectId string or already an ObjectId
          gameId = new mongoose.Types.ObjectId(logData.gameId);
        } else {
          // Invalid ObjectId - just set to null and continue
          console.warn(`Invalid gameId (will be set to null): ${logData.gameId}`);
        }
      }

      const log = new SystemLog({
        level: logData.level || 'info',
        category: logData.category || 'system',
        action: logData.action,
        message: logData.message,
        details: logData.details,
        userId: userId,
        gameId: gameId,
        metadata: logData.metadata
      });

      await log.save();
      return log;
    } catch (error) {
      console.warn('Error creating log:', error);
      // Try to save an error log about the logging failure
      try {
        const errorLog = new SystemLog({
          level: 'error',
          category: 'system',
          action: 'logging_failure',
          message: `Failed to create log entry: ${error.message}`,
          details: { originalLog: {...logData, userId: null, gameId: null}, error: error.message }
        });
        await errorLog.save();
      } catch (innerError) {
        console.error('Critical: Failed to log the logging error:', innerError);
      }
    }
  }

  /**
   * Shorthand for info level logs
   */
  static async info(category, action, message, details = {}, userId = null, gameId = null, metadata = {}) {
    return this.createLog({
      level: 'info',
      category,
      action,
      message,
      details,
      userId,
      gameId,
      metadata
    });
  }

  /**
   * Shorthand for success level logs
   */
  static async success(category, action, message, details = {}, userId = null, gameId = null, metadata = {}) {
    return this.createLog({
      level: 'success',
      category,
      action,
      message,
      details,
      userId,
      gameId,
      metadata
    });
  }

  /**
   * Shorthand for warning level logs
   */
  static async warning(category, action, message, details = {}, userId = null, gameId = null, metadata = {}) {
    return this.createLog({
      level: 'warning',
      category,
      action,
      message,
      details,
      userId,
      gameId,
      metadata
    });
  }

  /**
   * Shorthand for error level logs
   */
  static async error(category, action, message, details = {}, userId = null, gameId = null, metadata = {}) {
    return this.createLog({
      level: 'error',
      category,
      action,
      message,
      details,
      userId,
      gameId,
      metadata
    });
  }

  /**
   * Get recent logs
   * 
   * @param {Object} options - Query options
   * @param {number} [options.limit=100] - Maximum number of logs to retrieve
   * @param {string} [options.level] - Filter by log level
   * @param {string} [options.category] - Filter by category
   * @param {string} [options.userId] - Filter by user ID
   * @param {string} [options.gameId] - Filter by game ID
   * @param {Date} [options.startDate] - Filter logs after this date
   * @param {Date} [options.endDate] - Filter logs before this date
   * @returns {Promise<Array>} Array of log entries
   */
  static async getLogs(options = {}) {
    const query = {};
    
    if (options.level) query.level = options.level;
    if (options.category) query.category = options.category;
    if (options.userId) query.userId = options.userId;
    if (options.gameId) query.gameId = options.gameId;
    
    if (options.startDate || options.endDate) {
      query.timestamp = {};
      if (options.startDate) query.timestamp.$gte = options.startDate;
      if (options.endDate) query.timestamp.$lte = options.endDate;
    }

    const limit = options.limit || 100;
    
    return SystemLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userId', 'name email')
      .populate('gameId', 'name');
  }

  /**
   * Get all logs for today
   * 
   * @param {Object} options - Additional filter options
   * @returns {Promise<Array>} Array of today's log entries
   */
  static async getToday(options = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.getLogs({
      ...options,
      startDate: today,
      endDate: tomorrow
    });
  }

  /**
   * Get statistical summary of logs
   * 
   * @param {Date} [startDate] - Start date for statistics
   * @param {Date} [endDate] - End date for statistics
   * @returns {Promise<Object>} Statistics object
   */
  static async getStats(startDate, endDate) {
    const query = {};
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }
    
    const [
      totalCount,
      errorCount,
      warningCount,
      categoryStats,
      userStats,
      gameStats
    ] = await Promise.all([
      SystemLog.countDocuments(query),
      SystemLog.countDocuments({ ...query, level: 'error' }),
      SystemLog.countDocuments({ ...query, level: 'warning' }),
      SystemLog.aggregate([
        { $match: query },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      SystemLog.aggregate([
        { $match: { ...query, userId: { $exists: true, $ne: null } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      SystemLog.aggregate([
        { $match: { ...query, gameId: { $exists: true, $ne: null } } },
        { $group: { _id: '$gameId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);
    
    return {
      totalCount,
      errorCount,
      warningCount,
      successRate: totalCount > 0 ? ((totalCount - errorCount - warningCount) / totalCount) * 100 : 100,
      categoryBreakdown: categoryStats,
      topUsers: userStats,
      topGames: gameStats
    };
  }

  /**
   * Clear old logs
   * 
   * @param {number} [days=30] - Remove logs older than this many days
   * @returns {Promise<number>} Number of removed logs
   */
  static async clearOldLogs(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await SystemLog.deleteMany({ timestamp: { $lt: cutoffDate } });
    return result.deletedCount;
  }
}

module.exports = LoggerService;