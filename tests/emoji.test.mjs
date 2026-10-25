import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { builtinEmojis } from '../src/emoji-builtins.mjs';
import { mediaLinks } from '../src/media.mjs';
import { decodeAnimation, validateAnimation, emojiMatcher, emojiParts, insertEmoji, MAX_EMOJI_BYTES, MAX_DECODED_BYTES } from '../src/emoji.mjs';

const sample = () => structuredClone(builtinEmojis[0].data);
test('original built-in emojis validate and JSON/TGS decode to identical animation data', async () => {
  for (const item of builtinEmojis) assert.equal(validateAnimation(item.data), item.data);
  const json = JSON.stringify(sample());
  assert.deepEqual(await decodeAnimation(new Blob([json])), sample());
  assert.deepEqual(await decodeAnimation(new Blob([gzipSync(json)])), sample());
  await assert.rejects(decodeAnimation(new Blob(['not json'])), /valid Lottie/);
  await assert.rejects(decodeAnimation(new Blob([new Uint8Array(MAX_EMOJI_BYTES + 1)])), /1 MB/);
  await assert.rejects(decodeAnimation(new Blob([gzipSync(' '.repeat(MAX_DECODED_BYTES + 1))])), /2 MB/);
});
test('emoji validation rejects scripts, resource loads, cyclic assets and costly animations', () => {
  const invalid = [
    d => { d.layers[0].ks.r.x = 'fetch("https://example.com")'; },
    d => { d.assets.push({ id: 'remote', p: 'https://example.com/image.png', u: '' }); },
    d => { d.layers[0].ty = 5; },
    d => { d.layers[0].sc = 'url(https://example.com/paint.svg)'; },
    d => { d.fonts = { list: [{ fPath: 'https://example.com/font.woff' }] }; },
    d => { d.segments = [{ time: 1 }]; },
    d => { d.w = 100000; },
    d => { d.op = d.fr * 120; },
    d => { d.layers[0].parent = d.layers[0].ind; },
    d => { d.layers[0].refId = 'missing'; },
    d => { d.assets = [{ id: 'cycle', layers: [{ ty: 0, refId: 'cycle' }] }]; d.layers[0].refId = 'cycle'; },
    d => { d.layers[0].shapes.push({ ty: 'rp', c: { a: 0, k: 1000000 } }); },
    d => { d.layers[0].shapes.push({ ty: 'rp', c: { a: 1, k: [] } }); },
    d => { Object.defineProperty(d, '__proto__', { value: {}, enumerable: true }); },
  ];
  for (const mutate of invalid) { const data = sample(); mutate(data); assert.throws(() => validateAnimation(data)); }
});
test('emoji token matching is literal, longest-first and preserves unknown text', () => {
  const matcher = emojiMatcher([{ token: ':e:' }, { token: ':e:more' }, { token: '[x.*]' }, { token: '' }]);
  assert.deepEqual(emojiParts('Hi :e:more [x.*] :unknown:', matcher), [{ text: 'Hi ' }, { token: ':e:more' }, { text: ' ' }, { token: '[x.*]' }, { text: ' :unknown:' }]);
  assert.deepEqual(emojiParts(':e:', matcher), [{ token: ':e:' }]);
  assert.deepEqual(emojiParts(':e:', matcher), [{ token: ':e:' }], 'Repeated rendering must not reuse a stale regex cursor');
  assert.deepEqual(emojiParts('plain', null), [{ text: 'plain' }]);
});
test('emoji insertion retains text and formatting offsets on either side of the selection', () => {
  const node = { id: 'note', text: 'bold tail', formatting: '0:4:BOLD;5:9:ITALIC' };
  assert.deepEqual(insertEmoji(node, ':e:', 2, 3), { ...node, text: 'bo:e:d tail', formatting: '0:2:BOLD;5:6:BOLD;7:11:ITALIC' });
  assert.equal(insertEmoji(node, ':e:').text, 'bold tail:e:');
  const linked = insertEmoji({ text: 'https://youtu.be/M7lc1UVf-VE?t=20', formatting: '' }, ':remo_smile:');
  assert.ok(linked.text.endsWith(' :remo_smile:'));
  assert.ok(mediaLinks(linked.text)[0].embed.endsWith('start=20'), 'Inserting after a share link must not corrupt its timestamp');
});
