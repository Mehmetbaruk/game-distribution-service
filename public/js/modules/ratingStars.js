/**
 * Rating stars functionality for Game Distribution Service
 * Handles the interactive star rating system
 */

/**
 * Initialize rating stars interaction
 */
export function initializeRatingStars() {
  const ratingInputs = document.querySelectorAll('input[name="rating"]');
  if (ratingInputs.length > 0) {
    ratingInputs.forEach(input => {
      input.addEventListener('change', function() {
        const value = this.value;
        ratingInputs.forEach(inp => {
          const label = inp.nextElementSibling;
          if (label) {
            if (inp.value <= value) {
              label.classList.add('text-warning');
            } else {
              label.classList.remove('text-warning');
            }
          }
        });
      });
    });
  }

  // Add hover effect to rating progress bars
  const ratingStarsButtons = document.querySelectorAll('.rating-stars-btn');
  if (ratingStarsButtons) {
    ratingStarsButtons.forEach(button => {
      button.addEventListener('mouseover', () => {
        const rating = button.getAttribute('data-rating');
        const progressBar = document.querySelector(`.rating-progress[data-rating="${rating}"]`);
        if (progressBar) {
          progressBar.classList.add('bg-light');
        }
      });
      
      button.addEventListener('mouseout', () => {
        const rating = button.getAttribute('data-rating');
        const progressBar = document.querySelector(`.rating-progress[data-rating="${rating}"]`);
        if (progressBar) {
          progressBar.classList.remove('bg-light');
        }
      });
    });
  }
}