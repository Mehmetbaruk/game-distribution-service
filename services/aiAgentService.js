/**
 * AI Agent Service
 * Provides specialized data-fetching and analytics capabilities for the AI Assistant
 */

const mongoose = require('mongoose');
const LoggerService = require('./loggerService');
const mongodbService = require('./mongodbService');
const Game = mongoose.model('Game');
const User = mongoose.model('User');
const SystemLog = mongoose.model('SystemLog');

class AIAgentService {
  /**
   * Get a daily report of platform activity
   * 
   * @param {Date|string} date - The date to get the report for (defaults to today)
   * @returns {Promise<Object>} Report data
   */
  static async getDailyReport(date = new Date()) {
    // Parse date if it's a string
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    // Ensure we're working with the start of the day
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    try {
      // Get logs for the specified day
      const logs = await LoggerService.getLogs({
        startDate,
        endDate
      });
      
      // Get stats summary
      const stats = await LoggerService.getStats(startDate, endDate);
      
      // Get specific counts for the day
      const [
        newUsers,
        activeUsers,
        gamesPlayed,
        topPlayedGames,
        ratingsSubmitted,
        topRatedGames
      ] = await Promise.all([
        // Count new user registrations
        User.countDocuments({ 
          createdAt: { $gte: startDate, $lt: endDate } 
        }),
        
        // Count active users (users who logged in)
        SystemLog.countDocuments({
          category: 'auth',
          action: 'login',
          timestamp: { $gte: startDate, $lt: endDate }
        }),
        
        // Count game play sessions
        SystemLog.countDocuments({
          category: 'game',
          action: 'play',
          timestamp: { $gte: startDate, $lt: endDate }
        }),
        
        // Get top played games
        SystemLog.aggregate([
          { 
            $match: { 
              category: 'game',
              action: 'play',
              gameId: { $exists: true, $ne: null },
              timestamp: { $gte: startDate, $lt: endDate }
            }
          },
          { 
            $group: { 
              _id: '$gameId', 
              count: { $sum: 1 },
              totalPlayTime: { $sum: { $ifNull: ['$details.playTime', 0] } }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'games',
              localField: '_id',
              foreignField: '_id',
              as: 'gameDetails'
            }
          },
          {
            $project: {
              _id: 1,
              count: 1,
              totalPlayTime: 1,
              name: { $arrayElemAt: ['$gameDetails.name', 0] },
              genre: { $arrayElemAt: ['$gameDetails.genre', 0] }
            }
          }
        ]),
        
        // Count ratings submitted
        SystemLog.countDocuments({
          category: 'game',
          action: 'rate',
          timestamp: { $gte: startDate, $lt: endDate }
        }),
        
        // Get top rated games
        SystemLog.aggregate([
          { 
            $match: { 
              category: 'game',
              action: 'rate',
              gameId: { $exists: true, $ne: null },
              timestamp: { $gte: startDate, $lt: endDate }
            }
          },
          { 
            $group: { 
              _id: '$gameId', 
              ratingCount: { $sum: 1 },
              averageRating: { $avg: '$details.rating' }
            }
          },
          { $sort: { averageRating: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'games',
              localField: '_id',
              foreignField: '_id',
              as: 'gameDetails'
            }
          },
          {
            $project: {
              _id: 1,
              ratingCount: 1,
              averageRating: 1,
              name: { $arrayElemAt: ['$gameDetails.name', 0] },
              genre: { $arrayElemAt: ['$gameDetails.genre', 0] }
            }
          }
        ])
      ]);
      
      // Format top played games for readability
      const formattedTopPlayed = topPlayedGames.map(game => ({
        id: game._id,
        name: game.name || 'Unknown Game',
        playCount: game.count,
        totalPlayTime: game.totalPlayTime,
        genre: game.genre
      }));
      
      // Format top rated games for readability
      const formattedTopRated = topRatedGames.map(game => ({
        id: game._id,
        name: game.name || 'Unknown Game',
        ratingCount: game.ratingCount,
        averageRating: game.averageRating ? parseFloat(game.averageRating.toFixed(1)) : 0,
        genre: game.genre
      }));
      
      return {
        date: startDate,
        formattedDate: startDate.toLocaleDateString(),
        summary: {
          newUsers,
          activeUsers,
          gamesPlayed,
          ratingsSubmitted,
          totalActivities: logs.length,
          errorCount: stats.errorCount
        },
        topPlayedGames: formattedTopPlayed,
        topRatedGames: formattedTopRated,
        categoryBreakdown: stats.categoryBreakdown || [],
        recentLogs: logs.slice(0, 10) // Include 10 most recent logs
      };
    } catch (error) {
      console.error('Error getting daily report:', error);
      throw error;
    }
  }
  
