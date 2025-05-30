/**
 * Shared utility functions for Game Distribution Service
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} unsafe - The unsafe string that might contain HTML
 * @return {string} - The escaped safe string
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Converts a time string like "2h 30m 15s" to seconds
 * @param {string} timeStr - Time string to convert
 * @return {number} - Total seconds
 */
function convertTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  
  let seconds = 0;
  let remainingStr = timeStr.toString();
  
  if (remainingStr.includes('h')) {
    const hours = parseInt(remainingStr.split('h')[0].trim());
    if (!isNaN(hours)) seconds += hours * 3600;
    remainingStr = remainingStr.split('h')[1] || '';
  }
  
  if (remainingStr.includes('m')) {
    const minutes = parseInt(remainingStr.split('m')[0].trim());
    if (!isNaN(minutes)) seconds += minutes * 60;
    remainingStr = remainingStr.split('m')[1] || '';
  }
  
  if (remainingStr.includes('s')) {
    const secs = parseInt(remainingStr.split('s')[0].trim());
    if (!isNaN(secs)) seconds += secs;
  }
  
  return seconds;
}

// Make functions available globally
window.utils = {
  escapeHtml: escapeHtml,
  convertTimeToSeconds: convertTimeToSeconds
};
