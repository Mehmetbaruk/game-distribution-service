/**
 * Admin Translation Manager
 * Handles admin interface for the MongoDB-based translation system
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize translation manager when translations tab is active
  $('#translations-tab').on('click', function() {
    loadTranslationStats();
    loadTranslations();
  });
  
  // Translation tools event handlers
  $('#translateButton').on('click', translateText);
  $('#copyTranslation').on('click', copyTranslationToClipboard);
  $('#clearTranslation').on('click', clearTranslationForm);
  $('#refreshTranslations').on('click', loadTranslations);
  $('#cleanupTranslations').on('click', cleanupTranslations);
  $('#exportTranslations').on('click', exportTranslations);
  
  // Translation filter handlers
  $('#translationSourceFilter, #translationTargetFilter').on('change', loadTranslations);
  $('#translationSearchBtn').on('click', loadTranslations);
  $('#translationSearch').on('keypress', function(e) {
    if (e.which === 13) {
      loadTranslations();
      e.preventDefault();
    }
  });
});

/**
 * Load translation statistics from the server
 */
function loadTranslationStats() {
  console.log('Loading translation statistics');
  
  fetch('/api/translate/stats')
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        showAdminNotification('Error loading statistics', 'danger');
        console.error('Error loading statistics:', data.message);
        return;
      }
      
      const stats = data.stats;
      
      // Update statistics cards
      $('#total-translations').text(stats.totalTranslations || 0);
      $('#total-languages').text(stats.languageCount || 0);
      $('#cache-hit-rate').text(`${stats.cacheHitRate || 0}%`);
      $('#api-calls-today').text(stats.apiCallsToday || 0);
      
      // Generate chart if Chart.js is available
      if (window.Chart && stats.dailyStats) {
        generateTranslationChart(stats.dailyStats);
      }
    })
    .catch(error => {
      console.error('Error fetching translation statistics:', error);
      showAdminNotification('Failed to load statistics', 'danger');
    });
}

/**
 * Generate chart for translation statistics
 * @param {Array} dailyStats - Array of daily statistics
 */
function generateTranslationChart(dailyStats) {
  const ctx = document.getElementById('translation-stats-chart').getContext('2d');
  
  // Destroy existing chart if any
  if (window.translationChart) {
    window.translationChart.destroy();
  }
  
  // Prepare data for chart
  const labels = dailyStats.map(day => day.date);
  const apiCallsData = dailyStats.map(day => day.apiCalls);
  const cacheHitsData = dailyStats.map(day => day.cacheHits);
  
  // Create new chart
  window.translationChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'API Calls',
          data: apiCallsData,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderWidth: 2,
          tension: 0.3
        },
        {
          label: 'Cache Hits',
          data: cacheHitsData,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderWidth: 2,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Translation Activity (Last 7 Days)'
        },
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

/**
 * Load translations from the MongoDB collection
 */
function loadTranslations() {
  // Show loading state
  $('#translationsTable tbody').html('<tr class="loading-placeholder"><td colspan="7" class="text-center">Loading translations...</td></tr>');
  
  // Get filter values
  const sourceLanguage = $('#translationSourceFilter').val();
  const targetLanguage = $('#translationTargetFilter').val();
  const searchQuery = $('#translationSearch').val().trim();
  
  // Build query parameters
  const params = new URLSearchParams({
    page: 1,
    limit: 20
  });
  
  if (sourceLanguage !== 'all') {
    params.append('sourceLanguage', sourceLanguage);
  }
  
  if (targetLanguage !== 'all') {
    params.append('targetLanguage', targetLanguage);
  }
  
  if (searchQuery) {
    params.append('search', searchQuery);
  }
  
  // Fetch translations from MongoDB collection
  fetch(`/api/collections/translations?${params.toString()}`)
    .then(response => response.json())
    .then(data => {
      if (!data.success || !data.documents) {
        throw new Error(data.error || 'Failed to load translations');
      }
      
      if (!data.documents.length) {
        $('#translationsTable tbody').html('<tr><td colspan="7" class="text-center">No translations found</td></tr>');
        $('#translationsPagination').empty();
        return;
      }
      
      // Render translations
      renderTranslationsTable(data.documents);
      
      // Render pagination if count is available
      if (data.count) {
        const totalPages = Math.ceil(data.count / 20);
        renderPagination(1, totalPages);
      }
    })
    .catch(error => {
      console.error('Error loading translations:', error);
      $('#translationsTable tbody').html(`<tr><td colspan="7" class="text-center text-danger">Error: ${error.message || 'Failed to load translations'}</td></tr>`);
      $('#translationsPagination').empty();
      showAdminNotification('Failed to load translations', 'danger');
    });
}

