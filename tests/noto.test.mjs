import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { notoEmojis, getNotoEmoji, isNotoEmoji, notoAssetUrl, notoPosterPath, validateNotoWebp, validateNotoPoster, prepareNotoPoster, downloadNotoEmoji, NOTO_CREDIT_PATH, NOTO_CREDIT } from '../src/noto-emojis.mjs';
import { empty, archive, parseArchive, androidBlockers, references } from './.build/data.mjs';
import { insertEmoji } from '../src/emoji.mjs';
import { bullet } from '../src/domain.mjs';

const fixture = (id, extension) => readFile(new URL(`./fixtures/noto/${id}.${extension}`, import.meta.url));

test('complete official Noto catalog has 881 unique searchable animations across nine categories', () => {
  assert.equal(notoEmojis.length, 881);
  assert.equal(new Set(notoEmojis.map(item => item.token)).size, 881);
  assert.equal(new Set(notoEmojis.map(item => item.category)).size, 9);
  for (const item of notoEmojis) {
    assert.ok(isNotoEmoji(item)); assert.ok(item.label && item.tags.length && item.fallback);
    assert.equal(getNotoEmoji(item.token), item);
    assert.match(notoAssetUrl(item), /^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/[0-9a-f_]+\/512\.webp$/);
  }
  assert.ok(getNotoEmoji(':noto_1f642_200d_2195_fe0f:').fallback.includes('\u200d'));
  assert.ok(getNotoEmoji(':noto_1f443_1f3fb:'));
  assert.match(notoAssetUrl(getNotoEmoji(':noto_a9_fe0f:')), /\/00a9_fe0f\/512.webp$/);
  assert.match(notoAssetUrl(getNotoEmoji(':noto_ae_fe0f:'), true), /\/00ae_fe0f\/emoji.svg$/);
  assert.throws(() => notoAssetUrl({ token: ':noto_../../evil:' }), /Unknown/);
});

test('real Google face, ZWJ and skin-tone assets validate as animated WebP with safe static posters', async () => {
  for (const codepoint of ['1f600', '1f642_200d_2195_fe0f', '1f443_1f3fb']) {
    const webp = await fixture(codepoint, 'webp'), svg = await fixture(codepoint, 'svg');
    assert.equal(validateNotoWebp(webp), webp); assert.equal(validateNotoPoster(svg), svg);
    assert.throws(() => validateNotoWebp(webp.slice(0, -10)), /Incomplete/);
  }
  assert.throws(() => validateNotoWebp(new TextEncoder().encode('<html>not an image</html>')), /invalid/);
  for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"></svg>', '<svg><image href="https://example.com/x"/></svg>', '<svg><animate/></svg>']) assert.throws(() => validateNotoPoster(new TextEncoder().encode(bad)), /unsupported/);
});

test('Noto downloader is allow-listed, bounded, anonymous and produces a complete offline bundle', async () => {
  const original = globalThis.fetch, requests = [], item = notoEmojis[0];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return new Response(await fixture('1f600', url.endsWith('webp') ? 'webp' : 'svg'), { status: 200 });
    };
    const assets = await downloadNotoEmoji({ ...item, codepoint: '../../evil' });
    assert.equal(assets.size, 3);
    assert.equal(assets.get('emoji/' + item.fileName).type, 'image/webp');
    assert.equal(assets.get(notoPosterPath(item)).type, 'image/svg+xml');
    assert.match(await assets.get(NOTO_CREDIT_PATH).text(), /CC BY 4.0/);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(({ url, options }) => url.includes('/1f600/') && options.credentials === 'omit' && options.referrerPolicy === 'no-referrer'));
    globalThis.fetch = async () => new Response('bad', { status: 404 });
    await assert.rejects(downloadNotoEmoji(item), /download.*404/i);
    globalThis.fetch = async () => new Response('x', { headers: { 'content-length': '999999999' } });
    await assert.rejects(downloadNotoEmoji(item), /size limit/);
    await assert.rejects(downloadNotoEmoji({ token: 'https://example.com/evil' }), /Unknown/);
  } finally { globalThis.fetch = original; }
});

