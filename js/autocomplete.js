/* ======================================
   AUTOCOMPLETE LOCATION SUGGESTION SYSTEM
   ====================================== */

class LocationAutocomplete {
    constructor(inputElement, suggestionsElement, options = {}) {
        this.input = inputElement;
        this.suggestionsBox = suggestionsElement;
        this.data = window.locationsData || { states: {}, rajasthan: {} };
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

    normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    }

    pushUnique(list, item) {
        if (!item || !item.display) return;
        if (!list.some((entry) => entry.display === item.display)) {
            list.push(item);
        }
    }

    appendArrayMatches(container, values, query, builder) {
        if (!Array.isArray(values)) return;
        values.forEach((raw) => {
            if (typeof raw !== 'string') return;
            const value = raw.trim();
            if (!value) return;
            if (this.normalizeText(value).includes(query)) {
                this.pushUnique(container, builder(value));
            }
        });
    }

    getDynamicBucketLabel(categoryKey) {
        const key = String(categoryKey || '').toLowerCase();
        if (key.includes('museum')) return '🏛️ Museums & Heritage';
        if (key.includes('market')) return '🛍️ Markets & Local Spots';
        if (key.includes('nearby')) return '📍 Nearby Suggestions';
        if (key.includes('wildlife') || key.includes('nature')) return '🌿 Wildlife & Nature';
        if (key.includes('lake') || key.includes('water')) return '🌊 Lakes & Water Bodies';
        if (key.includes('palace') || key.includes('haveli')) return '🏯 Palaces & Havelis';
        if (key.includes('garden') || key.includes('park')) return '🌳 Gardens & Parks';
        return `📌 ${String(categoryKey || 'More Places').replace(/_/g, ' ')}`;
    }
    
    searchLocations(query) {
        const hasStates = this.data && this.data.states && typeof this.data.states === 'object';
        const hasRajasthan = this.data && this.data.rajasthan && typeof this.data.rajasthan === 'object';
        if (!hasStates && !hasRajasthan) {
            return [];
        }
        const results = {
            states: [],
            cities: [],
            districts: [],
            forts: [],
            temples: [],
            tourist_places: [],
            stations_airports: [],
            others: [],
            dynamicBuckets: {}
        };
        
        // Search in states and cities
        if (Array.isArray(this.data.states)) {
            this.data.states.forEach((state) => {
                if (typeof state !== 'string') return;
                const normalizedState = state.trim();
                if (!normalizedState) return;
                if (this.normalizeText(normalizedState).includes(query)) {
                    this.pushUnique(results.states, {
                        name: normalizedState,
                        type: 'state',
                        display: normalizedState
                    });
                }
            });
        } else {
            Object.keys(this.data.states).forEach(state => {
                if (this.normalizeText(state).includes(query)) {
                    this.pushUnique(results.states, {
                        name: state,
                        type: 'state',
                        display: state
                    });
                }
                
                // Search in cities of each state
                const cities = Array.isArray(this.data.states[state]) ? this.data.states[state] : [];
                cities.forEach(city => {
                    if (typeof city !== 'string') return;
                    if (this.normalizeText(city).includes(query)) {
                        this.pushUnique(results.cities, {
                            name: city,
                            type: 'city',
                            display: `${city}, ${state}`
                        });
                    }
                });
            });
        }
        
        // Search in Rajasthan districts and places
        Object.keys(this.data.rajasthan).forEach(district => {
            const districtData = this.data.rajasthan[district] || {};
            
            // District name match
            if (this.normalizeText(district).includes(query)) {
                this.pushUnique(results.districts, {
                    name: district,
                    type: 'district',
                    display: `${district}, Rajasthan`
                });
            }
            
            // Search in forts
            this.appendArrayMatches(results.forts, districtData.forts, query, (fort) => ({
                name: fort,
                district: district,
                type: 'fort',
                display: `${fort}, ${district}`
            }));
            
            // Search in temples
            this.appendArrayMatches(results.temples, districtData.temples, query, (temple) => ({
                name: temple,
                district: district,
                type: 'temple',
                display: `${temple}, ${district}`
            }));
            
            // Search in tourist places
            this.appendArrayMatches(results.tourist_places, districtData.tourist_places, query, (place) => ({
                name: place,
                district: district,
                type: 'tourist',
                display: `${place}, ${district}`
            }));
            
            // Search in railway stations and airports
            this.appendArrayMatches(results.stations_airports, districtData.railway_stations, query, (station) => ({
                name: station,
                district: district,
                type: 'station',
                display: `${station}, ${district}`
            }));
            
            this.appendArrayMatches(results.stations_airports, districtData.airports, query, (airport) => ({
                name: airport,
                district: district,
                type: 'airport',
                display: `${airport}, ${district}`
            }));
            
            // Search in other places (hospitals, markets, bus stands, landmarks)
            ['hospitals', 'markets', 'bus_stands', 'landmarks'].forEach(category => {
                this.appendArrayMatches(results.others, districtData[category], query, (place) => ({
                    name: place,
                    district: district,
                    type: category.replace('_', ' '),
                    display: `${place}, ${district}`
                }));
            });

            // Search in any additional array category that was added later (future-proof).
            const knownCategories = new Set([
                'forts', 'temples', 'tourist_places', 'railway_stations', 'airports',
                'hospitals', 'markets', 'bus_stands', 'landmarks'
            ]);

            Object.keys(districtData).forEach((category) => {
                if (knownCategories.has(category)) return;
                if (!Array.isArray(districtData[category])) return;

                const bucketKey = `dynamic:${category}`;
                results.dynamicBuckets[bucketKey] = results.dynamicBuckets[bucketKey] || {
                    label: this.getDynamicBucketLabel(category),
                    items: []
                };

                this.appendArrayMatches(results.dynamicBuckets[bucketKey].items, districtData[category], query, (place) => ({
                    name: place,
                    district: district,
                    type: category.replace(/_/g, ' '),
                    display: `${place}, ${district}`
                }));
            });
        });
        
        // Flatten and limit results
        return this.flattenResults(results);
    }
    
