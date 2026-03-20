/**
 * Synthograsizer Suite — Shared Navbar Component
 *
 * Include this script on any page to inject the consistent navbar.
 * Place a <div id="navbar-mount"></div> where you want the navbar to appear.
 *
 * The script auto-detects the current page from the URL path and highlights it.
 * All links use absolute paths from the static root (works with FastAPI StaticFiles).
 */
(function () {
  'use strict';

  // Page definitions: { path, label, dropdown }
  const pages = [
    { path: '/synthograsizer/', label: 'Synthograsizer (main)' },
    { path: '/legacy/', label: 'Synthograsizer (legacy)' },
    { path: '/glitcher/', label: 'Glitcher' },
    { path: '/daw/', label: 'DAW' },
    { path: '/metadata-manager/', label: 'Metadata Manager' },
    { path: '/fun-stuff/', label: 'Fun Stuff' },
    { path: '/chatroom/', label: 'Agent Chat Room' },
  ];

  const externalLinks = [];

  const aboutLink = { path: '/about/', label: 'About/Contact' };

  // Detect current page
  const currentPath = window.location.pathname;

  function isActive(pagePath) {
    // Match if the current URL starts with the page path
    return currentPath === pagePath || currentPath.startsWith(pagePath);
  }

  // Build dropdown items
  let dropdownItems = '';
  pages.forEach(function (page) {
    const activeClass = isActive(page.path) ? ' class="active"' : '';
    dropdownItems += '<a href="' + page.path + '"' + activeClass + '>' + page.label + '</a>\n';
  });

  // Build the full navbar HTML
  const navHTML = ''
    + '<nav class="suite-navbar">'
    + '  <div class="dropdown">'
    + '    <a href="/" class="dropbtn">Projects &#x25BC;</a>'
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

  // Inject into mount point or prepend to body
  function inject() {
    var mount = document.getElementById('navbar-mount');
    if (mount) {
      mount.innerHTML = navHTML;
    } else {
      // Fallback: insert at beginning of body
      document.body.insertAdjacentHTML('afterbegin', navHTML);
    }

    // Attach dropdown behavior
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
    dropdown.addEventListener('mouseleave', function () {
      content.style.display = 'none';
    });
    document.body.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target)) {
        content.style.display = 'none';
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
