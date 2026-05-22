'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fsp    = require('fs/promises');
const path   = require('path');
const os     = require('os');

const {
  classify,
  processField,
  resolveSafePath,
  isPieceObject,
  renderMd,
  transform,
  CATEGORY,
} = require('./transformation');

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

describe('classify', () => {

  // inline HTML
  it('classifies string with <p> as inline HTML', () => {
    assert.equal(classify('<p>Hello world</p>'), CATEGORY.INLINE_HTML);
  });
  it('classifies string with <strong> as inline HTML', () => {
    assert.equal(classify('Some <strong>bold</strong> text'), CATEGORY.INLINE_HTML);
  });
  it('does NOT classify bare <br> as inline HTML', () => {
    assert.notEqual(classify('Line one<br>Line two'), CATEGORY.INLINE_HTML);
  });
  it('does NOT classify <br/> as inline HTML', () => {
    assert.notEqual(classify('Line one<br/>Line two'), CATEGORY.INLINE_HTML);
  });
  it('does NOT classify <br /> as inline HTML', () => {
    assert.notEqual(classify('Line one<br />Line two'), CATEGORY.INLINE_HTML);
  });

  // HTML file path
  it('classifies path ending in .html as HTML file', () => {
    assert.equal(classify('contents/text/bio.html'), CATEGORY.HTML_FILE);
  });
  it('classifies root-relative .html path as HTML file', () => {
    assert.equal(classify('/contents/text/bio.html'), CATEGORY.HTML_FILE);
  });
  it('classifies .html path with trailing whitespace as HTML file', () => {
    assert.equal(classify('contents/text/bio.html  '), CATEGORY.HTML_FILE);
  });
  it('does NOT classify multiline string ending in .html as HTML file', () => {
    assert.notEqual(classify('Some text\ncontents/bio.html'), CATEGORY.HTML_FILE);
  });

  // MD file path
  it('classifies path ending in .md as MD file', () => {
    assert.equal(classify('contents/text/notes-en.md'), CATEGORY.MD_FILE);
  });
  it('classifies root-relative .md path as MD file', () => {
    assert.equal(classify('/contents/pieces/fulgura/notes.md'), CATEGORY.MD_FILE);
  });
  it('does NOT classify multiline string ending in .md as MD file', () => {
    assert.notEqual(classify('Some text\ncontents/notes.md'), CATEGORY.MD_FILE);
  });

  // inline MD
  it('classifies plain text as inline MD', () => {
    assert.equal(classify('Just some plain text'), CATEGORY.INLINE_MD);
  });
  it('classifies TBD as inline MD', () => {
    assert.equal(classify('TBD'), CATEGORY.INLINE_MD);
  });
  it('classifies MD with formatting as inline MD', () => {
    assert.equal(classify('# Heading\n\nSome **bold** text.'), CATEGORY.INLINE_MD);
  });
  it('classifies MD link containing .md as inline MD (not a file path)', () => {
    assert.equal(classify('See [notes](contents/notes.md) for details'), CATEGORY.INLINE_MD);
  });
});

// ---------------------------------------------------------------------------
// resolveSafePath
// ---------------------------------------------------------------------------

describe('resolveSafePath', () => {
  const siteRoot = '/site/root';

  it('resolves a relative path within site root', () => {
    const result = resolveSafePath('contents/text/bio.md', siteRoot);
    assert.equal(result, '/site/root/contents/text/bio.md');
  });

  it('resolves a root-relative path by stripping leading slash', () => {
    const result = resolveSafePath('/contents/text/bio.md', siteRoot);
    assert.equal(result, '/site/root/contents/text/bio.md');
  });

  it('throws when path escapes site root via ../', () => {
    assert.throws(
      () => resolveSafePath('../../other-site/secret.md', siteRoot),
      /outside the site root/
    );
  });

  it('throws when deeply nested path traverses outside site root', () => {
    assert.throws(
      () => resolveSafePath('contents/../../../../../../other-site/secret.md', siteRoot),
      /outside the site root/
    );
  });

  it('allows path equal to site root itself', () => {
    assert.doesNotThrow(() => resolveSafePath('.', siteRoot));
  });
});

// ---------------------------------------------------------------------------
// isPieceObject
// ---------------------------------------------------------------------------

describe('isPieceObject', () => {
  it('returns true for object with slug, summary, programNotes', () => {
    assert.ok(isPieceObject({ slug: 'x', summary: {}, programNotes: {} }));
  });
  it('returns false for object missing slug', () => {
    assert.equal(isPieceObject({ summary: {}, programNotes: {} }), false);
  });
  it('returns false for object missing summary', () => {
    assert.equal(isPieceObject({ slug: 'x', programNotes: {} }), false);
  });
  it('returns false for object missing programNotes', () => {
    assert.equal(isPieceObject({ slug: 'x', summary: {} }), false);
  });
  it('returns false for null', () => {
    assert.equal(isPieceObject(null), false);
  });
  it('returns false for array', () => {
    assert.equal(isPieceObject([]), false);
  });
  it('returns false for string', () => {
    assert.equal(isPieceObject('hello'), false);
  });
});

// ---------------------------------------------------------------------------
// processField — uses temp files for file-based cases
// ---------------------------------------------------------------------------

