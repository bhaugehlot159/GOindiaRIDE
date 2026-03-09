(function aiAutomationOrchestrator() {
  'use strict';

  const GRID_ID = 'aiAutomationGrid';
  const META_ID = 'aiAutomationMeta';
  const INCIDENT_KEY = 'goindia_ai_security_incidents_v1';

  function nowLabel() {
    return new Date().toLocaleTimeString();
  }

  function readIncidents() {
    try {
      const raw = localStorage.getItem(INCIDENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function deriveStatus() {
    const incidents = readIncidents().slice(0, 20);
    const critical = incidents.filter((item) => item.level === 'critical').length;
    const high = incidents.filter((item) => item.level === 'high').length;

    if (critical >= 2) return 'critical';
    if (critical > 0 || high >= 2) return 'elevated';
    return 'healthy';
  }

  function updateCardStatus(card, status) {
    const badge = card.querySelector('.ai-automation-status');
    if (!badge) return;

    badge.classList.remove('ai-status-healthy', 'ai-status-elevated', 'ai-status-critical');

    if (status === 'critical') {
      badge.classList.add('ai-status-critical');
      badge.textContent = 'critical';
      return;
    }

    if (status === 'elevated') {
      badge.classList.add('ai-status-elevated');
      badge.textContent = 'elevated';
      return;
    }

    badge.classList.add('ai-status-healthy');
    badge.textContent = 'healthy';
  }

  function refreshAutomationStatus() {
    const grid = document.getElementById(GRID_ID);
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.ai-automation-card'));
    if (!cards.length) return;

    const baseStatus = deriveStatus();

    cards.forEach((card, index) => {
      let cardStatus = baseStatus;

      if (baseStatus === 'critical' && index >= 3) {
        cardStatus = 'elevated';
      }

      if (baseStatus === 'elevated' && index % 3 === 0) {
        cardStatus = 'healthy';
      }

      updateCardStatus(card, cardStatus);
    });

    const meta = document.getElementById(META_ID);
    if (meta) {
      meta.textContent = `Auto refresh: ${nowLabel()} (${baseStatus})`;
    }
  }

  function boot() {
    refreshAutomationStatus();
    setInterval(refreshAutomationStatus, 15000);

    window.addEventListener('goindia:security-state', refreshAutomationStatus);
    window.addEventListener('storage', (event) => {
      if (event.key === INCIDENT_KEY) {
        refreshAutomationStatus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
