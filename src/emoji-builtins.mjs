// Original Remo vector art; no Telegram artwork or remote assets.
const value = k => ({ a: 0, k });
const fill = color => ({ ty: 'fl', c: value(color), o: value(100), r: 1 });
const ellipse = (x, y, w, h) => ({ ty: 'el', p: value([x, y]), s: value([w, h]) });
const path = (vertices, closed = true) => ({ ty: 'sh', ks: value({ v: vertices, i: vertices.map(() => [0, 0]), o: vertices.map(() => [0, 0]), c: closed }) });
const group = items => ({ ty: 'gr', it: [...items, { ty: 'tr', p: value([0, 0]), a: value([0, 0]), s: value([100, 100]), r: value(0), o: value(100), sk: value(0), sa: value(0) }] });
const gold = [1, .72, .2, 1], ink = [.19, .17, .13, 1];
function animation(shapes) {
  return { v: '5.7.4', fr: 30, ip: 0, op: 60, w: 100, h: 100, assets: [], layers: [{ ty: 4, ind: 1, ip: 0, op: 60, st: 0, sr: 1, ks: {
    o: value(100), p: value([50, 50, 0]), a: value([50, 50, 0]), r: value(0),
    s: { a: 1, k: [
      { t: 0, s: [90, 90, 100], e: [105, 105, 100], o: { x: [.42], y: [0] }, i: { x: [.58], y: [1] } },
      { t: 30, s: [105, 105, 100], e: [90, 90, 100], o: { x: [.42], y: [0] }, i: { x: [.58], y: [1] } },
      { t: 60, s: [90, 90, 100] },
    ] },
  }, shapes: [...shapes].reverse() }] };
}
export const builtinEmojis = [
  { token: ':remo_smile:', label: 'Smile', fallback: '🙂', data: animation([
    group([ellipse(50, 50, 84, 84), fill(gold)]),
    group([ellipse(35, 40, 7, 10), ellipse(65, 40, 7, 10), fill(ink)]),
    group([path([[30, 59], [36, 66], [44, 70], [56, 70], [64, 66], [70, 59]], false), { ty: 'st', c: value(ink), o: value(100), w: value(5), lc: 2, lj: 2 }]),
  ]) },
  { token: ':remo_heart:', label: 'Heart', fallback: '❤️', data: animation([
    group([{ ty: 'sh', ks: value({ v: [[50, 83], [15, 46], [50, 26], [85, 46]], i: [[0, 0], [-18, -27], [-16, -24], [18, -27]], o: [[0, 0], [0, -24], [16, -24], [0, 0]], c: true }) }, fill([.96, .32, .43, 1])]),
  ]) },
  { token: ':remo_sparkle:', label: 'Sparkle', fallback: '✨', data: animation([
    group([path([[50, 7], [61, 38], [93, 50], [61, 61], [50, 93], [39, 61], [7, 50], [39, 38]]), fill(gold)]),
  ]) },
  { token: ':remo_done:', label: 'Done', fallback: '✅', data: animation([
    group([ellipse(50, 50, 84, 84), fill([.27, .7, .51, 1])]),
    group([path([[29, 50], [44, 65], [72, 35]], false), { ty: 'st', c: value([1, 1, 1, 1]), o: value(100), w: value(8), lc: 2, lj: 2 }]),
  ]) },
];
