(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_AUTOCOMPLETE_DOWNWARD_HOTFIX__) {
    return;
  }
  window.__GOINDIARIDE_AUTOCOMPLETE_DOWNWARD_HOTFIX__ = true;

  function forceDownForInput(input) {
    var id = String((input && input.id) || '').toLowerCase();
    if (id.indexOf('pickup') !== -1 || id.indexOf('dropoff') !== -1 || id.indexOf('drop') !== -1) return true;
    return window.__GOINDIARIDE_AUTOCOMPLETE_FORCE_DOWN__ === true;
  }

  function patchAutocomplete() {
    var Ctor = window.LocationAutocomplete;
    if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.positionSuggestions !== 'function') {
      return false;
    }

    if (Ctor.prototype.__goiDownwardPatched) return true;

    var original = Ctor.prototype.positionSuggestions;

    Ctor.prototype.positionSuggestions = function () {
      if (!this || !this.input || !this.suggestionsBox) return;

      if (!forceDownForInput(this.input)) {
        original.call(this);
        return;
      }

      var rect = this.input.getBoundingClientRect();
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewportWidth || !viewportHeight || rect.width <= 0 || rect.height <= 0) return;

      var margin = 8;
      var maxDefaultHeight = 350;
      var width = Math.min(Math.max(220, rect.width), Math.max(220, viewportWidth - margin * 2));
      var left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
      var spaceBelow = viewportHeight - rect.bottom - margin;
      var maxHeight = Math.max(140, Math.min(maxDefaultHeight, Math.max(140, spaceBelow - 4)));
      var top = Math.min(viewportHeight - margin - 40, rect.bottom - 1);

      this.suggestionsBox.style.position = 'fixed';
      this.suggestionsBox.style.left = left + 'px';
      this.suggestionsBox.style.top = top + 'px';
      this.suggestionsBox.style.width = width + 'px';
      this.suggestionsBox.style.maxHeight = maxHeight + 'px';
      this.suggestionsBox.style.marginTop = '0';
      this.suggestionsBox.style.zIndex = '9999';
      this.suggestionsBox.style.borderTop = 'none';
      this.suggestionsBox.style.borderBottom = '2px solid #667eea';
      this.suggestionsBox.style.borderRadius = '0 0 8px 8px';

      if (!this.__goiDownwardBound) {
        this.__goiDownwardBound = true;
        var self = this;
        var reflow = function () {
          if (self.suggestionsBox && self.suggestionsBox.style.display === 'block') {
            try { self.positionSuggestions(); } catch (_error) { }
          }
        };
        window.addEventListener('resize', reflow);
        window.addEventListener('scroll', reflow, true);
      }
    };

    Ctor.prototype.__goiDownwardPatched = true;
    return true;
  }

  function boot() {
    if (patchAutocomplete()) return;
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (patchAutocomplete() || attempts > 30) {
        window.clearInterval(timer);
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
