// Logical depth is unbounded. Compress progressively (never flatten at level 8)
// so a deep branch still leaves room for text on a narrow screen.
export function depthIndent(depth, width = 800) {
  const step = width < 600 ? 24 : 44, comfortable = width < 600 ? 2 : 4;
  const extraStep = Math.min(step, Math.max(3, (width * 0.42 - comfortable * step) / 14));
  return Math.min(depth, comfortable) * step + Math.log2(1 + Math.max(0, depth - comfortable)) * extraStep;
}
