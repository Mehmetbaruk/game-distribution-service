/**
 * AI Assistant Client Module
 * Enables both admins and regular users to query the AI Assistant capabilities
 */

const AIAssistantClient = (function() {
  // Private variables
  const apiEndpoint = '/admin/api/ai-query';  

  /**
   * Send an AI query to the server
   * @param {Object} params - Query parameters
   * @param {string} params.queryType - Type of query to perform 
   * @param {number} [params.limit] - Optional limit for results
   * @param {Object} [params.additionalParams] - Optional additional parameters
   * @returns {Promise<Object>} Query results
   */
  async function sendQuery(params = {}) {
    try {
      const { queryType, limit = 5, ...additionalParams } = params;
      
      if (!queryType) {
        throw new Error('Query type is required');
      }
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          queryType,
          limit,
          ...additionalParams
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get AI response');
      }
      
      return await response.json();
    } catch (error) {
      console.error('AI Assistant query failed:', error);
      throw error;
    }
  }
  
  /**
   * Get random games from the platform
   * @param {number} [limit=5] - Number of games to return
   * @returns {Promise<Object>} Random games
   */
  async function getRandomGames(limit = 5) {
    return sendQuery({ queryType: 'randomGames', limit });
  }
  
  /**
   * Get rare/underplayed games from the platform
   * @param {number} [limit=5] - Number of games to return
   * @returns {Promise<Object>} Rare games
   */
  async function getRareGames(limit = 5) {
    return sendQuery({ queryType: 'rareGames', limit });
  }
  
  /**
   * Get top games by plays or ratings
   * @param {Object} options - Options
   * @param {string} [options.criteria='plays'] - 'plays' or 'ratings'
   * @param {number} [options.days=7] - Days to look back
   * @param {number} [options.limit=5] - Number of games to return
   * @returns {Promise<Object>} Top games
   */
  async function getTopGames(options = {}) {
    const { criteria = 'plays', days = 7, limit = 5 } = options;
    return sendQuery({ 
      queryType: 'topGames', 
      criteria, 
      days, 
      limit
    });
  }
  
  /**
   * Get the most played game on the platform
   * @returns {Promise<Object>} Most played game
   */
  async function getMostPlayedGame() {
    return sendQuery({ queryType: 'mostPlayedGame' });
  }
  
  /**
   * Get personalized game recommendations for the current user
   * @param {number} [limit=5] - Number of recommendations to return
   * @returns {Promise<Object>} Game recommendations 
   */
  async function getGameRecommendations(limit = 5) {
    return sendQuery({ queryType: 'gameRecommendations', limit });
  }
  
  /**
   * Admin-only: Get random users with their statistics
   * Note: This will return an error for non-admin users
   * @param {number} [limit=3] - Number of users to return
   * @returns {Promise<Object>} Random users with stats
   */
  async function getRandomUsers(limit = 3) {
    return sendQuery({ queryType: 'randomUsers', limit });
  }
  
  /**
   * Admin-only: Get full platform overview
   * Note: This will return an error for non-admin users
   * @returns {Promise<Object>} Platform overview
   */
  async function getPlatformOverview() {
    return sendQuery({ queryType: 'platformOverview' });
  }

  // Public API
  return {
    sendQuery,
    getRandomGames,
    getRareGames,
    getTopGames,
    getMostPlayedGame,
    getGameRecommendations,
    getRandomUsers,
    getPlatformOverview
  };
})();

// Export for use in both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIAssistantClient;
} else if (typeof window !== 'undefined') {
  window.AIAssistantClient = AIAssistantClient;
}