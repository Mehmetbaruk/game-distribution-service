/**
 * Table sorting functionality for Game Distribution Service
 * Makes tables sortable by clicking on column headers
 */

import { convertTimeToSeconds } from './utils.js';

/**
 * Initialize sorting functionality for tables
 * @param {string} tableSelector - CSS selector to identify tables to be made sortable
 */
export function initializeTableSorter(tableSelector = '.modal .table') {
  try {
    const tables = document.querySelectorAll(tableSelector);
    
    // Apply table sorting to matching tables
    tables.forEach(table => {
      tableSorter(table);
    });
  } catch (error) {
    console.error('Error setting up table sorting:', error);
  }
}

/**
 * Apply sorting functionality to a specific table element
 * @param {HTMLElement} tableEl - The table element to make sortable
 */
function tableSorter(tableEl) {
  const thead = tableEl.querySelector('thead');
  const tbody = tableEl.querySelector('tbody');
  const thList = thead.querySelectorAll('th');
  
  thList.forEach((th, colIndex) => {
    if (th.textContent === '#') return; // Skip the index column
    
    // Skip if it's not sortable
    if (!th.classList.contains('sortable')) return;
    
    th.style.cursor = 'pointer';
    th.title = 'Click to sort';
    
    // Add sort indicator if it doesn't exist
    if (!th.querySelector('.sort-indicator')) {
      const text = th.innerHTML.replace(/<i class="fas fa-sort"><\/i>/, '').trim();
      th.innerHTML = `${text} <span class="sort-indicator ms-1">↕️</span>`;
    }
    
    th.addEventListener('click', () => {
      const isAscending = th.getAttribute('data-sort-dir') === 'asc';
      
      // Reset all headers
      thList.forEach(header => {
        header.setAttribute('data-sort-dir', '');
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) indicator.textContent = '↕️';
      });
      
      // Set the current header sort direction
      th.setAttribute('data-sort-dir', isAscending ? 'desc' : 'asc');
      const indicator = th.querySelector('.sort-indicator');
      if (indicator) indicator.textContent = isAscending ? '↓' : '↑';
      
      // Get all rows and convert to array for sorting
      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      // Sort rows based on column content
      rows.sort((rowA, rowB) => {
        const cellA = rowA.querySelectorAll('td')[colIndex];
        const cellB = rowB.querySelectorAll('td')[colIndex];
        
        if (!cellA || !cellB) return 0;
        
        // Check if it's a playtime cell with data-seconds attribute
        if (cellA.classList.contains('playtime-cell') && cellB.classList.contains('playtime-cell')) {
          const secondsA = parseInt(cellA.getAttribute('data-seconds') || '0', 10);
          const secondsB = parseInt(cellB.getAttribute('data-seconds') || '0', 10);
          return isAscending ? secondsA - secondsB : secondsB - secondsA;
        }
        // Special handling for play time format (e.g. "2h 30m 15s")
        else if (cellA.textContent.includes('h') || cellA.textContent.includes('m') || cellA.textContent.includes('s')) {
          const valueA = convertTimeToSeconds(cellA.textContent.trim());
          const valueB = convertTimeToSeconds(cellB.textContent.trim());
          return isAscending ? valueA - valueB : valueB - valueA;
        }
        // Handle numeric values
        else if (!isNaN(cellA.textContent.trim()) && !isNaN(cellB.textContent.trim())) {
          return isAscending 
            ? parseFloat(cellA.textContent.trim()) - parseFloat(cellB.textContent.trim())
            : parseFloat(cellB.textContent.trim()) - parseFloat(cellA.textContent.trim());
        }
        // Default string comparison
        else {
          return isAscending 
            ? cellA.textContent.trim().localeCompare(cellB.textContent.trim())
            : cellB.textContent.trim().localeCompare(cellA.textContent.trim());
        }
      });
      
      // Remove all rows from table
      while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
      }
      
      // Add sorted rows back to table
      rows.forEach(row => tbody.appendChild(row));
    });
  });
}