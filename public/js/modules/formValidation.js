/**
 * Form validation functionality for Game Distribution Service
 */

/**
 * Initialize form validation for all forms with 'needs-validation' class
 */
export function initializeFormValidation() {
  const forms = document.querySelectorAll('.needs-validation');
  Array.prototype.slice.call(forms).forEach(function(form) {
    form.addEventListener('submit', function(event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    }, false);
  });
}