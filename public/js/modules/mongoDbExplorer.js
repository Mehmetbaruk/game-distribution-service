/**
 * MongoDB Explorer functionality for Game Distribution Service
 * Handles MongoDB collection viewing and data exploration
 */

import { escapeHtml } from './utils.js';

// State management for MongoDB explorer
const explorerState = {
  currentCollection: null,
  loadCollectionsAttempts: 0,
  loadCollectionDataAttempts: 0,
  MAX_RETRY_ATTEMPTS: 3,
  collectionsRequestController: null,

  // Collections pagination state
  collectionsState: {
    page: 1,
    limit: 10, // Show 10 collections per page
    totalPages: 1,
    total: 0
  }
};

/**
 * Initialize MongoDB Data Explorer
 */
export function initializeMongoDBExplorer() {
  const databaseTab = document.getElementById('database-tab');
  if (!databaseTab) {
    console.log("Database tab not found");
    return;
  }
  
  console.log("Database explorer initialized");
  
  // Make sure tab click event is properly registered
  databaseTab.addEventListener('click', function() {
    console.log("Database tab clicked - initializing...");
    // Get required elements
    const collectionList = document.querySelector('.collection-list');
    
    // Reset state when the tab is clicked
    if (collectionList && collectionList.children.length <= 1 && 
        collectionList.textContent.includes('Loading collections...')) {
      console.log("Loading collections on tab click");
      // First check MongoDB connection status
      checkMongoDBConnection();
      // Then load collections
      loadCollections(1, 10);
    }
  });
  
  // Load collections automatically when page loads
  setTimeout(() => {
    const collectionList = document.querySelector('.collection-list');
    if (collectionList && collectionList.children.length <= 1 && 
        collectionList.textContent.includes('Loading collections...')) {
      console.log("Auto-loading collections on page load");
      loadCollections(1, 10);
    }
  }, 500);
  
  // Set up button event handlers
  setupEventHandlers();
}

/**
 * Set up event handlers for MongoDB Explorer buttons
 */
function setupEventHandlers() {
  const refreshCollectionsBtn = document.querySelector('.refresh-collections-btn');
  const checkMongoDBBtn = document.querySelector('.check-mongodb-btn');
  const refreshDataBtn = document.querySelector('.refresh-data-btn');
  
  // Event listener for the Check Connection button
  if (checkMongoDBBtn) {
    checkMongoDBBtn.addEventListener('click', checkMongoDBConnection);
  }
  
  // Refresh collections when refresh button is clicked
  if (refreshCollectionsBtn) {
    refreshCollectionsBtn.addEventListener('click', () => {
      explorerState.loadCollectionsAttempts = 0;
      loadCollections(1, explorerState.collectionsState.limit, true); // Force refresh on page 1
    });
  }
  
  // Refresh data when refresh button is clicked
  if (refreshDataBtn) {
    refreshDataBtn.addEventListener('click', () => {
      if (explorerState.currentCollection) {
        explorerState.loadCollectionDataAttempts = 0;
        loadCollectionData(explorerState.currentCollection);
      }
    });
  }
}

/**
 * Show MongoDB debug panel with connection status
 */
function showMongoDBDebugPanel() {
  const mongodbDebugPanel = document.getElementById('mongodb-debug-panel');
  if (mongodbDebugPanel) {
    mongodbDebugPanel.style.display = 'block';
  }
}

/**
 * Update debug panel content
 * @param {string} content - HTML content for the debug panel
 * @param {boolean} isError - Whether the content represents an error
 */
function updateDebugPanel(content, isError = false) {
  const mongodbDebugContent = document.getElementById('mongodb-debug-content');
  const mongodbDebugPanel = document.getElementById('mongodb-debug-panel');
  
  if (mongodbDebugContent) {
    mongodbDebugContent.innerHTML = content;
  }
  
  if (mongodbDebugPanel) {
    mongodbDebugPanel.className = isError 
      ? 'alert alert-danger mb-3' 
      : 'alert alert-info mb-3';
  }
}

/**
 * Check MongoDB connection
 */
function checkMongoDBConnection() {
  showMongoDBDebugPanel();
  updateDebugPanel(`
    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
    Checking MongoDB connection...
  `);
  
  // Use the debug endpoint to check connection
  fetch('/admin/api/debug-mongodb', {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to check MongoDB connection');
      return response.json();
    })
    .then(data => {
      if (data.success) {
        handleConnectionSuccess(data);
      } else {
        throw new Error(data.error || 'Failed to get connection info');
      }
    })
    .catch(error => {
      handleConnectionError(error);
    });
}

/**
 * Handle successful connection check response
 * @param {Object} data - Connection data from server
 */
