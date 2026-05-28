window.__GOINDIARIDE_RUNTIME_EXTERNAL_PREFERRED__ = true;
if (!window.__GOINDIARIDE_API_ORIGIN__) {
  window.__GOINDIARIDE_API_ORIGIN__ = /(^|\\.)goindiaride\\.in$/i.test(window.location.hostname)
    ? 'https://goindiaride.onrender.com'
    : (window.location.origin || '');
}
if (!window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ && window.__GOINDIARIDE_API_ORIGIN__) {
  window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ = window.__GOINDIARIDE_API_ORIGIN__;
}
