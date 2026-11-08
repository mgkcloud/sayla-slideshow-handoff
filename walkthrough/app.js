(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const dom = {
    article: $('chapter-content'), loading: $('loading-state'), content: $('app-content'), fatal: $('fatal-state'),
    title: $('guide-title'), intro: $('guide-intro'), disclaimer: $('disclaimer'), stats: $('archive-stats'),
    chapterList: $('chapter-list'), chapterSelect: $('chapter-select'), railCount: $('rail-count'), progressList: $('progress-list'),
    eyebrow: $('chapter-eyebrow'), status: $('chapter-status'), chapterTitle: $('chapter-title'), summary: $('chapter-summary'),
    chapterPosition: $('chapter-position'), chapterProgress: $('chapter-progress'), chapterProgressFill: $('chapter-progress-fill'),
    previousChapter: $('previous-chapter'), nextChapter: $('next-chapter'),
    keyword: $('keyword-filter'), role: $('role-filter'), clearFilters: $('clear-filters'), filterCount: $('filter-count'),
    imageStage: $('image-stage'), image: $('generation-image'), imageError: $('image-error'), empty: $('empty-state'),
    emptyLabel: $('empty-state-label'), emptyTitle: $('empty-state-title'), emptyCopy: $('empty-state-copy'),
    generationControls: $('generation-controls'), openLightbox: $('open-lightbox'), previousImage: $('previous-image'), nextImage: $('next-image'),
    imagePosition: $('image-position'), thumbnailRegion: $('thumbnail-region'), thumbnailCount: $('thumbnail-count'), thumbnails: $('thumbnail-strip'),
    generationNotes: $('generation-notes'), generationTitle: $('generation-title'), metadata: $('generation-metadata'),
    hook: $('generation-hook'), caption: $('generation-caption'), assetNotesBlock: $('asset-notes-block'), assetNotes: $('asset-notes'),
    howBlock: $('how-block'), howList: $('how-list'), changedBlock: $('changed-block'), changedList: $('changed-list'),
    remainingBlock: $('remaining-block'), caveatList: $('caveat-list'), nextStep: $('next-step'), sourceSection: $('source-section'), sourceLinks: $('source-links'),
    lightbox: $('lightbox'), lightboxTitle: $('lightbox-title'), lightboxImage: $('lightbox-image'), lightboxCaption: $('lightbox-caption'),
    closeLightbox: $('close-lightbox'), lightboxPrevious: $('lightbox-previous'), lightboxNext: $('lightbox-next')
  };

  const state = { data: null, filteredChapters: [], chapter: null, assets: [], assetIndex: 0, keyword: '', role: '' };
  const statusLabels = { verified: 'Verified', historical: 'Historical', rejected: 'Not cleared', 'prompt-only': 'Prompt only', unavailable: 'Unavailable' };
  const roleLabels = { final: 'Final', raw: 'Raw generation', raw_or_generated_image: 'Raw / generated', historical_image: 'Historical image', clean_base: 'Clean base', review_sheet: 'Review sheet' };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function list(target, values) {
    target.replaceChildren();
    (Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.trim()).forEach((value) => {
      target.append(node('li', '', value));
    });
    return target.childElementCount;
  }

  function safeHttps(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  function safeMedia(value) {
    return typeof value === 'string' && /^media\/[a-zA-Z0-9._-]+\.webp$/.test(value) && !value.includes('..') ? value : null;
  }

  function humanize(value) {
    if (!value) return 'Not recovered';
    return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function validChapter(chapter) {
    return chapter && typeof chapter.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(chapter.id) && typeof chapter.title === 'string';
  }

  function assetSearchText(asset) {
    return [asset.title, asset.hook, asset.caption, asset.role, asset.set, asset.version, ...(asset.notes || [])].join(' ').toLowerCase();
  }

  function chapterSearchText(chapter) {
    return [chapter.title, chapter.eyebrow, chapter.status, chapter.summary, chapter.nextStep, ...(chapter.howItWorks || []), ...(chapter.whatChanged || []), ...(chapter.caveats || [])].join(' ').toLowerCase();
  }

  function chapterFromHash() {
    const match = window.location.hash.match(/^#chapter\/([a-z0-9][a-z0-9-]*)$/);
    return match ? match[1] : null;
  }

  function setChapterHash(id, replace = false) {
    const hash = `#chapter/${id}`;
    if (window.location.hash === hash) return;
    if (replace) window.history.replaceState(null, '', hash);
    else window.history.pushState(null, '', hash);
  }

  function applyFilters({ selectFirst = false } = {}) {
    if (!state.data) return;
    const query = state.keyword.trim().toLowerCase();
    state.filteredChapters = state.data.chapters.map((chapter) => {
      const chapterMatches = !query || chapterSearchText(chapter).includes(query);
      const assets = chapter.assets.filter((asset) => {
        const roleMatches = !state.role || asset.role === state.role;
        const keywordMatches = chapterMatches || assetSearchText(asset).includes(query);
        return roleMatches && keywordMatches;
      });
      return { chapter, assets, chapterMatches };
    }).filter(({ chapter, assets, chapterMatches }) => {
      if (chapterMatches && !state.role) return true;
      return assets.length > 0;
    }).map(({ chapter, assets }) => ({ chapter, assets }));

    dom.railCount.textContent = `${state.filteredChapters.length} / ${state.data.chapters.length}`;
    const filteredAssetCount = state.filteredChapters.reduce((total, entry) => total + entry.assets.length, 0);
    dom.filterCount.textContent = `${filteredAssetCount} generation${filteredAssetCount === 1 ? '' : 's'} · ${state.filteredChapters.length} chapter${state.filteredChapters.length === 1 ? '' : 's'}`;
    dom.clearFilters.hidden = !state.keyword && !state.role;

    const hashId = chapterFromHash();
    const currentId = selectFirst ? null : (hashId || state.chapter?.id);
    const selected = state.filteredChapters.find((entry) => entry.chapter.id === currentId) || state.filteredChapters[0];
    renderChapterOptions();
    if (selected) selectChapter(selected.chapter.id, 0, { updateHash: true, replaceHash: true, focus: false });
    else renderNoResults();
  }

  function renderChapterOptions() {
    dom.chapterList.replaceChildren();
    dom.chapterSelect.replaceChildren();
    state.filteredChapters.forEach((entry, index) => {
      const chapter = entry.chapter;
      const item = node('li');
      const link = node('a', 'chapter-link');
      link.href = `#chapter/${chapter.id}`;
      link.dataset.chapter = chapter.id;
      link.append(node('span', 'chapter-number', String(index + 1).padStart(2, '0')));
      link.append(node('span', '', chapter.title));
      item.append(link);
      dom.chapterList.append(item);
      const option = node('option', '', `${String(index + 1).padStart(2, '0')} — ${chapter.title}`);
      option.value = chapter.id;
      dom.chapterSelect.append(option);
    });
  }

  function renderNoResults() {
    state.chapter = null;
    state.assets = [];
    state.assetIndex = 0;
    dom.chapterTitle.textContent = 'No matching field notes';
    dom.eyebrow.textContent = 'Search the archive';
    dom.summary.textContent = 'Try a broader keyword or include all roles. The underlying archive has not been changed.';
    dom.status.textContent = 'No matches';
    dom.status.dataset.status = '';
    dom.chapterPosition.textContent = '0 chapters';
    dom.chapterProgressFill.style.width = '0%';
    dom.imageStage.hidden = true;
    dom.generationControls.hidden = true;
    dom.thumbnailRegion.hidden = true;
    dom.generationNotes.hidden = true;
    dom.empty.hidden = false;
    dom.emptyLabel.textContent = 'No results';
    dom.emptyTitle.textContent = 'Nothing matches those filters';
    dom.emptyCopy.textContent = 'Clear the filters to return to the complete field guide.';
    [dom.howBlock, dom.changedBlock, dom.remainingBlock, dom.sourceSection].forEach((section) => { section.hidden = true; });
    dom.previousChapter.disabled = true;
    dom.nextChapter.disabled = true;
  }

  function selectChapter(id, assetIndex = 0, { updateHash = true, replaceHash = false, focus = false } = {}) {
    const entry = state.filteredChapters.find((candidate) => candidate.chapter.id === id);
    if (!entry) return;
    state.chapter = entry.chapter;
    state.assets = entry.assets;
    state.assetIndex = Math.max(0, Math.min(assetIndex, state.assets.length - 1));
    if (updateHash) setChapterHash(id, replaceHash);
    renderChapter(focus);
  }

  function renderChapter(focus = false) {
    const chapter = state.chapter;
    if (!chapter) return;
    const chapterIndex = state.filteredChapters.findIndex((entry) => entry.chapter.id === chapter.id);
    dom.eyebrow.textContent = chapter.eyebrow || 'Creative field notes';
    dom.status.textContent = statusLabels[chapter.status] || humanize(chapter.status || 'historical');
    dom.status.dataset.status = chapter.status || '';
    dom.chapterTitle.textContent = chapter.title;
    dom.summary.textContent = chapter.summary || 'No chapter summary was recovered.';
    dom.chapterPosition.textContent = `Chapter ${chapterIndex + 1} of ${state.filteredChapters.length}`;
    dom.chapterProgress.setAttribute('aria-valuemax', String(state.filteredChapters.length));
    dom.chapterProgress.setAttribute('aria-valuenow', String(chapterIndex + 1));
    dom.chapterProgressFill.style.width = `${((chapterIndex + 1) / state.filteredChapters.length) * 100}%`;
    dom.previousChapter.disabled = chapterIndex <= 0;
    dom.nextChapter.disabled = chapterIndex >= state.filteredChapters.length - 1;
    dom.chapterSelect.value = chapter.id;
    dom.chapterList.querySelectorAll('a').forEach((link) => {
      if (link.dataset.chapter === chapter.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    document.title = `${chapter.title} — Sayla field guide`;

    const hasAssets = state.assets.length > 0;
    dom.imageStage.hidden = !hasAssets;
    dom.generationControls.hidden = !hasAssets;
    dom.thumbnailRegion.hidden = !hasAssets;
    dom.generationNotes.hidden = !hasAssets;
    dom.empty.hidden = hasAssets;
    if (hasAssets) {
      renderAsset();
      renderThumbnails();
    } else {
      renderEmptyChapter();
      dom.lightboxImage.removeAttribute('src');
      dom.image.removeAttribute('src');
    }

    dom.howBlock.hidden = !list(dom.howList, chapter.howItWorks);
    dom.changedBlock.hidden = !list(dom.changedList, chapter.whatChanged);
    const caveatCount = list(dom.caveatList, chapter.caveats);
    dom.nextStep.replaceChildren();
    if (chapter.nextStep) {
      dom.nextStep.append(node('strong', '', 'Next useful step'));
      dom.nextStep.append(document.createTextNode(chapter.nextStep));
    }
    dom.remainingBlock.hidden = !caveatCount && !chapter.nextStep;
    renderSourceLinks();
    if (focus) {
      dom.article.focus({ preventScroll: true });
      window.scrollTo({ top: dom.article.offsetTop - 45, behavior: 'smooth' });
    }
  }

  function renderEmptyChapter() {
    const status = state.chapter.status;
    const labels = {
      'prompt-only': ['Prompt-only branch', 'The brief survived, not a public image'],
      unavailable: ['Unavailable branch', 'The work is documented, the preview is not'],
      rejected: ['Excluded from public preview', 'Context without uncleared imagery']
    };
    const [label, title] = labels[status] || ['Text-only chapter', 'No public generation in this chapter'];
    dom.emptyLabel.textContent = label;
    dom.emptyTitle.textContent = title;
    dom.emptyCopy.textContent = state.chapter.nextStep || state.chapter.summary || 'No eligible public preview was recovered. The field notes preserve what is known without substituting another image.';
  }

  function currentAsset() {
    return state.assets[state.assetIndex] || null;
  }

  function renderAsset() {
    const asset = currentAsset();
    if (!asset) return;
    const src = safeMedia(asset.src);
    dom.imageError.hidden = true;
    dom.image.hidden = false;
    dom.openLightbox.hidden = !src;
    if (src) {
      dom.image.src = src;
      dom.lightboxImage.src = src;
    } else {
      dom.image.removeAttribute('src');
      dom.lightboxImage.removeAttribute('src');
      dom.image.hidden = true;
      dom.imageError.hidden = false;
    }
    const alt = `${asset.title || 'Sayla generation'}${asset.hook ? `. Hook: ${asset.hook}` : ''}. ${roleLabels[asset.role] || humanize(asset.role)}.`;
    dom.image.alt = alt;
    dom.lightboxImage.alt = alt;
    dom.imagePosition.textContent = `Generation ${state.assetIndex + 1} of ${state.assets.length}`;
    dom.previousImage.disabled = state.assetIndex <= 0;
    dom.nextImage.disabled = state.assetIndex >= state.assets.length - 1;
    dom.lightboxPrevious.disabled = dom.previousImage.disabled;
    dom.lightboxNext.disabled = dom.nextImage.disabled;
    dom.generationTitle.textContent = asset.title || `Generation ${state.assetIndex + 1}`;
    dom.lightboxTitle.textContent = asset.title || 'Generation preview';
    dom.lightboxCaption.textContent = `${state.assetIndex + 1} / ${state.assets.length} · ${asset.set || 'Set not recovered'} · ${asset.version || 'Version not recovered'}`;
    dom.metadata.replaceChildren();
    [['Set', asset.set], ['Version', asset.version], ['Role', roleLabels[asset.role] || humanize(asset.role)], ['Review', statusLabels[state.chapter.status] || humanize(state.chapter.status)]].forEach(([label, value]) => {
      const group = node('div');
      group.append(node('dt', '', label));
      group.append(node('dd', '', value || 'Not recovered'));
      dom.metadata.append(group);
    });
    dom.hook.textContent = asset.hook || 'Not recovered';
    dom.caption.textContent = asset.caption || 'Not recovered';
    dom.assetNotesBlock.hidden = !list(dom.assetNotes, asset.notes);
    dom.thumbnails.querySelectorAll('button').forEach((button, index) => {
      if (index === state.assetIndex) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    const activeThumbnail = dom.thumbnails.children[state.assetIndex];
    if (activeThumbnail) activeThumbnail.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    renderSourceLinks();
  }

  function renderThumbnails() {
    dom.thumbnails.replaceChildren();
    dom.thumbnailCount.textContent = `${state.assets.length} item${state.assets.length === 1 ? '' : 's'}`;
    state.assets.forEach((asset, index) => {
      const wrapper = node('div');
      wrapper.setAttribute('role', 'listitem');
      const button = node('button', 'thumbnail-button');
      button.type = 'button';
      button.setAttribute('aria-label', `View generation ${index + 1}: ${asset.title || 'Untitled'}`);
      const thumb = safeMedia(asset.thumb) || safeMedia(asset.src);
      if (thumb) {
        const image = node('img');
        image.src = thumb;
        image.alt = '';
        image.loading = index < 12 ? 'eager' : 'lazy';
        image.decoding = 'async';
        button.append(image);
      }
      button.append(node('span', 'thumbnail-number', String(index + 1)));
      if (index === state.assetIndex) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => selectImage(index));
      wrapper.append(button);
      dom.thumbnails.append(wrapper);
    });
  }

  function selectImage(index) {
    if (index < 0 || index >= state.assets.length) return;
    state.assetIndex = index;
    renderAsset();
  }

  function moveImage(delta) {
    selectImage(state.assetIndex + delta);
  }

  function moveChapter(delta) {
    const index = state.filteredChapters.findIndex((entry) => entry.chapter.id === state.chapter?.id);
    const next = state.filteredChapters[index + delta];
    if (next) selectChapter(next.chapter.id, 0, { focus: true });
  }

  function sourceLink(link) {
    const url = safeHttps(link?.url);
    if (!url) return null;
    const item = node('li');
    const anchor = node('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer nofollow';
    anchor.append(node('span', '', `${link.label || 'View source'} ↗`));

    item.append(anchor);
    return item;
  }

  function renderSourceLinks() {
    dom.sourceLinks.replaceChildren();
    const asset = currentAsset();
    const candidates = [];
    if (asset?.sourceUrl) candidates.push({ label: 'Current generation source', url: asset.sourceUrl });
    (state.chapter.sourceLinks || []).forEach((link) => candidates.push(link));
    const seen = new Set();
    candidates.forEach((link) => {
      const item = sourceLink(link);
      if (item && !seen.has(link.url)) {
        seen.add(link.url);
        dom.sourceLinks.append(item);
      }
    });
    dom.sourceSection.hidden = dom.sourceLinks.childElementCount === 0;
  }

  function renderProgress() {
    dom.progressList.replaceChildren();
    (state.data.progress || []).forEach((entry) => {
      const item = node('li');
      item.dataset.state = entry.state || 'historical';
      item.append(node('strong', '', entry.label || 'Archive note'));
      item.append(node('span', '', entry.detail || ''));
      dom.progressList.append(item);
    });
  }

  function populateRoles() {
    const roles = [...new Set(state.data.chapters.flatMap((chapter) => chapter.assets.map((asset) => asset.role)).filter(Boolean))].sort();
    roles.forEach((role) => {
      const option = node('option', '', roleLabels[role] || humanize(role));
      option.value = role;
      dom.role.append(option);
    });
  }

  function openLightbox() {
    if (!currentAsset() || !safeMedia(currentAsset().src)) return;
    dom.lightbox.showModal();
    document.body.style.overflow = 'hidden';
    dom.closeLightbox.focus();
  }

  function closeLightbox() {
    if (dom.lightbox.open) dom.lightbox.close();
    document.body.style.overflow = '';
  }

  function bindEvents() {
    dom.previousChapter.addEventListener('click', () => moveChapter(-1));
    dom.nextChapter.addEventListener('click', () => moveChapter(1));
    dom.previousImage.addEventListener('click', () => moveImage(-1));
    dom.nextImage.addEventListener('click', () => moveImage(1));
    dom.lightboxPrevious.addEventListener('click', () => moveImage(-1));
    dom.lightboxNext.addEventListener('click', () => moveImage(1));
    dom.openLightbox.addEventListener('click', openLightbox);
    dom.closeLightbox.addEventListener('click', closeLightbox);
    dom.lightbox.addEventListener('close', () => { document.body.style.overflow = ''; });
    dom.lightbox.addEventListener('click', (event) => {
      if (event.target === dom.lightbox) closeLightbox();
    });
    dom.chapterSelect.addEventListener('change', () => selectChapter(dom.chapterSelect.value, 0, { focus: true }));
    dom.chapterList.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-chapter]');
      if (!link) return;
      event.preventDefault();
      selectChapter(link.dataset.chapter, 0, { focus: true });
    });
    dom.keyword.addEventListener('input', () => {
      state.keyword = dom.keyword.value;
      applyFilters();
    });
    dom.role.addEventListener('change', () => {
      state.role = dom.role.value;
      applyFilters();
    });
    dom.clearFilters.addEventListener('click', () => {
      state.keyword = '';
      state.role = '';
      dom.keyword.value = '';
      dom.role.value = '';
      applyFilters();
      dom.keyword.focus();
    });
    window.addEventListener('hashchange', () => {
      const id = chapterFromHash();
      if (id && id !== state.chapter?.id) {
        const exists = state.filteredChapters.some((entry) => entry.chapter.id === id);
        if (exists) selectChapter(id, 0, { updateHash: false });
        else {
          state.keyword = '';
          state.role = '';
          dom.keyword.value = '';
          dom.role.value = '';
          applyFilters();
        }
      }
    });
    window.addEventListener('popstate', () => {
      const id = chapterFromHash();
      if (id && id !== state.chapter?.id && state.filteredChapters.some((entry) => entry.chapter.id === id)) {
        selectChapter(id, 0, { updateHash: false });
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dom.lightbox.open) {
        closeLightbox();
        return;
      }
      const tag = event.target.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' && (dom.lightbox.open || !dom.imageStage.hidden)) {
        event.preventDefault();
        moveImage(-1);
      } else if (event.key === 'ArrowRight' && (dom.lightbox.open || !dom.imageStage.hidden)) {
        event.preventDefault();
        moveImage(1);
      }
    });
    dom.image.addEventListener('error', () => {
      dom.image.hidden = true;
      dom.imageError.hidden = false;
      dom.openLightbox.hidden = true;
    });
    dom.image.addEventListener('load', () => {
      dom.image.hidden = false;
      dom.imageError.hidden = true;
      dom.openLightbox.hidden = false;
    });
  }

  async function init() {
    bindEvents();
    try {
      const response = await fetch('data.json?v=public-handoff-4', { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Dataset request returned ${response.status}.`);
      const data = await response.json();
      if (data.schemaVersion !== 1 || !Array.isArray(data.chapters) || !data.chapters.every(validChapter)) {
        throw new Error('Dataset does not match schema version 1.');
      }
      data.chapters.forEach((chapter) => { chapter.assets = Array.isArray(chapter.assets) ? chapter.assets.filter((asset) => asset && typeof asset === 'object' && safeMedia(asset.src)) : []; });
      data.chapters = data.chapters.filter((chapter) => chapter.assets.length > 0).reverse();
      if (!data.chapters.length) throw new Error('No versions with images are available.');
      state.data = data;
      document.querySelector('.wordmark').href = `#chapter/${data.chapters[0].id}`;
      dom.title.textContent = data.title || 'Sayla slideshow field guide';
      dom.intro.textContent = data.intro || 'A guided record of Sayla slideshow generations and their creative context.';
      if (data.disclaimer) dom.disclaimer.textContent = data.disclaimer;
      const actualAssets = data.chapters.reduce((sum, chapter) => sum + chapter.assets.length, 0);
      const uniqueMedia = new Set(data.chapters.flatMap((chapter) => chapter.assets.map((asset) => asset.src).filter(Boolean))).size;
      dom.stats.textContent = `${data.chapters.length} chapters · ${actualAssets} generation contexts · ${uniqueMedia} unique previews · read-only archive`;
      renderProgress();
      populateRoles();
      dom.loading.hidden = true;
      dom.content.hidden = false;
      dom.article.setAttribute('aria-busy', 'false');
      applyFilters();
    } catch (error) {
      dom.loading.hidden = true;
      dom.content.hidden = true;
      dom.fatal.hidden = false;
      dom.article.setAttribute('aria-busy', 'false');
      $('fatal-message').textContent = `Check that data.json and media/ are deployed beside this page, then reload. ${error.message}`;
      console.error('Field guide could not load:', error);
    }
  }

  init();
})();
