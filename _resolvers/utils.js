'use strict';

/**
 * utils.js — Resolver for the music portfolio site.
 *
 * All functions are pure or read-only with respect to the filesystem.
 * Functions that load files receive paths as arguments so they remain testable.
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Core helper: safe site-relative file resolution
// (mirrors the pattern from the scaffolded utils.js — always use this
//  instead of path.resolve() to remain CWD-independent)
// ---------------------------------------------------------------------------

function siteFile(siteRoot, ...parts) {
  return path.join(siteRoot, ...parts);
}

function readJson(siteRoot, relativePath) {
  return JSON.parse(fs.readFileSync(siteFile(siteRoot, relativePath), 'utf8'));
}


// ---------------------------------------------------------------------------
// Language helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a localised string field.
 * Falls back: requested lang → 'en' → first available value.
 *
 * @param {object|string} field   e.g. { en: "Hello", ro: "Bună" } or a plain string
 * @param {string}        lang    e.g. "en"
 * @returns {string}
 */
function t(field, lang) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] ?? field['en'] ?? Object.values(field)[0] ?? '';
}

/**
 * Return a script snippet that reads the "lang" cookie and redirects
 * to the equivalent page in the preferred language if the path doesn't
 * already start with that language segment.
 *
 * @param {string[]} languages
 * @param {string}   defaultLang
 * @returns {string}
 */
function getLangSwitcherScript(languages) {
  return `(function(){
  function setCookie(n,v,days){var d=new Date();d.setTime(d.getTime()+days*864e5);document.cookie=n+'='+v+';expires='+d.toUTCString()+';path=/';}
  var supported=${JSON.stringify(languages)};
  var segs=window.location.pathname.split('/');
  var langIdx=-1;
  for(var i=0;i<segs.length;i++){if(supported.indexOf(segs[i])!==-1){langIdx=i;break;}}
  document.querySelectorAll('[data-lang-switch]').forEach(function(el){
    el.addEventListener('click',function(e){
      e.preventDefault();
      var target=el.getAttribute('data-lang-switch');
      setCookie('lang',target,365);
      if(langIdx!==-1){
        var next=segs.slice();next[langIdx]=target;
        window.location.href=next.join('/');
      }
    });
  });
})();`.trim();
}

// ---------------------------------------------------------------------------
// Piece registry
// ---------------------------------------------------------------------------

/**
 * Load all piece JSON files from a directory and return them as an array.
 * Files that cannot be parsed are skipped with a console warning.
 *
 * @param {string} piecesDir   Absolute or relative path to contents/pieces/
 * @returns {object[]}
 */
