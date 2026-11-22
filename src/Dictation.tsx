// Dictation: record from the microphone and insert the transcript into a bullet. Audio is recorded
// in one-minute chunks (each a complete file), sent one after another to the sync server's
// /ai/transcribe (Whisper on Workers AI) and never stored. Each account has 10 minutes a day.
import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { CLOUD_API } from './cloud-config';
import { Icon } from './icons';
import './dictation.css';

const CHUNK_MS = 60_000, SESSION_SECONDS = 600;
const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
type Phase = 'starting' | 'listening' | 'finishing' | 'done' | 'error';

async function call(user: Pick<User, 'getIdToken'> | null, path: string, init: RequestInit = {}) {
  if (!user) throw Error('Sign in to dictate.');
  const r = await fetch(CLOUD_API + path, { ...init, headers: { Authorization: 'Bearer ' + await user.getIdToken(), ...(init.headers || {}) }, cache: 'no-store' });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(v.error || 'Dictation is unavailable. Try again.'), { code: v.code });
  return v;
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The floating "Listening" pill. It owns the microphone while open; `onText` receives each transcribed chunk in order. */
export function DictationPill({ user, onText, onClose }: { user: Pick<User, 'getIdToken'> | null; onText: (text: string) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('starting'), [seconds, setSeconds] = useState(0), [pending, setPending] = useState(0), [error, setError] = useState(''), [left, setLeft] = useState<number | null>(null);
  const s = useRef({ running: false, stream: null as MediaStream | null, rec: null as MediaRecorder | null, queue: Promise.resolve(), timer: 0, tick: 0, limit: SESSION_SECONDS, abort: new AbortController() });
  const textRef = useRef(onText); textRef.current = onText;

  const send = (blob: Blob) => {
    if (blob.size < 256) return;
    setPending(n => n + 1);
    s.current.queue = s.current.queue.then(async () => {
      try {
        const v = await call(user, '/ai/transcribe?id=' + crypto.randomUUID(), { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob, signal: s.current.abort.signal });
        if (typeof v.remainingSeconds === 'number') setLeft(v.remainingSeconds);
        if (v.text) textRef.current(v.text);
      } catch (e) { if (!s.current.abort.signal.aborted) { setError((e as Error).message); setPhase('error'); stopRecording(); } }
      finally { setPending(n => n - 1); }
    });
  };
  const segment = () => {
    const st = s.current, type = TYPES.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(st.stream!, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 }), parts: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => { send(new Blob(parts, { type: rec.mimeType || type || 'audio/webm' })); if (st.running) segment(); };
    st.rec = rec; rec.start();
    clearTimeout(st.timer); st.timer = window.setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, CHUNK_MS);
  };
  const stopRecording = () => {
    const st = s.current; if (!st.running && !st.stream) return;
    st.running = false; clearTimeout(st.timer); clearInterval(st.tick);
    if (st.rec?.state === 'recording') st.rec.stop();
    st.stream?.getTracks().forEach(t => t.stop()); st.stream = null;
  };
  const finish = () => { if (phase !== 'listening') return; setPhase('finishing'); stopRecording(); };
  const cancel = () => { s.current.abort.abort(); stopRecording(); onClose(); };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw Error('This browser cannot record audio.');
        const status = await call(user, '/ai/status');
        if (status.enabled === false) throw Error('AI is paused right now.');
        const remaining = typeof status.audioRemainingSeconds === 'number' ? status.audioRemainingSeconds : SESSION_SECONDS;
        if (remaining <= 0) throw Error('Your 10 dictation minutes for today are used. More are available after 00:00 UTC.');
        if (status.appAvailable === false) throw Error('Today’s shared AI allowance is used.');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => { throw Error('Allow microphone access to dictate.'); });
        if (!live) { stream.getTracks().forEach(t => t.stop()); return; }
        const st = s.current; st.stream = stream; st.running = true; st.limit = Math.min(SESSION_SECONDS, remaining); setLeft(remaining);
        segment(); setPhase('listening');
        const began = Date.now();
        st.tick = window.setInterval(() => { const t = (Date.now() - began) / 1000; setSeconds(t); if (t >= st.limit) { setPhase('finishing'); stopRecording(); } }, 250);
      } catch (e) { if (live) { setError((e as Error).message); setPhase('error'); } }
    })();
    return () => { live = false; s.current.abort.abort(); stopRecording(); };
  }, []);
  // Close by itself once the last chunk is transcribed.
  useEffect(() => { if (phase === 'finishing' && pending === 0) { const t = setTimeout(() => { if (!s.current.running) { setPhase('done'); onClose(); } }, 150); return () => clearTimeout(t); } }, [phase, pending]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); phase === 'listening' ? finish() : cancel(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });

  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the editor's cursor where it is
  return <div className={'dictation-pill is-' + phase} role="status" aria-live="polite" aria-label="Dictation" onMouseDown={keep}>
    {phase === 'error' ? <>
      <Icon name="mic" size={16} /><span className="dictation-text">{error}</span>
      <button type="button" onClick={onClose}>Close</button>
    </> : <>
      <span className="dictation-dot" aria-hidden="true" /><Icon name="mic" size={16} />
      <span className="dictation-text">{phase === 'starting' ? 'Starting…' : phase === 'listening' ? `Listening ${clock(seconds)}` : `Transcribing${pending > 1 ? ` (${pending})` : ''}…`}</span>
      {phase === 'listening' && left !== null && <small>{clock(Math.max(0, Math.min(left, s.current.limit) - seconds))} left today</small>}
      {phase === 'listening' && <button type="button" className="dictation-stop" onClick={finish}>Done</button>}
      <button type="button" aria-label="Cancel dictation" onClick={cancel}><Icon name="close" size={14} /></button>
    </>}
    <span className="dictation-note">Audio is transcribed by Cloudflare AI and not stored.</span>
  </div>;
}