/**
 * Render translations table with fetched data
 * @param {Array} translations - Array of translation documents
 */
function renderTranslationsTable(translations) {
  const tbody = $('#translationsTable tbody');
  tbody.empty();
  
  translations.forEach(translation => {
    const row = $('<tr></tr>');
    
    // Truncate long text for display
    const sourceTextTruncated = truncateText(translation.sourceText, 30);
    const translatedTextTruncated = truncateText(translation.translatedText, 30);
    
    // Format date
    const lastUsed = translation.lastUsed ? 
      new Date(translation.lastUsed).toLocaleDateString() : 
      'N/A';
    
    row.append(`<td title="${escapeHtml(translation.sourceText)}">${escapeHtml(sourceTextTruncated)}</td>`);
    row.append(`<td title="${escapeHtml(translation.translatedText)}">${escapeHtml(translatedTextTruncated)}</td>`);
    row.append(`<td>${translation.sourceLanguage}</td>`);
    row.append(`<td>${translation.targetLanguage}</td>`);
    row.append(`<td>${translation.usageCount || 0}</td>`);
    row.append(`<td>${lastUsed}</td>`);
    
    // Actions column
    const actions = $('<td></td>');
    
    const editBtn = $('<button class="btn btn-sm btn-outline-primary mr-1" title="Edit translation"><i class="fas fa-edit"></i></button>');
    editBtn.on('click', () => openEditModal(translation));
    
    const deleteBtn = $('<button class="btn btn-sm btn-outline-danger" title="Delete translation"><i class="fas fa-trash"></i></button>');
    deleteBtn.on('click', () => deleteTranslation(translation._id));
    
    actions.append(editBtn);
    actions.append(deleteBtn);
    row.append(actions);
    
    tbody.append(row);
  });
}

/**
 * Render pagination controls
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 */
function renderPagination(currentPage, totalPages) {
  const pagination = $('#translationsPagination');
  pagination.empty();
  
  // First page button
  const firstBtn = $(`<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" aria-label="First">
      <span aria-hidden="true">&laquo;&laquo;</span>
    </a>
  </li>`);
  
  if (currentPage !== 1) {
    firstBtn.on('click', () => goToPage(1));
  }
  
  // Previous button
  const prevBtn = $(`<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" aria-label="Previous">
      <span aria-hidden="true">&laquo;</span>
    </a>
  </li>`);
  
  if (currentPage !== 1) {
    prevBtn.on('click', () => goToPage(currentPage - 1));
  }
  
  pagination.append(firstBtn);
  pagination.append(prevBtn);
  
  // Page numbers
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = $(`<li class="page-item ${i === currentPage ? 'active' : ''}">
      <a class="page-link" href="#">${i}</a>
    </li>`);
    
    if (i !== currentPage) {
      pageBtn.on('click', () => goToPage(i));
    }
    
    pagination.append(pageBtn);
  }
  
  // Next button
  const nextBtn = $(`<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
    <a class="page-link" href="#" aria-label="Next">
      <span aria-hidden="true">&raquo;</span>
    </a>
  </li>`);
  
  if (currentPage !== totalPages) {
    nextBtn.on('click', () => goToPage(currentPage + 1));
  }
  
  // Last page button
  const lastBtn = $(`<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
    <a class="page-link" href="#" aria-label="Last">
      <span aria-hidden="true">&raquo;&raquo;</span>
    </a>
  </li>`);
  
  if (currentPage !== totalPages) {
    lastBtn.on('click', () => goToPage(totalPages));
  }
  
  pagination.append(nextBtn);
  pagination.append(lastBtn);
}

