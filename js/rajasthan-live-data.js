/* ======================================
   GO INDIA RIDE - RAJASTHAN LIVE DATA BRIDGE
   Purpose: Merge all available Rajasthan datasets into window.locationsData
   without removing old structures.
   ====================================== */

(function bootstrapRajasthanLiveData(global) {
    'use strict';

    const normalizeKey = (value) => String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const toUniqueStrings = (values) => {
        if (!Array.isArray(values)) return [];
        return Array.from(
            new Set(
                values
                    .map((item) => String(item || '').trim())
                    .filter(Boolean)
            )
        );
    };

    const mergeStringArray = (target, key, values) => {
        const existing = Array.isArray(target[key]) ? target[key] : [];
        const incoming = toUniqueStrings(values);
        if (incoming.length === 0 && existing.length > 0) return;
        target[key] = Array.from(new Set(existing.concat(incoming)));
    };

    const data = (global.locationsData && typeof global.locationsData === 'object')
        ? global.locationsData
        : {};

    if (!data.states || typeof data.states !== 'object') {
        data.states = {};
    }
    if (!data.rajasthan || typeof data.rajasthan !== 'object' || Array.isArray(data.rajasthan)) {
        data.rajasthan = {};
    }
    global.locationsData = data;

    const districtIndex = new Map();
    const districtAliasFixes = {
        barner: 'Barmer',
        shahapura: 'Shahpura',
        sawaimadhopur: 'Sawai Madhopur',
        didwanakuchaman: 'Didwana-Kuchaman',
        khairthaltijara: 'Khairthal-Tijara',
        kotputlibehror: 'Kotputli-Behror',
        sriganganagar: 'Sri Ganganagar',
        neemkathana: 'Neem Ka Thana',
        jaipurrural: 'Jaipur Rural',
        jodhpurrural: 'Jodhpur Rural'
    };
    const rebuildDistrictIndex = () => {
        districtIndex.clear();
        Object.keys(data.rajasthan).forEach((district) => {
            districtIndex.set(normalizeKey(district), district);
        });
    };
    rebuildDistrictIndex();

    const resolveDistrictName = (rawName) => {
        const cleaned = String(rawName || '').trim();
        if (!cleaned) return '';

        const normalized = normalizeKey(cleaned);
        if (districtAliasFixes[normalized]) {
            return districtAliasFixes[normalized];
        }
        if (districtIndex.has(normalized)) {
            return districtIndex.get(normalized);
        }

        let fuzzyMatch = '';
        districtIndex.forEach((sourceDistrict, sourceKey) => {
            if (fuzzyMatch) return;
            if (sourceKey.includes(normalized) || normalized.includes(sourceKey)) {
                fuzzyMatch = sourceDistrict;
            }
        });

        if (fuzzyMatch) return fuzzyMatch;

        const titleCase = cleaned
            .split(/[\s\-–]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ')
            .replace(/\bAnd\b/g, 'and')
            .replace(/\bKa\b/g, 'Ka')
            .replace(/\bKi\b/g, 'Ki');

        districtIndex.set(normalized, titleCase);
        return titleCase;
    };

    const categoryAliases = {
        forts_durg: ['forts', 'tourist_places'],
        palaces_havelis: ['forts', 'landmarks', 'tourist_places'],
        temples_religious: ['temples', 'tourist_places'],
        museums_heritage: ['landmarks', 'tourist_places'],
        lakes_water_bodies: ['tourist_places'],
        gardens_parks: ['tourist_places'],
        wildlife_nature: ['tourist_places'],
        markets_local_places: ['markets', 'landmarks'],
        nearby_tourist_spots: ['tourist_places'],
        desert_sand_dunes: ['tourist_places'],
        hills_nature: ['tourist_places'],
        places: ['tourist_places']
    };

    const touristFeedKeys = [
        'tourist_places', 'forts', 'temples', 'landmarks', 'markets',
        'forts_durg', 'palaces_havelis', 'temples_religious', 'museums_heritage',
        'lakes_water_bodies', 'gardens_parks', 'wildlife_nature', 'nearby_tourist_spots',
        'desert_sand_dunes', 'hills_nature'
    ];

    const sourceCatalogs = [];
    let lexicalRajasthan = null;
    if (typeof Rajasthan !== 'undefined' && Rajasthan && typeof Rajasthan === 'object') {
        lexicalRajasthan = Rajasthan;
    }

    if (lexicalRajasthan) {
        sourceCatalogs.push(lexicalRajasthan);
    }
    if (global.RajasthanMasterData && typeof global.RajasthanMasterData === 'object') {
        sourceCatalogs.push(global.RajasthanMasterData);
    }
    if (global.Rajasthan && typeof global.Rajasthan === 'object') {
        sourceCatalogs.push(global.Rajasthan);
    }
    if (global.RajasthanTouristPlaces && typeof global.RajasthanTouristPlaces === 'object') {
        sourceCatalogs.push(global.RajasthanTouristPlaces);
    }

    const touchedDistricts = new Set();

    sourceCatalogs.forEach((catalog) => {
        Object.keys(catalog).forEach((rawDistrictName) => {
            const districtData = catalog[rawDistrictName];
            if (!districtData || typeof districtData !== 'object') return;

            const districtName = resolveDistrictName(rawDistrictName);
            if (!districtName) return;

            if (!data.rajasthan[districtName] || typeof data.rajasthan[districtName] !== 'object') {
                data.rajasthan[districtName] = {};
                rebuildDistrictIndex();
            }

            const districtTarget = data.rajasthan[districtName];

            Object.keys(districtData).forEach((sourceCategory) => {
                const values = districtData[sourceCategory];
                if (!Array.isArray(values)) return;

                mergeStringArray(districtTarget, sourceCategory, values);

                const mappedCategories = categoryAliases[sourceCategory] || [];
                mappedCategories.forEach((mappedCategory) => {
                    mergeStringArray(districtTarget, mappedCategory, values);
                });
            });

            const rolledUpTouristPlaces = [];
            touristFeedKeys.forEach((key) => {
                if (Array.isArray(districtTarget[key])) {
                    rolledUpTouristPlaces.push(...districtTarget[key]);
                }
            });
            mergeStringArray(districtTarget, 'tourist_places', rolledUpTouristPlaces);

            touchedDistricts.add(districtName);
        });
    });

    const masterMetaDistricts = Array.isArray(global.RajasthanMasterMeta && global.RajasthanMasterMeta.districts)
        ? global.RajasthanMasterMeta.districts
        : [];
    masterMetaDistricts.forEach((rawDistrictName) => {
        const districtName = resolveDistrictName(rawDistrictName);
        if (!districtName) return;
        if (!data.rajasthan[districtName]) {
            data.rajasthan[districtName] = { tourist_places: [] };
        }
    });

    const summary = {
        status: 'ready',
        catalogsUsed: sourceCatalogs.length,
        touchedDistricts: touchedDistricts.size,
        totalDistricts: Object.keys(data.rajasthan).length,
        generatedAt: new Date().toISOString()
    };

    const requiredArrayKeys = [
        'forts', 'temples', 'tourist_places', 'markets', 'landmarks',
        'hospitals', 'bus_stands', 'railway_stations', 'airports'
    ];

    Object.keys(data.rajasthan).forEach((districtName) => {
        const district = data.rajasthan[districtName];
        if (!district || typeof district !== 'object') {
            data.rajasthan[districtName] = {};
        }

        const target = data.rajasthan[districtName];
        requiredArrayKeys.forEach((key) => {
            if (!Array.isArray(target[key])) {
                target[key] = [];
            }
        });

        if (target.landmarks.length === 0 && Array.isArray(target.tourist_places)) {
            target.landmarks = target.tourist_places.slice(0, 3);
        }

        if (!target.visit_info || typeof target.visit_info !== 'object' || Array.isArray(target.visit_info)) {
            target.visit_info = {};
        }

        const visitInfo = target.visit_info;
        if (!visitInfo.best_time_to_visit) visitInfo.best_time_to_visit = 'October to March is generally comfortable.';
        if (!visitInfo.opening_closing_timings) visitInfo.opening_closing_timings = 'Major attractions usually open 9:00 AM to 6:00 PM.';
        if (!visitInfo.entry_fee_note) visitInfo.entry_fee_note = 'Entry fees vary by site. Verify official counters before visit.';
        if (!visitInfo.photography_note) visitInfo.photography_note = 'Photography rules differ by monument; ask on-site staff.';
        if (!visitInfo.dress_code_note) visitInfo.dress_code_note = 'Use respectful attire at temples/religious places.';
        if (!visitInfo.guided_tour_note) visitInfo.guided_tour_note = 'Local guides are usually available at major forts and heritage sites.';
        if (!visitInfo.parking_note) visitInfo.parking_note = 'Parking availability depends on season and crowd level.';
        if (!visitInfo.audio_guide_note) visitInfo.audio_guide_note = 'Audio guide support may be available at selected landmarks.';
    });

    global.GOIRajasthanLiveDataSummary = summary;

    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('goindiaride:rajasthan-live-ready', { detail: summary }));
    }
})(typeof window !== 'undefined' ? window : globalThis);
