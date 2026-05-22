'use strict';

/**
 * transformation.js — site.resolve-piece-content
 *
 * A resolve step interceptor that processes the four human-readable text
 * fields of a piece object (summary.en, summary.ro, programNotes.en,
 * programNotes.ro) before they are stored in ctx.
 *
 * Fires on every resolve step. Only acts when the value about to be stored
 * in ctx is an object that looks like a piece — i.e., has all three of:
 * `slug`, `summary`, `programNotes`.
 *
 * For each of the four fields, content is classified and processed:
 *
 *   inline HTML  — has at least one HTML tag other than <br> variants
 *                  → passed through unchanged
 *
 *   HTML file    — entire trimmed value ends with ".html"
 *                  → file content read and substituted
 *
 *   MD file      — entire trimmed value ends with ".md"
 *                  → file content read, rendered to HTML, substituted
 *
 *   inline MD    — anything else (including "TBD")
 *                  → rendered to HTML, substituted
 *
 * File paths are resolved against the site root (process.cwd() during build).
 * Root-relative paths (starting with "/") have the leading slash stripped
 * before resolving. Any path that escapes the site root is a build failure.
 *
 * Engine-injected args:
 *   args["template"] — template path (used only for pass-through detection)
 *   args["value"]    — the object about to be stored in ctx
 */

const fs   = require('fs');
const path = require('path');
const { marked, Renderer } = require('marked');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fields within a piece object to process, as dot-paths
const PIECE_FIELDS = [
  ['summary',      'en'],
  ['summary',      'ro'],
  ['programNotes', 'en'],
  ['programNotes', 'ro'],
];

// Regex: matches any HTML tag whose tag name is NOT br (case-insensitive).
// Used to detect inline HTML content.
const NON_BR_TAG_RE = /<(?!\s*\/?br\b)[a-zA-Z][^>]*>/i;

// Regex: entire trimmed string ends with a valid path segment + .html
const HTML_PATH_RE = /^[^\n]+\.html\s*$/i;

// Regex: entire trimmed string ends with a valid path segment + .md
const MD_PATH_RE = /^[^\n]+\.md\s*$/i;

// ---------------------------------------------------------------------------
// Marked configuration — same renderer as md-to-html interceptor
// ---------------------------------------------------------------------------