  /**
   * Get top games based on specified criteria and period
   * 
   * @param {Object} options - Query options
   * @param {string} options.criteria - 'plays' or 'ratings'
   * @param {number} options.days - Number of days to look back
   * @param {number} [options.limit=5] - Number of games to return
   * @returns {Promise<Array>} Top games
   */
  static async getTopGames(options = {}) {
    const { criteria = 'plays', days = 7, limit = 5 } = options;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    try {
      if (criteria === 'ratings') {
        // Get top rated games
        const topRatedGames = await SystemLog.aggregate([
          { 
            $match: { 
              category: 'game',
              action: 'rate',
              'details.rating': { $exists: true },
              timestamp: { $gte: startDate, $lt: endDate }
            }
          },
          { 
            $group: { 
              _id: '$gameId', 
              ratingCount: { $sum: 1 },
              averageRating: { $avg: '$details.rating' }
            }
          },
          { $match: { ratingCount: { $gt: 0 } } },
          { $sort: { averageRating: -1, ratingCount: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: 'games',
              localField: '_id',
              foreignField: '_id',
              as: 'gameDetails'
            }
          },
          {
            $project: {
              _id: 1,
              ratingCount: 1,
              averageRating: 1,
              name: { $arrayElemAt: ['$gameDetails.name', 0] },
              description: { $arrayElemAt: ['$gameDetails.description', 0] },
              genre: { $arrayElemAt: ['$gameDetails.genre', 0] },
              imageUrl: { $arrayElemAt: ['$gameDetails.imageUrl', 0] }
            }
          }
        ]);
        
        return topRatedGames.map(game => ({
          id: game._id,
          name: game.name || 'Unknown Game',
          ratingCount: game.ratingCount,
          averageRating: game.averageRating ? parseFloat(game.averageRating.toFixed(1)) : 0,
          genre: game.genre,
          description: game.description,
          imageUrl: game.imageUrl
        }));
      } else {
        // Get top played games
        const topPlayedGames = await SystemLog.aggregate([
          { 
            $match: { 
              category: 'game',
              action: 'play',
              gameId: { $exists: true, $ne: null },
              timestamp: { $gte: startDate, $lt: endDate }
            }
          },
          { 
            $group: { 
              _id: '$gameId', 
              playCount: { $sum: 1 },
              totalPlayTime: { $sum: { $ifNull: ['$details.playTime', 0] } }
            }
          },
          { $sort: { playCount: -1, totalPlayTime: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: 'games',
              localField: '_id',
              foreignField: '_id',
              as: 'gameDetails'
            }
          },
          {
            $project: {
              _id: 1,
              playCount: 1,
              totalPlayTime: 1,
              name: { $arrayElemAt: ['$gameDetails.name', 0] },
              description: { $arrayElemAt: ['$gameDetails.description', 0] },
              genre: { $arrayElemAt: ['$gameDetails.genre', 0] },
              imageUrl: { $arrayElemAt: ['$gameDetails.imageUrl', 0] }
            }
          }
        ]);
        
        return topPlayedGames.map(game => ({
          id: game._id,
          name: game.name || 'Unknown Game',
          playCount: game.playCount,
          totalPlayTime: game.totalPlayTime || 0,
          averagePlayTime: game.playCount > 0 ? (game.totalPlayTime || 0) / game.playCount : 0,
          genre: game.genre,
          description: game.description,
          imageUrl: game.imageUrl
        }));
      }
    } catch (error) {
      console.error(`Error getting top ${criteria} games:`, error);
      throw error;
    }
  }
  
