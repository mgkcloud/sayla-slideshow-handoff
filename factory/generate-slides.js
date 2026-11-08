import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile, readFile, rename, rm, lstat, realpath, stat } from 'node:fs/promises';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const W = 1080;
const H = 1920;
const CTA_BAR_FRACTION = 0.15;
const CTA_BAR_HEIGHT = Math.round(H * CTA_BAR_FRACTION);
const TEXT_AREA_TOP = 0.30;
const MAX_TEXT_WIDTH = W * 0.85;
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(MODULE_DIR, 'fonts');
const DRAFTS_DIR = join(MODULE_DIR, 'drafts');
const FONT_FAMILY = 'DejaVu Sans';
const FONT_FILE = join(FONT_DIR, 'DejaVuSans-Bold.ttf');

let fontsRegistered = false;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function localReference(src, label) {
  nonempty(src, label);
  if (src.includes('\0') || /^[A-Za-z][A-Za-z\d+.-]*:/.test(src) || src.startsWith('//') || src.startsWith('\\\\')) {
    throw new Error(`${label} must be a plain local file path; URI, scheme, data and network paths are forbidden`);
  }
}

export function registerFonts() {
  if (fontsRegistered) return;
  if (!GlobalFonts.registerFromPath(FONT_FILE, FONT_FAMILY)) {
    throw new Error(`Required bundled font failed to register: ${FONT_FILE}`);
  }
  fontsRegistered = true;
}

export async function loadImageSource(src) {
  localReference(src, 'background');
  return loadImage(resolve(src));
}

export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function drawBackground(ctx, img, canvasW, canvasH) {
  const imgW = img.width;
  const imgH = img.height;
  const imgAspect = imgW / imgH;
  const canvasAspect = canvasW / canvasH;
  let sx, sy, sw, sh;

  if (imgAspect > canvasAspect) {
    sh = imgH;
    sw = imgH * canvasAspect;
    sx = (imgW - sw) / 2;
    sy = 0;
  } else {
    sw = imgW;
    sh = imgW / canvasAspect;
    sx = 0;
    sy = (imgH - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
}

export function drawCTABar(ctx, text, bgColor, canvasW, canvasH, fontSize) {
  const barH = CTA_BAR_HEIGHT;
  const barY = canvasH - barH;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, barY, canvasW, barH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${Math.round(fontSize * 0.6)}px "${FONT_FAMILY}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), canvasW / 2, barY + barH / 2);
}

function textLayout(ctx, textLines, opts = {}) {
  const {
    fontFamily = FONT_FAMILY,
    fontSize = 72,
    lineHeight = 1.25,
    position = 'top',
  } = opts;
  ctx.font = `${fontSize}px "${fontFamily}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const allWrappedLines = [];
  for (const line of textLines) {
    allWrappedLines.push(...wrapText(ctx, line, MAX_TEXT_WIDTH));
  }
  const lh = Math.round(fontSize * lineHeight);
  const totalTextH = allWrappedLines.length * lh;
  const startY = position === 'center'
    ? (H - CTA_BAR_HEIGHT) / 2 - totalTextH / 2
    : H * TEXT_AREA_TOP;
  return { allWrappedLines, lh, totalTextH, startY };
}

function validateTextFits(ctx, hook, font, hasCTA) {
  const layout = textLayout(ctx, hook.text, font);
  for (const line of layout.allWrappedLines) {
    if (ctx.measureText(line).width > MAX_TEXT_WIDTH) {
      throw new Error(`Text overflow in hook ${hook.id}: a word or line exceeds the safe width`);
    }
  }
  const maxBottom = H - (hasCTA ? CTA_BAR_HEIGHT : 0) - 80;
  if (layout.startY < 40 || layout.startY + layout.totalTextH > maxBottom) {
    throw new Error(`Text overflow in hook ${hook.id}: wrapped text exceeds the readable vertical area`);
  }
}

export function drawHookText(ctx, textLines, opts = {}) {
  const {
    fontFamily = FONT_FAMILY,
    fontSize = 72,
    fontColor = '#FFFFFF',
    outlineColor = 'rgba(0,0,0,0.9)',
    outlineWidth = 4,
    shadowColor = 'rgba(0,0,0,0.85)',
    shadowBlur = 8,
    shadowOffsetX = 4,
    shadowOffsetY = 4,
  } = opts;
  const { allWrappedLines, lh, startY } = textLayout(ctx, textLines, opts);
  ctx.font = `${fontSize}px "${fontFamily}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let i = 0; i < allWrappedLines.length; i++) {
    const y = startY + i * lh;
    const x = W / 2;
    ctx.save();
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;
    ctx.fillStyle = fontColor;
    ctx.fillText(allWrappedLines[i], x, y);
    ctx.restore();

    if (outlineWidth > 0) {
      ctx.save();
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineWidth * 2;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(allWrappedLines[i], x, y);
      ctx.restore();
    }
    ctx.fillStyle = fontColor;
    ctx.fillText(allWrappedLines[i], x, y);
  }
  return allWrappedLines;
}

export async function generateSlide({ background, hookText, hookId, hashtags, font: fontOpts, ctaText, ctaBgColor, outputDir, slideIndex }) {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, background.image, W, H);
  const fontDefaults = {
    fontFamily: FONT_FAMILY,
    fontSize: 72,
    fontColor: '#FFFFFF',
    outlineColor: 'rgba(0,0,0,0.9)',
    outlineWidth: 4,
    shadowColor: 'rgba(0,0,0,0.85)',
    shadowBlur: 8,
    shadowOffsetX: 4,
    shadowOffsetY: 4,
  };
  const font = { ...fontDefaults, ...fontOpts, fontFamily: FONT_FAMILY };
  validateTextFits(ctx, { id: hookId, text: hookText }, font, Boolean(ctaText));
  drawHookText(ctx, hookText, font);
  if (ctaText) drawCTABar(ctx, ctaText, ctaBgColor || '#2D7D46', W, H, font.fontSize);

  const num = String(slideIndex + 1).padStart(3, '0');
  const filename = `slide_${num}_${hookId}.png`;
  const filepath = join(outputDir, filename);
  const pngBuffer = canvas.toBuffer('image/png');
  await writeFile(filepath, pngBuffer, { flag: 'wx' });
  return {
    filename,
    hookId,
    hookText,
    background: background.reference,
    background_sha256: background.sha256,
    hashtags,
    width: W,
    height: H,
    sha256: sha256(pngBuffer),
    bytes: pngBuffer.length,
  };
}

