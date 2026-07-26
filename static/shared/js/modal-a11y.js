/* modal-a11y.js — keyboard and screen-reader behaviour for every modal in the Suite.
 *
 * Measured baseline before this existed (local install, 2026-07-25): with the
 * Smart Transform modal open on screen, 48 real Tab presses walked the page
 * *behind* it and never once entered the dialog. Its first control sat at
 * position 63 of 70 in the tab order, Escape did nothing, focus never moved in
 * and so was never restored, and all 12 modals reported role=null,
 * aria-modal=null, no accessible name, and a close button whose entire label
 * was "×".
 *
 * WHY AN OBSERVER RATHER THAN A HOOK IN openModal():
 * three of the twelve modals (trace-viewer, agent-studio, and the two auth
 * overlays) never call studio-integration's openModal() — they add/remove the
 * `active` class themselves, or create and remove their whole overlay. Keying
 * off the call site would have silently missed them, which is the same failure
 * mode that left `tier-gate.js` hiding nothing for a month. So this keys off
 * the observable state — an element IS an open modal or it is not — and cannot
 * be bypassed by a new call site.
 *
 * Dismissible vs blocking is inferred from the markup, not a hardcoded id list:
 * a modal is dismissible if it contains a close control. The Terms interstitial
 * has none, so Escape deliberately will not dismiss it — it is a consent gate
 * whose acceptance is recorded server-side, and a keyboard user must not be
 * able to skip it when a mouse user cannot.
 *
 * Loaded by: synthograsizer/{index,av,demo}.html, index.html,
 * taste-profile/index.html, videorama/index.html. No dependencies, no auth
 * coupling — local installs get this exactly as hosted does.
 */
(function () {
  'use strict';

  var MODAL_SEL = '.studio-modal, .sy-overlay';
  var CLOSE_SEL = '.studio-close-modal, .sy-gallery-close, [data-modal-close]';
  var FOCUS_SEL = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

  /* Visible = has a box AND is not display:none somewhere up the tree.
   * offsetParent is the cheap proxy for the latter, but it is also null for
   * position:fixed elements that are perfectly visible — hence the explicit
   * exemption. Deliberately not `getComputedStyle(el).display`, which reports
   * the element's own value and says nothing about a hidden ancestor. */
  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    return true;
  }

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll(FOCUS_SEL),
      function (el) { return !el.disabled && el.getAttribute('aria-hidden') !== 'true' && visible(el); }
    );
  }

  /* An open modal is one that is in the document and showing. `.studio-modal`
   * is toggled by an `active` class; the auth overlays are created and removed
   * outright, so merely being connected means open. */
  function isOpen(el) {
    if (!el.isConnected) return false;
    if (el.classList.contains('studio-modal')) return el.classList.contains('active');
    return true;
  }

  function openModals() {
    return Array.prototype.filter.call(document.querySelectorAll(MODAL_SEL), isOpen);
  }

  /* The dialog box itself — for the auth overlays the `.sy-overlay` is the
   * backdrop and `.sy-modal` inside it is the actual dialog. */
  function dialogOf(el) { return el.querySelector('.sy-modal') || el; }

  function closeControl(el) { return el.querySelector(CLOSE_SEL); }

  /* ── focus stack ───────────────────────────────────────────────────────── */
  var returnTo = [];   // element to restore focus to, innermost last
  var tracked = [];    // modals currently considered open

  function activate(el) {
    var dialog = dialogOf(el);
    var prev = document.activeElement;
    returnTo.push(prev && prev !== document.body ? prev : null);

    if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
    if (!dialog.hasAttribute('aria-modal')) dialog.setAttribute('aria-modal', 'true');
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');

    /* Focus the dialog rather than its first control, so a screen reader
     * announces the dialog's name and role before its contents. An explicit
     * [autofocus] still wins where a form field is the obvious first stop. */
    var auto = dialog.querySelector('[autofocus]');
    var target = (auto && visible(auto)) ? auto : dialog;
    // Synchronously first: the observer runs after the class mutation is
    // applied, so the dialog is already display:block and focusable. Retry once
    // on a macrotask for the case where a modal's contents are filled in right
    // after it opens. Deliberately NOT requestAnimationFrame — rAF does not run
    // in a hidden or throttled tab, and a modal opened there would get no focus
    // management at all (observed: visibilityState "hidden" swallowed it whole).
    if (!focusInto(target)) setTimeout(function () { focusInto(target); }, 0);
  }

  function focusInto(target) {
    if (!target || !target.isConnected) return true;   // nothing to do
    try { target.focus({ preventScroll: true }); } catch (e) {
      try { target.focus(); } catch (e2) { return false; }
    }
    return document.activeElement === target || target.contains(document.activeElement);
  }

  function deactivate() {
    var prev = returnTo.pop();
    if (!prev || !prev.isConnected) return;
    if (visible(prev)) { focusInto(prev); return; }

    /* The trigger is gone from view — the commonest case by far is a menu item,
     * because opening a modal closes the dropdown it was launched from. Landing
     * on <body> would dump a keyboard user at the top of the document with no
     * idea where they were, so climb to the nearest ancestor that still shows a
     * focusable control: for a menu item that is its own menu's trigger button,
     * which is exactly where the user would expect to be. */
    for (var node = prev.parentElement; node && node !== document.body; node = node.parentElement) {
      var candidate = focusables(node)[0];
      if (candidate) { focusInto(candidate); return; }
    }
  }

  /* Reconcile what is open against what we last saw. One pass handles opens,
   * closes, and several changing at once (openModal() closes all then opens
   * one, which lands here as a single batch). */
  function sync() {
    var now = openModals();
    var opened = now.filter(function (m) { return tracked.indexOf(m) < 0; });
    var closed = tracked.filter(function (m) { return now.indexOf(m) < 0; });
    tracked = now;
    closed.forEach(deactivate);
    opened.forEach(activate);
  }

  /* ── keyboard ──────────────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    var open = openModals();
    if (!open.length) return;
    var top = open[open.length - 1];

    if (e.key === 'Escape') {
      var close = closeControl(top);
      if (close) { e.preventDefault(); e.stopPropagation(); close.click(); }
      return;   // blocking dialogs (no close control) swallow nothing and close nothing
    }

    if (e.key !== 'Tab') return;

    var items = focusables(dialogOf(top));
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0];
    var last = items[items.length - 1];
    var at = document.activeElement;
    var inside = dialogOf(top).contains(at);

    if (!inside) {
      // Focus escaped (or never entered) — pull it back to the right edge.
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && (at === first || at === dialogOf(top))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }, true);

  /* ── observe ───────────────────────────────────────────────────────────── */
  var mo = new MutationObserver(sync);
  function start() {
    mo.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class'],
    });
    sync();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // Exposed for the a11y probe / tests, not for app code.
  window.SynthModalA11y = { sync: sync, openModals: openModals, focusables: focusables };
})();
