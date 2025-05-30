/**
 * UI enhancement functionality for Game Distribution Service
 * Handles tooltips, alerts, and other basic UI interactions
 */

/**
 * Initialize Bootstrap tooltips
 */
export function initializeTooltips() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Add tooltips to various interactive elements that might be added after initial load
  const additionalTooltipTriggers = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  if (additionalTooltipTriggers.length > 0) {
    const additionalTooltips = [...additionalTooltipTriggers].map(tooltipTriggerEl => 
      new bootstrap.Tooltip(tooltipTriggerEl));
  }
}

/**
 * Set up auto-dismissing alerts
 * @param {number} timeout - Time in ms before alerts are dismissed
 */
export function setupAutoDismissAlerts(timeout = 5000) {
  setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(function(alert) {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    });
  }, timeout);
}
