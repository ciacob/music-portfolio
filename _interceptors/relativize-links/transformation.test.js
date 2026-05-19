'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');

const { relativizeHtml, isRootRelative, transform } = require('./transformation');

// Simulate an absolute _out directory for all tests
const OUT_DIR = path.join('/site', '_out');

// Helper: build an absolute output file path
function outFile(...segments) {
  return path.join(OUT_DIR, ...segments);
}

// ---------------------------------------------------------------------------
// isRootRelative
// ---------------------------------------------------------------------------

describe('isRootRelative', () => {
  it('accepts root-relative path', () => {
    assert.ok(isRootRelative('/assets/css/site.css'));
  });
  it('accepts root-relative path with query', () => {
    assert.ok(isRootRelative('/en/home.html'));
  });
  it('rejects protocol-relative URL', () => {
    assert.equal(isRootRelative('//cdn.example.com/x.js'), false);
  });
  it('rejects absolute https URL', () => {
    assert.equal(isRootRelative('https://example.com/x'), false);
  });
  it('rejects mailto', () => {
    assert.equal(isRootRelative('mailto:a@b.com'), false);
  });
  it('rejects relative path', () => {
    assert.equal(isRootRelative('../assets/x.css'), false);
  });
  it('rejects empty string', () => {
    assert.equal(isRootRelative(''), false);
  });
  it('rejects data URI', () => {
    assert.equal(isRootRelative('data:image/png;base64,abc'), false);
  });
});

// ---------------------------------------------------------------------------
// relativizeHtml — same-depth file (en/home.html)
// ---------------------------------------------------------------------------

describe('relativizeHtml — shallow file (en/home.html)', () => {
  const file = outFile('en', 'home.html');

  it('rewrites stylesheet link', () => {
    const { html } = relativizeHtml('<link href="/assets/css/site.css">', file, OUT_DIR);
    assert.ok(html.includes('../assets/css/site.css'), html);
  });

  it('rewrites script src', () => {
    const { html } = relativizeHtml('<script src="/assets/js/app.js">', file, OUT_DIR);
    assert.ok(html.includes('../assets/js/app.js'), html);
  });

  it('rewrites same-language page link', () => {
    const { html } = relativizeHtml('<a href="/en/contact.html">', file, OUT_DIR);
    assert.ok(html.includes('contact.html'), html);
    assert.ok(!html.includes('/en/'), html);
  });

  it('rewrites cross-language link', () => {
    const { html } = relativizeHtml('<a href="/ro/home.html">', file, OUT_DIR);
    assert.ok(html.includes('../ro/home.html'), html);
  });

  it('counts rewritten links', () => {
    const { count } = relativizeHtml(
      '<link href="/a.css"><a href="/b.html"><img src="/c.png">',
      file, OUT_DIR
    );
    assert.equal(count, 3);
  });

  it('leaves external links untouched', () => {
    const input = '<a href="https://example.com">';
    const { html, count } = relativizeHtml(input, file, OUT_DIR);
    assert.equal(html, input);
    assert.equal(count, 0);
  });

  it('leaves mailto links untouched', () => {
    const input = '<a href="mailto:a@b.com">';
    const { html, count } = relativizeHtml(input, file, OUT_DIR);
    assert.equal(html, input);
    assert.equal(count, 0);
  });

  it('leaves already-relative links untouched', () => {
    const input = '<a href="../portfolio/music/fulgura.html">';
    const { html, count } = relativizeHtml(input, file, OUT_DIR);
    assert.equal(html, input);
    assert.equal(count, 0);
  });

  it('handles single-quoted attributes', () => {
    const { html } = relativizeHtml("<link href='/assets/css/site.css'>", file, OUT_DIR);
    assert.ok(html.includes("'../assets/css/site.css'"), html);
  });
});

// ---------------------------------------------------------------------------
// relativizeHtml — deep file (en/portfolio/music/fulgura.html)
// ---------------------------------------------------------------------------

describe('relativizeHtml — deep file (en/portfolio/music/fulgura.html)', () => {
  const file = outFile('en', 'portfolio', 'music', 'fulgura.html');

  it('rewrites stylesheet with correct depth', () => {
    const { html } = relativizeHtml('<link href="/assets/css/site.css">', file, OUT_DIR);
    assert.ok(html.includes('../../../assets/css/site.css'), html);
  });

  it('rewrites sibling piece link', () => {
    const { html } = relativizeHtml('<a href="/en/portfolio/music/hortus.html">', file, OUT_DIR);
    assert.ok(html.includes('hortus.html'), html);
    // Should not have any ../ since it's in the same directory
    assert.ok(!html.includes('../'), html);
  });

  it('rewrites nav link to home', () => {
    const { html } = relativizeHtml('<a href="/en/home.html">', file, OUT_DIR);
    assert.ok(html.includes('../../../en/home.html') || html.includes('../../home.html'), html);
  });

  it('rewrites cross-language equivalent', () => {
    const { html } = relativizeHtml('<a href="/ro/portfolio/music/fulgura.html">', file, OUT_DIR);
    assert.ok(html.includes('../../../ro/portfolio/music/fulgura.html'), html);
  });
});

// ---------------------------------------------------------------------------
// transform function
// ---------------------------------------------------------------------------

describe('transform', () => {
  const outFilePath = outFile('en', 'home.html');
  const log = () => {};

  it('rewrites HTML and sets output.response to rewritten string', () => {
    const output = {};
    transform(
      { 'content': '<link href="/assets/css/site.css">', 'file-path': outFilePath },
      output,
      { log }
    );
    assert.ok(typeof output.response === 'string');
    assert.ok(output.response.includes('../assets/css/site.css'), output.response);
  });

  it('sets output.response to true when nothing to rewrite', () => {
    const output = {};
    transform(
      { 'content': '<a href="https://example.com">', 'file-path': outFilePath },
      output,
      { log }
    );
    assert.equal(output.response, true);
  });

  it('sets output.response to true for non-HTML files', () => {
    const output = {};
    transform(
      { 'content': 'body { color: red; }', 'file-path': outFile('assets', 'css', 'site.css') },
      output,
      { log }
    );
    assert.equal(output.response, true);
  });

  it('sets output.response to true when content is empty', () => {
    const output = {};
    transform({ 'content': '', 'file-path': outFilePath }, output, { log });
    assert.equal(output.response, true);
  });

  it('sets output.response to true when _out not in path', () => {
    const output = {};
    transform(
      { 'content': '<link href="/x.css">', 'file-path': '/some/other/path/home.html' },
      output,
      { log }
    );
    assert.equal(output.response, true);
  });
});