function handleConnectionSuccess(data) {
  const connInfo = data.connection;
  const isConnected = connInfo.readyState === 1;
  
  // Create a detailed status report
  let debugContent = `
    <div class="mb-2">
      <strong>Connection Status:</strong> 
      <span class="badge bg-${isConnected ? 'success' : 'danger'}">
        ${connInfo.status}
      </span>
    </div>
    
    <div class="mb-2">
      <strong>Connection String:</strong> ${connInfo.uri}
    </div>
    
    <div class="mb-2">
      <strong>Mongoose Version:</strong> ${connInfo.mongooseVersion}
    </div>
  `;
  
  // Add ping test result if available
  if (connInfo.dbTest) {
    debugContent += `
      <div class="mb-2">
        <strong>Ping Test:</strong> 
        <span class="badge bg-${connInfo.dbTest === 'successful' ? 'success' : 'danger'}">
          ${connInfo.dbTest}
        </span>
      </div>
    `;
  }
  
  // Add database list if available
  if (connInfo.databases && connInfo.databases.length > 0) {
    debugContent += `
      <div class="mb-2">
        <strong>Available Databases:</strong> 
        <ul class="mb-0 ps-3">
          ${connInfo.databases.map(db => `<li>${db}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  // Add action buttons based on connection status
  debugContent += `
    <div class="mt-3">
      ${isConnected ? `
        <button class="btn btn-sm btn-success load-collections-btn">
          <i class="fas fa-table me-1"></i>Load Collections
        </button>
      ` : `
        <button class="btn btn-sm btn-warning retry-connection-btn">
          <i class="fas fa-sync-alt me-1"></i>Retry Connection
        </button>
      `}
      
      <button class="btn btn-sm btn-secondary ms-2 hide-debug-btn">
        <i class="fas fa-times me-1"></i>Hide Details
      </button>
    </div>
  `;
  
  updateDebugPanel(debugContent, !isConnected);
  
  // Add event listeners to the new buttons
  setTimeout(() => {
    const loadCollectionsBtn = document.querySelector('.load-collections-btn');
    if (loadCollectionsBtn) {
      loadCollectionsBtn.addEventListener('click', () => {
        loadCollections(1, explorerState.collectionsState.limit);
        document.getElementById('mongodb-debug-panel').style.display = 'none';
      });
    }
    
    const retryConnectionBtn = document.querySelector('.retry-connection-btn');
    if (retryConnectionBtn) {
      retryConnectionBtn.addEventListener('click', tryReconnectMongoDB);
    }
    
    const hideDebugBtn = document.querySelector('.hide-debug-btn');
    if (hideDebugBtn) {
      hideDebugBtn.addEventListener('click', () => {
        document.getElementById('mongodb-debug-panel').style.display = 'none';
      });
    }
  }, 100);
  
  // If connected, try to load collections automatically
  if (isConnected) {
    loadCollections(1, explorerState.collectionsState.limit);
  }
}

/**
 * Handle connection check error
 * @param {Error} error - The error that occurred
 */
function handleConnectionError(error) {
  console.error('MongoDB connection check error:', error);
  
  const errorContent = `
    <div class="text-danger mb-2">
      <i class="fas fa-exclamation-triangle me-2"></i>
      <strong>Connection Error:</strong> ${error.message}
    </div>
    
    <div class="mb-3">
      <p class="mb-2">Possible causes:</p>
      <ul class="ps-3 mb-0">
        <li>MongoDB server is not running</li>
        <li>Connection string is invalid</li>
        <li>Network connectivity issues</li>
        <li>Server-side error in the application</li>
      </ul>
    </div>
    
    <div>
      <button class="btn btn-sm btn-warning retry-connection-btn">
        <i class="fas fa-sync-alt me-1"></i>Retry Connection
      </button>
      
      <button class="btn btn-sm btn-info ms-2 debug-collections-btn">
        <i class="fas fa-stethoscope me-1"></i>Debug Collections
      </button>
      
      <button class="btn btn-sm btn-secondary ms-2 hide-debug-btn">
        <i class="fas fa-times me-1"></i>Hide Details
      </button>
    </div>
  `;
  
  updateDebugPanel(errorContent, true);
  
  // Add event listeners to the new buttons
  setTimeout(() => {
    const retryConnectionBtn = document.querySelector('.retry-connection-btn');
    if (retryConnectionBtn) {
      retryConnectionBtn.addEventListener('click', checkMongoDBConnection);
    }
    
    const debugCollectionsBtn = document.querySelector('.debug-collections-btn');
    if (debugCollectionsBtn) {
      debugCollectionsBtn.addEventListener('click', debugCollections);
    }
    
    const hideDebugBtn = document.querySelector('.hide-debug-btn');
    if (hideDebugBtn) {
      hideDebugBtn.addEventListener('click', () => {
        document.getElementById('mongodb-debug-panel').style.display = 'none';
      });
    }
  }, 100);
}

/**
 * Try to explicitly reconnect MongoDB
 */
function tryReconnectMongoDB() {
  updateDebugPanel(`
    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
    Attempting to reconnect to MongoDB...
  `);
  
  // Call the MongoDB status endpoint which tries to reconnect
  fetch('/admin/api/mongodb-status', {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to reconnect to MongoDB');
      return response.json();
    })
    .then(data => {
      if (data.success && data.connected) {
        handleReconnectionSuccess();
      } else {
        // Still not connected
        handleReconnectionFailure(data.error || 'Could not establish connection to MongoDB');
      }
    })
    .catch(error => {
      console.error('MongoDB reconnection error:', error);
      handleReconnectionFailure(error.message);
    });
}

/**
 * Handle successful MongoDB reconnection
 */
function handleReconnectionSuccess() {
  updateDebugPanel(`
    <div class="text-success mb-3">
      <i class="fas fa-check-circle me-2"></i>
      <strong>Successfully reconnected to MongoDB!</strong>
    </div>
    
    <div>
      <button class="btn btn-sm btn-success load-collections-btn">
        <i class="fas fa-table me-1"></i>Load Collections
      </button>
      
      <button class="btn btn-sm btn-secondary ms-2 hide-debug-btn">
        <i class="fas fa-times me-1"></i>Hide Details
      </button>
    </div>
  `);
  
  // Add event listeners
  setTimeout(() => {
    const loadCollectionsBtn = document.querySelector('.load-collections-btn');
    if (loadCollectionsBtn) {
      loadCollectionsBtn.addEventListener('click', () => {
        loadCollections(1, explorerState.collectionsState.limit);
        document.getElementById('mongodb-debug-panel').style.display = 'none';
      });
    }
    
    const hideDebugBtn = document.querySelector('.hide-debug-btn');
    if (hideDebugBtn) {
      hideDebugBtn.addEventListener('click', () => {
        document.getElementById('mongodb-debug-panel').style.display = 'none';
      });
    }
  }, 100);
}

/**
 * Handle failed MongoDB reconnection
 * @param {string} errorMessage - Error message to display
 */
function handleReconnectionFailure(errorMessage) {
  updateDebugPanel(`
    <div class="text-danger mb-2">
      <i class="fas fa-exclamation-triangle me-2"></i>
      <strong>Reconnection Failed:</strong> ${errorMessage}
    </div>
    
    <div class="mb-3">
      <p class="mb-0">Please check your MongoDB connection settings and ensure the server is running.</p>
    </div>
    
    <div>
      <button class="btn btn-sm btn-warning retry-connection-btn">
        <i class="fas fa-sync-alt me-1"></i>Try Again
      </button>
      
      <button class="btn btn-sm btn-secondary ms-2 hide-debug-btn">
        <i class="fas fa-times me-1"></i>Hide Details
      </button>
    </div>
  `, true);
  
  // Add event listeners
  setTimeout(() => {
    const retryConnectionBtn = document.querySelector('.retry-connection-btn');
    if (retryConnectionBtn) {
      retryConnectionBtn.addEventListener('click', tryReconnectMongoDB);
    }
    
    const hideDebugBtn = document.querySelector('.hide-debug-btn');
    if (hideDebugBtn) {
      hideDebugBtn.addEventListener('click', () => {
        document.getElementById('mongodb-debug-panel').style.display = 'none';
      });
    }
  }, 100);
}

/**
 * Show connection error in the collection list
 */
function showConnectionError() {
  const collectionList = document.querySelector('.collection-list');
  const collectionDataContainer = document.querySelector('.collection-data-container');
  
  if (collectionList) {
    collectionList.innerHTML = `
      <li class="list-group-item text-center">
        <div class="alert alert-danger mb-0 py-2">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>MongoDB Connection Error</strong>
          <p class="small mb-1 mt-2">Could not establish connection to MongoDB.</p>
          <button class="btn btn-sm btn-danger check-connection-btn mt-2">
            <i class="fas fa-sync-alt me-1"></i>Check Connection
          </button>
        </div>
      </li>
    `;
    
    const checkConnectionBtn = document.querySelector('.check-connection-btn');
    if (checkConnectionBtn) {
      checkConnectionBtn.addEventListener('click', checkMongoDBConnection);
    }
  }
  
  // Clear the data container
  if (collectionDataContainer) {
    collectionDataContainer.innerHTML = `
      <div class="text-center py-5">
        <div class="alert alert-danger">
          <i class="fas fa-database me-2"></i>
          <strong>Database Connection Error</strong>
          <p>Cannot connect to the MongoDB database.</p>
          <p class="small mb-0">Please check your database connection and try again.</p>
        </div>
      </div>
    `;
  }
}

/**
 * Create collection pagination controls
 * @param {number} page - Current page
 * @param {number} totalPages - Total number of pages
 * @param {number} total - Total number of collections
 * @returns {string} - HTML for pagination controls
 */
function createCollectionPagination(page, totalPages, total) {
  if (totalPages <= 1) return ''; // No pagination needed
  
  let paginationHtml = `
    <nav aria-label="Collections pagination" class="collections-pagination mb-2">
      <ul class="pagination pagination-sm justify-content-center mb-0">
  `;
  
  // First page button
  paginationHtml += `
    <li class="page-item ${page === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="1">First</a>
    </li>
  `;
  
  // Previous page button
  paginationHtml += `
    <li class="page-item ${page === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${page - 1}">Prev</a>
    </li>
  `;
  
  // Page indicator
  paginationHtml += `
    <li class="page-item active">
      <span class="page-link">Page ${page} of ${totalPages}</span>
    </li>
  `;
  
  // Next page button
  paginationHtml += `
    <li class="page-item ${page === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${page + 1}">Next</a>
    </li>
  `;
  
  // Last page button
  paginationHtml += `
    <li class="page-item ${page === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${totalPages}">Last</a>
    </li>
  `;
  
  paginationHtml += `
      </ul>
    </nav>
    <div class="text-center text-muted small mb-2">
      Showing ${explorerState.collectionsState.limit} of ${total} collections
    </div>
  `;
  
  return paginationHtml;
}

/**
 * Load MongoDB collections with pagination
 * @param {number} page - Page number to load
 * @param {number} limit - Number of collections per page
 * @param {boolean} forceRefresh - Whether to force a refresh
 */
function loadCollections(page = 1, limit = 10, forceRefresh = false) {
  const collectionList = document.querySelector('.collection-list');
  if (!collectionList) {
    console.error("Collection list element not found!");
    return;
  }
  
  // Cancel any previous request
  if (explorerState.collectionsRequestController) {
    console.log("Aborting previous collections request.");
    explorerState.collectionsRequestController.abort();
  }
  
  // Create a new AbortController for this request
  explorerState.collectionsRequestController = new AbortController();
  const signal = explorerState.collectionsRequestController.signal;
  
  // Show loading state
  console.log("Setting loading state for collections list.");
  collectionList.innerHTML = `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div class="w-100 text-center">
        <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
        <div>Loading collections...</div>
      </div>
    </li>
  `;
  
  console.log(`Fetching MongoDB collections (page: ${page}, limit: ${limit}, refresh: ${forceRefresh})... (attempt: ${explorerState.loadCollectionsAttempts + 1})`);
  
  // Add a random cache-busting parameter to avoid caching issues
  const cacheBuster = `_t=${Date.now()}`;
  const apiUrl = `/admin/api/collections?page=${page}&limit=${limit}&refresh=${forceRefresh}&${cacheBuster}`;
  console.log("Fetching URL:", apiUrl);
  
  // Set a timeout to abort the request if it takes too long
  const timeoutId = setTimeout(() => {
    if (explorerState.collectionsRequestController) {
      console.log('Request is taking too long, aborting...');
      explorerState.collectionsRequestController.abort();
      
      // Show timeout message
      collectionList.innerHTML = `
        <li class="list-group-item text-center">
          <div class="alert alert-warning mb-0 py-2">
            <p><i class="fas fa-clock me-2"></i>Request timed out. The database may be too large or experiencing issues.</p>
            <button class="btn btn-sm btn-warning retry-collections-btn">
              <i class="fas fa-sync-alt me-1"></i>Try Again
            </button>
            <button class="btn btn-sm btn-info ms-2 check-connection-btn">
              <i class="fas fa-stethoscope me-1"></i>Check Connection
            </button>
          </div>
        </li>
      `;
      
      // Add event listeners
      setTimeout(() => {
        const retryBtn = document.querySelector('.retry-collections-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => loadCollections(page, limit, true));
        }
        
        const checkBtn = document.querySelector('.check-connection-btn');
        if (checkBtn) {
          checkBtn.addEventListener('click', checkMongoDBConnection);
        }
      }, 0);
    }
  }, 15000); // 15 second timeout
  
  // Directly use the paginated endpoint
  fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache, no-store',
      'Pragma': 'no-cache'
    },
    signal: signal
  })
    .then(response => {
      // Clear the timeout since we got a response
      clearTimeout(timeoutId);
      
      console.log('Collections API response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        console.error(`Fetch failed with status: ${response.status} ${response.statusText}`);
        // Try to get error message from response body
        return response.text().then(text => {
          console.error("Error response body:", text);
          throw new Error(`Failed to fetch collections: ${response.status} ${response.statusText}`);
        });
      }
      
      console.log("Parsing response JSON...");
      let jsonData;
      try {
        return response.json();
      } catch (err) {
        console.error("JSON parse error:", err);
        return response.text().then(text => {
          console.error("Failed to parse response as JSON. Raw response:", text);
          throw new Error("Invalid JSON response from server");
        });
      }
    })
    .then(data => {
      console.log('Collections API response data:', data);
      explorerState.loadCollectionsAttempts = 0; // Reset attempts counter on success
      
      // Verify the structure of the received data
      if (data && data.success && data.collections && data.pagination) {
        console.log("Data structure seems valid. Processing collections...");
        // Store pagination state
        explorerState.collectionsState = {
          page: data.pagination.page,
          limit: data.pagination.limit,
          totalPages: data.pagination.totalPages,
          total: data.pagination.total
        };
        console.log("Updated collectionsState:", explorerState.collectionsState);
        
        // Add pagination controls above the list
        const paginationHtml = createCollectionPagination(
          explorerState.collectionsState.page,
          explorerState.collectionsState.totalPages,
          explorerState.collectionsState.total
        );
        
        // Render collections with pagination
        collectionList.innerHTML = paginationHtml;
        
        // Create a container for the collections
        const collectionsContainer = document.createElement('div');
        collectionsContainer.className = 'collections-container';
        
        if (data.collections.length > 0) {
          console.log(`Rendering ${data.collections.length} collections.`);
          // Add each collection to the list
          const listGroup = document.createElement('ul');
          listGroup.className = 'list-group mb-3';
          
          data.collections.forEach(collection => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center collection-item';
            li.setAttribute('data-collection', collection.name);
            
            // Create collection name with count badge
            li.innerHTML = `
              <div>
                <i class="fas fa-table me-2 text-primary"></i>
                ${escapeHtml(collection.name)}
                <span class="badge bg-secondary ms-2">${collection.count}</span>
              </div>
              <div>
                <button class="btn btn-sm btn-outline-primary view-collection-btn">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
            `;
            
            listGroup.appendChild(li);
            
            // Add event listener to view collection button
            const viewBtn = li.querySelector('.view-collection-btn');
            viewBtn.addEventListener('click', function() {
              explorerState.currentCollection = collection.name;
              loadCollectionData(collection.name);
              
              // Update active collection
              document.querySelectorAll('.collection-item').forEach(item => {
                item.classList.remove('active');
              });
              li.classList.add('active');
            });
          });
          
          collectionsContainer.appendChild(listGroup);
        } else {
          console.log("No collections found in the response.");
          // Handle empty collections case even with success response
          collectionsContainer.innerHTML = `
            <li class="list-group-item text-center">
              <span class="text-muted">No collections found in the database</span>
            </li>
          `;
        }
        
        collectionList.appendChild(collectionsContainer);
        
        // Add pagination controls at the bottom too
        if (paginationHtml) {
          collectionList.innerHTML += paginationHtml;
        }
        
        // Add event listeners to pagination controls
        document.querySelectorAll('.collections-pagination .page-link[data-page]').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageNum = parseInt(e.currentTarget.getAttribute('data-page'), 10);
            if (pageNum !== explorerState.collectionsState.page) {
              loadCollections(pageNum, explorerState.collectionsState.limit);
            }
          });
        });
        
        // If mongo debug panel is visible, hide it
        const mongodbDebugPanel = document.getElementById('mongodb-debug-panel');
        if (mongodbDebugPanel && mongodbDebugPanel.style.display !== 'none') {
          console.log("Hiding MongoDB debug panel.");
          mongodbDebugPanel.style.display = 'none';
        }
        console.log("Successfully loaded and rendered collections.");
      } else {
        // Handle case where success is false or data is missing
        console.error("Invalid data structure received:", data);
        throw new Error(data?.error || 'Invalid response format or failed to load collections');
      }
    })
    .catch(error => {
      // Clear the timeout since we got a response (even if it's an error)
      clearTimeout(timeoutId);
      
      // Don't handle aborted requests as errors
      if (error.name === 'AbortError') {
        console.log('Collections request was aborted.');
        return;
      }
      
      console.error('Error loading collections:', error);
      console.error("Error stack:", error.stack);
      
      // Show retry button
      collectionList.innerHTML = `
        <li class="list-group-item text-center">
          <div class="alert alert-warning mb-0 py-2">
            <p><i class="fas fa-exclamation-triangle me-2"></i>Failed to load collections: ${escapeHtml(error.message)}</p>
            <button class="btn btn-sm btn-warning retry-collections-btn">
              <i class="fas fa-sync-alt me-1"></i>Try Again
            </button>
            <button class="btn btn-sm btn-info ms-2 check-connection-btn">
              <i class="fas fa-stethoscope me-1"></i>Check Connection
            </button>
          </div>
        </li>
      `;
      
      // Add event listeners
      setTimeout(() => {
        const retryBtn = document.querySelector('.retry-collections-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => loadCollections(page, limit, true));
        }
        
        const checkBtn = document.querySelector('.check-connection-btn');
        if (checkBtn) {
          checkBtn.addEventListener('click', checkMongoDBConnection);
        }
      }, 0);
    });
}

