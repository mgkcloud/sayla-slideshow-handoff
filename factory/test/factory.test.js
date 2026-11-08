import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir, rm, copyFile, cp, symlink, lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORK = join(ROOT, 'test', '.work');
const DRAFTS = join(ROOT, 'drafts');
const suffix = `${process.pid}`;
const outputs = new Set();
const sha256 = data => createHash('sha256').update(data).digest('hex');

function validConfig(name = `test-basic-${suffix}`) {
  outputs.add(name);
  return {
    client: 'sayla-test',
    caption: 'A draft caption with exact content. #sayla',
    background_images: ['../../assets/backgrounds/spanish-isnt-speaking-spanish.png'],
    output_dir: `../../drafts/${name}`,
    imagery: 'Fictional AI story imagery; manual approval required.',
    hooks: [
      { id: 'hook-one', text: ['knowing spanish isn’t speaking spanish'] },
      { id: 'hook-two', text: ['practice answering out loud'] },
      { id: 'hook-three', text: ['a third distinct draft slide'] },
    ],
  };
}

function runConfig(config, filename) {
  const path = join(WORK, filename);
  return writeFile(path, JSON.stringify(config, null, 2)).then(() => {
    const result = spawnSync(process.execPath, [join(ROOT, 'generate-slides.js'), path], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: `--require=${join(ROOT, 'test', 'block-network.cjs')}` },
    });
    return { ...result, configPath: path, raw: JSON.stringify(config, null, 2) };
  });
}

async function makeIsolatedFactory(name) {
  const isolated = join(WORK, name);
  await mkdir(isolated, { recursive: true });
  await Promise.all([
    copyFile(join(ROOT, 'generate-slides.js'), join(isolated, 'generate-slides.js')),
    cp(join(ROOT, 'fonts'), join(isolated, 'fonts'), { recursive: true }),
    cp(join(ROOT, 'assets'), join(isolated, 'assets'), { recursive: true }),
  ]);
  return isolated;
}

function isolatedConfig(name) {
  const config = validConfig(name);
  outputs.delete(name);
  config.background_images = ['assets/backgrounds/spanish-isnt-speaking-spanish.png'];
  config.output_dir = `drafts/${name}`;
  return config;
}

async function runIsolated(config, isolated, filename = 'config.json', extraEnv = {}) {
  const path = join(isolated, filename);
  await writeFile(path, JSON.stringify(config, null, 2));
  return spawnSync(process.execPath, [join(isolated, 'generate-slides.js'), path], {
    cwd: isolated,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv, NODE_OPTIONS: `--require=${join(ROOT, 'test', 'block-network.cjs')}` },
  });
}

before(async () => {
  await mkdir(WORK, { recursive: true });
  await mkdir(DRAFTS, { recursive: true });
});

after(async () => {
  await rm(WORK, { recursive: true, force: true });
  await Promise.all([...outputs].map(name => rm(join(DRAFTS, name), { recursive: true, force: true })));
});

test('offline render produces ordered real PNGs, exact caption and verified manifest hashes', async () => {
  const config = validConfig();
  const result = await runConfig(config, 'valid.json');
  assert.equal(result.status, 0, result.stderr);
  const output = join(DRAFTS, `test-basic-${suffix}`);
  const entries = await readdir(output);
  assert.deepEqual(entries.filter(name => name.endsWith('.png')).sort(), [
    'slide_001_hook-one.png', 'slide_002_hook-two.png', 'slide_003_hook-three.png',
  ]);
  const manifest = JSON.parse(await readFile(join(output, 'slides-config.json'), 'utf8'));
  assert.equal(manifest.status, 'draft_manual_approval_required');
  assert.equal(manifest.total_slides, 3);
  assert.equal(manifest.input.script_sha256, sha256(result.raw));
  assert.equal(manifest.input.backgrounds[0].sha256, '180ef270fde1f9491aa47c679df91c7cb23c6ece77a6aad4ee9df77c18035f5d');
  for (const [index, slide] of manifest.slides.entries()) {
    assert.equal(slide.hook_id, config.hooks[index].id);
    assert.deepEqual(slide.hook_text, config.hooks[index].text);
    assert.equal(slide.width, 1080);
    assert.equal(slide.height, 1920);
    const png = await readFile(join(output, slide.filename));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1920);
    assert.equal(sha256(png), slide.sha256);
    assert.ok(png.length > 10000);
  }
  const expectedCaption = Buffer.from(`${config.caption}\n`);
  const caption = await readFile(join(output, 'caption.txt'));
  assert.deepEqual(caption, expectedCaption);
  assert.equal(manifest.caption.sha256, sha256(expectedCaption));
});

test('second write refuses overwrite and leaves no staging residue', async () => {
  const config = validConfig(`test-repeat-${suffix}`);
  const first = await runConfig(config, 'repeat.json');
  assert.equal(first.status, 0, first.stderr);
  const captionPath = join(DRAFTS, `test-repeat-${suffix}`, 'caption.txt');
  const beforeCaption = await readFile(captionPath);
  const second = await runConfig(config, 'repeat.json');
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /Refusing to overwrite/);
  assert.deepEqual(await readFile(captionPath), beforeCaption);
  const residue = (await readdir(DRAFTS)).filter(name => name.includes(`test-repeat-${suffix}`) && name.includes('staging'));
  assert.deepEqual(residue, []);
});

test('URL, scheme, data and network backgrounds are rejected', async () => {
  for (const [index, source] of ['https://example.com/a.png', 'http://example.com/a.png', 'data:image/png;base64,AAAA', 'file:///tmp/a.png', 'ftp://host/a.png', '//host/share/a.png'].entries()) {
    const config = validConfig(`test-url-${suffix}`);
    config.background_images = [source];
    const result = await runConfig(config, `url-${index}.json`);
    assert.notEqual(result.status, 0, source);
    assert.match(result.stderr, /plain local file path/);
  }
});