test('Rocket Illustrator SVG is normalized without changing artwork and can be inserted', async () => {
  const raw = await fixture('1f680', 'svg'), original = new TextDecoder().decode(raw), normalized = prepareNotoPoster(raw), text = new TextDecoder().decode(normalized);
  assert.throws(() => validateNotoPoster(raw), /unsupported/);
  assert.equal(validateNotoPoster(normalized), normalized);
  assert.doesNotMatch(text, /<!DOCTYPE|<!ENTITY|&ns_[a-z_]+;|encoding=/);
  assert.match(text, /xmlns:i="http:\/\/ns\.adobe\.com\/AdobeIllustrator\/10\.0\/"/);
  assert.deepEqual([...text.matchAll(/<path\b[^>]*>/g)].map(match => match[0]), [...original.matchAll(/<path\b[^>]*>/g)].map(match => match[0]), 'Illustrated paths are unchanged');
  const originalFetch = globalThis.fetch, rocket = getNotoEmoji(':noto_1f680:');
  try {
    globalThis.fetch = async url => new Response(await fixture('1f680', url.endsWith('webp') ? 'webp' : 'svg'));
    const assets = await downloadNotoEmoji(rocket);
    assert.deepEqual(new Uint8Array(await assets.get(notoPosterPath(rocket)).arrayBuffer()), normalized);
    assert.deepEqual(new Uint8Array(await assets.get('emoji/' + rocket.fileName).arrayBuffer()), new Uint8Array(await fixture('1f680', 'webp')));
    assert.match(await assets.get(NOTO_CREDIT_PATH).text(), /metadata may be normalized/);
    globalThis.fetch = async url => new Response(url.endsWith('webp') ? await fixture('1f680', 'webp') : '<svg><script>bad()</script></svg>');
    await assert.rejects(downloadNotoEmoji(rocket), error => /unsupported static/.test(error.message) && !/connection/.test(error.message), 'Validation failures are not mislabeled as connection failures');
  } finally { globalThis.fetch = originalFetch; }
});

test('legacy SVG normalization never enables external, arbitrary, recursive or parameter entities', () => {
  const encode = value => new TextEncoder().encode(value), declaration = body => `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [${body}]>`, safe = '<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">';
  for (const body of ['<!ENTITY evil SYSTEM "file:///etc/passwd">', '<!ENTITY ns_ai "https://evil.example/">', '<!ENTITY ns_ai "&recursive;">', '<!ENTITY % ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">', safe + safe, '<!ENTITY evil "<script/>">']) assert.throws(() => prepareNotoPoster(encode(declaration(body) + '<svg/>')), /unsupported/);
  for (const svg of ['<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"/>', '<svg><image href="&ns_ai;"/></svg>']) assert.throws(() => prepareNotoPoster(encode(declaration(safe) + svg)), /unsupported/);
  assert.throws(() => prepareNotoPoster(encode('<!DOCTYPE svg SYSTEM "https://evil.example/evil.dtd"><svg/>')), /unsupported/);
  assert.ok(prepareNotoPoster(encode(declaration(safe) + '<svg xmlns:i="&ns_ai;"/>')));
});

test('Noto animation, static frame and attribution survive full backup and retain normal text semantics', async () => {
  const doc = empty(), item = notoEmojis[0];
  doc.tables.bullets = [insertEmoji(bullet('q', { text: 'Good work! ' }), item.token)];
  doc.tables.emojis = [{ token: item.token, label: item.label, fileName: item.fileName }];
  const assets = new Map([['emoji/' + item.fileName, new Blob([await fixture('1f600', 'webp')], { type: 'image/webp' })], [notoPosterPath(item), new Blob([await fixture('1f600', 'svg')], { type: 'image/svg+xml' })], [NOTO_CREDIT_PATH, new Blob([NOTO_CREDIT], { type: 'text/plain' })]]);
  assert.equal(references(doc).size, 3);
  const restored = await parseArchive(await archive(doc, assets));
  assert.equal(restored.doc.tables.bullets[0].text, 'Good work! :noto_1f600:');
  assert.deepEqual(restored.doc.tables.emojis, doc.tables.emojis);
  for (const [path, blob] of assets) assert.deepEqual(await restored.assets.get(path).arrayBuffer(), await blob.arrayBuffer());
  assert.ok(androidBlockers(doc).some(reason => /Noto/.test(reason)));
  await assert.rejects(archive(doc, assets, true), /full web backup/);
  const missing = new Map(assets); missing.delete(notoPosterPath(item));
  await assert.rejects(archive(doc, missing), /Missing attachment/);
});
