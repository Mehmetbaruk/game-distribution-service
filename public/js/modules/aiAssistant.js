/**
 * AI Assistant functionality for Game Distribution Service
 * Manages the AI chat interface
 */

import { escapeHtml } from './utils.js';
import TranslationManager from './translationManager.js';

/**
 * Add necessary CSS styles for AI Assistant
 */
export function addAIAssistantStyles() {
  // Check if the style element already exists
  if (document.getElementById('ai-assistant-inline-styles')) {
    return;
  }
  
  // Create style element
  const style = document.createElement('style');
  style.id = 'ai-assistant-inline-styles';
  style.textContent = `
    .ai-assistant-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: #007bff;
      color: white;
      border: none;
      outline: none;
      cursor: pointer;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      z-index: 999;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }
    
    .ai-assistant-toggle:hover {
      transform: scale(1.1);
      background-color: #0069d9;
    }
    
    .ai-assistant-container {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 350px;
      height: 500px;
      background-color: white;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
      z-index: 998;
      display: flex;
      flex-direction: column;
      transition: all 0.3s ease;
      transform: scale(0.8);
      opacity: 0;
      pointer-events: none;
    }
    
    .ai-assistant-container.show {
      transform: scale(1);
      opacity: 1;
      pointer-events: all;
    }
    
    .ai-assistant-header {
      padding: 15px;
      background-color: #007bff;
      color: white;
      border-top-left-radius: 10px;
      border-top-right-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .ai-assistant-header h3 {
      margin: 0;
      font-size: 18px;
    }
    
    .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
    }
    
    .ai-assistant-messages {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      display: flex;
      flex-direction: column;
    }
    
    .ai-assistant-input-container {
      padding: 10px 15px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      background-color: #f8f9fa;
      border-bottom-left-radius: 10px;
      border-bottom-right-radius: 10px;
    }
    
    .ai-assistant-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #ced4da;
      border-radius: 4px;
      outline: none;
      font-size: 14px;
    }
    
    .ai-assistant-send {
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 12px;
      margin-left: 8px;
      cursor: pointer;
    }
    
    .ai-assistant-send:hover {
      background-color: #0069d9;
    }
    
    /* Chat message styles */
    .chat-message {
      margin-bottom: 15px;
      max-width: 85%;
      clear: both;
    }
    
    .user-message {
      float: right;
    }
    
    .assistant-message {
      float: left;
    }
    
    .chat-message .message-content {
      padding: 10px 14px;
      border-radius: 12px;
      position: relative;
      display: inline-block;
      max-width: 100%;
    }
    
    .user-message .message-content {
      background-color: #007bff;
      color: white;
      border-bottom-right-radius: 2px;
    }
    
    .assistant-message .message-content {
      background-color: #f1f3f4;
      color: #333;
      border-bottom-left-radius: 2px;
    }
    
    .assistant-message.error .message-content {
      background-color: #f8d7da;
      color: #721c24;
    }
    
    .assistant-message.loading .message-content {
      background-color: #e9ecef;
      color: #495057;
    }
    
    /* Enhanced styles for agent-like responses */
    .assistant-message .badge {
      font-size: 0.7em;
      padding: 2px 5px;
      border-radius: 4px;
      margin-bottom: 5px;
      display: inline-block;
    }
    
    .badge.thinking {
      background-color: #f0ad4e;
      color: white;
    }
    
    .badge.searching {
      background-color: #5bc0de;
      color: white;
    }
    
    .badge.recommending {
      background-color: #5cb85c;
      color: white;
    }
    
    /* Style for loading indicators */
    .typing-indicator {
      display: flex;
      padding: 5px 0;
    }
    
    .typing-indicator span {
      height: 7px;
      width: 7px;
      margin: 0 1px;
      background-color: #6c757d;
      display: block;
      border-radius: 50%;
      opacity: 0.4;
      animation: typing 1s infinite;
    }
    
    .typing-indicator span:nth-child(1) {
      animation-delay: 0s;
    }
    
    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }
    
    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }
    
    @keyframes typing {
      0% {
        opacity: 0.4;
        transform: scale(1);
      }
      50% {
        opacity: 1;
        transform: scale(1.2);
      }
      100% {
        opacity: 0.4;
        transform: scale(1);
      }
    }
    
    /* Table styling for data presentation */
    .message-content table {
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 0.9em;
      width: 100%;
    }
    
    .message-content table th,
    .message-content table td {
      padding: 6px;
      text-align: left;
      border: 1px solid #ddd;
    }
    
    .message-content table th {
      background-color: #f8f9fa;
    }
    
    /* Dark theme adjustments */
    [data-bs-theme="dark"] .ai-assistant-container {
      background-color: #212529;
    }
    
    [data-bs-theme="dark"] .ai-assistant-input-container {
      background-color: #343a40;
      border-top: 1px solid #495057;
    }
    
    [data-bs-theme="dark"] .ai-assistant-input {
      background-color: #495057;
      border-color: #6c757d;
      color: #fff;
    }
    
    [data-bs-theme="dark"] .assistant-message .message-content {
      background-color: #495057;
      color: #fff;
    }
  `;
  
  document.head.appendChild(style);
}