function buildRenderer() {
  const renderer = new Renderer();
  renderer.link = ({ href, title, text }) => {
    const titleAttr = title ? ` title="${title}"` : '';
    const isExternal = href && (/^[a-z][a-z0-9+\-.]*:/i.test(href) || href.startsWith('//'));
    if (isExternal) {
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    return `<a href="${href}"${titleAttr}>${text}</a>`;
  };
  return renderer;
}

/**
 * Render a Markdown string to HTML.
 * Pure function.
 *
 * @param {string} markdown
 * @returns {string}
 */
function renderMd(markdown) {
  return marked(markdown, { renderer: buildRenderer(), gfm: true, breaks: false });
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/**
 * Resolve a user-supplied file path safely against the site root.
 * Throws a descriptive Error if the resolved path escapes the site root.
 *
 * @param {string} rawPath   As authored: relative, root-relative (/...), or absolute
 * @param {string} siteRoot  Absolute path to the site root (process.cwd())
 * @returns {string}         Absolute, safe path to the file
 */
function resolveSafePath(rawPath, siteRoot) {
  const trimmed = rawPath.trim();

  // Both root-relative (/path/to/file.md) and relative (path/to/file.md)
  // paths are resolved against siteRoot. Leading slash is stripped so that
  // root-relative paths don't escape to the filesystem root.
  // Anything that resolves outside siteRoot is rejected by the safety check.
  const normalised = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const resolved   = path.resolve(siteRoot, normalised);

  // Ensure the resolved path stays within the site root
  const siteRootWithSep = siteRoot.endsWith(path.sep) ? siteRoot : siteRoot + path.sep;
  if (resolved !== siteRoot && !resolved.startsWith(siteRootWithSep)) {
    throw new Error(
      `Path "${rawPath}" resolves to "${resolved}" which is outside the site root "${siteRoot}"`
    );
  }

  return resolved;
}


// ---------------------------------------------------------------------------
// Content classification
// ---------------------------------------------------------------------------

/**
 * Content categories.
 */
const CATEGORY = {
  INLINE_HTML: 'inline-html',
  HTML_FILE:   'html-file',
  MD_FILE:     'md-file',
  INLINE_MD:   'inline-md',
};

/**
 * Classify a content string into one of four categories.
 * Pure function.
 *
 * @param {string} content
 * @returns {string}  One of CATEGORY.*
 */
function classify(content) {
  if (NON_BR_TAG_RE.test(content))  return CATEGORY.INLINE_HTML;
  if (HTML_PATH_RE.test(content))   return CATEGORY.HTML_FILE;
  if (MD_PATH_RE.test(content))     return CATEGORY.MD_FILE;
  return CATEGORY.INLINE_MD;
}

// ---------------------------------------------------------------------------
// Field processing
// ---------------------------------------------------------------------------

/**
 * Process a single content string according to its classification.
 * Returns the final HTML string.
 * Throws if a file path cannot be read or escapes the site root.
 *
 * @param {string} content
 * @param {string} siteRoot
 * @returns {string}
 */
function processField(content, siteRoot) {
  const category = classify(content);

  switch (category) {
    case CATEGORY.INLINE_HTML:
      return content;

    case CATEGORY.HTML_FILE: {
      const absPath = resolveSafePath(content, siteRoot);
      if (!fs.existsSync(absPath)) {
        throw new Error(`HTML file not found: "${content}" (resolved to "${absPath}")`);
      }
      return fs.readFileSync(absPath, 'utf8');
    }

    case CATEGORY.MD_FILE: {
      const absPath = resolveSafePath(content, siteRoot);
      if (!fs.existsSync(absPath)) {
        throw new Error(`MD file not found: "${content}" (resolved to "${absPath}")`);
      }
      return renderMd(fs.readFileSync(absPath, 'utf8'));
    }

    case CATEGORY.INLINE_MD:
      return renderMd(content);

    default:
      return content;
  }
}

// ---------------------------------------------------------------------------
// Piece detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a value looks like a piece object.
 * Requires all three of: slug, summary, programNotes.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isPieceObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'slug'         in value &&
    'summary'      in value &&
    'programNotes' in value
  );
}

// ---------------------------------------------------------------------------
// transform entry point
// ---------------------------------------------------------------------------

/**
 * @param {object}   args
 * @param {string}   args["template"]  Template path (not used, but available)
 * @param {*}        args["value"]     Value about to be stored in ctx
 * @param {object}   output
 * @param {object}   tools
 * @param {Function} tools.log
 */
function transform(args, output, tools) {
  const log   = (tools && tools.log) || (() => {});
  const value = args['value'];

  if (!isPieceObject(value)) {
    output.response = true;
    return;
  }

  const siteRoot = process.cwd();

  // Deep-clone the piece object so we don't mutate the original
  const piece = JSON.parse(JSON.stringify(value));

  for (const [field, lang] of PIECE_FIELDS) {
    const content = piece[field] && piece[field][lang];
    if (!content) continue; // falsy — leave untouched

    const category = classify(content);
    log(`  [resolve-piece-content] ${piece.slug}.${field}.${lang} → ${category}`);

    try {
      piece[field][lang] = processField(content, siteRoot);
    } catch (e) {
      // Re-throw as a build failure with full context
      throw new Error(
        `[resolve-piece-content] Failed processing "${piece.slug}.${field}.${lang}": ${e.message}`
      );
    }
  }

  output.response = piece;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  transform,
  classify,
  processField,
  resolveSafePath,
  isPieceObject,
  renderMd,
  CATEGORY,
};
