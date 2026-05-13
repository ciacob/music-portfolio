'use strict';

/**
 * utils.js — Stock utility resolver for Statico sites.
 *
 * Export a "utils" namespace with helper functions available
 * throughout your templates and build.json as {{fn:utils.*}}.
 */

/**
 * Read a cookie by name from document.cookie.
 * Returns null if not found or if not in a browser context.
 * This is intended to be embedded in a <script> tag in your HTML output.
 * It is provided here as a string so you can inject it via a resolve step.
 */
function getCookieScript() {
  return `
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}
`.trim();
}

/**
 * Return a minimal JS snippet that reads the "lang" cookie and redirects
 * to the appropriate language path if needed.
 *
 * @param {string[]} languages    e.g. ["en", "ro"]
 * @param {string}   defaultLang  e.g. "en"
 */
function getLanguageSwitcherScript(languages, defaultLang) {
  return `
(function() {
  var lang = getCookie('lang') || '${defaultLang}';
  var supported = ${JSON.stringify(languages)};
  var seg = window.location.pathname.split('/').filter(Boolean)[0];
  if (supported.indexOf(seg) === -1 && supported.indexOf(lang) !== -1) {
    window.location.replace('/' + lang + window.location.pathname);
  }
})();
`.trim();
}

/**
 * Simple utility: join an array of path segments with '/'.
 */
function joinPath(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

/**
 * Return the current ISO date string (build time).
 */
function buildDate() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  utils: {
    getCookieScript,
    getLanguageSwitcherScript,
    joinPath,
    buildDate,
  },
};