/**
 * Initialize the AI Assistant interface
 */
export function initializeAIAssistant() {
  console.log("Initializing AI Assistant Interface...");
  
  // Chat toggle button
  const chatToggleBtn = document.getElementById('ai-assistant-toggle');
  const chatContainer = document.getElementById('ai-assistant-container');
  
  if (!chatToggleBtn) {
    console.log("AI Assistant toggle button not found");
    return;
  }
  
  if (!chatContainer) {
    console.log("AI Assistant container not found");
    return;
  }
  
  console.log("AI Assistant elements found in DOM");
  
  // Direct approach - remove and re-add event listener to prevent duplicates
  const handleToggleClick = () => {
    console.log("AI Assistant toggle clicked");
    chatContainer.classList.toggle('show');
    
    // If opening the chat, focus the input field
    if (chatContainer.classList.contains('show')) {
      const inputField = document.getElementById('ai-assistant-input');
      if (inputField) {
        inputField.focus();
      }
      
      // Scroll to the bottom of the chat messages
      const chatMessages = document.getElementById('ai-assistant-messages');
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
  };
  
  // Use the technique of removing any existing event listeners (if possible) before adding a new one
  chatToggleBtn.removeEventListener('click', handleToggleClick);
  chatToggleBtn.addEventListener('click', handleToggleClick);
  
  // Force event handler to be on the element itself, not delegated
  chatToggleBtn.onclick = handleToggleClick;
  
  // Close button - use both approaches for maximum compatibility
  const closeButton = document.querySelector('#ai-assistant-container .close-btn');
  if (closeButton) {
    const handleCloseClick = () => {
      console.log("AI Assistant close button clicked");
      chatContainer.classList.remove('show');
    };
    
    closeButton.removeEventListener('click', handleCloseClick);
    closeButton.addEventListener('click', handleCloseClick);
    closeButton.onclick = handleCloseClick;
  }
  
  // Send button and enter key handling
  setupMessageSending();
  
  // Add a global click handler for the chat toggle button
  addGlobalClickHandler();
}

/**
 * Format the AI response for better readability
 * Handles markdown-like syntax and special formatting for data
 * 
 * @param {string} text - The raw response from the AI
 * @returns {string} Formatted HTML
 */
function formatAIResponse(text) {
  if (!text) return '<p>No response received.</p>';
  
  let formatted = escapeHtml(text);
  
  // Convert newlines to <br> tags
  formatted = formatted.replace(/\n/g, '<br>');
  
  // Enhance bold and italic markdown
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Handle simple bullet lists
  formatted = formatted.replace(/(^|\n)- (.+?)(?=\n|$)/g, '$1<li>$2</li>');
  formatted = formatted.replace(/<li>(.+?)<\/li>/g, '<ul><li>$1</li></ul>');
  formatted = formatted.replace(/<\/ul><ul>/g, '');
  
  // Handle numbered lists
  formatted = formatted.replace(/(^|\n)\d+\. (.+?)(?=\n|$)/g, '$1<li>$2</li>');
  formatted = formatted.replace(/<li>(.+?)<\/li>/g, '<ol><li>$1</li></ol>');
  formatted = formatted.replace(/<\/ol><ol>/g, '');
  
  // Handle headings (# Heading)
  formatted = formatted.replace(/(^|\n)# (.+?)(?=\n|$)/g, '$1<h4>$2</h4>');
  formatted = formatted.replace(/(^|\n)## (.+?)(?=\n|$)/g, '$1<h5>$2</h5>');
  
  // Convert URLs to clickable links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
  
  return formatted;
}

/**
 * Add a global click handler for the chat toggle button
 */
function addGlobalClickHandler() {
  document.addEventListener('click', (event) => {
    const toggleButton = document.getElementById('ai-assistant-toggle');
    const chatContainer = document.getElementById('ai-assistant-container');
    
    if (toggleButton && event.target === toggleButton || event.target.closest('#ai-assistant-toggle')) {
      console.log('Global click handler caught AI toggle click');
      if (chatContainer) {
        chatContainer.classList.toggle('show');
        
        // If opening the chat, focus the input field
        if (chatContainer.classList.contains('show')) {
          const inputField = document.getElementById('ai-assistant-input');
          if (inputField) {
            inputField.focus();
          }
          
          // Scroll to the bottom of the chat messages
          const chatMessages = document.getElementById('ai-assistant-messages');
          if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        }
      }
    }
  });
}

/**
 * Set up message sending functionality
 */
function setupMessageSending() {
  const sendButton = document.getElementById('ai-assistant-send');
  const inputField = document.getElementById('ai-assistant-input');
  const chatMessages = document.getElementById('ai-assistant-messages');
  
  if (!sendButton || !inputField || !chatMessages) {
    console.log("AI Assistant message elements not found");
    return;
  }
  
  // Function to send message
  const sendMessage = () => {
    const message = inputField.value.trim();
    if (!message) return;
    
    console.log("Sending message to AI Assistant:", message);
    
    // Clear input field
    inputField.value = '';
    
    // Add user message to chat
    const userMsgElement = document.createElement('div');
    userMsgElement.className = 'chat-message user-message';
    userMsgElement.innerHTML = `
      <div class="message-content">
        <p>${escapeHtml(message)}</p>
      </div>
    `;
    chatMessages.appendChild(userMsgElement);
    
    // Check if this is a language translation request
    if (checkForTranslationRequest(message)) {
      handleTranslationRequest(message, chatMessages);
      return;
    }
    
    // Add loading message with enhanced styling
    const loadingElement = document.createElement('div');
    loadingElement.className = 'chat-message assistant-message loading';
    
    // Check for potential agent-triggering keywords to show proper loading state
    const lowerMessage = message.toLowerCase();
    let loadingContent = '';
    
    if (lowerMessage.includes('report') || 
        lowerMessage.includes('statistics') || 
        lowerMessage.includes('analytics')) {
      loadingContent = `
        <span class="badge searching">Searching Data</span>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <p>I'm searching for platform data...</p>
        </div>
      `;
    } else if (lowerMessage.includes('recommend') || 
               lowerMessage.includes('suggest') || 
               lowerMessage.includes('what to play') ||
               lowerMessage.includes('what should i play')) {
      loadingContent = `
        <span class="badge recommending">Analyzing Preferences</span>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <p>I'm finding games you might enjoy...</p>
        </div>
      `;
    } else if (lowerMessage.includes('translate') || 
               lowerMessage.includes('language') ||
               lowerMessage.includes('translation')) {
      loadingContent = `
        <span class="badge searching">Translation</span>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <p>Processing language request...</p>
        </div>
      `;
    } else {
      loadingContent = `
        <span class="badge thinking">Processing</span>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <p>AI Assistant is thinking...</p>
        </div>
      `;
    }
    
    loadingElement.innerHTML = loadingContent;
    chatMessages.appendChild(loadingElement);
    
    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Disable input until response is received
    inputField.disabled = true;
    sendButton.disabled = true;
    
    // Get user role for context
    let userRole = 'user';
    let userId = '';
    
    // Try to get user data from hidden element
    const userElement = document.querySelector('[data-user-id]');
    if (userElement) {
      userId = userElement.getAttribute('data-user-id');
      const userRoleElement = document.querySelector('[data-user-role]');
      if (userRoleElement) {
        userRole = userRoleElement.getAttribute('data-user-role');
      }
    }
    
    console.log("User context for AI:", { userRole, userId });
    
    // Send request to API
    fetch('/assistant/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, userRole, userId })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      console.log("AI response received:", data);
      
      // Remove loading message
      chatMessages.removeChild(loadingElement);
      
      // Format the response to improve readability
      const formattedResponse = formatAIResponse(data.response);
      
      // Add assistant response
      const assistantMsgElement = document.createElement('div');
      assistantMsgElement.className = 'chat-message assistant-message';
      assistantMsgElement.innerHTML = `
        <div class="message-content">
          ${formattedResponse}
        </div>
      `;
      chatMessages.appendChild(assistantMsgElement);
      
      // Scroll to the bottom
      chatMessages.scrollTop = chatMessages.scrollHeight;
    })
    .catch(error => {
      console.error('Error sending message:', error);
      
      // Remove loading message
      chatMessages.removeChild(loadingElement);
      
      // Add error message
      const errorMsgElement = document.createElement('div');
      errorMsgElement.className = 'chat-message assistant-message error';
      errorMsgElement.innerHTML = `
        <div class="message-content">
          <p>Sorry, I encountered an error. Please try again later.</p>
        </div>
      `;
      chatMessages.appendChild(errorMsgElement);
    })
    .finally(() => {
      // Re-enable input
      inputField.disabled = false;
      sendButton.disabled = false;
      inputField.focus();
    });
  };
  
  // Send button - use both event listener and onclick
  sendButton.removeEventListener('click', sendMessage);
  sendButton.addEventListener('click', sendMessage);
  sendButton.onclick = sendMessage;
  
  // Enter key handler
  inputField.removeEventListener('keypress', null);
  inputField.addEventListener('keypress', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  });
}

/**
 * Check if a message is a language translation request
 * @param {string} message - The user's message
 * @returns {boolean} True if it's a language translation request
 */
function checkForTranslationRequest(message) {
  const lowerMessage = message.toLowerCase();
  
  // Keywords that might indicate a translation request
  const translationKeywords = [
    'translate', 'translation', 'language', 'change language',
    'switch to', 'speak', 'in', 'preferred language'
  ];
  
  // Check if message contains language-related keywords
  const containsKeyword = translationKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Check if the message resembles a language selection prompt response
  const isLanguageSelection = /^[a-z]{2}$/.test(lowerMessage) || // Language code like "fr"
                              /^[a-zA-Z\s]{3,}$/.test(message);  // Language name like "French"
  
  return containsKeyword || isLanguageSelection;
}

/**
 * Handle language translation requests
 * @param {string} message - The user's message
 * @param {HTMLElement} chatMessages - The chat messages container
 */
function handleTranslationRequest(message, chatMessages) {
  // Create a response message element
  const responseElement = document.createElement('div');
  responseElement.className = 'chat-message assistant-message';
  
  const lowerMessage = message.toLowerCase();
  
  // Check if message matches the specific prompt response pattern
  if (lowerMessage.startsWith("what's your preferred language") || 
      lowerMessage.includes("please specify") ||
      lowerMessage.includes("preferred language")) {
    
    // This appears to be the prompt asking for language selection
    responseElement.innerHTML = `
      <div class="message-content">
        <p>Please tell me what language you'd like to use. For example, you can say "Spanish" or "French" or any other language, and I'll help change the page to that language.</p>
      </div>
    `;
    
    chatMessages.appendChild(responseElement);
    return;
  }
  
  // If message appears to be a language selection
  let languageInput = message.trim();
  
  // First show a loading response
  responseElement.innerHTML = `
    <div class="message-content">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
      <p>Processing your language request...</p>
    </div>
  `;
  
  chatMessages.appendChild(responseElement);
  
  // Validate the language with the server
  fetch('/users/validate-language', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ languageInput })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success && data.languageCode) {
      // Update message based on success
      TranslationManager.changeLanguage(data.languageCode);
      
      responseElement.innerHTML = `
        <div class="message-content">
          <p>Great! I'm changing the language to ${data.languageName} (${data.languageCode}). The page will be translated momentarily.</p>
        </div>
      `;
    } else {
      // Language not supported
      responseElement.innerHTML = `
        <div class="message-content">
          <p>I'm sorry, but I couldn't recognize "${escapeHtml(languageInput)}" as a supported language. Please try another language or check the spelling.</p>
          <p>Some examples of supported languages: English, Spanish, French, German, Chinese, Japanese, Arabic, Swahili, etc.</p>
        </div>
      `;
    }
  })
  .catch(error => {
    console.error('Error validating language:', error);
    
    // Show error message
    responseElement.innerHTML = `
      <div class="message-content">
        <p>Sorry, there was an error processing your language request. Please try again later.</p>
      </div>
    `;
  });
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}