async function validateAndLoad(config, baseDir) {
  object(config, 'config');
  nonempty(config.client, 'client');
  nonempty(config.caption, 'caption');
  nonempty(config.output_dir, 'output_dir');
  if (!Array.isArray(config.background_images) || config.background_images.length === 0) {
    throw new Error('background_images must be a non-empty array');
  }
  if (!Array.isArray(config.hooks) || config.hooks.length === 0 || config.hooks.length > 100) {
    throw new Error('hooks must contain 1 to 100 slides');
  }
  if (config.font !== undefined) object(config.font, 'font');
  if (config.font?.fontFamily && config.font.fontFamily !== FONT_FAMILY) {
    throw new Error(`Only the bundled ${FONT_FAMILY} font is supported`);
  }
  const fontSize = config.font?.fontSize ?? 72;
  if (!Number.isFinite(fontSize) || fontSize < 16 || fontSize > 160) {
    throw new Error('font.fontSize must be between 16 and 160');
  }
  const lineHeight = config.font?.lineHeight ?? 1.25;
  if (!Number.isFinite(lineHeight) || lineHeight < 0.8 || lineHeight > 2) {
    throw new Error('font.lineHeight must be between 0.8 and 2');
  }
  if (config.font?.position && !['top', 'center'].includes(config.font.position)) {
    throw new Error('font.position must be top or center');
  }
  if (config.cta_text !== undefined) nonempty(config.cta_text, 'cta_text');

  const outputDir = resolve(baseDir, config.output_dir);
  if (dirname(outputDir) !== DRAFTS_DIR) {
    throw new Error(`output_dir must resolve to a new child of ${DRAFTS_DIR} (direct child only); traversal is forbidden`);
  }

  const ids = new Set();
  for (const [index, hook] of config.hooks.entries()) {
    object(hook, `hooks[${index}]`);
    nonempty(hook.id, `hooks[${index}].id`);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(hook.id) || ids.has(hook.id)) {
      throw new Error(`Invalid or duplicate hook id: ${hook.id}`);
    }
    ids.add(hook.id);
    if (!Array.isArray(hook.text) || hook.text.length === 0) {
      throw new Error(`hooks[${index}].text must be a non-empty array`);
    }
    hook.text.forEach((line, lineIndex) => {
      nonempty(line, `hooks[${index}].text[${lineIndex}]`);
      if (/[\x00-\x1F\x7F-\x9F]/.test(line)) {
        throw new Error(`hooks[${index}].text[${lineIndex}] must not contain newline or control characters; use separate array elements for lines`);
      }
    });
    if (hook.hashtags !== undefined && typeof hook.hashtags !== 'string' && !Array.isArray(hook.hashtags)) {
      throw new Error(`hooks[${index}].hashtags must be a string or array`);
    }
  }

  const factoryReal = await realpath(MODULE_DIR);
  const backgrounds = [];
  for (const [index, reference] of config.background_images.entries()) {
    localReference(reference, `background_images[${index}]`);
    const unresolved = resolve(baseDir, reference);
    if (!inside(factoryReal, unresolved)) {
      throw new Error(`Background escapes the factory asset boundary: ${reference}`);
    }
    let path;
    try {
      path = await realpath(unresolved);
      if (!inside(factoryReal, path) || !(await stat(path)).isFile()) throw new Error('not a regular local file');
    } catch (error) {
      throw new Error(`Missing or invalid background ${reference}: ${error.message}`);
    }
    const bytes = await readFile(path);
    let image;
    try {
      image = await loadImage(bytes);
    } catch (error) {
      throw new Error(`Corrupt or unsupported background ${reference}: ${error.message}`);
    }
    if (!image.width || !image.height) throw new Error(`Background has invalid dimensions: ${reference}`);
    backgrounds.push({ reference, path, bytes, image, sha256: sha256(bytes) });
  }

  registerFonts();
  const measureCanvas = createCanvas(W, H);
  const ctx = measureCanvas.getContext('2d');
  const font = { fontFamily: FONT_FAMILY, fontSize, lineHeight, ...config.font, fontFamily: FONT_FAMILY };
  for (const hook of config.hooks) validateTextFits(ctx, hook, font, Boolean(config.cta_text));
  if (config.cta_text) {
    ctx.font = `${Math.round(fontSize * 0.6)}px "${FONT_FAMILY}"`;
    if (ctx.measureText(config.cta_text.toUpperCase()).width > W * 0.9) {
      throw new Error('CTA text overflow: reduce cta_text length');
    }
  }
  return { outputDir, backgrounds };
}

