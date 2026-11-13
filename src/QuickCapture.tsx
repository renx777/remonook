// The quick capture box (desktop): a small window opened with Ctrl+Shift+Space or from the tray.
// Enter saves to the Inbox of the workspace open in RemoNook; Shift+Enter starts a new line
// (each line becomes a bullet); Escape closes.
import React, { useEffect, useRef, useState } from 'react';
import { desktopInvoke, desktopListen } from './desktop';
import { activeLocalWorkspace } from './workspaces';

export function QuickCapture() {
  const [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [target, setTarget] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const refresh = () => { setTarget(activeLocalWorkspace()?.name || 'My notes'); setError(''); setTimeout(() => box.current?.focus(), 0); };
  useEffect(() => {
    refresh();
    const stop = desktopListen('capture-open', refresh);
    const hide = () => void desktopInvoke('capture_hide').catch(() => {});
    // Clicking elsewhere closes the box; the text stays for next time.
    window.addEventListener('blur', hide);
    return () => { void stop.then(s => s()); window.removeEventListener('blur', hide); };
  }, []);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try { await desktopInvoke('capture_submit', { text }); setText(''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <main className="quick-capture" onKeyDown={e => { if (e.key === 'Escape') void desktopInvoke('capture_hide'); }}>
    <div className="quick-capture-head" data-tauri-drag-region><strong data-tauri-drag-region>Quick capture</strong><small data-tauri-drag-region>to Inbox · {target}</small></div>
    <textarea ref={box} autoFocus value={text} placeholder="Type a note. Enter saves · Shift+Enter for a new bullet · Esc closes" aria-label="Note to capture"
      onChange={e => setText(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
    {error && <p role="alert" className="quick-capture-error">{error}</p>}
  </main>;
}
