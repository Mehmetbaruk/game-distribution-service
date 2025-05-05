/**
 * Comment tools functionality for Game Distribution Service
 * Handles comment interactions like character counting
 */

/**
 * Initialize comment character counter
 * @param {number} maxLength - Maximum comment length
 */
export function initializeCommentCounter(maxLength = 500) {
  const commentTextarea = document.getElementById('comment');
  if (commentTextarea) {
    // Create and add counter element
    const counter = document.createElement('small');
    counter.classList.add('text-muted', 'float-end');
    counter.textContent = `0/${maxLength} characters`;
    commentTextarea.parentNode.appendChild(counter);

    commentTextarea.addEventListener('input', function() {
      const remaining = this.value.length;
      counter.textContent = `${remaining}/${maxLength} characters`;
      
      if (remaining > maxLength) {
        counter.classList.add('text-danger');
      } else {
        counter.classList.remove('text-danger');
      }
    });
  }
}