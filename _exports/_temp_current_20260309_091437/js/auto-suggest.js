// Auto-suggest functionality for districts and attractions

class AutoSuggest {
  constructor(inputElement, suggestionsContainer, dataObject) {
    this.inputElement = inputElement;
    this.suggestionsContainer = suggestionsContainer;
    this.dataObject = dataObject;
    this.allDistricts = Object.keys(dataObject);
    this.init();
  }

  init() {
    // Listen to input changes
    this.inputElement.addEventListener('input', (e) => this.handleInput(e));
    
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (e.target !== this.inputElement) {
        this.suggestionsContainer.innerHTML = '';
      }
    });
  }

  handleInput(event) {
    const query = event.target.value.toLowerCase().trim();

    if (query.length === 0) {
      this.suggestionsContainer.innerHTML = '';
      return;
    }

    // Get matching districts
    const matchedDistricts = this.allDistricts.filter(district =>
      district.toLowerCase().includes(query)
    );

    // Get matching attractions from all districts
    const matchedAttractions = this.searchAttractions(query);

    // Display suggestions
    this.displaySuggestions(matchedDistricts, matchedAttractions, query);
  }

  searchAttractions(query) {
    const results = [];

    for (const district in this.dataObject) {
      const districtData = this.dataObject[district];
      
      // Search in all categories
      for (const category in districtData) {
        const items = districtData[category];
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item.toLowerCase().includes(query)) {
              results.push({
                name: item,
                district: district,
                category: category
              });
            }
          });
        }
      }
    }

    return results.slice(0, 8); // Limit results
  }

  displaySuggestions(districts, attractions, query) {
    let html = '';

    // Display districts
    if (districts.length > 0) {
      html += '<div class="suggestion-group">';
      html += '<h4 class="suggestion-title">Districts</h4>';
      districts.forEach(district => {
        const highlighted = this.highlightText(district, query);
        html += `
          <div class="suggestion-item district-item" data-district="${district}">
            <i class="fas fa-map-marker-alt"></i>
            ${highlighted}
          </div>
        `;
      });
      html += '</div>';
    }

    // Display attractions
    if (attractions.length > 0) {
      html += '<div class="suggestion-group">';
      html += '<h4 class="suggestion-title">Attractions</h4>';
      attractions.forEach(attraction => {
        const highlighted = this.highlightText(attraction.name, query);
        const icon = this.getCategoryIcon(attraction.category);
        html += `
          <div class="suggestion-item attraction-item" data-district="${attraction.district}">
            ${icon}
            <div class="attraction-info">
              <div class="attraction-name">${highlighted}</div>
              <div class="attraction-location">${attraction.district}</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    if (html === '') {
      html = '<div class="suggestion-item no-result">No results found</div>';
    }

    this.suggestionsContainer.innerHTML = html;

    // Add click handlers
    this.addClickHandlers();
  }

  highlightText(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }

  getCategoryIcon(category) {
    const icons = {
      'forts_durg': '<i class="fas fa-chess-rook"></i>',
      'palaces_havelis': '<i class="fas fa-crown"></i>',
      'temples_religious': '<i class="fas fa-gopuram"></i>',
      'museums_heritage': '<i class="fas fa-museum"></i>',
      'lakes_water_bodies': '<i class="fas fa-water"></i>',
      'gardens_parks': '<i class="fas fa-leaf"></i>',
      'wildlife_nature': '<i class="fas fa-paw"></i>',
      'markets_local_places': '<i class="fas fa-store"></i>',
      'stepwells_baoris': '<i class="fas fa-well"></i>',
      'desert_sand_dunes': '<i class="fas fa-dune"></i>'
    };
    return icons[category] || '<i class="fas fa-location-dot"></i>';
  }

  addClickHandlers() {
    const items = this.suggestionsContainer.querySelectorAll('.suggestion-item:not(.no-result)');
    
    items.forEach(item => {
      item.addEventListener('click', () => {
        const district = item.dataset.district;
        const attraction = item.textContent.trim().split('\n')[0];
        
        this.inputElement.value = attraction || district;
        this.suggestionsContainer.innerHTML = '';
        
        // Trigger custom event
        const event = new CustomEvent('suggestionSelected', {
          detail: { district, attraction }
        });
        this.inputElement.dispatchEvent(event);
      });
    });
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutoSuggest;
}