/**
 * Navigate to a specific page of translations
 * @param {number} page - Page number to navigate to
 */
function goToPage(page) {
  // TODO: Implement pagination navigation
  console.log(`Navigate to page: ${page}`);
  // For now, we'll just reload the first page
  loadTranslations();
}

/**
 * Translate text using the API
 */
function translateText() {
  const text = $('#translationText').val().trim();
  if (!text) {
    showAdminNotification('Please enter text to translate', 'warning');
    return;
  }
  
  const sourceLanguage = $('#sourceLanguage').val();
  const targetLanguage = $('#targetLanguage').val();
  
  // Show loading state
  $('#translationResult').val('Translating...');
  $('#translationSource').text('Source: Loading...');
  
  // Request translation from API
  fetch('/api/translate/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      sourceLanguage,
      targetLanguage
    })
  })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || 'Translation failed');
      }
      
      // Update UI with translation
      $('#translationResult').val(data.translatedText);
      $('#translationSource').text('Source: AI Translation API');
    })
    .catch(error => {
      console.error('Translation error:', error);
      $('#translationResult').val('Error: ' + error.message);
      $('#translationSource').text('Source: Error');
      showAdminNotification('Translation failed: ' + error.message, 'danger');
    });
}

/**
 * Copy translation result to clipboard
 */
function copyTranslationToClipboard() {
  const translationText = $('#translationResult').val();
  if (!translationText) {
    showAdminNotification('No translation to copy', 'warning');
    return;
  }
  
  // Use clipboard API if available
  if (navigator.clipboard) {
    navigator.clipboard.writeText(translationText)
      .then(() => {
        showAdminNotification('Translation copied to clipboard', 'success');
      })
      .catch(err => {
        console.error('Could not copy text:', err);
        showAdminNotification('Failed to copy to clipboard', 'danger');
      });
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = translationText;
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      showAdminNotification(successful ? 
        'Translation copied to clipboard' : 
        'Failed to copy to clipboard', 
        successful ? 'success' : 'danger');
    } catch (err) {
      console.error('Could not copy text:', err);
      showAdminNotification('Failed to copy to clipboard', 'danger');
    }
    
    document.body.removeChild(textArea);
  }
}

/**
 * Clear translation form
 */
function clearTranslationForm() {
  $('#translationText').val('');
  $('#translationResult').val('');
  $('#translationSource').text('Source: Not translated yet');
}

/**
 * Open modal to edit a translation
 * @param {Object} translation - Translation object to edit
 */
function openEditModal(translation) {
  // TODO: Implement edit modal functionality
  console.log('Edit translation:', translation);
  showAdminNotification('Edit functionality coming soon', 'info');
}

/**
 * Delete a translation from the database
 * @param {string} id - MongoDB ID of the translation to delete
 */
function deleteTranslation(id) {
  // TODO: Implement delete functionality
  console.log('Delete translation:', id);
  showAdminNotification('Delete functionality coming soon', 'info');
}

/**
 * Cleanup old translations from the database
 */
function cleanupTranslations() {
  if (!confirm('This will remove unused and old translations from the database. Continue?')) {
    return;
  }
  
  fetch('/api/translate/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ olderThanDays: 90 })
  })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || 'Cleanup failed');
      }
      
      showAdminNotification(data.message || 'Translations cleanup complete', 'success');
      loadTranslations();
      loadTranslationStats();
    })
    .catch(error => {
      console.error('Cleanup error:', error);
      showAdminNotification('Cleanup failed: ' + error.message, 'danger');
    });
}

/**
 * Export translations to a CSV file
 */
function exportTranslations() {
  // TODO: Implement export functionality
  console.log('Export translations');
  showAdminNotification('Export functionality coming soon', 'info');
}

/**
 * Helper function to show admin notifications
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, info, warning, danger)
 */
function showAdminNotification(message, type = 'info') {
  if (window.showNotification) {
    window.showNotification(message, type);
  } else {
    alert(`${type.toUpperCase()}: ${message}`);
  }
}

/**
 * Helper function to truncate long text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Helper function to escape HTML
 * @param {string} unsafe - Unsafe text
 * @returns {string} Safe text
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}