    flattenResults(results) {
        const flattened = [];

        const addCategorySection = (label, items, limit = 3) => {
            if (!Array.isArray(items) || items.length === 0) return;
            flattened.push({ isCategory: true, label });
            flattened.push(...items.slice(0, limit));
        };
        
        // Add categorized results with a maximum per category
        addCategorySection('📍 Districts', results.districts, 4);
        addCategorySection('🏰 Forts & Palaces', results.forts, 4);
        addCategorySection('🛕 Temples & Religious Places', results.temples, 4);
        addCategorySection('🏖️ Tourist Spots', results.tourist_places, 5);
        addCategorySection('🚉 Stations & Airports', results.stations_airports, 4);
        addCategorySection('🏙️ Cities & States', results.cities, 4);

        if (Array.isArray(results.states) && results.states.length > 0 && !flattened.some((item) => item.isCategory && item.label.includes('Cities'))) {
            addCategorySection('🏙️ States', results.states, 3);
        }

        const dynamicBucketKeys = Object.keys(results.dynamicBuckets || {}).sort();
        dynamicBucketKeys.forEach((bucketKey) => {
            const dynamic = results.dynamicBuckets[bucketKey];
            if (!dynamic || !Array.isArray(dynamic.items) || dynamic.items.length === 0) return;
            addCategorySection(dynamic.label, dynamic.items, 3);
        });

        addCategorySection('📍 Other Places', results.others, 4);
        
        const deduped = [];
        const seenDisplays = new Set();
        let pendingCategory = null;

        flattened.forEach((item) => {
            if (item.isCategory) {
                pendingCategory = item;
                return;
            }

            if (seenDisplays.has(item.display)) {
                return;
            }

            if (pendingCategory) {
                deduped.push(pendingCategory);
                pendingCategory = null;
            }

            seenDisplays.add(item.display);
            deduped.push(item);
        });

        return deduped.slice(0, this.maxResults);
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

// Helper function to initialize autocomplete for an input
function initializeAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.parentNode) return;

    const existing = document.getElementById(inputId + 'Autocomplete');
    const suggestions = existing || document.createElement('div');

    if (!existing) {
        suggestions.id = inputId + 'Autocomplete';
        suggestions.className = 'autocomplete-suggestions';
        input.parentNode.appendChild(suggestions);
    }

    if (input.dataset.autocompleteReady === '1') return;
    input.dataset.autocompleteReady = '1';

    // Initialize autocomplete
    new LocationAutocomplete(input, suggestions);
}

// Initialize autocomplete when DOM is loaded or immediately if already loaded
function initializeAllAutocomplete() {
    const ids = ['pickup', 'dropoff', 'pickupLocation', 'dropLocation', 'searchLocation', 'calcFrom', 'calcTo'];
    ids.forEach((id) => initializeAutocomplete(id));
}

// Check if DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAllAutocomplete);
} else {
    // DOM already loaded, initialize immediately
    initializeAllAutocomplete();
}
