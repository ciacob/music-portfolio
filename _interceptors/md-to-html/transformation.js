"use strict";

/**
 * transformation.js — site.md-to-html
 *
 * Converts a Markdown string into semantic HTML.
 *
 * Features:
 *   - Pure semantic output — no inline styles, no class attributes
 *   - External links (href starting with a protocol or "//") get
 *     target="_blank" rel="noopener noreferrer"
 *   - Internal links replace the current page (no extra attributes)
 *   - Accepts Markdown either as a literal string argument or as the
 *     contents of a file path argument
 *
 * Explicit trigger arguments:
 *   "text"      — a literal Markdown string to convert (optional)
 *   "file"      — path to a .md file to read and convert (optional)
 *
 * Exactly one of "text" or "file" must be provided.
 * If both are provided, "text" takes precedence.
 * If neither is provided, output.response is set to "" and a warning is logged.
 *
 * Usage examples in JSON:
 *
 *   Inline text:
 *   {
 *     "interceptBy": "site.md-to-html",
 *     "@text": "# Hello\n\nThis is **bold**."
 *   }
 *
 *   From file:
 *   {
 *     "interceptBy": "site.md-to-html",
 *     "@file": "contents/text/bio-en.md"
 *   }
 */

const fs = require("fs");
const path = require("path");
const { marked, Renderer } = require("marked");

// ---------------------------------------------------------------------------
// Link renderer — pure function, no side effects
// ---------------------------------------------------------------------------

/**
 * Determine whether a URL is external.
 * External: starts with a protocol (e.g. "https://", "mailto:") or is
 * protocol-relative ("//").
 *
 * @param {string} href
 * @returns {boolean}
 */
function isExternalUrl(href) {
  if (!href || typeof href !== "string") return false;
  if (href.startsWith("//")) return true;
  return /^[a-z][a-z0-9+\-.]*:/i.test(href);
}

/**
 * Render an anchor tag, adding external link attributes where appropriate.
 * Pure function — given the same inputs always produces the same output.
 *
 * @param {string}      href
 * @param {string|null} title
 * @param {string}      text   Inner HTML of the link
 * @returns {string}    HTML string
 */
function renderLink(href, title, text) {
  const titleAttr = title ? ` title="${title}"` : "";
  if (isExternalUrl(href)) {
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  }
  return `<a href="${href}"${titleAttr}>${text}</a>`;
}

// ---------------------------------------------------------------------------
// Marked configuration
// ---------------------------------------------------------------------------

/**
 * Build and return a configured marked Renderer instance.
 * Pure — returns a new Renderer each time with no shared state.
 *
 * @returns {Renderer}
 */
function buildRenderer() {
  const renderer = new Renderer();
  renderer.link = ({ href, title, text }) => renderLink(href, title, text);
  return renderer;
}

/**
 * Convert a Markdown string to semantic HTML.
 * Pure function.
 *
 * @param {string} markdown
 * @returns {string}  HTML string
 */
function mdToHtml(markdown) {
  if (!markdown || typeof markdown !== "string") return "";
  return marked(markdown, {
    renderer: buildRenderer(),
    gfm: true, // GitHub Flavoured Markdown
    breaks: false // don't convert single newlines to <br>
  });
}

/**
 * Read a Markdown file from the given path and convert it to HTML.
 * Throws if the file cannot be read.
 *
 * @param {string} filePath   Absolute or CWD-relative path to a .md file
 * @returns {string}          HTML string
 */
function mdFileToHtml(filePath) {
  const abs = path.resolve(filePath);
  const markdown = fs.readFileSync(abs, "utf8");
  return mdToHtml(markdown);
}

// ---------------------------------------------------------------------------
// transform entry point
// ---------------------------------------------------------------------------

/**
 * Entry point for the site.md-to-html interceptor.
 *
 * @param {object}   args
 * @param {string}   [args.text]   Literal Markdown string
 * @param {string}   [args.file]   Path to a .md file (CWD-relative or absolute)
 * @param {object}   output
 * @param {*}        output.response  Set to the resulting HTML string
 * @param {object}   tools
 * @param {Function} tools.log
 */
function transform(args, output, tools) {
  const log = (tools && tools.log) || (() => {});

  if (args.text !== undefined) {
    output.response = mdToHtml(String(args.text));
    return;
  }

  if (args.file !== undefined) {
    try {
      output.response = mdFileToHtml(String(args.file));
    } catch (e) {
      log(`[site.md-to-html] Failed to read file "${args.file}": ${e.message}`);
      output.response = "";
    }
    return;
  }

  log(
    '[site.md-to-html] Neither "text" nor "file" argument provided — returning empty string'
  );
  output.response = "";
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  transform,
  mdToHtml,
  mdFileToHtml,
  renderLink,
  isExternalUrl,
  buildRenderer
};
