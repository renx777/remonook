// RemoNook desktop (Tauri): small differences from the website.
// The desktop app opens straight into the app, opens links to other sites in the system browser,
// and (until Google sign-in through the browser lands) offers email sign-in only.
type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
const internals = (): TauriInternals | undefined => (typeof window === 'undefined' ? undefined : (window as any).__TAURI_INTERNALS__);
export const isDesktop = () => !!internals();

/** Opens a web or mail link in the system browser. */
export function openExternal(url: string) {
  return internals()?.invoke('plugin:opener|open_url', { url }).catch(() => {});
}
const external = (href: string) => { try { const u = new URL(href, location.href); return /^(https?|mailto):$/.test(u.protocol) && u.origin !== location.origin; } catch { return false; } };

/** Sends links to other sites, and window.open calls for them, to the system browser. */
export function installDesktopLinks() {
  if (!isDesktop()) return;
  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (a && external(a.href)) { e.preventDefault(); void openExternal(a.href); }
  }, true);
  const open = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url ? String(url) : '';
    if (href && external(href)) { void openExternal(new URL(href, location.href).href); return null; }
    return open(url as any, target, features);
  }) as typeof window.open;
}