/**
 * Add a debugging function for collections
 */
function debugCollections() {
  showMongoDBDebugPanel();
  updateDebugPanel(`
    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
    Debugging collections...
  `);
  
  // Call the debug endpoint
  fetch('/admin/api/debug-collections', {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to debug collections');
      return response.json();
    })
    .then(data => {
      if (data.success) {
        // Create a detailed debug report
        const connectionState = data.connectionState;
        const isConnected = connectionState.code === 1;
        
        let debugContent = `
          <div class="mb-2">
            <strong>Connection Status:</strong> 
            <span class="badge bg-${isConnected ? 'success' : 'danger'}">
              ${connectionState.status}
            </span>
          </div>
          
          <div class="mb-3">
            <strong>Database Name:</strong> ${data.databaseName || 'Unknown'}
          </div>
        `;
        
        // Add direct collections results
        if (data.directCollections && data.directCollections.length > 0) {
          // Show a warning if there are many collections
          const collectionCount = data.directCollections.length;
          const showWarning = collectionCount > 20;
          
          debugContent += `
            <div class="mb-3">
              <strong>Direct Collections (${collectionCount}):</strong>
              ${showWarning ? 
                `<div class="alert alert-warning py-1 mt-1 mb-2">
                  <i class="fas fa-exclamation-triangle me-1"></i>
                  Large database detected with ${collectionCount} collections.
                  Consider using pagination to improve performance.
                </div>` : ''}
              <ul class="mb-0 ps-3 ${showWarning ? 'collection-list-scrollable' : ''}">
                ${data.directCollections.slice(0, 50).map(coll => `<li>${coll}</li>`).join('')}
                ${data.directCollections.length > 50 ? 
                  `<li>...and ${data.directCollections.length - 50} more collections</li>` : ''}
              </ul>
            </div>
          `;
        } else {
          debugContent += `
            <div class="mb-3 text-warning">
              <strong>Direct Collections:</strong> None found
            </div>
          `;
        }
        
        // Add service collections results
        if (data.serviceCollections && data.serviceCollections.length > 0) {
          debugContent += `
            <div class="mb-3">
              <strong>Service Collections (${data.serviceCollections.length}):</strong>
              <ul class="mb-0 ps-3">
                ${data.serviceCollections.slice(0, 20).map(coll => `<li>${coll}</li>`).join('')}
                ${data.serviceCollections.length > 20 ? 
                  `<li>...and ${data.serviceCollections.length - 20} more collections</li>` : ''}
              </ul>
            </div>
          `;
        } else {
          debugContent += `
            <div class="mb-3 text-warning">
              <strong>Service Collections:</strong> None found
            </div>
          `;
        }
        
        // Add action buttons
        debugContent += `
          <div class="mt-3">
            <button class="btn btn-sm btn-primary try-load-collections-btn">
              <i class="fas fa-sync-alt me-1"></i>Try Loading Collections
            </button>
            
            <button class="btn btn-sm btn-warning ms-2 check-mongodb-status-btn">
              <i class="fas fa-heartbeat me-1"></i>Check MongoDB Status
            </button>
            
            <button class="btn btn-sm btn-secondary ms-2 hide-debug-btn">
              <i class="fas fa-times me-1"></i>Hide Details
            </button>
          </div>
        `;
        
        updateDebugPanel(debugContent);
        
        // Add event listeners
        setTimeout(() => {
          const loadBtn = document.querySelector('.try-load-collections-btn');
          if (loadBtn) {
            loadBtn.addEventListener('click', () => loadCollections(1, explorerState.collectionsState.limit, true));
          }
          
          const statusBtn = document.querySelector('.check-mongodb-status-btn');
          if (statusBtn) {
            statusBtn.addEventListener('click', checkMongoDBConnection);
          }
          
          const hideBtn = document.querySelector('.hide-debug-btn');
          if (hideBtn) {
            hideBtn.addEventListener('click', () => {
              document.getElementById('mongodb-debug-panel').style.display = 'none';
            });
          }
        }, 100);
      } else {
        throw new Error(data.error || 'Debug collections failed');
      }
    })
    .catch(error => {
      console.error('Collections debug error:', error);
      
      updateDebugPanel(`
        <div class="text-danger mb-2">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Debug Error:</strong> ${error.message}
        </div>
        
        <div class="mt-3">
          <button class="btn btn-sm btn-warning retry-debug-btn">
            <i class="fas fa-sync-alt me-1"></i>Retry Debug
          </button>
          
          <button class="btn btn-sm btn-secondary ms-2 hide-debug-btn">
            <i class="fas fa-times me-1"></i>Hide Details
          </button>
        </div>
      `, true);
      
      // Add event listeners
      setTimeout(() => {
        const retryBtn = document.querySelector('.retry-debug-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', debugCollections);
        }
        
        const hideBtn = document.querySelector('.hide-debug-btn');
        if (hideBtn) {
          hideBtn.addEventListener('click', () => {
            document.getElementById('mongodb-debug-panel').style.display = 'none';
          });
        }
      }, 100);
    });
}

