// ===============================================
// Data Loader Configuration
// Select which format to use
// ===============================================

const DataLoaderConfig = {
  // Choose which format to use
  activeFormat: "format-1-js", // "format-1-js" | "format-2-json" | "format-3-sqlite"
  
  // Format 1: JavaScript Objects
  format1: {
    enabled: true,
    path: "/data/format-1-js/",
    files: [
      "rajasthan-1000-attractions.js",
      "delhi-attractions.js",
      "maharashtra-attractions.js"
      // Add more states as needed
    ]
  },

  // Format 2: JSON Files
  format2: {
    enabled: true,
    basePath: "/data/format-2-json/",
    statesPath: "/data/format-2-json/states/",
    metadataPath: "/data/format-2-json/metadata/",
    states: [
      "rajasthan",
      "delhi",
      "maharashtra",
      "karnataka",
      "tamil-nadu",
      "uttar-pradesh",
      "bihar",
      "west-bengal",
      "haryana",
      "punjab",
      "himachal-pradesh",
      "uttarakhand",
      "odisha",
      "goa",
      "gujarat"
    ]
  },

  // Format 3: SQLite Database
  format3: {
    enabled: true,
    dbPath: "/data/format-3-sqlite/india-attractions.db",
    tables: [
      "districts",
      "attractions",
      "categories",
      "images",
      "metadata"
    ]
  },

  // Caching
  cache: {
    enabled: true,
    ttl: 3600000 // 1 hour in milliseconds
  },

  // Pagination
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },

  // Search
  search: {
    minQueryLength: 2,
    maxResults: 50
  }
};

// Load appropriate format
class DataLoader {
  constructor(config) {
    this.config = config;
    this.activeFormat = config.activeFormat;
    this.data = {};
  }

  async load() {
    switch (this.activeFormat) {
      case "format-1-js":
        return this.loadFormat1();
      case "format-2-json":
        return this.loadFormat2();
      case "format-3-sqlite":
        return this.loadFormat3();
      default:
        console.error("Unknown format");
    }
  }

  async loadFormat1() {
    try {
      // Load JavaScript files
      const script = document.createElement('script');
      script.src = this.config.format1.path + this.config.format1.files[0];
      document.head.appendChild(script);
      this.data = window.RajasthanData;
      console.log("Format 1 loaded successfully");
      return this.data;
    } catch (error) {
      console.error("Error loading Format 1:", error);
    }
  }

  async loadFormat2() {
    try {
      // Load JSON files
      for (const state of this.config.format2.states) {
        const response = await fetch(`${this.config.format2.statesPath}${state}.json`);
        const data = await response.json();
        this.data[state] = data;
      }
      console.log("Format 2 loaded successfully");
      return this.data;
    } catch (error) {
      console.error("Error loading Format 2:", error);
    }
  }

  async loadFormat3() {
    try {
      // Load SQLite database
      console.log("Loading Format 3 (SQLite)...");
      // Implementation depends on backend
      return this.data;
    } catch (error) {
      console.error("Error loading Format 3:", error);
    }
  }

  search(query) {
    const results = [];
    for (const region in this.data) {
      for (const district in this.data[region]) {
        for (const category in this.data[region][district]) {
          const items = this.data[region][district][category];
          for (const name in items) {
            if (name.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                name,
                district,
                region,
                category
              });
            }
          }
        }
      }
    }
    return results;
  }
}

// Initialize
const loader = new DataLoader(DataLoaderConfig);

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DataLoaderConfig, DataLoader };
}
