// Settings → Desktop (desktop app only): tray, quick capture, launch at login, and local AI apps.
import React, { useEffect, useState } from 'react';
import { desktopInvoke } from './desktop';
import { localAccess, setLocalAccess, localActivity, type LocalAccess } from './local-mcp';
import './ai-apps.css';

type View = { keepInTray: boolean; quickCapture: boolean; launchAtLogin: boolean; shortcut: string };
type Mcp = { on: boolean; url: string | null; token: string | null; command: string };
const ACCESS: [LocalAccess, string, string][] = [
  ['read', 'Read only', 'Can search and read your notes.'],
  ['write', 'Read and write', 'Can also add and edit notes, flashcards, MCQs and bookmarks.'],
  ['delete', 'Read, write and delete', 'Can also move notes to Trash (you can restore them).'],
];
const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
/** The shortcut as people read it on this system: ⌘⇧Space on a Mac, Ctrl+Shift+Space elsewhere. */
export const shortcutLabel = (s = 'CommandOrControl+Shift+Space') => mac ? s.replace('CommandOrControl+', '⌘').replace('Shift+', '⇧') : s.replace('CommandOrControl', 'Ctrl');
const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function DesktopSettings() {
  const [view, setView] = useState<View | null>(null), [mcp, setMcp] = useState<Mcp | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [access, setAccess] = useState(localAccess), [copied, setCopied] = useState(''), [activity, setActivity] = useState(localActivity);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  useEffect(() => {
    desktopInvoke<View>('desktop_settings').then(setView).catch(fail);
    desktopInvoke<Mcp>('local_mcp_status').then(setMcp).catch(fail);
    const update = () => setActivity(localActivity());
    window.addEventListener('remo-local-mcp-activity', update);
    return () => window.removeEventListener('remo-local-mcp-activity', update);
  }, []);
  const change = async (c: Partial<View>) => { setError(''); try { setView(await desktopInvoke<View>('desktop_settings_set', { change: c })); } catch (e) { fail(e); } };
  const setServer = async (on: boolean, newToken = false) => { setBusy(true); setError(''); try { setMcp(await desktopInvoke<Mcp>('local_mcp_set', { on, newToken })); } catch (e) { fail(e); } finally { setBusy(false); } };
  const copy = async (label: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 1600); } catch { setError('Copy failed. Select the text and copy it.'); } };
  const exe = mcp?.command || 'RemoNook.exe';
  const configs: [string, string][] = mcp?.on && mcp.url && mcp.token ? [
    ['Claude Desktop', JSON.stringify({ mcpServers: { remonook: { command: exe, args: ['--mcp'] } } }, null, 2)],
    ['Claude Code', `claude mcp add remonook -- "${exe}" --mcp`],
    ['Codex', `# ~/.codex/config.toml\n[mcp_servers.remonook]\ncommand = ${JSON.stringify(exe)}\nargs = ["--mcp"]`],
    ['Any MCP client (HTTP)', `URL: ${mcp.url}\nTransport: Streamable HTTP\nHeader: Authorization: Bearer ${mcp.token}`],
  ] : [];
  const toggle = (label: string, hint: string, checked: boolean | undefined, onChange: (v: boolean) => void) =>
    <label className="ai-apps-access"><input type="checkbox" disabled={!view} checked={!!checked} onChange={e => onChange(e.target.checked)} /><span><strong>{label}</strong><small>{hint}</small></span></label>;
  return <section className="ai-apps" aria-label="Desktop">
    <div className="settings-section-heading"><h3>RemoNook on this computer.</h3><p>Keep RemoNook a keystroke away, and let AI apps on this computer use your notes.</p></div>
    {error && <p className="ai-apps-error" role="alert">{error}</p>}
    <fieldset><legend>App</legend>
      {toggle('Quick capture', `Press ${shortcutLabel(view?.shortcut)} anywhere to jot a note into the Inbox of the open workspace.`, view?.quickCapture, v => void change({ quickCapture: v }))}
      {toggle('Keep running in the tray', 'Closing the window keeps RemoNook in the system tray, so quick capture and AI apps keep working. Quit from the tray icon.', view?.keepInTray, v => void change({ keepInTray: v }))}
      {toggle('Start at login', 'Open RemoNook in the tray when you sign in to this computer.', view?.launchAtLogin, v => void change({ launchAtLogin: v }))}
    </fieldset>
    <h4>AI apps on this computer</h4>
    <p className="ai-apps-muted">Claude Desktop, Claude Code, Codex and other MCP apps on this computer can use the workspace that is open in RemoNook, including device-only and folder workspaces. Nothing goes through RemoNook cloud, but the AI app sends what it reads to its own service.</p>
    <label className="ai-apps-access"><input type="checkbox" disabled={!mcp || busy} checked={!!mcp?.on} onChange={e => void setServer(e.target.checked)} /><span><strong>Allow AI apps on this computer</strong><small>{mcp?.on ? `Listening on ${mcp.url} (this computer only).` : 'Off. Only apps you set up with the details below can connect.'}</small></span></label>
    {mcp?.on && <>
      <fieldset><legend>What they can do</legend>{ACCESS.map(([id, label, hint]) => <label key={id} className="ai-apps-access"><input type="radio" name="local-ai-access" checked={access === id} onChange={() => { setAccess(id); setLocalAccess(id); }} /><span><strong>{label}</strong><small>{hint}</small></span></label>)}</fieldset>
      <p>Add RemoNook to your AI app:</p>
      {configs.map(([label, text]) => <details key={label} open={label === 'Claude Desktop'}><summary>{label}</summary><pre>{text}</pre><button type="button" onClick={() => copy(label, text)}>{copied === label ? 'Copied' : 'Copy'}</button></details>)}
      <p className="ai-apps-note">Apps started with <code>--mcp</code> open RemoNook in the tray if it is closed. The HTTP address needs the token above; keep it private. <button type="button" disabled={busy} onClick={() => { if (window.confirm('Disconnect every app that uses the HTTP token? Apps set up with --mcp keep working.')) void setServer(true, true); }}>New token</button></p>
    </>}
    <h4>Recent changes by AI apps on this computer</h4>
    {!activity.length ? <p className="ai-apps-muted">Nothing yet.</p> : <ul className="ai-apps-activity">{activity.slice(0, 20).map((a, i) => <li key={i}><span>{a.summary}</span><small>{a.workspace} · {when(a.at)}</small></li>)}</ul>}
    <p className="ai-apps-note">Each AI change is an ordinary edit: undo it with Ctrl+Z while it is recent, or restore deleted notes from Trash.</p>
  </section>;
}
