'use strict';

/**
 * transformation.js — site.relativize-links
 *
 * Rewrites site-root-relative href and src attribute values to
 * file-relative equivalents, based on the output file's location
 * within _out/.
 *
 * Example:
 *   File being written : _out/en/portfolio/music/fulgura.html
 *   Root-relative link : /assets/css/site.css
 *   Rewritten to       : ../../../assets/css/site.css
 *
 * Only rewrites values that begin with "/" and are not protocol-relative
 * ("//") or absolute URLs ("http://", "https://", "mailto:", etc.).
 *
 * Fires as an output step interceptor. Receives:
 *   args["content"]   — the full HTML string about to be written
 *   args["file-path"] — the absolute path of the output file
 *
 * Returns the rewritten HTML via output.response, or true if nothing
 * needed rewriting.
 */

const path = require('path');

// Matches href="..." and src="..." (single or double quotes).
// Captures: [1] attribute name, [2] quote char, [3] attribute value.
const ATTR_RE = /\b(href|src|action)=(['"])([^'"]+)\2/g;

/**
 * Determine whether a URL value should be rewritten.
 * Only rewrites values that are root-relative (start with exactly one "/",
 * not "//") and are not data URIs.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isRootRelative(value) {
  if (!value || value.length < 2)        return false;
  if (!value.startsWith('/'))            return false;
  if (value.startsWith('//'))            return false;  // protocol-relative
  if (/^[a-z][a-z0-9+\-.]*:/i.test(value)) return false; // absolute URL / mailto / etc.
  return true;
}

/**
 * Rewrite all root-relative attribute values in an HTML string to paths
 * relative to the given output file.
 *
 * @param {string} html           Full HTML content
 * @param {string} outFilePath    Absolute path to the output file
 * @param {string} outDir         Absolute path to the _out directory
 * @returns {{ html: string, count: number }}
 */
function relativizeHtml(html, outFilePath, outDir) {
  let count = 0;

  const result = html.replace(ATTR_RE, (match, attr, quote, value) => {
    if (!isRootRelative(value)) return match;

    // The root-relative path is relative to _out/, so strip the leading "/"
    // and resolve it from outDir.
    const absoluteTarget = path.join(outDir, value.replace(/^\//, ''));

    // Compute relative path from the directory containing the output file
    const fromDir  = path.dirname(outFilePath);
    let   relative = path.relative(fromDir, absoluteTarget);

    // On Windows path.relative uses backslashes — normalise to forward slashes
    relative = relative.split(path.sep).join('/');

    // path.relative returns '' when from === to; use './' in that case
    if (!relative) relative = './';

    // Ensure the result doesn't accidentally look absolute
    if (!relative.startsWith('.') && !relative.startsWith('/')) {
      relative = './' + relative;
    }

    count++;
    return `${attr}=${quote}${relative}${quote}`;
  });

  return { html: result, count };
}

/**
 * Entry point for the site.relativize-links interceptor.
 *
 * @param {object} args             Named arguments injected by the engine
 * @param {string} args["content"]   HTML content about to be written to disk
 * @param {string} args["file-path"] Absolute path of the output file
 * @param {object} output           Injected response recipient
 * @param {*}      output.response  Set to rewritten HTML, or true if unchanged
 * @param {object} tools            Injected utilities
 * @param {Function} tools.log      Logging function
 */
function transform(args, output, tools) {
  const html        = args['content'];
  const outFilePath = args['file-path'];
  const log         = (tools && tools.log) || (() => {});

  // Only process HTML files
  if (!outFilePath || !outFilePath.endsWith('.html')) {
    output.response = true;
    return;
  }

  if (!html || typeof html !== 'string') {
    output.response = true;
    return;
  }

  // Derive _out/ directory from the file path:
  // outFilePath is something like /abs/path/_out/en/home.html
  // We find _out by walking up until we hit a segment named "_out"
  const segments = outFilePath.split(path.sep);
  const outIdx   = segments.lastIndexOf('_out');

  if (outIdx === -1) {
    log(`  [relativize-links] Could not locate _out/ in path: ${outFilePath} — skipping`);
    output.response = true;
    return;
  }

  const outDir = segments.slice(0, outIdx + 1).join(path.sep);

  const { html: rewritten, count } = relativizeHtml(html, outFilePath, outDir);

  if (count > 0) {
    log(`  [relativize-links] ${path.relative(outDir, outFilePath)}: ${count} link(s) relativized`);
    output.response = rewritten;
  } else {
    output.response = true;
  }
}

module.exports = { transform, relativizeHtml, isRootRelative };
