/**
 * Translation Manager Module
 * Handles client-side translation functionality using server-side MongoDB caching
 */

class TranslationManager {
  constructor() {
    this.currentLanguage = 'en';
    this.baseLanguage = 'en';
    this.pendingTranslations = 0;
    this.pageKey = window.location.pathname.replace(/\//g, '_');
    this.translationCache = {}; // Local in-memory cache
  }

  /**
   * Initialize the translation manager
   * @param {string} initialLanguage - Initial language to use
   * @param {string} baseLanguage - Base language of the application
   */
  init(initialLanguage = 'en', baseLanguage = 'en') {
    // Set current and base languages
    this.currentLanguage = initialLanguage;
    this.baseLanguage = baseLanguage;
    
    // Get saved language preference from localStorage if available
    const savedLanguage = localStorage.getItem('preferred_language');
    if (savedLanguage) {
      this.currentLanguage = savedLanguage;
    }
    
    // Add language selector event listeners
    this._addLanguageSelectorListeners();
    
    // Log initialization
    console.log(`[Translation] Initialized with language: ${this.currentLanguage}`);
    
    // Initial page translation
    this.translatePage();
  }

  /**
   * Set up language selector event listeners
   * @private
   */
  _addLanguageSelectorListeners() {
    document.addEventListener('DOMContentLoaded', () => {
      const languageSelectors = document.querySelectorAll('[data-language-selector]');
      
      languageSelectors.forEach(selector => {
        selector.addEventListener('change', (event) => {
          const newLanguage = event.target.value;
          this.setLanguage(newLanguage);
        });
        
        // Set the current value
        if (selector.tagName === 'SELECT') {
          selector.value = this.currentLanguage;
        }
      });
      
      // Also listen for language change buttons
      const languageButtons = document.querySelectorAll('[data-language]');
      languageButtons.forEach(button => {
        button.addEventListener('click', (event) => {
          const newLanguage = button.getAttribute('data-language');
          this.setLanguage(newLanguage);
          // Toggle active state on buttons
          languageButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          event.preventDefault();
        });
        
        // Set active state on current language button
        if (button.getAttribute('data-language') === this.currentLanguage) {
          button.classList.add('active');
        }
      });
    });
  }

  /**
   * Change the current language and translate the page
   * @param {string} language - New language code
   */
  setLanguage(language) {
    if (this.currentLanguage === language) return;
    
    console.log(`[Translation] Changing language from ${this.currentLanguage} to ${language}`);
    this.currentLanguage = language;
    localStorage.setItem('preferred_language', language);
    
    // Update language selectors
    const languageSelectors = document.querySelectorAll('[data-language-selector]');
    languageSelectors.forEach(selector => {
      if (selector.tagName === 'SELECT') {
        selector.value = language;
      }
    });
    
    // Update active state on language buttons
    const languageButtons = document.querySelectorAll('[data-language]');
    languageButtons.forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-language') === language);
    });
    
    // Translate the page
    this.translatePage();
    
