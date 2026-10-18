// Appearance settings (M4.8 task 15), applied before the first paint so a reload doesn't flash. A file rather than
// an inline script, which the CSP would refuse. Keep in step with lib/settings/appearance.svelte.ts.
(function () {
  try {
    var a = JSON.parse(localStorage.getItem('concord:appearance') || '{}');
    var root = document.documentElement;
    if (a.compact === true) root.setAttribute('data-compact', '');
    if (typeof a.fontSize === 'number' && a.fontSize >= 12 && a.fontSize <= 24 && a.fontSize !== 16) root.style.fontSize = (a.fontSize / 16) * 100 + '%';
  } catch {
    // No storage: the defaults.
  }
})();