function loadPieces(piecesDir) {
  const abs = siteFile(piecesDir);
  if (!fs.existsSync(abs)) return [];

  return fs.readdirSync(abs)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(siteFile(abs, f), 'utf8'));
      } catch (e) {
        console.warn(`[utils] Could not parse piece file "${f}": ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Return up to N most recent finished pieces, sorted by completedOn descending.
 *
 * @param {object[]} pieces
 * @param {number}   [n=3]
 * @returns {object[]}
 */
function getRecentPieces(pieces, n) {
  const count = parseInt(n, 10) || 3;
  return pieces
    .filter(p => p.imprint && p.imprint.state === 'finished' && p.imprint.completedOn)
    .sort((a, b) => b.imprint.completedOn.localeCompare(a.imprint.completedOn))
    .slice(0, count);
}

/**
 * Given a piece slug and the featured items array from commons,
 * return the matching featured item (with its description), or null.
 *
 * @param {object[]} featuredItems
 * @param {string}   slug
 * @returns {object|null}
 */
function getFeaturedItem(featuredItems, slug) {
  return featuredItems.find(f => f.slug === slug) || null;
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the display label for a tag value in the given language.
 *
 * @param {object[]} tags    Global tags array from tags.json
 * @param {string}   value   Tag value, e.g. "piano"
 * @param {string}   lang
 * @returns {string}
 */
function getTagLabel(tags, value, lang) {
  const tag = tags.find(t => t.value === value);
  if (!tag) return value;
  return t(tag.labels, lang);
}

/**
 * Given a piece's tag values and the global tags array, return full tag objects
 * (with resolved labels for the given language).
 *
 * @param {object[]} allTags
 * @param {string[]} pieceTagValues
 * @param {string}   lang
 * @returns {{ value: string, label: string }[]}
 */
function resolvePieceTags(allTags, pieceTagValues, lang) {
  return (pieceTagValues || []).map(value => ({
    value,
    label: getTagLabel(allTags, value, lang),
  }));
}

// ---------------------------------------------------------------------------
// HTML fragment builders
// These return HTML strings and are used in resolve steps to build
// repeated structures (nav items, tag chips, contact means, etc.)
// ---------------------------------------------------------------------------

/**
 * Build the <li> items for the main navigation.
 *
 * @param {object[]} navItems    commons.nav array
 * @param {string}   lang
 * @param {string}   currentSlug  slug of the active page, or ''
 * @returns {string}  HTML string of <li> elements
 */
function buildNavItems(navItems, lang, currentSlug) {
  return navItems.map(item => {
    const active = item.slug === currentSlug ? ' aria-current="page"' : '';
    const label  = t(item.label, lang);
    return `    <li class="nav__item">
      <a class="nav__link${item.slug === currentSlug ? ' nav__link--active' : ''}" href="/${lang}/${item.path}"${active}>${label}</a>
    </li>`;
  }).join('\n');
}

/**
 * Build the language picker <li> items.
 *
 * @param {string[]} languages
 * @param {string}   currentLang
 * @returns {string}
 */
function buildLangPickerItems(languages, currentLang) {
  return languages.map(lang => {
    const active = lang === currentLang;
    return `    <li class="lang-picker__item${active ? ' lang-picker__item--active' : ''}">
      <button class="lang-picker__btn${active ? ' lang-picker__btn--active' : ''}"
              data-lang-switch="${lang}"
              aria-pressed="${active}"
              aria-label="Switch to ${lang.toUpperCase()}">${lang.toUpperCase()}</button>
    </li>`;
  }).join('\n');
}

/**
 * Build the footer sections HTML.
 *
 * @param {object[]} sections   commons.footer.sections
 * @param {string}   lang
 * @returns {string}
 */
function buildFooterSections(sections, lang) {
  return sections.map(s => `  <section class="footer__section">
    <h3 class="footer__section-heading">
      <a class="footer__section-link" href="/${lang}/${s.headingHref}">${t(s.heading, lang)}<small>↗</small></a>
    </h3>
    <div class="footer__section-text">${t(s.text, lang)}</div>
  </section>`).join('\n');
}

/**
 * Build contact mean items HTML.
 *
 * @param {object[]} means   commons.contact.means
 * @param {string}   lang
 * @returns {string}
 */
function buildContactMeans(means, lang) {
  return means.map(m => {
    const ctaHtml = m.cta
      ? `\n      <a class="contact-mean__cta" href="${m.cta.href}">${t(m.cta.label, lang)}</a>`
      : '';
    return `  <article class="contact-mean" id="contact-${m.id}">
    <img class="contact-mean__icon" src="/${m.icon}" alt="" aria-hidden="true" />
    <div class="contact-mean__body">
      <h3 class="contact-mean__heading">${t(m.heading, lang)}</h3>
      <p class="contact-mean__subheading">${t(m.subheading, lang)}</p>${ctaHtml}
    </div>
  </article>`;
  }).join('\n');
}

/**
 * Build the directory page's list of piece cards.
 *
 * @param {object[]} pieces
 * @param {string}   lang
 * @param {object[]} allTags
 * @returns {string}
 */
function buildDirectoryItems(pieces, lang, allTags) {
  return pieces.map(p => {
    const tagValues  = (p.tags || []).join(' ');
    const tagChips   = (p.tags || []).map(v =>
      `<span class="piece-card__tag" data-tag="${v}">${getTagLabel(allTags, v, lang)}</span>`
    ).join('');
    const titleText  = t(p.title, lang);
    const subtitleText = t(p.subtitle, lang);
    const summaryText  = t(p.summary, lang);

    // Program notes stripped of HTML tags for data attribute (used in client-side search)
    const notesPlain = t(p.programNotes, lang).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return `  <article class="piece-card"
    data-slug="${p.slug}"
    data-tags="${tagValues}"
    data-title="${titleText.replace(/"/g, '&quot;')}"
    data-subtitle="${subtitleText.replace(/"/g, '&quot;')}"
    data-summary="${summaryText.replace(/"/g, '&quot;')}"
    data-notes="${notesPlain.replace(/"/g, '&quot;')}">
    <a class="piece-card__link" href="/${lang}/portfolio/music/${p.slug}.html">
      <img class="piece-card__image" src="/${p.picture}" alt="${t(p.pictureAlt, lang)}" loading="lazy" />
      <div class="piece-card__body">
        <h3 class="piece-card__title">${titleText}</h3>
        <p class="piece-card__subtitle">${subtitleText}</p>
        <div class="piece-card__tags" aria-label="Tags">${tagChips}</div>
      </div>
    </a>
  </article>`;
  }).join('\n');
}

/**
 * Build the directory page's tag filter checkboxes.
 *
 * @param {object[]} allTags
 * @param {string}   lang
 * @param {string}   labelAll   Localised "All" label
 * @returns {string}
 */
function buildTagFilters(allTags, lang, labelAll) {
  const allCheck = `  <label class="filter-tags__label filter-tags__label--all">
    <input class="filter-tags__checkbox" type="checkbox" name="tag" value="__all__" checked />
    <span>${labelAll}</span>
  </label>`;
  const tagChecks = allTags.map(tag =>
    `  <label class="filter-tags__label">
    <input class="filter-tags__checkbox" type="checkbox" name="tag" value="${tag.value}" />
    <span>${t(tag.labels, lang)}</span>
  </label>`
  ).join('\n');
  return allCheck + '\n' + tagChecks;
}

/**
 * Build the recent works sidebar items (up to 3).
 *
 * @param {object[]} pieces   Already filtered/sorted recent pieces
 * @param {string}   lang
 * @returns {string}
 */
function buildRecentItems(pieces, lang) {
  return pieces.map(p => {
    const completedLabel = p.imprint.completedOn || '';
    return `  <article class="recent-work">
    <a class="recent-work__link" href="/${lang}/portfolio/music/${p.slug}.html">
      <img class="recent-work__image" src="/${p.picture}" alt="${t(p.pictureAlt, lang)}" loading="lazy" />
      <div class="recent-work__body">
        <h4 class="recent-work__title">${t(p.title, lang)}<small>↗</small></h4>
        <p class="recent-work__date">${completedLabel}</p>
      </div>
    </a>
  </article>`;
  }).join('\n');
}

/**
 * Build the featured composition list items for the home page rider.
 *
 * @param {object[]} featuredItems   commons.home.featured.items
 * @param {object[]} pieces          Full piece registry
 * @param {string}   lang
 * @returns {string}
 */
function buildFeaturedItems(featuredItems, pieces, lang) {
  return featuredItems.map(fi => {
    const piece = pieces.find(p => p.slug === fi.slug);
    const title = piece ? t(piece.title, lang) : fi.slug;
    const desc  = t(fi.description, lang);
    return `    <li class="featured-works__item">
      <a class="featured-works__link" href="/${lang}/portfolio/music/${fi.slug}.html">
        <h4 class="featured-works__title">${title}<small>↗</small></h4>
      </a>
      <p class="featured-works__description">${desc}</p>
    </li>`;
  }).join('\n');
}

/**
 * Build the imprint table rows for a piece page.
 * Empty/null fields are rendered with an m-dash.
 *
 * @param {object} imprint   piece.imprint
 * @param {string} lang
 * @param {object} labels    Localised labels for each row heading
 * @returns {string}
 */
function buildImprintRows(imprint, lang, labels) {
  const dash = '—';
  const rows = [
    { key: 'orchestration', label: labels.orchestration },
    { key: 'lyrics',        label: labels.lyrics },
    { key: 'length',        label: labels.length },
    { key: 'state',         label: labels.state },
    { key: 'completedOn',   label: labels.completedOn },
    { key: 'premieredOn',   label: labels.premieredOn },
    { key: 'premieredBy',   label: labels.premieredBy },
    { key: 'honors',        label: labels.honors },
    { key: 'copyright',     label: labels.copyright },
  ];
  return rows.map(row => {
    const raw = imprint[row.key];
    const val = raw ? t(raw, lang) : dash;
    return `    <tr class="imprint__row">
      <th class="imprint__label" scope="row">${row.label}</th>
      <td class="imprint__value">${val}</td>
    </tr>`;
  }).join('\n');
}

/**
 * Build the piece tag chips for a piece detail page.
 *
 * @param {string[]} tagValues
 * @param {object[]} allTags
 * @param {string}   lang
 * @returns {string}
 */
function buildPieceTags(tagValues, allTags, lang) {
  return (tagValues || []).map(v =>
    `<span class="piece-tag" data-tag="${v}">${getTagLabel(allTags, v, lang)}</span>`
  ).join('\n');
}

/**
 * Return the current build date as a localised string.
 *
 * @param {string} lang
 * @returns {string}
 */
function buildDate(lang) {
  const d = new Date();
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Produce the state label string for a piece's imprint.
 *
 * @param {string} state   "finished" | "in-progress" | "refining"
 * @param {string} lang
 * @returns {string}
 */
function stateLabel(state, lang) {
  const labels = {
    finished:    { en: 'Finished',     ro: 'Finalizată' },
    'in-progress':{ en: 'In progress', ro: 'În lucru' },
    refining:    { en: 'Refining',     ro: 'Rafinare' },
  };
  return t(labels[state] || { en: state }, lang);
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Return the output path for a piece page given a language.
 * e.g. "en/portfolio/music/nocturne-op1.html"
 *
 * @param {string} slug
 * @param {string} lang
 * @returns {string}
 */
function pieceOutPath(slug, lang) {
  return `${lang}/portfolio/music/${slug}.html`;
}

/**
 * Return the ctx key for a resolved piece page.
 * e.g. "pages.en.pieces.nocturne-op1"
 * (hyphens replaced with underscores for safe dot-path use)
 *
 * @param {string} slug
 * @param {string} lang
 * @returns {string}
 */
function pieceCtxKey(slug, lang) {
  return `pages.${lang}.pieces.${slug.replace(/-/g, '_')}`;
}

/**
 * Entry-point index page data — language detection redirect.
 * No lang argument needed: this page is language-neutral.
 *
 * @returns {object}
 */
function prepareIndex() {
  const commons   = JSON.parse(fs.readFileSync('contents/commons.json', 'utf8'));
  const languages = commons.site.languages;
  const defaultLang = commons.site.defaultLanguage;

  const noScriptLinks = languages.map(lang => {
    const label = lang === 'ro'
      ? 'Versiunea în limba română'
      : 'English version';
    return `      <li><a href="/${lang}/home.html">${label}</a></li>`;
  }).join('\n');

  return {
    siteTitle:       t(commons.site.title, defaultLang),
    supportedLangs:  JSON.stringify(languages),
    defaultLang,
    noScriptMessage: 'Please choose your language:',
    noScriptLinks,
  };
}

module.exports = {
  utils: {
    t,
    getLangSwitcherScript,
    loadPieces,
    getRecentPieces,
    getFeaturedItem,
    getTagLabel,
    resolvePieceTags,
    buildNavItems,
    buildLangPickerItems,
    buildFooterSections,
    buildContactMeans,
    buildDirectoryItems,
    buildTagFilters,
    buildRecentItems,
    buildFeaturedItems,
    buildImprintRows,
    buildPieceTags,
    buildDate,
    stateLabel,
    pieceOutPath,
    pieceCtxKey,
  },
};

// ---------------------------------------------------------------------------
// Page data preparation functions
// These return plain objects that get stored directly in ctx.current.
// Templates then read ctx.current.* fields.
// ---------------------------------------------------------------------------

/**
 * Load tags.json from a path and return the parsed array.
 * @param {string} tagsPath  e.g. "contents/tags.json"
 * @returns {object[]}
 */
function loadTags(tagsPath) {
  const abs = siteFile(tagsPath);
  if (!fs.existsSync(abs)) return [];
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    console.warn('[utils] Could not parse tags file:', e.message);
    return [];
  }
}

/**
 * Load a single piece JSON by slug from the pieces directory.
 * @param {string} piecesDir
 * @param {string} slug
 * @returns {object|null}
 */
function loadPieceBySlug(piecesDir, slug) {
  const abs = siteFile(piecesDir, slug + '.json');
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Shared data needed by every page's partials (header, footer, html-open).
 * Merged into ctx.current before partials are resolved.
 *
 * @param {string} lang
 * @param {string} tagsPath
 * @returns {object}
 */
function prepareShared(lang) {
  const commons  = JSON.parse(fs.readFileSync('contents/commons.json', 'utf8'));
  const allTags  = loadTags('contents/tags.json');
  const languages = commons.site.languages;

  return {
    lang,
    siteTitle:         t(commons.site.title, lang),
    siteTagline:       t(commons.site.tagline, lang),
    metaDescription:   t(commons.site.tagline, lang),
    pageTitle:         t(commons.site.title, lang),
    bodyClass:         'default',
    langPickerItems:   buildLangPickerItems(languages, lang),
    menuLabel:         lang === 'ro' ? 'Meniu' : 'Menu',
    langPickerLabel:   lang === 'ro' ? 'Limbă' : 'Language',
    footerSections:    buildFooterSections(commons.footer.sections, lang),
    copyrightName:     t(commons.site.copyright, lang),
    lastUpdatedLabel:  lang === 'ro' ? 'Actualizat' : 'Last updated',
    buildDate:         buildDate(lang),
    langSwitcherScript: getLangSwitcherScript(languages),
  };
}

/**
 * Home page-specific data. Merged into ctx.current after prepareShared.
 *
 * @param {string} lang
 * @param {string} piecesDir
 * @returns {object}
 */
function prepareHome(lang) {
  const commons  = JSON.parse(fs.readFileSync('contents/commons.json', 'utf8'));
  const pieces   = loadPieces('contents/pieces');
  const recent   = getRecentPieces(pieces, 3);
  const h        = commons.home;
  const shared   = prepareShared(lang);

  return Object.assign({}, shared, {
    bodyClass:          'home',
    pageTitle:          lang === 'ro' ? 'Acasă' : 'Home',
    metaDescription:    t(h.bio.text, lang).replace(/<[^>]+>/g, ' ').trim().slice(0, 155),
    navCurrentSlug:     'home',
    navItems:           buildNavItems(commons.nav, lang, 'home'),
    riderLabel:         lang === 'ro' ? 'Prezentare' : 'Introduction',
    riderHeading:       t(h.rider.heading, lang),
    riderSubheading:    t(h.rider.subheading, lang),
    riderPicture:       h.rider.picture,
    riderPictureAlt:    t(h.rider.pictureAlt, lang),
    featuredHeading:    t(h.featured.heading, lang),
    featuredItems:      buildFeaturedItems(h.featured.items, pieces, lang),
    bioHeading:         t(h.bio.heading, lang),
    bioText:            t(h.bio.text, lang),
    recentHeading:      lang === 'ro' ? 'Lucrări recente' : 'Recent works',
    recentSubheading:   lang === 'ro' ? 'Cele mai recente compoziții finalizate' : 'Latest finished compositions',
    recentItems:        buildRecentItems(recent, lang),
  });
}

/**
 * Directory page-specific data.
 *
 * @param {string} lang
 * @param {string} piecesDir
 * @param {string} tagsPath
 * @returns {object}
 */
function prepareDirectory(lang) {
  const commons  = JSON.parse(fs.readFileSync('contents/commons.json', 'utf8'));
  const pieces   = loadPieces('contents/pieces');
  const allTags  = loadTags('contents/tags.json');
  const p        = commons.portfolio;
  const shared   = prepareShared(lang);

  // Attempt to list newer pieces first.
  pieces.sort((a, b) => {
    const yearOf = p => {
      const m = String(p.imprint && p.imprint.completedOn || '').match(/\d{4}/);
      return m ? parseInt(m[0], 10) : null;
    };
    const ya = yearOf(a), yb = yearOf(b);
    if (ya === null && yb === null) return 0;
    if (ya === null) return 1;
    if (yb === null) return -1;
    return yb - ya; // descending — newest first
  });

  return Object.assign({}, shared, {
    bodyClass:          'directory',
    pageTitle:          t(p.heading, lang),
    metaDescription:    t(p.subheading, lang),
    navCurrentSlug:     'portfolio',
    navItems:           buildNavItems(commons.nav, lang, 'portfolio'),
    heading:            t(p.heading, lang),
    subheading:         t(p.subheading, lang),
    filterLabel:        lang === 'ro' ? 'Filtrare lucrări' : 'Filter works',
    filterLabelTags:    t(p.filter.labelTags, lang),
    filterLabelAll:     t(p.filter.labelAll, lang),
    filterLabelPhrase:  t(p.filter.labelPhrase, lang),
    filterLabelIn:      t(p.filter.labelIn, lang),
    filterLabelTitle:   t(p.filter.labelTitle, lang),
    filterLabelSubtitle:t(p.filter.labelSubtitle, lang),
    filterLabelSummary: t(p.filter.labelSummary, lang),
    filterLabelNotes:   t(p.filter.labelNotes, lang),
    tagFilters:         buildTagFilters(allTags, lang, t(p.filter.labelAll, lang)),
    directoryItems:     buildDirectoryItems(pieces, lang, allTags),
  });
}

/**
 * Contact page-specific data.
 *
 * @param {string} lang
 * @returns {object}
 */
function prepareContact(lang) {
  const commons = JSON.parse(fs.readFileSync('contents/commons.json', 'utf8'));
  const c       = commons.contact;
  const shared  = prepareShared(lang);

  return Object.assign({}, shared, {
    bodyClass:        'contact',
    pageTitle:        t(c.heading, lang),
    metaDescription:  t(c.subheading, lang),
    navCurrentSlug:   'contact',
    navItems:         buildNavItems(commons.nav, lang, 'contact'),
    heading:          t(c.heading, lang),
    subheading:       t(c.subheading, lang),
    contactMeans:     buildContactMeans(c.means, lang),
  });
}

/**
 * Individual piece page-specific data.
 *
 * @param {string} slug
 * @param {string} lang
 * @param {string} piecesDir
 * @param {string} tagsPath
 * @returns {object}
 */
function preparePiece(slug, lang) {
  const commons  = JSON.parse(fs.readFileSync('contents/commons.json', 'utf8'));
  const allTags  = loadTags('contents/tags.json');
  const piece    = loadPieceBySlug('contents/pieces', slug);

  if (!piece) throw new Error(`Piece not found: ${slug}`);

  const imprintLabels = {
    orchestration: lang === 'ro' ? 'Orchestrație'   : 'Orchestration',
    lyrics:        lang === 'ro' ? 'Text'            : 'Lyrics',
    length:        lang === 'ro' ? 'Durată'          : 'Duration',
    state:         lang === 'ro' ? 'Stare'           : 'State',
    completedOn:   lang === 'ro' ? 'Finalizat'       : 'Completed',
    premieredOn:   lang === 'ro' ? 'Premieră'        : 'Premiered',
    premieredBy:   lang === 'ro' ? 'Interpretat de'  : 'Performed by',
    honors:        lang === 'ro' ? 'Distincții'      : 'Honors',
    copyright:     lang === 'ro' ? 'Copyright'       : 'Copyright',
  };

  const imprintData = Object.assign({}, piece.imprint, {
    state: stateLabel(piece.imprint.state, lang),
  });

  const shared = prepareShared(lang);

  return Object.assign({}, shared, {
    bodyClass:             'piece',
    pageTitle:             t(piece.title, lang),
    metaDescription:       t(piece.summary, lang),
    navCurrentSlug:        'portfolio',
    navItems:              buildNavItems(commons.nav, lang, 'portfolio'),
    pieceTitle:            t(piece.title, lang),
    pieceSubtitle:         t(piece.subtitle, lang),
    piecePicture:          piece.picture,
    piecePictureAlt:       t(piece.pictureAlt, lang),
    pieceSummary:          t(piece.summary, lang),
    pieceNotes:            t(piece.programNotes, lang),
    pieceTags:             buildPieceTags(piece.tags, allTags, lang),
    imprintRows:           buildImprintRows(imprintData, lang, imprintLabels),
    pieceScore:            piece.score,
    pieceRecording:        piece.recording,
    summaryLabel:          lang === 'ro' ? 'Rezumat'          : 'Summary',
    notesLabel:            lang === 'ro' ? 'Note de program'  : 'Program notes',
    tagsLabel:             lang === 'ro' ? 'Etichete'         : 'Tags',
    imprintLabel:          lang === 'ro' ? 'Fișă tehnică'     : 'Imprint',
    scoreLabel:            lang === 'ro' ? 'Partituri și înregistrări'        : 'Scores & Recordings',
    recordingLabel:        lang === 'ro' ? 'Înregistrare'     : 'Recording',
    scoreDownloadLabel:    lang === 'ro' ? 'Descarcă partitura (PDF)' : 'Download score (PDF)',
    recordingDownloadLabel:lang === 'ro' ? 'Descarcă înregistrarea (MP3)' : 'Download recording (MP3)',
    audioFallback:         lang === 'ro' ? 'Browserul dumneavoastră nu suportă audio HTML5.' : 'Your browser does not support HTML5 audio.',
  });
}

/**
 * Output path for a top-level page.
 * e.g. pageOutPath("home", "en") → "en/home.html"
 * e.g. pageOutPath("portfolio/music/directory", "ro") → "ro/portfolio/music/directory.html"
 *
 * @param {string} pagePath
 * @param {string} lang
 * @returns {string}
 */
function pageOutPath(pagePath, lang) {
  return `${lang}/${pagePath}.html`;
}

// Patch module.exports to include the new functions
Object.assign(module.exports.utils, {
  prepareShared,
  prepareHome,
  prepareDirectory,
  prepareContact,
  preparePiece,
  pageOutPath,
  loadTags,
  loadPieceBySlug,
  prepareIndex,
});
