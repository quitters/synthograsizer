/**
 * Synthograsizer Suite — Shared Navbar Component
 *
 * Include this script on any page to inject the consistent navbar.
 * Place a <div id="navbar-mount"></div> where you want the navbar to appear,
 * otherwise it prepends itself to <body>.
 *
 * Self-contained: if the page doesn't load shared/css/base.css (main app,
 * taste-profile), a compact scoped stylesheet is injected so the bar renders
 * as an unobtrusive dark pill that works on any background. Pages that DO
 * load base.css keep their existing look (glitcher adds its own overrides).
 *
 * The script auto-detects the current page from the URL path and highlights it.
 * All links use absolute paths from the static root (works with FastAPI StaticFiles).
 */
(function () {
  'use strict';

  // Page definitions. `divider: true` starts the "archive" group.
  var pages = [
    { path: '/synthograsizer/', label: 'Synthograsizer' },
    { path: '/taste-profile/', label: 'Taste Profile' },
    { path: '/glitcher/', label: 'Glitcher' },
    { path: '/chatroom/', label: 'Agent Chat Room' },
    { path: '/synthograsizer/demo.html', label: 'Synthograsizer (demo)' },
    { divider: true },
    { path: '/legacy/', label: 'Synthograsizer (legacy)' },
    { path: '/metadata-manager/', label: 'Metadata Manager' }
  ];

  var externalLinks = [];

  var aboutLink = { path: '/about/', label: 'About/Contact' };

  var currentPath = window.location.pathname;

  function isActive(pagePath) {
    if (pagePath.slice(-1) !== '/') {
      // File entry (e.g. demo.html) — exact match only.
      return currentPath === pagePath;
    }
    // Directory entry — match the dir and its pages, but never steal a match
    // from a more specific file entry (demo.html lives under /synthograsizer/).
    if (currentPath === pagePath || currentPath === pagePath + 'index.html') return true;
    if (currentPath.indexOf(pagePath) === 0) {
      var moreSpecific = pages.some(function (p) {
        return p.path && p.path !== pagePath && p.path.slice(-1) !== '/' &&
               currentPath === p.path;
      });
      return !moreSpecific;
    }
    return false;
  }

  // Build dropdown items
  var dropdownItems = '';
  pages.forEach(function (page) {
    if (page.divider) {
      dropdownItems += '<div class="suite-navbar-divider" role="separator"></div>\n';
      return;
    }
    var activeClass = isActive(page.path) ? ' class="active"' : '';
    dropdownItems += '<a href="' + page.path + '"' + activeClass + '>' + page.label + '</a>\n';
  });

  var navHTML = ''
    + '<nav class="suite-navbar" aria-label="Synthograsizer Suite">'
    + '  <a href="/" class="suite-home">Synthograsizer Suite</a>'
    + '  <div class="dropdown">'
    + '    <a href="/" class="dropbtn" aria-haspopup="true">Tools &#x25BC;</a>'
    + '    <div class="dropdown-content">'
    +        dropdownItems
    + '    </div>'
    + '  </div>'
    + externalLinks.map(function (link) {
        return '  <a href="' + link.href + '" target="_blank" rel="noopener">' + link.label + '</a>';
      }).join('\n')
    + '  <a href="' + aboutLink.path + '"'
    + (isActive(aboutLink.path) ? ' class="active" style="text-decoration:underline;"' : '')
    + '>' + aboutLink.label + '</a>'
    + '</nav>';

  // Compact fallback styles for pages that don't load shared/css/base.css.
  // Rendered as a slim dark pill so it reads on light AND dark pages.
  var fallbackCSS = ''
    + '.suite-navbar{display:flex;align-items:center;justify-content:center;gap:18px;'
    +   'margin:6px auto;padding:5px 16px;max-width:640px;border-radius:999px;'
    +   'background:rgba(22,22,30,.88);font:600 12px/1.6 "Inter","Segoe UI",sans-serif;'
    +   'position:relative;z-index:900;}'
    + '.suite-navbar a{color:#cfd2e6;text-decoration:none;padding:2px 0;}'
    + '.suite-navbar a:hover{color:#fff;}'
    + '.suite-navbar .suite-home{color:#8f93b8;font-weight:700;letter-spacing:.04em;}'
    + '.suite-navbar .dropdown{position:relative;display:inline-block;}'
    + '.suite-navbar .dropdown-content{display:none;position:absolute;left:50%;'
    +   'transform:translateX(-50%);top:100%;padding:8px 0;min-width:200px;'
    +   'background:rgba(22,22,30,.97);border:1px solid rgba(255,255,255,.12);'
    +   'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);}'
    + '.suite-navbar .dropdown-content a{display:block;padding:6px 16px;}'
    + '.suite-navbar .dropdown-content a.active{color:#7efff6;}'
    + '.suite-navbar .dropdown-content a:hover{background:rgba(255,255,255,.08);}'
    + '.suite-navbar-divider{margin:6px 12px;border-top:1px solid rgba(255,255,255,.15);}';

  function inject() {
    var hasBaseCss = !!document.querySelector('link[href*="shared/css/base.css"]');
    if (!hasBaseCss && !document.getElementById('suite-navbar-styles')) {
      var style = document.createElement('style');
      style.id = 'suite-navbar-styles';
      style.textContent = fallbackCSS;
      document.head.appendChild(style);
    }

    var mount = document.getElementById('navbar-mount');
    if (mount) {
      mount.innerHTML = navHTML;
    } else {
      document.body.insertAdjacentHTML('afterbegin', navHTML);
    }

    var dropdown = document.querySelector('.suite-navbar .dropdown');
    if (!dropdown) return;

    var btn = dropdown.querySelector('.dropbtn');
    var content = dropdown.querySelector('.dropdown-content');

    btn.addEventListener('mouseenter', function () {
      content.style.display = 'block';
    });
    btn.addEventListener('focus', function () {
      content.style.display = 'block';
    });
    // Click toggles too (touch devices have no hover)
    btn.addEventListener('click', function (e) {
      if (content.style.display !== 'block') {
        e.preventDefault();
        content.style.display = 'block';
      }
    });
    dropdown.addEventListener('mouseleave', function () {
      content.style.display = 'none';
    });
    document.body.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target)) {
        content.style.display = 'none';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