describe('processField', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'statico-rpc-'));
    await fsp.writeFile(path.join(tmpDir, 'notes.html'), '<p>HTML content</p>', 'utf8');
    await fsp.writeFile(path.join(tmpDir, 'notes.md'), '# MD heading\n\nMD content.', 'utf8');
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes through inline HTML unchanged', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    assert.equal(processField(input, tmpDir), input);
  });

  it('reads HTML file and substitutes content', () => {
    const result = processField('notes.html', tmpDir);
    assert.ok(result.includes('<p>HTML content</p>'), result);
  });

  it('reads MD file, renders to HTML, and substitutes', () => {
    const result = processField('notes.md', tmpDir);
    assert.ok(result.includes('<h1>MD heading</h1>'), result);
    assert.ok(result.includes('<p>MD content.</p>'), result);
  });

  it('renders inline MD to HTML', () => {
    const result = processField('# Inline\n\nSome text.', tmpDir);
    assert.ok(result.includes('<h1>Inline</h1>'), result);
  });

  it('renders TBD as inline MD (produces paragraph)', () => {
    const result = processField('TBD', tmpDir);
    assert.ok(result.includes('TBD'), result);
  });

  it('throws for missing HTML file', () => {
    assert.throws(
      () => processField('nonexistent.html', tmpDir),
      /HTML file not found/
    );
  });

  it('throws for missing MD file', () => {
    assert.throws(
      () => processField('nonexistent.md', tmpDir),
      /MD file not found/
    );
  });

  it('throws for path escaping site root', () => {
    assert.throws(
      () => processField('../../escape.md', tmpDir),
      /outside the site root/
    );
  });

  it('resolves root-relative path correctly', () => {
    // /notes.html should resolve to tmpDir/notes.html
    const result = processField('/notes.html', tmpDir);
    assert.ok(result.includes('<p>HTML content</p>'), result);
  });
});

// ---------------------------------------------------------------------------
// transform
// ---------------------------------------------------------------------------

describe('transform', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'statico-rpc-tr-'));
    await fsp.writeFile(
      path.join(tmpDir, 'notes-en.md'),
      '# English notes\n\nSome content.',
      'utf8'
    );
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // Save and restore CWD around each test that needs it
  let savedCwd;
  before(() => { savedCwd = process.cwd(); });
  after(() => { process.chdir(savedCwd); });

  it('passes through non-piece values unchanged', () => {
    const output = {};
    transform({ 'template': 'x.html', 'value': { title: 'hello' } }, output, { log: () => {} });
    assert.equal(output.response, true);
  });

  it('passes through string values unchanged', () => {
    const output = {};
    transform({ 'template': 'x.html', 'value': 'just a string' }, output, { log: () => {} });
    assert.equal(output.response, true);
  });

  it('passes through null unchanged', () => {
    const output = {};
    transform({ 'template': 'x.html', 'value': null }, output, { log: () => {} });
    assert.equal(output.response, true);
  });

  it('processes inline MD fields on a piece object', () => {
    const piece = {
      slug: 'test-piece',
      title: { en: 'Test', ro: 'Test' },
      summary: { en: '# Summary\n\nA paragraph.', ro: 'TBD' },
      programNotes: { en: 'TBD', ro: 'TBD' },
    };
    const output = {};
    transform({ 'template': 'piece.html', 'value': piece }, output, { log: () => {} });
    assert.ok(typeof output.response === 'object');
    assert.ok(output.response.summary.en.includes('<h1>Summary</h1>'), output.response.summary.en);
  });

  it('leaves falsy fields untouched', () => {
    const piece = {
      slug: 'test-piece',
      summary: { en: 'Some text.', ro: null },
      programNotes: { en: 'TBD', ro: '' },
    };
    const output = {};
    transform({ 'template': 'piece.html', 'value': piece }, output, { log: () => {} });
    assert.equal(output.response.summary.ro, null);
    assert.equal(output.response.programNotes.ro, '');
  });

  it('leaves inline HTML fields untouched', () => {
    const html = '<p>Already <strong>HTML</strong>.</p>';
    const piece = {
      slug: 'test-piece',
      summary: { en: html, ro: 'TBD' },
      programNotes: { en: 'TBD', ro: 'TBD' },
    };
    const output = {};
    transform({ 'template': 'piece.html', 'value': piece }, output, { log: () => {} });
    assert.equal(output.response.summary.en, html);
  });

  it('does not mutate the original value object', () => {
    const piece = {
      slug: 'test-piece',
      summary: { en: '# Heading', ro: 'TBD' },
      programNotes: { en: 'TBD', ro: 'TBD' },
    };
    const original = JSON.stringify(piece);
    const output = {};
    transform({ 'template': 'piece.html', 'value': piece }, output, { log: () => {} });
    assert.equal(JSON.stringify(piece), original);
  });

  it('reads an MD file when field contains a .md path', () => {
    process.chdir(tmpDir);
    const piece = {
      slug: 'test-piece',
      summary: { en: 'notes-en.md', ro: 'TBD' },
      programNotes: { en: 'TBD', ro: 'TBD' },
    };
    const output = {};
    transform({ 'template': 'piece.html', 'value': piece }, output, { log: () => {} });
    assert.ok(output.response.summary.en.includes('<h1>English notes</h1>'),
      output.response.summary.en);
  });

  it('throws a descriptive error for a missing file', () => {
    process.chdir(tmpDir);
    const piece = {
      slug: 'bad-piece',
      summary: { en: 'nonexistent.md', ro: 'TBD' },
      programNotes: { en: 'TBD', ro: 'TBD' },
    };
    const output = {};
    assert.throws(
      () => transform({ 'template': 'piece.html', 'value': piece }, output, { log: () => {} }),
      /bad-piece\.summary\.en/
    );
  });
});
