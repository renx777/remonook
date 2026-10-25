// Fetch only Google's published catalog, never execute its JavaScript.
// Generated catalog and test fixtures are mechanical copies/derivations of upstream assets.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prepareNotoPoster } from '../src/noto-emojis.mjs';
const source = 'https://googlefonts.github.io/noto-emoji-animation/data/api.json';
const response = await fetch(source);
if (!response.ok) throw Error(`Catalog request failed: ${response.status}`);
const bytes = await response.text(), data = JSON.parse(bytes);
if (!Array.isArray(data.icons) || data.icons.length < 800) throw Error('Unexpected/incomplete catalog. Existing files have not been changed.');
const seen = new Set(), items = data.icons.map(icon => {
  const codepoint = icon.codepoint;
  if (typeof codepoint !== 'string' || !/^[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*$/.test(codepoint) || seen.has(codepoint)) throw Error(`Invalid/duplicate catalog codepoint: ${codepoint}`);
  if (codepoint.split('_').some(part => { const value = Number.parseInt(part, 16); return value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff); })) throw Error('Invalid Unicode sequence');
  seen.add(codepoint);
  const tags = icon.tags.filter(tag => typeof tag === 'string'), label = (tags[0] || codepoint).replace(/^:|:$/g, '').replace(/[-_]/g, ' ');
  const assetCodepoint = codepoint.split('_').map(part => part.padStart(4, '0')).join('_');
  return { codepoint, ...(assetCodepoint !== codepoint ? { assetCodepoint } : {}), label: label[0].toUpperCase() + label.slice(1), tags, category: icon.categories[0] || 'Other' };
});
const catalog = { source, sourceSha256: createHash('sha256').update(bytes).digest('hex'), count: items.length, license: 'CC-BY-4.0', items };
await writeFile(new URL('../src/noto-emoji-catalog.json', import.meta.url), JSON.stringify(catalog) + '\n');
console.log(`Catalog synchronized: ${items.length} animations, ${new Set(items.map(item => item.category)).size} categories.`);
if (process.argv.includes('--verify')) {
  const queue = items.flatMap(item => ['512.webp', 'emoji.svg'].map(file => ({ codepoint: item.assetCodepoint || item.codepoint, file }))), failures = [];
  let checked = 0, animationBytes = 0, maximumBytes = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const item = queue.shift(), url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${item.codepoint}/${item.file}`;
      try {
        const asset = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        const size = Number(asset.headers.get('content-length'));
        if (!asset.ok || size > (item.file === '512.webp' ? 16 * 1024 * 1024 : 1024 * 1024)) failures.push(`${item.codepoint}/${item.file}: ${asset.status}, ${size} bytes`);
        if (item.file === '512.webp') { animationBytes += size; maximumBytes = Math.max(maximumBytes, size); }
      } catch (error) { failures.push(`${item.codepoint}/${item.file}: ${error.message}`); }
      if (++checked % 200 === 0) console.log(`Verified ${checked}/${items.length * 2} image endpoints`);
    }
  }));
  console.log(`Checked ${checked} endpoints. Animation bytes: ${animationBytes}; largest: ${maximumBytes}. Failures: ${failures.length}.`);
  if (failures.length) throw Error(failures.join('\n'));
}
if (process.argv.includes('--validate-posters')) {
  const queue = items.slice(), failures = []; let checked = 0, normalized = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        const asset = await fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${item.assetCodepoint || item.codepoint}/emoji.svg`, { signal: AbortSignal.timeout(15000) });
        if (!asset.ok) throw Error(`HTTP ${asset.status}`);
        const bytes = new Uint8Array(await asset.arrayBuffer()), prepared = prepareNotoPoster(bytes);
        if (prepared !== bytes) normalized++;
      } catch (error) { failures.push(`${item.codepoint}: ${error.message}`); }
      if (++checked % 100 === 0) console.log(`Validated ${checked}/${items.length} static image payloads`);
    }
  }));
  console.log(`Validated ${checked} static images. Normalized legacy exports: ${normalized}. Failures: ${failures.length}.`);
  if (failures.length) throw Error(failures.join('\n'));
}
if (process.argv.includes('--fixtures')) {
  await mkdir(new URL('../tests/fixtures/noto/', import.meta.url), { recursive: true });
  const sample = [items[0], items.find(item => item.codepoint.includes('_200d_')), items.find(item => /_1f3f[b-f]/.test(item.codepoint)), items.find(item => item.codepoint === '1f680')].filter(Boolean);
  for (const item of sample) for (const file of ['512.webp', 'emoji.svg']) {
    const asset = await fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${item.codepoint}/${file}`);
    if (!asset.ok) throw Error(`Fixture download failed: ${item.codepoint}/${file}`);
    const content = new Uint8Array(await asset.arrayBuffer());
    await writeFile(new URL(`../tests/fixtures/noto/${item.codepoint}.${file.endsWith('webp') ? 'webp' : 'svg'}`, import.meta.url), content);
    console.log(item.codepoint, file, content.length, asset.headers.get('access-control-allow-origin'));
  }
}
