/**
 * Game features functionality for Game Distribution Service
 * Handles game-related interactions
 */

/**
 * Initialize dropdown enhancement for game selection
 */
export function initializeGameDropdowns() {
  const gameDropdowns = document.querySelectorAll('select[name="gameId"]');
  if (gameDropdowns.length > 0) {
    gameDropdowns.forEach(dropdown => {
      dropdown.addEventListener('change', function() {
        // You could add AJAX functionality here to load game details
        console.log('Selected game ID:', this.value);
      });
    });
  }
}

/**
 * Initialize play time input validation
 */
export function initializePlayTimeValidation() {
  const playTimeInput = document.getElementById('playTime');
  if (playTimeInput) {
    playTimeInput.addEventListener('input', function() {
      const value = parseInt(this.value, 10);
      if (value < 1) {
        this.value = 1;
      }
    });
  }
}

/**
 * Initialize game analytics interactive features
 */
export function initializeGameAnalytics() {
  // Make progress bars in rating distribution clickable
  const ratingProgressBars = document.querySelectorAll('.rating-progress');
  if (ratingProgressBars) {
    ratingProgressBars.forEach(bar => {
      bar.style.cursor = 'pointer';
      bar.addEventListener('click', (e) => {
        const rating = bar.getAttribute('data-rating');
        const modalId = `#ratingUsersModal${rating}`;
        const modal = new bootstrap.Modal(document.querySelector(modalId));
        modal.show();
      });
    });
  }
}