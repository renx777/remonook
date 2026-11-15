// The phone back button (Android's back gesture, or the browser's back on a phone) closes what is
// open on top, in order: a menu or dialog, the reader, then bullet editing, instead of leaving
// the app. Each open layer adds a history entry; going back removes it and closes the layer.
// On wider screens nothing changes: the browser's back button keeps its usual meaning.
import { useEffect, useRef } from 'react';

type Layer = { id: number; close: () => void };
const layers: Layer[] = [];
let next = 1, ignorePops = 0, listening = false;

const phone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches;

function onPop() {
  if (ignorePops) { ignorePops--; return; }
  const top = layers.pop();
  top?.close();
}

/** Registers a layer that the back button closes. Returns a function to call when the layer
 closes by other means (its own button), which removes its history entry. */
export function pushBackLayer(close: () => void): () => void {
  if (!phone() || typeof history === 'undefined') return () => {};
  if (!listening) { window.addEventListener('popstate', onPop); listening = true; }
  const layer = { id: next++, close };
  layers.push(layer);
  try { history.pushState({ ...(history.state || {}), remoBack: layer.id }, ''); } catch { /* history unavailable */ }
  return () => {
    const i = layers.indexOf(layer);
    if (i < 0) return; // already closed by the back button
    layers.splice(i, 1);
    // Drop our entry so a later back press does not land on a stale one.
    if (history.state?.remoBack === layer.id) { ignorePops++; history.back(); }
  };
}

/** While `open`, the back button calls `close`. */
export function useBackClose(open: boolean, close: () => void) {
  const latest = useRef(close); latest.current = close;
  useEffect(() => {
    if (!open) return;
    return pushBackLayer(() => latest.current());
  }, [open]);
}

/** For tests. */
export const backLayers = () => layers.length;