async function verifyDraftsParent(outputDir) {
  const rootStat = await lstat(DRAFTS_DIR);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`drafts root must be a real directory, not a symlink or non-directory: ${DRAFTS_DIR}`);
  }
  const approvedReal = await realpath(DRAFTS_DIR);
  const outputParentReal = await realpath(dirname(outputDir));
  if (outputParentReal !== approvedReal) {
    throw new Error(`output_dir parent must match the approved real drafts directory: ${approvedReal}`);
  }
}

export async function generateFromConfig(config, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const { outputDir, backgrounds } = await validateAndLoad(config, baseDir);
  try {
    await lstat(outputDir);
    throw new Error(`Refusing to overwrite existing draft output: ${outputDir}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await mkdir(DRAFTS_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await verifyDraftsParent(outputDir);
  const staging = join(DRAFTS_DIR, `.${outputDir.split(sep).pop()}.staging-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  try {
    const results = [];
    for (let i = 0; i < config.hooks.length; i++) {
      const hook = config.hooks[i];
      const background = backgrounds[i % backgrounds.length];
      console.log(`  [slide ${i + 1}/${config.hooks.length}] ${hook.id}: "${hook.text.join(' / ')}"`);
      results.push(await generateSlide({
        background,
        hookText: hook.text,
        hookId: hook.id,
        hashtags: hook.hashtags || '',
        font: config.font,
        ctaText: config.cta_text,
        ctaBgColor: config.cta_bg_color,
        outputDir: staging,
        slideIndex: i,
      }));
    }
    const captionBytes = Buffer.from(`${config.caption.trim()}\n`, 'utf8');
    await writeFile(join(staging, 'caption.txt'), captionBytes, { flag: 'wx' });
    const manifest = {
      status: 'draft_manual_approval_required',
      client: config.client,
      generated_at: new Date().toISOString(),
      canvas: { width: W, height: H },
      total_slides: results.length,
      caption: { filename: 'caption.txt', sha256: sha256(captionBytes) },
      input: {
        script_sha256: options.inputSha256 || sha256(JSON.stringify(config)),
        backgrounds: backgrounds.map(({ reference, sha256: hash }) => ({ path: reference, sha256: hash })),
      },
      source_provenance: config.source_provenance || null,
      imagery: config.imagery || 'story imagery; manual rights and content review required',
      slides: results.map(result => ({
        filename: result.filename,
        hook_id: result.hookId,
        hook_text: result.hookText,
        background: result.background,
        background_sha256: result.background_sha256,
        hashtags: result.hashtags,
        width: result.width,
        height: result.height,
        sha256: result.sha256,
        bytes: result.bytes,
      })),
      font: { family: FONT_FAMILY, file: 'fonts/DejaVuSans-Bold.ttf', ...(config.font || {}), fontFamily: FONT_FAMILY },
      cta_text: config.cta_text,
      cta_bg_color: config.cta_bg_color,
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(staging, 'slides-config.json'), manifestBytes, { flag: 'wx' });
    await verifyDraftsParent(outputDir);
    try {
      await lstat(outputDir);
      throw new Error(`Refusing to overwrite existing draft output: ${outputDir}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(staging, outputDir);
    console.log(`  [manifest] Written ${join(outputDir, 'slides-config.json')}`);
    return { ...manifest, output_dir: outputDir };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) {
    throw new Error('Usage: node generate-slides.js <slides-config.json>');
  }
  const configPath = resolve(args[0]);
  const configRaw = await readFile(configPath);
  let config;
  try {
    config = JSON.parse(configRaw.toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON input: ${error.message}`);
  }
  console.log(`\nSayla local draft factory — ${config.client || 'invalid input'}`);
  const manifest = await generateFromConfig(config, {
    baseDir: dirname(configPath),
    inputSha256: sha256(configRaw),
  });
  console.log(`\nDone — ${manifest.total_slides} draft slides in ${manifest.output_dir}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
