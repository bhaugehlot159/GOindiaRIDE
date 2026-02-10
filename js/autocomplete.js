/* ======================================
   AUTOCOMPLETE LOCATION SUGGESTION SYSTEM
   ====================================== */

class LocationAutocomplete {
    constructor(inputElement, suggestionsElement, options = {}) {
        this.input = inputElement;
        this.suggestionsBox = suggestionsElement;
        this.data = window.locationsData;
        this.currentFocus = -1;
        
        // Configurable options with defaults
        this.minSearchLength = options.minSearchLength || 2;
        this.maxResults = options.maxResults || 20;
        
        this.init();
    }
    
    init() {
        // Add input event listener
        this.input.addEventListener('input', (e) => {
            this.handleInput(e.target.value);
        });
        
        // Handle keyboard navigation
        this.input.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });
        
        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target !== this.input) {
                this.closeSuggestions();
            }
        });
    }
    
    handleInput(value) {
        this.closeSuggestions();
        
        if (!value || value.length < this.minSearchLength) {
            return;
        }
        
        const suggestions = this.searchLocations(value.toLowerCase());
        
        if (suggestions.length === 0) {
            this.showNoResults();
            return;
        }
        
        this.displaySuggestions(suggestions);
    }
    
    searchLocations(query) {
        const results = {
            states: [],
            cities: [],
            districts: [],
            forts: [],
            temples: [],
            tourist_places: [],
            stations_airports: [],
            others: []
        };
        
        // Search in states and cities
        Object.keys(this.data.states).forEach(state => {
            if (state.toLowerCase().includes(query)) {
                results.states.push({
                    name: state,
                    type: 'state',
                    display: state
                });
            }
            
            // Search in cities of each state
            this.data.states[state].forEach(city => {
                if (city.toLowerCase().includes(query)) {
                    results.cities.push({
                        name: city,
                        type: 'city',
                        display: `${city}, ${state}`
                    });
                }
            });
        });
        
        // Search in Rajasthan districts and places
        Object.keys(this.data.rajasthan).forEach(district => {
            const districtData = this.data.rajasthan[district];
            
            // District name match
            if (district.toLowerCase().includes(query)) {
                results.districts.push({
                    name: district,
                    type: 'district',
                    display: `${district}, Rajasthan`
                });
            }
            
            // Search in forts
            if (districtData.forts) {
                districtData.forts.forEach(fort => {
                    if (fort.toLowerCase().includes(query)) {
                        results.forts.push({
                            name: fort,
                            district: district,
                            type: 'fort',
                            display: `${fort}, ${district}`
                        });
                    }
                });
            }
            
            // Search in temples
            if (districtData.temples) {
                districtData.temples.forEach(temple => {
                    if (temple.toLowerCase().includes(query)) {
                        results.temples.push({
                            name: temple,
                            district: district,
                            type: 'temple',
                            display: `${temple}, ${district}`
                        });
                    }
                });
            }
            
            // Search in tourist places
            if (districtData.tourist_places) {
                districtData.tourist_places.forEach(place => {
                    if (place.toLowerCase().includes(query)) {
                        results.tourist_places.push({
                            name: place,
                            district: district,
                            type: 'tourist',
                            display: `${place}, ${district}`
                        });
                    }
                });
            }
            
            // Search in railway stations and airports
            if (districtData.railway_stations) {
                districtData.railway_stations.forEach(station => {
                    if (station.toLowerCase().includes(query)) {
                        results.stations_airports.push({
                            name: station,
                            district: district,
                            type: 'station',
                            display: `${station}, ${district}`
                        });
                    }
                });
            }
            
            if (districtData.airports) {
                districtData.airports.forEach(airport => {
                    if (airport.toLowerCase().includes(query)) {
                        results.stations_airports.push({
                            name: airport,
                            district: district,
                            type: 'airport',
                            display: `${airport}, ${district}`
                        });
                    }
                });
            }
            
            // Search in other places (hospitals, markets, bus stands, landmarks)
            ['hospitals', 'markets', 'bus_stands', 'landmarks'].forEach(category => {
                if (districtData[category]) {
                    districtData[category].forEach(place => {
                        if (place.toLowerCase().includes(query)) {
                            results.others.push({
                                name: place,
                                district: district,
                                type: category.replace('_', ' '),
                                display: `${place}, ${district}`
                            });
                        }
                    });
                }
            });
        });
        
        // Flatten and limit results
        return this.flattenResults(results);
    }
    
    flattenResults(results) {
        const flattened = [];
        
        // Add categorized results with a maximum per category
        if (results.districts.length > 0) {
            flattened.push({ isCategory: true, label: '📍 Districts' });
            flattened.push(...results.districts.slice(0, 3));
        }
        
        if (results.forts.length > 0) {
            flattened.push({ isCategory: true, label: '🏰 Forts & Palaces' });
            flattened.push(...results.forts.slice(0, 3));
        }
        
        if (results.temples.length > 0) {
            flattened.push({ isCategory: true, label: '🛕 Temples & Religious Places' });
            flattened.push(...results.temples.slice(0, 3));
        }
        
        if (results.tourist_places.length > 0) {
            flattened.push({ isCategory: true, label: '🏖️ Tourist Spots' });
            flattened.push(...results.tourist_places.slice(0, 3));
        }
        
        if (results.stations_airports.length > 0) {
            flattened.push({ isCategory: true, label: '🚉 Stations & Airports' });
            flattened.push(...results.stations_airports.slice(0, 3));
        }
        
        if (results.cities.length > 0) {
            flattened.push({ isCategory: true, label: '🏙️ Cities & States' });
            flattened.push(...results.cities.slice(0, 3));
        }
        
        if (results.states.length > 0 && flattened.filter(item => item.isCategory && item.label.includes('Cities')).length === 0) {
            flattened.push({ isCategory: true, label: '🏙️ States' });
            flattened.push(...results.states.slice(0, 3));
        }
        
        if (results.others.length > 0) {
            flattened.push({ isCategory: true, label: '📍 Other Places' });
            flattened.push(...results.others.slice(0, 3));
        }
        
        return flattened.slice(0, this.maxResults);
    }
    
    displaySuggestions(suggestions) {
        this.suggestionsBox.innerHTML = '';
        this.suggestionsBox.style.display = 'block';
        
        suggestions.forEach((item, index) => {
            const div = document.createElement('div');
            
            if (item.isCategory) {
                div.className = 'autocomplete-category';
                div.textContent = item.label;
            } else {
                div.className = 'autocomplete-item';
                div.innerHTML = this.highlightMatch(item.display, this.input.value);
                div.addEventListener('click', () => {
                    this.selectItem(item.display);
                });
                div.dataset.index = index;
            }
            
            this.suggestionsBox.appendChild(div);
        });
    }
    
    highlightMatch(text, query) {
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }
    
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    showNoResults() {
        this.suggestionsBox.innerHTML = '<div class="autocomplete-no-results">No locations found</div>';
        this.suggestionsBox.style.display = 'block';
    }
    
    selectItem(value) {
        this.input.value = value;
        this.closeSuggestions();
        
        // Trigger change event
        const event = new Event('change', { bubbles: true });
        this.input.dispatchEvent(event);
    }
    
    closeSuggestions() {
        this.suggestionsBox.style.display = 'none';
        this.suggestionsBox.innerHTML = '';
        this.currentFocus = -1;
    }
    
    handleKeyboard(e) {
        const items = this.suggestionsBox.querySelectorAll('.autocomplete-item');
        
        if (e.key === 'ArrowDown') { // Down arrow
            e.preventDefault();
            this.currentFocus++;
            this.addActive(items);
        } else if (e.key === 'ArrowUp') { // Up arrow
            e.preventDefault();
            this.currentFocus--;
            this.addActive(items);
        } else if (e.key === 'Enter') { // Enter
            e.preventDefault();
            if (this.currentFocus > -1 && items[this.currentFocus]) {
                items[this.currentFocus].click();
            }
        } else if (e.key === 'Escape') { // Escape
            this.closeSuggestions();
        }
    }
    
    addActive(items) {
        if (!items || items.length === 0) return;
        
        this.removeActive(items);
        
        if (this.currentFocus >= items.length) this.currentFocus = 0;
        if (this.currentFocus < 0) this.currentFocus = items.length - 1;
        
        items[this.currentFocus].classList.add('autocomplete-active');
        items[this.currentFocus].scrollIntoView({ block: 'nearest' });
    }
    
    removeActive(items) {
        items.forEach(item => item.classList.remove('autocomplete-active'));
    }
}

// Initialize autocomplete when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const pickupInput = document.getElementById('pickup');
    const dropoffInput = document.getElementById('dropoff');
    
    if (pickupInput) {
        // Create suggestions container for pickup
        const pickupSuggestions = document.createElement('div');
        pickupSuggestions.id = 'pickupAutocomplete';
        pickupSuggestions.className = 'autocomplete-suggestions';
        pickupInput.parentNode.appendChild(pickupSuggestions);
        
        new LocationAutocomplete(pickupInput, pickupSuggestions);
    }
    
    if (dropoffInput) {
        // Create suggestions container for dropoff
        const dropoffSuggestions = document.createElement('div');
        dropoffSuggestions.id = 'dropoffAutocomplete';
        dropoffSuggestions.className = 'autocomplete-suggestions';
        dropoffInput.parentNode.appendChild(dropoffSuggestions);
        
        new LocationAutocomplete(dropoffInput, dropoffSuggestions);
    }
});