    // Dispatch language change event for other components
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
  }

  /**
   * Translate the current page
   */
  translatePage() {
    if (this.currentLanguage === this.baseLanguage) {
      // Reset to original text if switching back to base language
      this._resetToOriginalText();
      return;
    }

    // Show loading indicator if there are many elements
    const elementsToTranslate = document.querySelectorAll('[data-i18n]');
    if (elementsToTranslate.length > 10) {
      this._showTranslationLoading();
    }
    
    // Prepare elements for bulk translation
    const elementsMap = {};
    elementsToTranslate.forEach(element => {
      const key = element.getAttribute('data-i18n') || element.textContent.trim();
      // Store original text if not already stored
      if (!element.hasAttribute('data-original')) {
        element.setAttribute('data-original', element.textContent.trim());
      }
      elementsMap[key] = element.getAttribute('data-original');
    });
    
    // Check if we have these translations in local cache
    if (this._areTranslationsInLocalCache(elementsMap, this.currentLanguage)) {
      this._applyLocalCacheTranslations(elementsMap, this.currentLanguage);
      this._hideTranslationLoading();
      return;
    }
    
    // Request translations from server
    this._translatePageElements(elementsMap, this.currentLanguage);
  }

  /**
   * Reset elements to their original text
   * @private
   */
  _resetToOriginalText() {
    const elements = document.querySelectorAll('[data-i18n][data-original]');
    elements.forEach(element => {
      element.textContent = element.getAttribute('data-original');
    });
  }

  /**
   * Check if we have all needed translations in local cache
   * @param {Object} elements - Map of element keys to text
   * @param {string} language - Language to check for
   * @returns {boolean} Whether all translations are in local cache
   * @private
   */
  _areTranslationsInLocalCache(elements, language) {
    if (!this.translationCache[language]) return false;
    
    for (const key in elements) {
      if (!this.translationCache[language][key]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Apply translations from local cache
   * @param {Object} elements - Map of element keys to text
   * @param {string} language - Language to apply
   * @private
   */
  _applyLocalCacheTranslations(elements, language) {
    console.log('[Translation] Using local cache for translations');
    
    for (const key in elements) {
      const translatedText = this.translationCache[language][key];
      this._updateElementWithTranslation(key, translatedText);
    }
  }

  /**
   * Update element with translated text
   * @param {string} key - Element key or selector
   * @param {string} translatedText - Translated text to apply
   * @private
   */
  _updateElementWithTranslation(key, translatedText) {
    if (!translatedText) return;
    
    // Find elements with matching data-i18n or original text
    const elements = document.querySelectorAll(`[data-i18n="${key}"], [data-original="${key}"]`);
    
    elements.forEach(element => {
      // For inputs, update placeholder or value
      if (element.tagName === 'INPUT') {
        if (element.getAttribute('data-i18n-attr') === 'placeholder') {
          element.placeholder = translatedText;
        } else {
          element.value = translatedText;
        }
      }
      // For elements with HTML attribute specified
      else if (element.getAttribute('data-i18n-attr')) {
        const attr = element.getAttribute('data-i18n-attr');
        element.setAttribute(attr, translatedText);
      }
      // Default: update text content
      else {
        element.textContent = translatedText;
      }
    });
  }

  /**
   * Get translations from server and apply them to the page
   * @param {Object} elements - Map of element keys to text
   * @param {string} language - Target language
   * @private
   */
  _translatePageElements(elements, language) {
    console.log(`[Translation] Requesting translations from server for ${Object.keys(elements).length} elements`);
    
    // Prepare data for bulk translation API
    const textsToTranslate = Object.values(elements).filter(text => text);
    const keysToTranslate = Object.keys(elements).filter(key => elements[key]);
    
    this.pendingTranslations++;
    
    // Make API request to server
    fetch('/api/translate/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: textsToTranslate,
        sourceLanguage: this.baseLanguage,
        targetLanguage: language,
        pageKey: this.pageKey
      })
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || 'Translation failed');
      }
      
      // Create local cache for this language if it doesn't exist
      if (!this.translationCache[language]) {
        this.translationCache[language] = {};
      }
      
      // Apply translations to elements and update cache
      data.translatedTexts.forEach((translatedText, index) => {
        const key = keysToTranslate[index];
        this.translationCache[language][key] = translatedText;
        this._updateElementWithTranslation(key, translatedText);
      });
      
      console.log(`[Translation] Applied ${data.translatedTexts.length} translations`);
      this._hideTranslationLoading();
      this.pendingTranslations--;
    })
    .catch(error => {
      console.error('[Translation] Error:', error);
      this._hideTranslationLoading();
      this.pendingTranslations--;
      
      // Show error notification if available
      if (window.showNotification) {
        window.showNotification('Translation error: ' + error.message, 'error');
      }
    });
  }

  /**
   * Translate a single text element
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Optional target language (defaults to current)
   * @returns {Promise<string>} Promise resolving to translated text
   */
  async translateText(text, targetLanguage = null) {
    if (!text) return '';
    
    const language = targetLanguage || this.currentLanguage;
    if (language === this.baseLanguage) return text;
    
    // Check local cache first
    if (this.translationCache[language] && this.translationCache[language][text]) {
      return this.translationCache[language][text];
    }
    
    try {
      const response = await fetch('/api/translate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLanguage: this.baseLanguage,
          targetLanguage: language
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Translation failed');
      }
      
      // Cache the translation
      if (!this.translationCache[language]) {
        this.translationCache[language] = {};
      }
      this.translationCache[language][text] = data.translatedText;
      
      return data.translatedText;
    } catch (error) {
      console.error('[Translation] Error translating text:', error);
      return text; // Fall back to original text on error
    }
  }

  /**
   * Show loading indicator for translations
   * @private
   */
  _showTranslationLoading() {
    // Create or show loading indicator
    let loadingIndicator = document.getElementById('translation-loading-indicator');
    
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'translation-loading-indicator';
      loadingIndicator.className = 'translation-loading';
      loadingIndicator.innerHTML = '<div class="spinner"></div><span>Translating...</span>';
      document.body.appendChild(loadingIndicator);
      
      // Add styling
      const style = document.createElement('style');
      style.textContent = `
        .translation-loading {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 8px 15px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          z-index: 9999;
          font-size: 14px;
        }
        .translation-loading .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          margin-right: 10px;
          animation: translation-spin 1s ease-in-out infinite;
        }
        @keyframes translation-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    loadingIndicator.style.display = 'flex';
  }

  /**
   * Hide translation loading indicator
   * @private
   */
  _hideTranslationLoading() {
    // Only hide if no pending translations
    if (this.pendingTranslations <= 1) {
      const loadingIndicator = document.getElementById('translation-loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
    }
  }
  
  /**
   * Get translation statistics from the server
   * @returns {Promise<Object>} Promise resolving to statistics object
   */
  async getTranslationStats() {
    try {
      const response = await fetch('/api/translate/stats');
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to get translation stats');
      }
      
      return data.stats;
    } catch (error) {
      console.error('[Translation] Error getting stats:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
const translationManager = new TranslationManager();
export default translationManager;