(function initEnterpriseFeatureRegistry(window) {
    "use strict";

    const root = window.GOINDIARIDE_ADMIN_ENTERPRISE = window.GOINDIARIDE_ADMIN_ENTERPRISE || {};

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function addUniqueById(target, rows) {
        asArray(rows).forEach((row) => {
            if (!row || !row.id) return;
            const existingIndex = target.findIndex((item) => item && item.id === row.id);
            if (existingIndex >= 0) {
                target[existingIndex] = { ...target[existingIndex], ...row };
            } else {
                target.push(row);
            }
        });
    }

    root.modules = asArray(root.modules);
    root.sources = asArray(root.sources);
    root.benchmark = asArray(root.benchmark);
    root.backendRequired = asArray(root.backendRequired);
    root.backendEndpoints = root.backendEndpoints || {};

    root.registerModules = function registerModules(rows) {
        addUniqueById(root.modules, rows);
    };

    root.registerSources = function registerSources(rows) {
        asArray(rows).forEach((row) => {
            if (!row || !row.url) return;
            if (!root.sources.some((item) => item && item.url === row.url)) {
                root.sources.push(row);
            }
        });
    };

    root.registerBenchmark = function registerBenchmark(rows) {
        addUniqueById(root.benchmark, rows);
    };

    root.registerBackend = function registerBackend(endpointMap, requiredModules) {
        Object.keys(endpointMap || {}).forEach((moduleId) => {
            const current = asArray(root.backendEndpoints[moduleId]);
            root.backendEndpoints[moduleId] = Array.from(new Set([
                ...current,
                ...asArray(endpointMap[moduleId])
            ]));
        });
        asArray(requiredModules).forEach((moduleId) => {
            if (moduleId && !root.backendRequired.includes(moduleId)) {
                root.backendRequired.push(moduleId);
            }
        });
    };
})(window);
