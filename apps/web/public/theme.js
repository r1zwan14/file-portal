(function () {
  try {
    var stored = localStorage.getItem('file-portal-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (_) {
    // Keep the light theme when browser storage is unavailable.
  }
})();
