// Settings → About: which RemoNook this is, so a bug report can say exactly which build it was.
import React, { useEffect, useState } from 'react';
import { isApp, isDesktop, isMobileApp, desktopInvoke } from './desktop';
import { APP_ENV } from './cloud-config';
import { Icon } from './icons';

const value = (read: () => string) => { try { return read() || ''; } catch { return ''; } };
export const buildCommit = () => value(() => typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '');
export const webRelease = () => value(() => typeof __WEB_RELEASE__ !== 'undefined' ? __WEB_RELEASE__ : '');
export const builtAt = () => value(() => typeof __BUILT_AT__ !== 'undefined' ? __BUILT_AT__ : '');

export function About() {
  const [version, setVersion] = useState(''), [copied, setCopied] = useState(false);
  useEffect(() => { if (isApp()) desktopInvoke<string>('plugin:app|version').then(setVersion).catch(() => {}); }, []);
  const platform = isMobileApp() ? 'Android app' : isDesktop() ? (/Mac/i.test(navigator.userAgent) ? 'Mac app' : /Windows/i.test(navigator.userAgent) ? 'Windows app' : 'Linux app') : 'Web';
  const env = APP_ENV === 'production' ? 'Production' : APP_ENV === 'staging' ? 'Staging' : APP_ENV ? APP_ENV[0].toUpperCase() + APP_ENV.slice(1) : '';
  const rows: [string, string][] = [
    ...(version ? [['App version', version] as [string, string]] : []),
    ['Platform', platform],
    ['Web release', webRelease() || '—'],
    ['Build', [buildCommit(), builtAt()].filter(Boolean).join(' · ') || '—'],
    ...(env ? [['Sync server', env] as [string, string]] : []),
  ];
  const text = `RemoNook ${version || webRelease()}\n` + rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\nBrowser: ${navigator.userAgent}`;
  return <section className="settings-about" aria-label="About">
    <div className="settings-section-heading"><h3>RemoNook{env && env !== 'Production' ? ' ' + env : ''}</h3><p>{version ? `Version ${version} · ${platform}` : platform}</p></div>
    <dl className="about-facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ } }}><Icon name="copy" size={15} />{copied ? 'Copied' : 'Copy details for a bug report'}</button>
  </section>;
}
