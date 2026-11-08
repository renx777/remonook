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

/** The website that finishes Google sign-in for this build (see DesktopSignIn and google.rs). */
export const desktopSignInSite = (env: string) => env === 'production' ? 'https://remonook.com' : 'https://staging.remonook.com';
/** Opens Google sign-in in the system browser and resolves with the Google ID token.
 `onLink` receives the sign-in address when the browser could not be opened, to show it. */
export async function desktopGoogleToken(env: string, onLink?: (url: string) => void): Promise<string> {
  const tauri = internals(); if (!tauri) throw Error('Not in the desktop app.');
  const message = (e: unknown) => Error(typeof e === 'string' ? e : (e as any)?.message || 'Google sign-in failed.');
  const started = await tauri.invoke('google_sign_in_start', { web: desktopSignInSite(env) }).catch(e => { throw message(e); }) as { url: string; opened: boolean };
  if (!started.opened) onLink?.(started.url);
  return String(await tauri.invoke('google_sign_in_wait').catch(e => { throw message(e); }));
}

/** The request the desktop app put in the sign-in page's address: its loopback port and state. */
export function desktopSignInRequest(search: string): { port: number; state: string } | null {
  const q = new URLSearchParams(search), port = Number(q.get('port')), state = q.get('state') || '';
  return Number.isInteger(port) && port >= 1024 && port <= 65535 && /^[a-f0-9]{32,128}$/.test(state) ? { port, state } : null;
}
export const desktopCallback = (port: number, state: string, idToken: string) =>
  `http://127.0.0.1:${port}/callback?state=${encodeURIComponent(state)}&id_token=${encodeURIComponent(idToken)}`;

