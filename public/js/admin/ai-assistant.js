/**
 * AI Assistant Module for Admin Panel
 * Handles interactions with the AI assistant for platform administrators
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const chatForm = document.getElementById('ai-chat-form');
  const chatInput = document.getElementById('ai-chat-input');
  const chatContainer = document.getElementById('ai-chat-container');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  const testConnectionBtn = document.getElementById('test-connection-btn');
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  const assistantStatusEl = document.getElementById('assistant-status');
  const logsContainer = document.getElementById('ai-logs-container');
  const filterLogSelect = document.getElementById('filter-logs');
  
  // For image generation
  const imageGenForm = document.getElementById('image-gen-form');
  const imagePromptInput = document.getElementById('image-prompt');
  const generatedImageContainer = document.getElementById('generated-image-container');
  
  // User role and ID
  const userRole = 'admin'; // Since this is the admin panel
  const userId = getUserId(); // Get user ID from session or data attribute
  
  // Chat history
  let chatHistory = [];
  
  // Initialize
  initAssistant();
  
  /**
   * Initialize the AI Assistant
   */
  function initAssistant() {
    // Load assistant status
    loadAssistantStatus();
    
    // Load assistant logs
    loadAssistantLogs();
    
    // Set up event listeners
    if (chatForm) {
      chatForm.addEventListener('submit', handleChatSubmit);
    }
    
    if (clearChatBtn) {
      clearChatBtn.addEventListener('click', clearChat);
    }
    
    if (testConnectionBtn) {
      testConnectionBtn.addEventListener('click', testConnection);
    }
    
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', clearLogs);
    }
    
    if (filterLogSelect) {
      filterLogSelect.addEventListener('change', () => {
        loadAssistantLogs(filterLogSelect.value);
      });
    }
    
    if (imageGenForm) {
      imageGenForm.addEventListener('submit', handleImageGenSubmit);
    }
  }
  
  /**
   * Get current user ID safely - never pass invalid MongoDB ObjectIds
   */
  function getUserId() {
    // Try to get from data attribute on a user element
    const userElement = document.getElementById('user-data') || document.body;
    if (userElement && userElement.dataset.userId) {
      return userElement.dataset.userId;
    }
    
    // Try to get from session storage 
    const userData = sessionStorage.getItem('userData');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        if (parsed && parsed.id) {
          return parsed.id;
        }
      } catch (e) {
        console.warn('Error parsing user data from session storage:', e);
      }
    }
    
    // If we can't determine the ID reliably, return null
    // The server will handle this safely
    return null;
  }
  
  /**
   * Handle chat form submission
   * @param {Event} e - Form submit event
   */
  async function handleChatSubmit(e) {
    e.preventDefault();
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Display user message
    appendChatMessage(message, 'user');
    
    // Clear input
    chatInput.value = '';
    
    try {
      // Show loading state
      const loadingEl = appendChatMessage('Thinking...', 'assistant', true);
      
      // Send message to server
      const response = await fetch('/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          userRole,
          userId // This will be processed safely on the server
        })
      });
      
      const data = await response.json();
      
      // Remove loading message
      if (loadingEl) {
        loadingEl.remove();
      }
      
      if (data.success) {
        // Display assistant response
        appendChatMessage(data.response, 'assistant');
        
        // Save to chat history
        chatHistory.push({ role: 'user', message });
        chatHistory.push({ role: 'assistant', message: data.response });
        
        // Save chat history to session storage
        saveChat();
      } else {
        appendChatMessage('Error: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error communicating with assistant:', error);
      appendChatMessage('Error communicating with the assistant. Please try again later.', 'error');
    }
  }
  
  /**
   * Append a message to the chat container
   * @param {string} message - The message to append
   * @param {string} role - Role of the sender (user, assistant, error)
   * @param {boolean} isLoading - Whether this is a loading message
   * @returns {HTMLElement} The created message element
   */
  function appendChatMessage(message, role, isLoading = false) {
    if (!chatContainer) return null;
    
    const messageEl = document.createElement('div');
    messageEl.classList.add('chat-message', `chat-message-${role}`);
    
    if (isLoading) {
      messageEl.classList.add('loading');
      messageEl.innerHTML = `
        <div class="message-header">
          <span class="message-role">Assistant</span>
        </div>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      `;
    } else {
      // Format role name
      const roleName = role === 'user' ? 'You' : 
                       role === 'assistant' ? 'Assistant' : 'System';
      
      // Parse message for markdown-like formatting
      const formattedMessage = formatMessage(message);
      
      messageEl.innerHTML = `
        <div class="message-header">
          <span class="message-role">${roleName}</span>
          <span class="message-time">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="message-content">
          ${formattedMessage}
        </div>
      `;
    }
    
    chatContainer.appendChild(messageEl);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageEl;
  }
  
  /**
   * Format message with basic markdown-like syntax
   * @param {string} message - Raw message text
   * @returns {string} - Formatted HTML
   */
  function formatMessage(message) {
    if (!message) return '';
    
    // Escape HTML to prevent XSS
    let formatted = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Lists
    formatted = formatted.replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }
  
  /**
   * Clear the chat container
   */
  function clearChat() {
    if (!chatContainer) return;
    
    // Clear the chat container
    chatContainer.innerHTML = '';
    
    // Clear chat history
    chatHistory = [];
    
    // Clear session storage
    saveChat();
    
    // Add initial message
    appendChatMessage('Chat cleared. How can I help you today?', 'assistant');
  }
  
  /**
   * Save chat history to session storage
   */
  function saveChat() {
    try {
      sessionStorage.setItem('aiChatHistory', JSON.stringify(chatHistory));
    } catch (e) {
      console.warn('Error saving chat history:', e);
    }
  }
  
  /**
   * Load chat history from session storage
   */
  function loadChat() {
    try {
      const savedChat = sessionStorage.getItem('aiChatHistory');
      if (savedChat) {
        chatHistory = JSON.parse(savedChat);
        
        // Display saved messages
        chatHistory.forEach(item => {
          appendChatMessage(item.message, item.role);
        });
      } else {
        // Add welcome message if no history
        appendChatMessage('Hello admin! How can I assist you with the platform today?', 'assistant');
      }
    } catch (e) {
      console.warn('Error loading chat history:', e);
      appendChatMessage('Hello! How can I assist you today?', 'assistant');
    }
  }
  
  /**
   * Load assistant status
   */
  async function loadAssistantStatus() {
    if (!assistantStatusEl) return;
    
    try {
      const response = await fetch('/assistant/status');
      const data = await response.json();
      
      if (data.success) {
        const status = data.status;
        
        // Update status display
        assistantStatusEl.innerHTML = `
          <div class="status-item ${status.connected ? 'connected' : 'disconnected'}">
            <span class="status-label">Status:</span>
            <span class="status-value">${status.connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Provider:</span>
            <span class="status-value">${status.provider}</span>
          </div>
          <div class="status-item">
            <span class="status-label">API Key:</span>
            <span class="status-value">${status.apiKeyMasked || 'Not set'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Model:</span>
            <span class="status-value">${status.model || 'Unknown'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Total Requests:</span>
            <span class="status-value">${status.totalRequests}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Last Request:</span>
            <span class="status-value">${status.lastRequest ? new Date(status.lastRequest).toLocaleString() : 'None'}</span>
          </div>
        `;
      } else {
        assistantStatusEl.innerHTML = `
          <div class="status-error">
            Error loading assistant status: ${data.error || 'Unknown error'}
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading assistant status:', error);
      assistantStatusEl.innerHTML = `
        <div class="status-error">
          Error communicating with the server. Please refresh the page.
        </div>
      `;
    }
  }
  
  /**
   * Test connection to the assistant API
   */
  async function testConnection() {
    if (!testConnectionBtn) return;
    
    // Set button to loading state
    const originalText = testConnectionBtn.textContent;
    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = 'Testing...';
    
    try {
      const response = await fetch('/assistant/test-connection', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`Connection successful! Response: ${data.response}`);
        loadAssistantStatus(); // Refresh status
      } else {
        alert(`Connection test failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      alert('Error testing connection. Check console for details.');
    } finally {
      // Restore button state
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = originalText;
    }
  }
  
  /**
   * Load assistant logs
   * @param {string} filter - Optional filter
   */
  async function loadAssistantLogs(filter = '') {
    if (!logsContainer) return;
    
    try {
      const url = `/assistant/logs${filter ? `?filter=${filter}` : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        // Clear existing logs
        logsContainer.innerHTML = '';
        
        if (data.logs.length === 0) {
          logsContainer.innerHTML = '<div class="empty-logs">No logs found</div>';
          return;
        }
        
        // Create log entries
        data.logs.forEach(log => {
          const logEl = document.createElement('div');
          logEl.classList.add('log-entry');
          
          if (log.status === 'error') {
            logEl.classList.add('log-error');
          }
          
          logEl.innerHTML = `
            <div class="log-header">
              <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
              <span class="log-event">${log.event}</span>
              <span class="log-role">${log.userRole}</span>
            </div>
            <div class="log-message">${log.message}</div>
          `;
          
          logsContainer.appendChild(logEl);
        });
      } else {
        logsContainer.innerHTML = `
          <div class="logs-error">
            Error loading logs: ${data.error || 'Unknown error'}
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading logs:', error);
      logsContainer.innerHTML = `
        <div class="logs-error">
          Error communicating with the server. Please refresh the page.
        </div>
      `;
    }
  }
  
  /**
   * Clear all assistant logs
   */
  async function clearLogs() {
    if (!clearLogsBtn) return;
    
    if (!confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      return;
    }
    
    // Set button to loading state
    const originalText = clearLogsBtn.textContent;
    clearLogsBtn.disabled = true;
    clearLogsBtn.textContent = 'Clearing...';
    
    try {
      const response = await fetch('/assistant/clear-logs', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('Logs cleared successfully');
        loadAssistantLogs(); // Refresh logs
      } else {
        alert(`Failed to clear logs: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error clearing logs:', error);
      alert('Error clearing logs. Check console for details.');
    } finally {
      // Restore button state
      clearLogsBtn.disabled = false;
      clearLogsBtn.textContent = originalText;
    }
  }
  
  /**
   * Handle image generation form submission
   * @param {Event} e - Form submit event
   */
  async function handleImageGenSubmit(e) {
    e.preventDefault();
    
    const prompt = imagePromptInput.value.trim();
    if (!prompt) return;
    
    // Clear input
    imagePromptInput.value = '';
    
    try {
      // Show loading state
      generatedImageContainer.innerHTML = `
        <div class="image-loading">
          <div class="spinner"></div>
          <p>Generating image from prompt: "${prompt}"</p>
        </div>
      `;
      
      // Send request to server
      const response = await fetch('/assistant/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          width: 1024,
          height: 1024
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Display the generated image
        generatedImageContainer.innerHTML = `
          <div class="generated-image-wrapper">
            <img src="${data.imageUrl}" alt="AI Generated: ${prompt}" class="generated-image">
            <p class="image-prompt">"${prompt}"</p>
            <button type="button" class="download-image-btn" data-url="${data.imageUrl}" data-prompt="${prompt}">
              Download Image
            </button>
          </div>
        `;
        
        // Add event listener for download button
        const downloadBtn = generatedImageContainer.querySelector('.download-image-btn');
        if (downloadBtn) {
          downloadBtn.addEventListener('click', () => {
            const imageUrl = downloadBtn.dataset.url;
            const prompt = downloadBtn.dataset.prompt;
            
            // Create a temporary link element
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = `ai-generated-${prompt.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '-')}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          });
        }
      } else {
        generatedImageContainer.innerHTML = `
          <div class="image-error">
            <p>Error generating image: ${data.error || 'Unknown error'}</p>
            <p>Prompt: "${prompt}"</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error generating image:', error);
      generatedImageContainer.innerHTML = `
        <div class="image-error">
          <p>Error communicating with the server. Please try again later.</p>
          <p>Prompt: "${prompt}"</p>
        </div>
      `;
    }
  }
  
  // Load chat history on initialization
  if (chatContainer) {
    loadChat();
  }
});