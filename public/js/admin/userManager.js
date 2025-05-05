/**
 * Admin User Manager
 * Handles user management operations with real-time updates
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize event listeners for user deletion buttons
  initUserDeleteButtons();
  
  // If we're on the admin dashboard, also hook into tab changes
  $('#users-tab').on('click', function() {
    // Make sure our delete buttons are initialized when tab is activated
    initUserDeleteButtons();
  });
});

/**
 * Initialize event handlers for user deletion buttons
 */
function initUserDeleteButtons() {
  // Find all user delete forms and attach our custom handler
  document.querySelectorAll('.user-delete-form').forEach(form => {
    // Remove any existing listener to avoid duplicates
    form.removeEventListener('submit', handleUserDelete);
    // Add the event listener
    form.addEventListener('submit', handleUserDelete);
  });
}

/**
 * Handle user deletion via AJAX instead of form submission
 * @param {Event} event - Form submission event
 */
function handleUserDelete(event) {
  event.preventDefault();
  
  if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
    return;
  }
  
  const form = event.target;
  const userId = form.getAttribute('data-user-id');
  const url = form.action;
  
  // Show loading state
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnHTML = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  
  // Send AJAX request to delete the user
  fetch(url, {
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest'
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('Server returned ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete user');
      }
      
      // Show success notification
      showAdminNotification('User deleted successfully', 'success');
      
      // Remove the user row from the table
      const userRow = form.closest('tr');
      userRow.style.backgroundColor = '#ffcccc';
      
      // Fade out and remove after animation
      setTimeout(() => {
        userRow.style.opacity = '0';
        setTimeout(() => {
          userRow.remove();
          
          // Update game statistics if available
          if (data.updatedGames && Array.isArray(data.updatedGames)) {
            updateGameStatistics(data.updatedGames);
          }
          
          // If there are no more users, show "No users found" message
          const userTable = document.querySelector('#users-tab table tbody');
          if (userTable && userTable.querySelectorAll('tr').length === 0) {
            userTable.innerHTML = '<tr><td colspan="5" class="text-center py-4">No users found</td></tr>';
          }
        }, 300);
      }, 100);
      
    })
    .catch(error => {
      console.error('Error deleting user:', error);
      showAdminNotification('Error deleting user: ' + error.message, 'danger');
      
      // Restore button state
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHTML;
    });
}

/**
 * Update game statistics in the games tab after user deletion
 * @param {Array} updatedGames - Array of updated game objects with IDs and new stats
 */
function updateGameStatistics(updatedGames) {
  // Skip if no games were updated
  if (!updatedGames || updatedGames.length === 0) return;
  
  // Get the games table if it exists
  const gamesTable = document.querySelector('#games-tab table tbody');
  if (!gamesTable) return;
  
  // Update each game row
  updatedGames.forEach(game => {
    const gameRow = document.querySelector(`tr[data-game-id="${game._id}"]`);
    if (gameRow) {
      // Update play time with formatted time string
      const playTimeCell = gameRow.querySelector('.game-play-time');
      if (playTimeCell) {
        // Calculate formatted play time display using the single source of truth
        const totalSeconds = game.totalPlayTimeSeconds || (game.totalPlayTime * 3600) || 0;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        let timeStr = '';
        if (hours > 0) {
          timeStr = `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
          timeStr = `${minutes}m ${seconds}s`;
        } else {
          timeStr = `${seconds}s`;
        }
        
        playTimeCell.textContent = timeStr;
      }
      
      // Update player count if available
      const playerCountCell = gameRow.querySelector('.game-player-count');
      if (playerCountCell && game.uniquePlayers !== undefined) {
        playerCountCell.textContent = game.uniquePlayers;
      }
      
      // Briefly highlight the row to show it was updated
      gameRow.style.transition = 'background-color 1s';
      gameRow.style.backgroundColor = '#ffffcc';
      setTimeout(() => {
        gameRow.style.backgroundColor = '';
      }, 2000);
    }
  });
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