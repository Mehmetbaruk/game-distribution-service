/**
 * Main JavaScript file for Game Distribution Service
 * This file imports and initializes all modules
 */

import { escapeHtml, convertTimeToSeconds } from './modules/utils.js';
import { initializeTooltips, setupAutoDismissAlerts } from './modules/uiEnhancements.js';
import { initializeFormValidation } from './modules/formValidation.js';
import { initializeRatingStars } from './modules/ratingStars.js';
import { initializeGameDropdowns, initializePlayTimeValidation, initializeGameAnalytics } from './modules/gameFeatures.js';
import { initializeCommentCounter } from './modules/commentTools.js';
import { initializeTableSorter } from './modules/tableSorter.js';
import { addAIAssistantStyles, initializeAIAssistant } from './modules/aiAssistant.js';
import { initializeMongoDBExplorer } from './modules/mongoDbExplorer.js';
import TranslationManager from './modules/translationManager.js';

/**
 * Initialize all modules
 */
function initializeModules() {
  // Initialize UI enhancements
  uiEnhancements.init();
  
  // Initialize form validation if forms exist
  if (document.querySelector('form')) {
    formValidation.init();
  }
  
  // Initialize game features if on game-related pages
  if (document.querySelector('.game-card') || document.querySelector('.game-detail')) {
    gameFeatures.init();
  }
  
  // Initialize rating stars if ratings exist
  if (document.querySelector('.rating-stars')) {
    ratingStars.init();
  }
  
  // Initialize comment tools if comments exist
  if (document.querySelector('.comments-section')) {
    commentTools.init();
  }
  
  // Initialize utils
  utils.init();
}

/**
 * Set up global event listeners
 */
function setupEventListeners() {
  // Toggle theme between light and dark mode
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Add listeners for global search
  const searchForm = document.getElementById('global-search');
  if (searchForm) {
    searchForm.addEventListener('submit', handleGlobalSearch);
  }
  
  // Add listeners for notification bell
  const notificationBell = document.getElementById('notification-bell');
  if (notificationBell) {
    notificationBell.addEventListener('click', toggleNotifications);
  }
  
  // Handle floating back to top button
  const backToTopButton = document.getElementById('back-to-top');
  if (backToTopButton) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopButton.style.display = 'block';
      } else {
        backToTopButton.style.display = 'none';
      }
    });
    
    backToTopButton.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

/**
 * Setup translation manager
 */
function setupTranslation() {
  // Get user's preferred language from different sources
  const userLang = getUserPreferredLanguage();
  
  console.log(`Detected user preferred language: ${userLang}`);
  
  // Initialize translation manager with user's language
  TranslationManager.init(userLang);
  
  // Translate all static HTML content on the page
  if (userLang !== 'en') {
    TranslationManager.translatePage();
  }
  
  // Set up MutationObserver to handle dynamically added content
  setupDynamicTranslation();
}

/**
 * Get user's preferred language from various sources
 * Priority: 1. URL param, 2. User session, 3. LocalStorage, 4. Browser setting
 * @returns {string} The detected language code
 */
function getUserPreferredLanguage() {
  // Check URL parameters first (highest priority)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('lang')) {
    const langParam = urlParams.get('lang');
    // Validate the language code (this is a simple check, improve as needed)
    if (/^[a-z]{2}(-[A-Z]{2})?$/.test(langParam)) {
      return langParam;
    }
  }
  
  // Check if we have language set in data attribute (from session)
  const htmlLang = document.documentElement.getAttribute('lang');
  if (htmlLang && htmlLang !== 'en') {
    return htmlLang;
  }
  
  // Check localStorage for remembered preference
  const storedLang = localStorage.getItem('preferredLanguage');
  if (storedLang) {
    return storedLang;
  }
  
  // Check browser language settings as fallback
  return navigator.language.split('-')[0] || 'en';
}

/**
 * Set up MutationObserver to translate dynamically added content
 */
function setupDynamicTranslation() {
  // Don't setup observer if user prefers English
  if (TranslationManager.currentLanguage === 'en') {
    return;
  }
  
  // Create a new MutationObserver
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only process if nodes were added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          // Only process element nodes (nodeType 1)
          if (node.nodeType === 1) {
            // Process the new element
            TranslationManager.translateElement(node);
          }
        });
      }
    }
  });
  
  // Start observing the document body for added nodes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing Game Distribution Service modules...');
  
  // Initialize modules
  initializeModules();
  
  // Set up global event listeners
  setupEventListeners();
  
  // Setup translation manager with user's preferred language
  setupTranslation();
  
  // Initialize AI Assistant with delay to ensure all DOM elements are ready
  setTimeout(() => {
    addAIAssistantStyles();
    initializeAIAssistant();
  }, 500);
  
  // Initialize MongoDB Explorer for Admin Dashboard
  initializeMongoDBExplorer();

  console.log('All modules initialized successfully!');
});