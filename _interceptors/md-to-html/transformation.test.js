'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fsp    = require('fs/promises');
const path   = require('path');
const os     = require('os');

const {
  isExternalUrl,
  renderLink,
  mdToHtml,
  mdFileToHtml,
  transform,
} = require('./transformation');

// ---------------------------------------------------------------------------
// isExternalUrl
// ---------------------------------------------------------------------------

describe('isExternalUrl', () => {
  it('recognises https', ()  => assert.ok(isExternalUrl('https://example.com')));
  it('recognises http',  ()  => assert.ok(isExternalUrl('http://example.com')));
  it('recognises mailto', () => assert.ok(isExternalUrl('mailto:a@b.com')));
  it('recognises ftp',   ()  => assert.ok(isExternalUrl('ftp://files.example.com')));
  it('recognises protocol-relative', () => assert.ok(isExternalUrl('//cdn.example.com/x.js')));
  it('rejects root-relative',   () => assert.equal(isExternalUrl('/en/home.html'), false));
  it('rejects relative path',   () => assert.equal(isExternalUrl('../page.html'), false));
  it('rejects plain anchor',    () => assert.equal(isExternalUrl('#section'), false));
  it('rejects empty string',    () => assert.equal(isExternalUrl(''), false));
  it('rejects null',            () => assert.equal(isExternalUrl(null), false));
});

// ---------------------------------------------------------------------------
// renderLink
// ---------------------------------------------------------------------------

describe('renderLink', () => {
  it('adds target and rel for external links', () => {
    const html = renderLink('https://example.com', null, 'Visit');
    assert.ok(html.includes('target="_blank"'), html);
    assert.ok(html.includes('rel="noopener noreferrer"'), html);
    assert.ok(html.includes('href="https://example.com"'), html);
    assert.ok(html.includes('>Visit<'), html);
  });

  it('does not add target/rel for internal links', () => {
    const html = renderLink('/en/home.html', null, 'Home');
    assert.ok(!html.includes('target'), html);
    assert.ok(!html.includes('rel='), html);
  });

  it('includes title attribute when provided', () => {
    const html = renderLink('https://example.com', 'My title', 'Link');
    assert.ok(html.includes('title="My title"'), html);
  });

  it('omits title attribute when null', () => {
    const html = renderLink('/page.html', null, 'Link');
    assert.ok(!html.includes('title'), html);
  });

  it('handles mailto as external', () => {
    const html = renderLink('mailto:a@b.com', null, 'Email');
    assert.ok(html.includes('target="_blank"'), html);
  });
});

// ---------------------------------------------------------------------------
// mdToHtml
// ---------------------------------------------------------------------------

describe('mdToHtml', () => {
  it('converts heading', () => {
    const html = mdToHtml('# Hello');
    assert.ok(html.includes('<h1>Hello</h1>'), html);
  });

  it('converts bold', () => {
    const html = mdToHtml('**bold**');
    assert.ok(html.includes('<strong>bold</strong>'), html);
  });

  it('converts italic', () => {
    const html = mdToHtml('_italic_');
    assert.ok(html.includes('<em>italic</em>'), html);
  });

  it('converts paragraph', () => {
    const html = mdToHtml('Hello world');
    assert.ok(html.includes('<p>Hello world</p>'), html);
  });

  it('converts unordered list', () => {
    const html = mdToHtml('- one\n- two');
    assert.ok(html.includes('<ul>'), html);
    assert.ok(html.includes('<li>one</li>'), html);
  });

  it('converts ordered list', () => {
    const html = mdToHtml('1. first\n2. second');
    assert.ok(html.includes('<ol>'), html);
    assert.ok(html.includes('<li>first</li>'), html);
  });

  it('converts blockquote', () => {
    const html = mdToHtml('> quoted');
    assert.ok(html.includes('<blockquote>'), html);
  });

  it('converts inline code', () => {
    const html = mdToHtml('`code`');
    assert.ok(html.includes('<code>code</code>'), html);
  });

  it('converts fenced code block', () => {
    const html = mdToHtml('```\ncode block\n```');
    assert.ok(html.includes('<pre>'), html);
    assert.ok(html.includes('<code>'), html);
  });

  it('converts horizontal rule', () => {
    const html = mdToHtml('---');
    assert.ok(html.includes('<hr'), html);
  });

  it('applies external link attributes via custom renderer', () => {
    const html = mdToHtml('[Visit](https://example.com)');
    assert.ok(html.includes('target="_blank"'), html);
    assert.ok(html.includes('rel="noopener noreferrer"'), html);
  });

  it('does not add target/rel to internal links', () => {
    const html = mdToHtml('[Home](/en/home.html)');
    assert.ok(!html.includes('target'), html);
  });

  it('produces no inline styles', () => {
    const html = mdToHtml('# Title\n\n**bold** and _italic_');
    assert.ok(!html.includes('style='), html);
  });

  it('produces no class attributes', () => {
    const html = mdToHtml('# Title\n\nA paragraph.');
    assert.ok(!html.includes('class='), html);
  });

  it('returns empty string for empty input', () => {
    assert.equal(mdToHtml(''), '');
  });

  it('returns empty string for null', () => {
    assert.equal(mdToHtml(null), '');
  });
});

// ---------------------------------------------------------------------------
// mdFileToHtml
// ---------------------------------------------------------------------------

describe('mdFileToHtml', () => {
  let tmpDir;
  let mdFile;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'statico-md-'));
    mdFile = path.join(tmpDir, 'test.md');
    await fsp.writeFile(mdFile, '# File heading\n\nFile paragraph.', 'utf8');
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads and converts a markdown file', () => {
    const html = mdFileToHtml(mdFile);
    assert.ok(html.includes('<h1>File heading</h1>'), html);
    assert.ok(html.includes('<p>File paragraph.</p>'), html);
  });

  it('throws for missing file', () => {
    assert.throws(() => mdFileToHtml('/nonexistent/file.md'));
  });
});

// ---------------------------------------------------------------------------
// transform
// ---------------------------------------------------------------------------

describe('transform', () => {
  const log = () => {};

  it('converts "text" argument', () => {
    const output = {};
    transform({ text: '# Hi' }, output, { log });
    assert.ok(output.response.includes('<h1>Hi</h1>'), output.response);
  });

  it('"text" takes precedence over "file"', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'statico-md2-'));
    const f = path.join(tmpDir, 'x.md');
    await fsp.writeFile(f, '# From file', 'utf8');
    const output = {};
    transform({ text: '# From text', file: f }, output, { log });
    assert.ok(output.response.includes('From text'), output.response);
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('converts "file" argument', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'statico-md3-'));
    const f = path.join(tmpDir, 'bio.md');
    await fsp.writeFile(f, 'A **biography**.', 'utf8');
    const output = {};
    transform({ file: f }, output, { log });
    assert.ok(output.response.includes('<strong>biography</strong>'), output.response);
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('sets empty string when neither argument provided', () => {
    const output = {};
    transform({}, output, { log });
    assert.equal(output.response, '');
  });

  it('sets empty string and logs when file is missing', () => {
    const output = {};
    const logs = [];
    transform({ file: '/nonexistent/bio.md' }, output, { log: m => logs.push(m) });
    assert.equal(output.response, '');
    assert.ok(logs.some(l => l.includes('Failed to read')));
  });

  it('works without tools argument', () => {
    const output = {};
    assert.doesNotThrow(() => transform({ text: 'hello' }, output, null));
    assert.ok(output.response.includes('hello'));
  });
});
