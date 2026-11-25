(function () {
  var root = document.documentElement;
  try {
    var t = localStorage.getItem('ripcord-theme');
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('theme-toggle');
    if (!b) return;
    function isDark() {
      var t = root.getAttribute('data-theme');
      if (t) return t === 'dark';
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    function label() {
      b.textContent = isDark() ? 'Light' : 'Dark';
      b.setAttribute('aria-label', 'Switch to ' + (isDark() ? 'light' : 'dark') + ' mode');
    }
    label();
    b.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ripcord-theme', next); } catch (e) {}
      label();
    });
  });
})();