test('path traversal, unsafe hook IDs and invalid shapes fail closed', async () => {
  const cases = [];
  let config = validConfig(`test-traverse-${suffix}`);
  config.background_images = ['../../../etc/passwd'];
  cases.push([config, /asset boundary/]);
  config = validConfig(`test-output-traverse-${suffix}`);
  config.output_dir = '../../outside-output';
  cases.push([config, /new child/]);
  config = validConfig(`test-hook-id-${suffix}`);
  config.hooks[0].id = '../escape';
  cases.push([config, /Invalid or duplicate hook id/]);
  config = validConfig(`test-empty-hooks-${suffix}`);
  config.hooks = [];
  cases.push([config, /1 to 100 slides/]);
  config = validConfig(`test-text-shape-${suffix}`);
  config.hooks[0].text = 'not an array';
  cases.push([config, /non-empty array/]);
  for (const text of ['first\nsecond', 'first\tsecond', 'first\0second', 'first\u007fsecond']) {
    config = validConfig(`test-control-${suffix}`);
    config.hooks[0].text = [text];
    cases.push([config, /must not contain newline or control characters/]);
  }
  config = validConfig(`test-caption-${suffix}`);
  delete config.caption;
  cases.push([config, /caption must be a non-empty string/]);
  config = validConfig(`test-duplicate-${suffix}`);
  config.hooks[1].id = config.hooks[0].id;
  cases.push([config, /Invalid or duplicate hook id/]);
  for (const [index, [candidate, error]] of cases.entries()) {
    const result = await runConfig(candidate, `invalid-${index}.json`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  }
});

test('missing input, missing background and corrupt background are errors', async () => {
  const missingInput = spawnSync(process.execPath, [join(ROOT, 'generate-slides.js'), join(WORK, 'absent.json')], { encoding: 'utf8' });
  assert.notEqual(missingInput.status, 0);
  let config = validConfig(`test-missing-bg-${suffix}`);
  config.background_images = ['missing.png'];
  let result = await runConfig(config, 'missing-bg.json');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing or invalid background/);
  await writeFile(join(WORK, 'corrupt.png'), 'not a png');
  config = validConfig(`test-corrupt-bg-${suffix}`);
  config.background_images = ['corrupt.png'];
  result = await runConfig(config, 'corrupt-bg.json');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Corrupt or unsupported background/);
});

test('horizontal and vertical text overflow are rejected before output', async () => {
  let config = validConfig(`test-wide-${suffix}`);
  config.hooks[0].text = ['x'.repeat(500)];
  let result = await runConfig(config, 'wide.json');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Text overflow/);
  config = validConfig(`test-tall-${suffix}`);
  config.hooks[0].text = Array.from({ length: 30 }, (_, i) => `line ${i} with enough words to wrap around the canvas`);
  result = await runConfig(config, 'tall.json');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Text overflow/);
});

test('renderer contains no network downloader or posting/provider integration', async () => {
  const source = await readFile(join(ROOT, 'generate-slides.js'), 'utf8');
  assert.doesNotMatch(source, /node:https?/);
  assert.doesNotMatch(source, /downloadToBuffer|\bfetch\s*\(/);
  assert.doesNotMatch(source, /replicate|fal\.ai|upload|schedule|posting/i);
});

test('nested output symlink cannot escape an isolated drafts root', async () => {
  const isolated = await makeIsolatedFactory('isolated-nested-symlink');
  const outside = join(isolated, 'outside');
  await mkdir(join(isolated, 'drafts'), { recursive: true });
  await mkdir(outside);
  await symlink(outside, join(isolated, 'drafts', 'qa-link'), 'dir');
  const config = isolatedConfig('escaped-draft');
  config.output_dir = 'drafts/qa-link/escaped-draft';
  const result = await runIsolated(config, isolated);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /direct child/);
  assert.deepEqual(await readdir(outside), []);
});

test('symlinked drafts root is rejected in an isolated factory copy', async () => {
  const isolated = await makeIsolatedFactory('isolated-root-symlink');
  const outside = join(isolated, 'outside');
  await mkdir(outside);
  await symlink(outside, join(isolated, 'drafts'), 'dir');
  const config = isolatedConfig('escaped-draft');
  const result = await runIsolated(config, isolated);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /drafts root must be a real directory/);
  assert.deepEqual(await readdir(outside), []);
});

test('isolated source-injected second-PNG write failure removes real staging and completed output', async () => {
  const isolated = await makeIsolatedFactory('isolated-write-failure');
  const modulePath = join(isolated, 'generate-slides.js');
  const original = await readFile(modulePath, 'utf8');
  const write = "  await writeFile(filepath, pngBuffer, { flag: 'wx' });";
  assert.ok(original.includes(write));
  const injection = "  if (process.env.SAYLA_TEST_FAIL_SECOND_PNG === '1' && filename === 'slide_002_hook-two.png') throw new Error('Injected second PNG write failure');";
  await writeFile(modulePath, original.replace(write, `${injection}\n${write}`));
  const config = isolatedConfig(`test-injected-${suffix}`);
  const result = await runIsolated(config, isolated, 'config.json', { SAYLA_TEST_FAIL_SECOND_PNG: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Injected second PNG write failure/);
  await assert.rejects(lstat(join(isolated, 'drafts', config.output_dir.split('/').pop())), { code: 'ENOENT' });
  const residue = (await readdir(join(isolated, 'drafts'))).filter(name => name.includes('staging'));
  assert.deepEqual(residue, []);
});
