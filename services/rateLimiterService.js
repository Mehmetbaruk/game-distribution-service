/**
 * Rate Limiter Service
 * Prevents API rate limit errors by enforcing minimum time between requests
 */

class RateLimiterService {
  constructor() {
    this.lastCallTime = {};  // tracks the last call time for each endpoint
    this.inProgress = {};    // tracks if a request is in progress
    this.queue = {};         // queues requests when rate limited
  }

  /**
   * Execute a function with rate limiting
   * 
   * @param {string} endpoint - The endpoint identifier (e.g., 'text', 'image')
   * @param {Function} fn - The function to execute
   * @param {number} minInterval - Minimum interval between requests in ms
   * @returns {Promise<any>} The result of the function
   */
  async execute(endpoint, fn, minInterval = 5000) {
    if (!this.lastCallTime[endpoint]) {
      this.lastCallTime[endpoint] = 0;
      this.queue[endpoint] = [];
      this.inProgress[endpoint] = false;
    }
    
    // Create a promise that will resolve when it's our turn to make the request
    return new Promise((resolve, reject) => {
      // Add this request to the queue
      this.queue[endpoint].push({ fn, resolve, reject });
      this.processQueue(endpoint, minInterval);
    });
  }

  /**
   * Process queued requests
   * 
   * @param {string} endpoint - The endpoint identifier
   * @param {number} minInterval - Minimum interval between requests in ms
   */
  async processQueue(endpoint, minInterval) {
    // If already processing the queue, return
    if (this.inProgress[endpoint]) return;
    
    this.inProgress[endpoint] = true;
    
    try {
      while (this.queue[endpoint].length > 0) {
        const now = Date.now();
        const timeElapsed = now - this.lastCallTime[endpoint];
        
        // Wait if we need to respect the rate limit
        if (timeElapsed < minInterval) {
          const delay = minInterval - timeElapsed;
          await new Promise(r => setTimeout(r, delay));
        }
        
        // Execute the first request in the queue
        const { fn, resolve, reject } = this.queue[endpoint].shift();
        
        try {
          // Execute the function
          const result = await fn();
          this.lastCallTime[endpoint] = Date.now();
          resolve(result);
        } catch (error) {
          // If we get a rate limit error, wait a bit longer next time
          if (error.response && error.response.status === 429) {
            this.lastCallTime[endpoint] = Date.now();
            // Increase the wait time if we hit rate limiting
            await new Promise(r => setTimeout(r, minInterval * 2));
          }
          reject(error);
        }
      }
    } finally {
      this.inProgress[endpoint] = false;
    }
  }
}

// Create a singleton instance
const rateLimiter = new RateLimiterService();

module.exports = rateLimiter;