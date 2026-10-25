import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AnimationItem } from 'lottie-web';
import type { RecordData } from './data';
import { decodeAnimation, emojiMatcher, emojiParts } from './emoji.mjs';
import { getNotoEmoji, isNotoEmoji, notoAssetUrl, notoPosterPath } from './noto-emojis.mjs';

const cache = new WeakMap<Blob, Promise<any>>();
const EmojiContext = createContext<{ emojis: Map<string, RecordData>; matcher: RegExp | null; assets: Map<string, Blob>; animate: boolean; onInsert?: (item: RecordData, id: string, start: number, end: number) => Promise<void> }>({ emojis: new Map(), matcher: null, assets: new Map(), animate: true });
export const useEmojiLibrary = () => useContext(EmojiContext);
export function EmojiProvider({ emojis, assets, animate, children, onInsert }: { emojis: RecordData[]; assets: Map<string, Blob>; animate: boolean; children: ReactNode; onInsert?: (item: RecordData, id: string, start: number, end: number) => Promise<void> }) {
  const value = useMemo(() => ({ emojis: new Map(emojis.filter(e => e.token).map(e => [e.token, e])), matcher: emojiMatcher(emojis), assets, animate, onInsert }), [emojis, assets, animate, onInsert]);
  return <EmojiContext.Provider value={value}>{children}</EmojiContext.Provider>;
}
type EmojiProps = { item: RecordData; blob?: Blob; data?: any; preview?: boolean; playRequest?: number; localAssetBase?: string };
export function AnimatedEmoji(props: EmojiProps) {
  return isNotoEmoji(props.item) ? <NotoAnimatedEmoji {...props} /> : <LottieEmoji {...props} />;
}
function useEmojiUrl(blob?: Blob, mime?: string) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (!blob || typeof URL.createObjectURL !== 'function') { setUrl(''); return; } const next = URL.createObjectURL(mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob, mime]);
  return url;
}
function NotoAnimatedEmoji({ item, blob, preview = false, playRequest = 0, localAssetBase }: EmojiProps) {
  const { assets, animate } = useContext(EmojiContext), host = useRef<HTMLSpanElement>(null), lastPlay = useRef(playRequest), known = getNotoEmoji(item.token);
  const animationUrl = useEmojiUrl(blob, 'image/webp'), posterUrl = useEmojiUrl(assets.get(notoPosterPath(item)), 'image/svg+xml');
  const [visible, setVisible] = useState(false), [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches), [hidden, setHidden] = useState(document.hidden),
    [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [animationFailed, setAnimationFailed] = useState(false), [replay, setReplay] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'), change = () => setReduced(media.matches), visibility = () => setHidden(document.hidden);
    media.addEventListener?.('change', change); document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener?.('change', change); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '40px' }); observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!preview || lastPlay.current === playRequest) return;
    lastPlay.current = playRequest; setReplay(true); const timer = setTimeout(() => setReplay(false), 5000); return () => clearTimeout(timer);
  }, [playRequest, preview]);
  const playing = visible && !hidden && ((animate && !reduced) || replay) && !animationFailed;
  // Only catalog previews contact Google. Reading inserted notes uses saved blobs exclusively.
  const local = known && localAssetBase ? `${localAssetBase}/${known.fileName}` : '';
  const animation = animationUrl || local || (preview && known && !blob ? notoAssetUrl(known) : ''), poster = posterUrl || (local ? local.replace(/\.webp$/,'.svg') : '') || (preview && known && !blob ? notoAssetUrl(known, true) : '');
  const src = visible ? (playing && animation ? animation : poster) : '';
  useLayoutEffect(() => { setReady(false); setFailed(false); }, [src]);
  return <span ref={host} className={`animated-emoji noto-animated-emoji ${preview ? 'emoji-preview' : ''} ${ready && !failed ? 'is-ready' : ''}`} role="img" aria-label={item.label || known?.label || 'Animated emoji'} title={item.label || known?.label} data-emoji-token={item.token}>
    <span className="emoji-fallback" aria-hidden="true">{known?.fallback || '◈'}</span>
    {src && <img key={src} className="emoji-animation" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onLoad={() => setReady(true)} onError={() => { if (playing && src === animation) setAnimationFailed(true); else setFailed(true); }} />}
  </span>;
}
function LottieEmoji({ item, blob, data, preview = false, playRequest = 0 }: EmojiProps) {
  const { animate } = useContext(EmojiContext), host = useRef<HTMLSpanElement>(null), player = useRef<AnimationItem | null>(null),
    lastPlay = useRef(playRequest),
    [visible, setVisible] = useState(false), [ready, setReady] = useState(false), [failed, setFailed] = useState(false),
    [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'), change = () => setReduced(media.matches), visibility = () => setHidden(document.hidden);
    media.addEventListener?.('change', change); document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener?.('change', change); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '80px' });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || (!blob && !data) || player.current) return;
    let cancelled = false, animation: AnimationItem | undefined;
    setReady(false); setFailed(false);
    const load = async () => {
      try {
        if (blob && !cache.has(blob)) cache.set(blob, decodeAnimation(blob));
        const [module, animationData] = await Promise.all([import('lottie-web/build/player/lottie_light'), data ? Promise.resolve(data) : cache.get(blob!)]);
        if (cancelled || !host.current) return;
        animation = module.default.loadAnimation({ container: host.current, renderer: 'svg', loop: true, autoplay: false, animationData: structuredClone(animationData), rendererSettings: { progressiveLoad: false, preserveAspectRatio: 'xMidYMid meet' } });
        player.current = animation;
        animation.addEventListener('DOMLoaded', () => { if (!cancelled) setReady(true); });
        animation.addEventListener('data_failed', () => { if (!cancelled) setFailed(true); });
        animation.addEventListener('error', () => { if (!cancelled) setFailed(true); });
        // Inline vector data can finish synchronously before the listener is installed.
        if (animation.isLoaded) setReady(true);
      } catch { if (!cancelled) setFailed(true); }
    };
    void load();
    return () => { cancelled = true; animation?.destroy(); if (player.current === animation) player.current = null; };
  }, [blob, data, visible]);
  useEffect(() => {
    const animation = player.current;
    if (!animation || !ready) return;
    if (!animate || reduced) animation.goToAndStop(0, true);
    else if (visible && !hidden && !failed) { animation.loop = true; animation.play(); }
    else animation.pause();
  }, [animate, reduced, visible, hidden, ready, failed]);
  useEffect(() => {
    if (!ready || !player.current || !visible || hidden || failed || lastPlay.current === playRequest) return;
    lastPlay.current = playRequest;
    player.current.loop = false;
    player.current.goToAndPlay(0, true);
  }, [playRequest, ready, visible, hidden, failed]);
  const label = item.label || 'Animated emoji';
  return <span className={`animated-emoji ${preview ? 'emoji-preview' : ''} ${ready && !failed ? 'is-ready' : ''}`} role="img" aria-label={label} title={failed ? `${label} · animation unavailable` : label} data-emoji-token={item.token}>
    <span className="emoji-fallback" aria-hidden="true">{item.fallback || '◈'}</span><span ref={host} className="emoji-animation" aria-hidden="true" />
  </span>;
}
export function EmojiText({ text }: { text: string }) {
  const { matcher, emojis, assets } = useContext(EmojiContext);
  return <>{emojiParts(text, matcher).map((part, i) => part.token ? <AnimatedEmoji key={i} item={emojis.get(part.token)!} blob={assets.get('emoji/' + emojis.get(part.token)!.fileName)} /> : part.text)}</>;
}