// When creating tables in collection data display
function createTableForDocuments(data, skip = 0) {
  // Create the outer container with guaranteed horizontal scrolling
  const outerContainer = document.createElement('div');
  outerContainer.className = 'mongo-table-container';
  
  // Extract all unique field names from documents to use as column headers
  const allFields = new Set(['_id']); // Always include _id
  
  // Get all fields from all documents
  data.documents.forEach(doc => {
    Object.keys(doc).forEach(field => {
      allFields.add(field);
    });
  });
  
  // Convert to array and sort (_id first, then alphabetically)
  const fieldNames = Array.from(allFields);
  fieldNames.sort((a, b) => {
    if (a === '_id') return -1;
    if (b === '_id') return 1;
    return a.localeCompare(b);
  });
  
  // Add debug banner to show column information
  const debugBanner = document.createElement('div');
  debugBanner.className = 'db-debug-banner';
  debugBanner.innerHTML = `
    <span>MongoDB Collection: displaying ${data.documents.length} documents with ${fieldNames.length} fields</span>
    <span>Scroll horizontally to see all fields →</span>
  `;
  outerContainer.appendChild(debugBanner);
  
  // Create the table with dynamic column structure
  const table = document.createElement('table');
  table.className = 'table table-hover table-sm';
  
  // Create table header with all field names
  const thead = document.createElement('thead');
  thead.className = 'table-light';
  
  const headerRow = document.createElement('tr');
  
  // Add index column
  const indexHeader = document.createElement('th');
  indexHeader.textContent = '#';
  indexHeader.style.width = '60px';
  indexHeader.style.minWidth = '60px';
  headerRow.appendChild(indexHeader);
  
  // Add one column per document field
  fieldNames.forEach(field => {
    const header = document.createElement('th');
    header.textContent = field;
    
    // Make ID column a bit wider, but not too wide
    if (field === '_id') {
      header.style.width = '180px';
      header.style.minWidth = '180px';
    } else {
      // Other columns get standard width
      header.style.minWidth = '150px';
    }
    
    headerRow.appendChild(header);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Create and add tbody
  const tbody = document.createElement('tbody');
  
  // Add each document as a row
  data.documents.forEach((doc, index) => {
    const row = document.createElement('tr');
    
    // Index column
    const indexCell = document.createElement('td');
    indexCell.textContent = skip + index + 1;
    row.appendChild(indexCell);
    
    // One cell for each field
    fieldNames.forEach(field => {
      const cell = document.createElement('td');
      
      // Format value based on type
      const value = doc[field];
      if (value === undefined) {
        // Field doesn't exist in this document
        cell.innerHTML = '<span class="text-muted">—</span>';
      } else if (value === null) {
        cell.innerHTML = '<span class="text-muted">null</span>';
      } else if (typeof value === 'object') {
        // Object or array - display as formatted JSON
        const pre = document.createElement('pre');
        pre.className = 'document-json mb-0';
        
        const code = document.createElement('code');
        code.textContent = JSON.stringify(value, null, 2);
        
        pre.appendChild(code);
        cell.appendChild(pre);
      } else {
        // Simple value
        cell.textContent = String(value);
      }
      
      row.appendChild(cell);
    });
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  outerContainer.appendChild(table);
  
  // After a slight delay, add visual indicator if scrolling is needed
  setTimeout(() => {
    if (table.scrollWidth > outerContainer.clientWidth) {
      outerContainer.classList.add('has-horizontal-scroll');
      console.log('Table is wider than container, horizontal scrolling enabled');
      console.log('Table width:', table.scrollWidth, 'Container width:', outerContainer.clientWidth);
    }
  }, 100);
  
  return outerContainer;
}

/**
 * Create a full view display for MongoDB documents
 * @param {Array} documents - Array of MongoDB documents
 * @param {number} skip - Number of documents to skip (for pagination)
 * @returns {HTMLElement} - The full view container element
 */
function createFullViewForDocuments(data, skip = 0) {
  const container = document.createElement('div');
  container.className = 'full-view-container';
  
  // Add a header with document count and helper text
  const header = document.createElement('div');
  header.className = 'alert alert-light mb-3';
  header.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <span>
        <i class="fas fa-file-alt me-2"></i>
        Displaying ${data.documents.length} documents in full JSON view
      </span>
      <span class="text-muted small">Document ${skip + 1}-${skip + data.documents.length} of ${data.count}</span>
    </div>
    <p class="small text-muted mb-0">
      Full view shows complete document structure. Click "Table View" to return to tabular format.
    </p>
  `;
  container.appendChild(header);
  
  // Create a card for each document
  data.documents.forEach((doc, index) => {
    const card = document.createElement('div');
    card.className = 'document-card';
    
    // Create a header with the document index and ID
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    cardHeader.innerHTML = `
      <span><strong>#${skip + index + 1}</strong> - ID: <code>${doc._id || 'N/A'}</code></span>
      <span class="badge bg-light text-dark">${Object.keys(doc).length} fields</span>
    `;
    
    // Create card body with the full document JSON
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    const pre = document.createElement('pre');
    pre.className = 'document-full-json';
    pre.innerHTML = `<code>${escapeHtml(JSON.stringify(doc, null, 2))}</code>`;
    
    cardBody.appendChild(pre);
    
    // Add header and body to the card
    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    
    // Add the card to the container
    container.appendChild(card);
  });
  
  return container;
}

/**
 * Load collection data
 * @param {string} collectionName - Collection name to load
 * @param {number} limit - Number of documents to load per page
 * @param {number} skip - Number of documents to skip
 */
function loadCollectionData(collectionName, limit = 20, skip = 0) {
  const collectionDataContainer = document.querySelector('.collection-data-container');
  if (!collectionDataContainer) return;
  
  console.log(`Loading data for collection: ${collectionName} (limit: ${limit}, skip: ${skip}, attempt: ${explorerState.loadCollectionDataAttempts + 1})`);
  
  // Update collection name display
  const currentCollectionName = document.querySelector('.current-collection-name');
  if (currentCollectionName) {
    currentCollectionName.textContent = collectionName;
  }
  
  // Show loading state
  collectionDataContainer.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border" role="status"></div>
      <p class="mt-2">Loading data from ${collectionName}...</p>
    </div>
  `;
  
  // Enable refresh button and toggle view button
  const refreshDataBtn = document.querySelector('.refresh-data-btn');
  const toggleViewBtn = document.querySelector('.toggle-view-btn');
  if (refreshDataBtn) {
    refreshDataBtn.disabled = false;
  }
  if (toggleViewBtn) {
    toggleViewBtn.disabled = false;
  }
  
  // Add a random cache-busting parameter to avoid caching issues
  const cacheBuster = `_t=${Date.now()}`;
  
  // Create an AbortController for this request
  const controller = new AbortController();
  const signal = controller.signal;
  
  // Set a timeout to abort the request if it takes too long
  const timeoutId = setTimeout(() => {
    controller.abort();
    
    if (collectionDataContainer.innerHTML.includes('Loading data')) {
      collectionDataContainer.innerHTML = `
        <div class="text-center py-5">
          <div class="alert alert-warning">
            <i class="fas fa-clock me-2"></i>
            <strong>Request Timeout</strong>
            <p>The request to load collection data timed out.</p>
            <button class="btn btn-sm btn-warning retry-data-btn mt-2">
              <i class="fas fa-sync-alt me-1"></i>Try Again
            </button>
          </div>
        </div>
      `;
      
      // Add event listener to retry button
      const retryBtn = document.querySelector('.retry-data-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => loadCollectionData(collectionName, limit, skip));
      }
    }
  }, 15000); // 15 second timeout
  
  // Fetch collection data from API with timeout
  fetch(`/admin/api/collections/${collectionName}?limit=${limit}&skip=${skip}&${cacheBuster}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    signal: signal
  })
    .then(response => {
      clearTimeout(timeoutId);
      
      console.log(`Collection data response status for ${collectionName}:`, response.status);
      
      if (!response.ok) {
        // Try to get detailed error message from response
        return response.text().then(text => {
          console.error(`Error response for ${collectionName}:`, text);
          throw new Error(`Failed to fetch collection data: ${response.status} ${response.statusText}`);
        });
      }
      
      // Try to parse JSON with error handling
      try {
        return response.json();
      } catch (err) {
        console.error("JSON parse error:", err);
        return response.text().then(text => {
          console.error("Failed to parse collection data response as JSON:", text);
          throw new Error("Invalid JSON response from server");
        });
      }
    })
    .then(data => {
      explorerState.loadCollectionDataAttempts = 0; // Reset attempts counter on success
      
      if (data.success) {
        // Store the current collection name in state
        explorerState.currentCollection = collectionName;
        
        // Update document count
        const collectionCount = document.querySelector('.collection-count');
        if (collectionCount) {
          collectionCount.textContent = `${data.count} documents`;
          collectionCount.disabled = false;
        }
        
        // Display the data
        if (data.documents && data.documents.length > 0) {
          // Create a container for the data
          const dataContainer = document.createElement('div');
          dataContainer.className = 'data-wrapper p-3 position-relative'; // Add wrapper class for styling
          dataContainer.setAttribute('data-view-mode', 'table'); // Default to table view
          
          // Create pagination controls if needed
          let paginationHtml = '';
          if (data.count > limit) {
            const totalPages = Math.ceil(data.count / limit);
            const currentPage = Math.floor(skip / limit) + 1;
            
            paginationHtml = `
              <nav aria-label="Documents pagination" class="mb-3">
                <ul class="pagination pagination-sm justify-content-center">
                  <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="1">First</a>
                  </li>
                  <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
                  </li>
                  <li class="page-item active">
                    <span class="page-link">Page ${currentPage} of ${totalPages}</span>
                  </li>
                  <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
                  </li>
                  <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="${totalPages}">Last</a>
                  </li>
                </ul>
              </nav>
              <div class="text-center text-muted small mb-3">
                Showing ${data.documents.length} of ${data.count} documents
              </div>
            `;
          }
          
          // Add the pagination controls at the top
          dataContainer.innerHTML = paginationHtml;
          
          // Create table view container
          const tableViewContainer = document.createElement('div');
          tableViewContainer.className = 'table-view-container';
          
          // Create table with our helper function
          const tableContainer = createTableForDocuments(data, skip);
          tableViewContainer.appendChild(tableContainer);
          
          // Create full view container
          const fullViewContainer = document.createElement('div');
          fullViewContainer.className = 'full-view-container';
          fullViewContainer.style.display = 'none'; // Initially hidden
          
          // Add full view content
          fullViewContainer.appendChild(createFullViewForDocuments(data, skip));
          
          // Add both view containers to the data container
          dataContainer.appendChild(tableViewContainer);
          dataContainer.appendChild(fullViewContainer);
          
          // Add the pagination controls again at the bottom
          if (paginationHtml) {
            const bottomPagination = document.createElement('div');
            bottomPagination.className = 'mt-3';
            bottomPagination.innerHTML = paginationHtml;
            dataContainer.appendChild(bottomPagination);
          }
          
          // Add event listeners to pagination controls
          dataContainer.querySelectorAll('.page-link[data-page]').forEach(link => {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              const page = parseInt(this.getAttribute('data-page'), 10);
              const newSkip = (page - 1) * limit;
              loadCollectionData(collectionName, limit, newSkip);
            });
          });
          
          // Clear and add the data container to the page
          collectionDataContainer.innerHTML = '';
          collectionDataContainer.appendChild(dataContainer);
          
          // Add a small delay to detect if there's a horizontal overflow and add class for visual indicator
          setTimeout(() => {
            const tableEl = tableContainer.querySelector('table');
            if (tableEl && tableEl.scrollWidth > tableContainer.clientWidth) {
              dataContainer.classList.add('can-scroll-right');
            }
          }, 100);
          
          // Set up toggle button with direct click handler
          setupViewToggleButton(collectionName, limit, skip);
          
        } else {
          collectionDataContainer.innerHTML = `
            <div class="text-center py-5">
              <i class="fas fa-info-circle mb-3" style="font-size: 3rem; color: #e0e0e0;"></i>
              <p class="text-muted">No documents found in collection "${collectionName}"</p>
            </div>
          `;
        }
      } else {
        throw new Error(data.error || 'Failed to load collection data');
      }
    })
    .catch(error => {
      clearTimeout(timeoutId);
      
      // Don't handle aborted requests as errors
      if (error.name === 'AbortError') {
        console.log('Collection data request was aborted');
        return;
      }
      
      console.error('Error loading collection data:', error);
      
      // Show retry button if max attempts not reached
      if (explorerState.loadCollectionDataAttempts < explorerState.MAX_RETRY_ATTEMPTS) {
        explorerState.loadCollectionDataAttempts++;
        collectionDataContainer.innerHTML = `
          <div class="text-center py-5">
            <div class="alert alert-warning">
              <p><i class="fas fa-exclamation-triangle me-2"></i>Failed to load data: ${error.message}</p>
              <button class="btn btn-sm btn-warning retry-data-btn mt-2">
                <i class="fas fa-sync-alt me-1"></i>Retry (Attempt ${explorerState.loadCollectionDataAttempts}/${explorerState.MAX_RETRY_ATTEMPTS})
              </button>
              <button class="btn btn-sm btn-info ms-2 check-connection-btn">
                <i class="fas fa-stethoscope me-1"></i>Diagnose Connection
              </button>
            </div>
          </div>
        `;
        
        // Add event listener to retry button
        const retryBtn = document.querySelector('.retry-data-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => loadCollectionData(collectionName, limit, skip));
        }
        
        // Add event listener to check connection button
        const checkBtn = document.querySelector('.check-connection-btn');
        if (checkBtn) {
          checkBtn.addEventListener('click', checkMongoDBConnection);
        }
      } else {
        // Max retries reached
        collectionDataContainer.innerHTML = `
          <div class="text-center py-5">
            <div class="alert alert-danger">
              <i class="fas fa-times-circle me-2"></i>Failed to load collection data after ${explorerState.loadCollectionDataAttempts} attempts.
              <div class="mt-2">
                <p class="small text-muted mb-1">Possible causes:</p>
                <ul class="text-start small">
                  <li>Collection data too large or complex</li>
                  <li>MongoDB query timeout</li>
                  <li>Server error processing request</li>
                </ul>
                <div class="mt-2">
                  <button class="btn btn-sm btn-danger retry-data-btn">
                    <i class="fas fa-sync-alt me-1"></i>Try Again
                  </button>
                  <button class="btn btn-sm btn-info ms-2 check-connection-btn">
                    <i class="fas fa-stethoscope me-1"></i>Diagnose Connection
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        
        // Reset attempts counter for next try
        explorerState.loadCollectionDataAttempts = 0;
        
        // Add event listener to try again button
        const retryBtn = document.querySelector('.retry-data-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => loadCollectionData(collectionName, limit, skip));
        }
        
        // Add event listener to check connection button
        const checkBtn = document.querySelector('.check-connection-btn');
        if (checkBtn) {
          checkBtn.addEventListener('click', checkMongoDBConnection);
        }
      }
    });
}

/**
 * Set up the toggle view button with direct click handler
 * @param {string} collectionName - Current collection name
 * @param {number} limit - Documents per page
 * @param {number} skip - Documents to skip
 */
function setupViewToggleButton(collectionName, limit, skip) {
  // Get toggle view button and containers
  const toggleViewBtn = document.querySelector('.toggle-view-btn');
  const tableViewContainer = document.querySelector('.table-view-container');
  const fullViewContainer = document.querySelector('.full-view-container');
  
  // Make sure elements exist
  if (!toggleViewBtn || !tableViewContainer || !fullViewContainer) {
    console.error('Toggle view elements not found!');
    return;
  }
  
  // Remove any existing listeners to avoid duplicates
  const newToggleBtn = toggleViewBtn.cloneNode(true);
  toggleViewBtn.parentNode.replaceChild(newToggleBtn, toggleViewBtn);
  
  // Set initial button state
  newToggleBtn.innerHTML = '<i class="fas fa-expand-alt me-1"></i> Full View';
  newToggleBtn.title = 'Switch to full document view';
  
  // Add a direct click event listener
  newToggleBtn.addEventListener('click', function(e) {
    console.log('Toggle view button clicked!');
    e.preventDefault();
    e.stopPropagation();
    
    const dataWrapper = document.querySelector('.data-wrapper');
    const currentMode = dataWrapper.getAttribute('data-view-mode') || 'table';
    
    if (currentMode === 'table') {
      // Switch to full view
      tableViewContainer.style.display = 'none';
      fullViewContainer.style.display = 'block';
      dataWrapper.setAttribute('data-view-mode', 'full');
      
      // Update button text
      this.innerHTML = '<i class="fas fa-table me-1"></i> Table View';
      this.title = 'Switch to tabular view';
      this.classList.add('active');
      
      console.log('Switched to Full View');
    } else {
      // Switch to table view
      fullViewContainer.style.display = 'none';
      tableViewContainer.style.display = 'block';
      dataWrapper.setAttribute('data-view-mode', 'table');
      
      // Update button text
      this.innerHTML = '<i class="fas fa-expand-alt me-1"></i> Full View';
      this.title = 'Switch to full document view';
      this.classList.remove('active');
      
      console.log('Switched to Table View');
    }
    
    return false;
  });
  
  console.log('Toggle view button event listener attached');
}

// Export functions to be used elsewhere
export {
  checkMongoDBConnection,
  debugCollections,
  loadCollections,
  loadCollectionData
};