  /**
   * Get significant users based on activity changes
   * 
   * @param {Object} options - Query options
   * @param {number} options.days - Days to analyze
   * @param {number} [options.limit=5] - Number of users to return
   * @returns {Promise<Array>} Users with significant activity changes
   */
  static async getSignificantUsers(options = {}) {
    const { days = 7, limit = 5 } = options;
    
    // Calculate date ranges
    const currentEnd = new Date();
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - days);
    
    const previousEnd = new Date(currentStart);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);
    
    try {
      // Get recent user activities
      const currentPeriodActivities = await SystemLog.aggregate([
        { 
          $match: { 
            userId: { $exists: true, $ne: null },
            timestamp: { $gte: currentStart, $lt: currentEnd }
          }
        },
        { 
          $group: { 
            _id: '$userId', 
            currentCount: { $sum: 1 }
          }
        }
      ]);
      
      // Get previous period activities
      const previousPeriodActivities = await SystemLog.aggregate([
        { 
          $match: { 
            userId: { $exists: true, $ne: null },
            timestamp: { $gte: previousStart, $lt: previousEnd }
          }
        },
        { 
          $group: { 
            _id: '$userId', 
            previousCount: { $sum: 1 }
          }
        }
      ]);
      
      // Create a map of previous activities for easier lookup
      const previousActivitiesMap = previousPeriodActivities.reduce((map, item) => {
        map[item._id.toString()] = item.previousCount;
        return map;
      }, {});
      
      // Calculate activity changes
      const userActivities = currentPeriodActivities.map(user => {
        const userId = user._id.toString();
        const currentCount = user.currentCount;
        const previousCount = previousActivitiesMap[userId] || 0;
        
        return {
          userId: user._id,
          currentCount,
          previousCount,
          change: currentCount - previousCount,
          percentChange: previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 100
        };
      });
      
      // Sort by absolute percentage change to find most significant users
      const sortedUsers = userActivities.sort((a, b) => {
        return Math.abs(b.percentChange) - Math.abs(a.percentChange);
      });
      
      // Get user details
      const topUsers = sortedUsers.slice(0, limit);
      const userDetails = await User.find({
        _id: { $in: topUsers.map(u => u.userId) }
      }, 'name email totalPlayTime registrationDate lastLogin');
      
      // Merge activity data with user details
      return topUsers.map(user => {
        const userDetail = userDetails.find(u => u._id.toString() === user.userId.toString());
        return {
          ...user,
          name: userDetail?.name || 'Unknown User',
          email: userDetail?.email,
          totalPlayTime: userDetail?.totalPlayTime || 0,
          registrationDate: userDetail?.registrationDate,
          lastLogin: userDetail?.lastLogin,
          isPositiveChange: user.change > 0
        };
      });
    } catch (error) {
      console.error('Error getting significant users:', error);
      throw error;
    }
  }
  
  /**
   * Get personalized game recommendations for a user
   * 
   * @param {string} userId - User ID
   * @param {number} [limit=5] - Number of recommendations
   * @returns {Promise<Object>} Recommendations with reasoning
   */
  static async getGameRecommendations(userId, limit = 5) {
    try {
      // Find the user
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Get user's play history
      const playHistory = await SystemLog.aggregate([
        {
          $match: {
            userId: user._id,
            category: 'game',
            action: 'play',
            gameId: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$gameId',
            playCount: { $sum: 1 },
            totalPlayTime: { $sum: { $ifNull: ['$details.playTime', 0] } }
          }
        },
        { $sort: { playCount: -1 } }
      ]);
      
      // If user has played games, use those for recommendations
      if (playHistory.length > 0) {
        // Get details of played games to extract genres
        const playedGameIds = playHistory.map(history => history._id);
        const playedGames = await Game.find({ _id: { $in: playedGameIds } });
        
        // Extract all genres from played games and count them
        const genreCounts = {};
        for (const game of playedGames) {
          const genre = game.genre;
          if (genre) {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          }
        }
        
        // Find top genres
        const topGenres = Object.entries(genreCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(entry => entry[0]);
        
        // Find recommendations based on genres
        const recommendations = await Game.find({
          _id: { $nin: playedGameIds }, // Exclude already played games
          genre: { $in: topGenres }
        })
        .sort({ rating: -1 })
        .limit(limit);
        
        return {
          userId,
          userName: user.name,
          isReturningUser: true,
          playedGames: playedGames.slice(0, 5).map(game => ({
            id: game._id,
            name: game.name,
            genre: game.genre,
            playCount: playHistory.find(h => h._id.toString() === game._id.toString())?.playCount || 0
          })),
          preferredGenres: topGenres,
          recommendations: recommendations.map(game => ({
            id: game._id,
            name: game.name,
            description: game.description,
            genre: game.genre,
            rating: game.rating || 0,
            imageUrl: game.imageUrl,
            recommendationReason: `Based on your interest in ${game.genre} games`
          }))
        };
      } else {
        // New user with no play history, get trending games
        return this.getNewUserRecommendations(userId, limit);
      }
    } catch (error) {
      console.error('Error getting game recommendations for user:', error);
      throw error;
    }
  }
  
  /**
   * Get recommendations for new users based on trending games
   * 
   * @param {string} userId - User ID (optional)
   * @param {number} [limit=5] - Number of recommendations
   * @returns {Promise<Object>} Trending game recommendations
   */
  static async getNewUserRecommendations(userId = null, limit = 5) {
    try {
      let user = null;
      if (userId) {
        user = await User.findById(userId);
      }
      
      // Get trending games (most played in last 7 days)
      const trendingGames = await this.getTopGames({
        criteria: 'plays',
        days: 7,
        limit
      });
      
      // Also get top rated games
      const topRatedGames = await this.getTopGames({
        criteria: 'ratings',
        days: 30, // Look at a longer period for ratings
        limit
      });
      
      // Get recent releases
      const recentReleases = await Game.find({})
        .sort({ createdAt: -1 })
        .limit(limit);
      
      return {
        userId,
        userName: user?.name,
        isNewUser: true,
        trending: trendingGames.map(game => ({
          id: game.id,
          name: game.name,
          description: game.description,
          genre: game.genre,
          playCount: game.playCount,
          imageUrl: game.imageUrl,
          recommendationReason: 'Popular game on our platform'
        })),
        topRated: topRatedGames.map(game => ({
          id: game.id,
          name: game.name,
          description: game.description,
          genre: game.genre,
          rating: game.averageRating,
          ratingCount: game.ratingCount,
          imageUrl: game.imageUrl,
          recommendationReason: 'Highly rated by our users'
        })),
        recentReleases: recentReleases.map(game => ({
          id: game._id,
          name: game.name,
          description: game.description,
          genre: game.genre,
          rating: game.rating || 0,
          imageUrl: game.imageUrl,
          releaseDate: game.createdAt,
          recommendationReason: 'Recently added to our platform'
        }))
      };
    } catch (error) {
      console.error('Error getting recommendations for new user:', error);
      throw error;
    }
  }
  
  /**
   * Get rare games based on lowest player engagement
   * @param {Object} options - Query options
   * @param {number} [limit=5] - Number of games to return
   * @returns {Promise<Array>} Rare games list
   */
  static async getRareGames({ limit = 5 } = {}) {
    try {
      // Aggregate play counts for games
      const playCounts = await SystemLog.aggregate([
        { $match: { category: 'game', action: 'play', gameId: { $exists: true, $ne: null } } },
        { $group: { _id: '$gameId', playCount: { $sum: 1 } } }
      ]);
      const countMap = playCounts.reduce((m, item) => { m[item._id.toString()] = item.playCount; return m; }, {});
      // Fetch all games with creation date
      const games = await Game.find().select('name description genre rating imageUrl createdAt').lean();
      // Build list with playCount
      const gamesWithCounts = games.map(game => ({
        id: game._id,
        name: game.name,
        description: game.description,
        genre: game.genre,
        playCount: countMap[game._id.toString()] || 0,
        rating: game.rating || 0,
        imageUrl: game.imageUrl,
        createdAt: game.createdAt
      }));
      // Separate games never played
      const unplayed = gamesWithCounts.filter(g => g.playCount === 0);
      if (unplayed.length > 0) {
        // Sort by oldest release (rarer legacy titles)
        unplayed.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        return unplayed.slice(0, limit);
      }
      // Fallback: games with lowest playCount
      gamesWithCounts.sort((a, b) => a.playCount - b.playCount || a.rating - b.rating);
      return gamesWithCounts.slice(0, limit);
    } catch (error) {
      console.error('Error getting rare games:', error);
      throw error;
    }
  }

  /**
   * Get random users with their statistics for the last week
   * @param {Object} options - Query options
   * @param {number} [limit=3] - Number of users to return
   * @param {number} [days=7] - Number of days to look back
   * @returns {Promise<Array>} Random users stats
   */
  static async getRandomUsers({ limit = 3, days = 7 } = {}) {
    try {
      console.log('Accessing random users analytics');
      await LoggerService.info('ai', 'access_random_users', 'Accessing random users analytics', { limit, days }, null);
      // Sample random users
      const randomUsers = await User.aggregate([{ $sample: { size: limit } }]);
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      // Gather stats per user
      const stats = await Promise.all(randomUsers.map(async (user) => {
        // total hours played in period
        const playAgg = await SystemLog.aggregate([
          { $match: { userId: user._id, category: 'game', action: 'play', timestamp: { $gte: sinceDate } } },
          { $group: { _id: null, totalTime: { $sum: { $ifNull: ['$details.playTime', 0] } }, sessions: { $sum: 1 } } }
        ]);
        const { totalTime = 0, sessions = 0 } = playAgg[0] || {};
        return {
          id: user._id,
          name: user.name,
          totalHours: parseFloat((totalTime / 60).toFixed(1)), // minutes to hours
          gamesPlayed: sessions,
          isActive: sessions > 0
        };
      }));
      return stats;
    } catch (error) {
      console.error('Error getting random users:', error);
      throw error;
    }
  }

  /**
   * Get a full platform overview combining multiple analytics
   * @returns {Promise<Object>} Platform overview data
   */
  static async getPlatformOverview() {
    try {
      console.log('Accessing platform overview analytics');
      await LoggerService.info('ai', 'access_platform_overview', 'Accessing platform overview analytics', {}, null);

      // Concurrently fetch key analytics
      const [dailyReport, topPlays, topRatings, rareList, significantUsers, totalUsers, totalGames] = await Promise.all([
        this.getDailyReport(),
        this.getTopGames({ criteria: 'plays', days: 7, limit: 5 }),
        this.getTopGames({ criteria: 'ratings', days: 7, limit: 5 }),
        this.getRareGames({ limit: 5 }),
        this.getSignificantUsers({ days: 7, limit: 5 }),
        User.countDocuments(),
        Game.countDocuments()
      ]);

      console.log('Accessing members analytics');
      await LoggerService.info('ai', 'access_members', 'Accessing members analytics', {}, null);

      return {
        totalUsers,
        totalGames,
        dailyReport,
        topGamesByPlays: topPlays,
        topGamesByRatings: topRatings,
        rareGames: rareList,
        significantUsers
      };
    } catch (error) {
      console.error('Error getting platform overview:', error);
      throw error;
    }
  }

  /**
   * Search the database for any kind of information
   * This is a general-purpose search function for the AI to query different collections
   * 
   * @param {Object} options - Search options
   * @param {string} options.collection - Collection to search in
   * @param {Object} options.query - MongoDB query object
   * @param {Object} [options.sort] - Sort criteria
   * @param {number} [options.limit=10] - Max results
   * @returns {Promise<Array>} Search results
   */
  static async searchDatabase(options) {
    const { 
      collection, 
      query = {}, 
      sort = { createdAt: -1 },
      limit = 10 
    } = options;
    
    if (!collection) {
      throw new Error('Collection name is required for database search');
    }
    
    try {
      // Get the collection
      const dbCollection = await mongodbService.getCollection(collection);
      
      // Perform the query
      const results = await dbCollection
        .find(query)
        .sort(sort)
        .limit(limit)
        .toArray();
      
      return results;
    } catch (error) {
      console.error(`Error searching ${collection}:`, error);
      throw error;
    }
  }
  
  /**
   * Utility function to parse date expressions into actual dates
   * 
   * @param {string} expression - Date expression (e.g., "today", "yesterday", "3 days ago")
   * @returns {Date} Parsed date
   */
  static parseDateExpression(expression) {
    if (!expression) return new Date();
    
    const now = new Date();
    expression = expression.toLowerCase().trim();
    
    if (expression === 'today') {
      return new Date(now.setHours(0, 0, 0, 0));
    }
    
    if (expression === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      return yesterday;
    }
    
    // Handle "X days ago"
    const daysAgoMatch = expression.match(/(\d+)\s+days?\s+ago/);
    if (daysAgoMatch) {
      const daysAgo = parseInt(daysAgoMatch[1], 10);
      const pastDate = new Date(now);
      pastDate.setDate(pastDate.getDate() - daysAgo);
      pastDate.setHours(0, 0, 0, 0);
      return pastDate;
    }
    
    // Handle "last week", "last month"
    if (expression === 'last week') {
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      lastWeek.setHours(0, 0, 0, 0);
      return lastWeek;
    }
    
    if (expression === 'last month') {
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      lastMonth.setHours(0, 0, 0, 0);
      return lastMonth;
    }
    
    // Try parsing as a direct date
    try {
      const date = new Date(expression);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      // Invalid date string, continue to fallback
    }
    
    // Fallback to today
    return new Date(now.setHours(0, 0, 0, 0));
  }
  
  /**
   * Determine if a user is new based on registration date and activity
   * 
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Whether the user is considered new
   */
  static async isNewUser(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return true; // Default to treating as new user
      }
      
      // Consider users registered in the last 7 days as new
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      if (user.createdAt > oneWeekAgo) {
        return true;
      }
      
      // Check if the user has played any games
      const playCount = await SystemLog.countDocuments({
        userId: user._id,
        category: 'game',
        action: 'play'
      });
      
      return playCount < 3; // Consider users with fewer than 3 plays as new
    } catch (error) {
      console.error('Error determining if user is new:', error);
      return false;
    }
  }

  /**
   * Get the most recently added game
   * @returns {Promise<Object>} Most recently added game data
   */
  static async getMostRecentGame() {
    try {
      console.log('Accessing most recent game analytics');
      await LoggerService.info('ai', 'access_most_recent_game', 'Accessing most recent game analytics', {}, null);
      const game = await Game.findOne().sort({ createdAt: -1 }).lean();
      if (!game) return null;
      return {
        id: game._id,
        name: game.name,
        genre: game.genre,
        description: game.description,
        rating: game.rating || 0,
        releaseDate: game.createdAt
      };
    } catch (error) {
      console.error('Error getting most recent game:', error);
      throw error;
    }
  }

  /**
   * Get the most played game overall
   * @returns {Promise<Object>} Most played game data
   */
  static async getMostPlayedGame() {
    try {
      console.log('Accessing most played game analytics');
      await LoggerService.info('ai', 'access_most_played_game', 'Accessing most played game analytics', {}, null);
      const agg = await SystemLog.aggregate([
        { $match: { category: 'game', action: 'play', gameId: { $exists: true, $ne: null } } },
        { $group: { _id: '$gameId', playCount: { $sum: 1 } } },
        { $sort: { playCount: -1 } },
        { $limit: 1 }
      ]);
      if (!agg || !agg[0]) return null;
      const gameId = agg[0]._id;
      const playCount = agg[0].playCount;
      const game = await Game.findById(gameId).lean();
      if (!game) return null;
      return {
        id: game._id,
        name: game.name,
        genre: game.genre,
        description: game.description,
        playCount,
        rating: game.rating || 0
      };
    } catch (error) {
      console.error('Error getting most played game:', error);
      throw error;
    }
  }

  /**
   * Get the most recent game releases
   * @param {Object} options - Query options
   * @param {number} [limit=5] - Number of games to return
   * @returns {Promise<Array>} Recent releases
   */
  static async getRecentReleases({ limit = 5 } = {}) {
    try {
      console.log('Accessing recent game releases analytics');
      await LoggerService.info('ai', 'access_recent_releases', 'Accessing recent game releases analytics', { limit }, null);
      const games = await Game.find().sort({ createdAt: -1 }).limit(limit).lean();
      return games.map(game => ({
        id: game._id,
        name: game.name,
        description: game.description || 'No description available',
        genre: game.genre,
        rating: game.rating || 0,
        releaseDate: game.createdAt
      }));
    } catch (error) {
      console.error('Error getting recent releases:', error);
      throw error;
    }
  }

  /**
   * Describe database schema by listing collections and sample fields
   * @returns {Promise<Object>} Database schema description
   */
  static async getDatabaseSchema() {
    try {
      // List collection names
      const collections = await mongoose.connection.db.listCollections().toArray();
      const schema = {};
      for (const coll of collections) {
        const name = coll.name;
        // Sample one document to infer fields
        const doc = await this._getCollectionSample(name);
        schema[name] = doc ? Object.keys(doc) : [];
      }
      return schema;
    } catch (error) {
      console.error('Error describing database schema:', error);
      throw error;
    }
  }

  // Internal helper to get one document
  static async _getCollectionSample(collectionName) {
    try {
      const db = mongoose.connection.db;
      const doc = await db.collection(collectionName).findOne();
      return doc;
    } catch (e) {
      return null;
    }
  }

  /**
   * Get random games from the database
   * @param {Object} options - Query options
   * @param {number} [limit=5] - Number of games to return
   * @returns {Promise<Array>} Random games list
   */
  static async getRandomGames({ limit = 5 } = {}) {
    try {
      console.log('Accessing random games');
      await LoggerService.info('ai', 'access_random_games', 'Accessing random games', { limit }, null);
      
      // Use MongoDB's $sample operator to get random documents
      const randomGames = await Game.aggregate([
        { $sample: { size: limit } }
      ]);
      
      return randomGames.map(game => {
        // Safely handle the genres field which might be undefined or not an array
        const genres = Array.isArray(game.genres) ? game.genres : 
                     (game.genre ? [game.genre] : []);
        
        return {
          id: game._id,
          name: game.name,
          description: game.description || 'No description available',
          genre: genres,
          rating: game.rating || 0,
          imageUrl: game.photo || game.imageUrl,
          recommendationReason: 'Random discovery'
        };
      });
    } catch (error) {
      console.error('Error getting random games:', error);
      throw error;
    }
  }
}

module.exports = AIAgentService;