import { EmojiText } from './AnimatedEmoji';
import {DeckRetention} from './FsrsPreferences';
import {fsrsSettings,memoryInfo} from './fsrs-scheduler.mjs';
import {ActionMenu,ActionMenuItem} from './ActionMenu';
import {occlusionDefinition} from "./occlusion.mjs";
import {OcclusionStudyImage} from "./ImageTools";
import {OcclusionEditor} from "./OcclusionEditor";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Editor } from "@tiptap/core";
import { withNodes, type Workspace, type RecordData, type Node } from "./data";
import { flashcardSources, index, rows, bullet, move } from "./domain.mjs";
import type { ClipboardInput } from "./clipboard";
import { readerSelection } from "./outline-selection";
import { SelectionFormatting } from "./SelectionFormatting";
import { availableCard, createStudyContext, deckTopics, dueCards, intervalLabel, navigateStudyCard, newStudySession, reviewCard, saveSession, scopedCards, separateFlashcardSession, sessionQueue, studyFrontier, STUDY_SESSION, tomorrow } from "./study.mjs";
import { BulletEditor, RichRead } from "./editor";
import { MediaContent } from "./MediaContent";
import { Icon } from "./icons";
import {StudyEmptyArtwork} from './StudyEmptyArtwork';
import { StudyCardEditor } from './StudyCardEditor';
import { useImmersiveStudy } from "./useImmersiveStudy";
import { useStudyConfetti } from "./useStudyConfetti";
import { useEntranceMotion } from "./useEntranceMotion";
import { FlowNumber, NumberGroup } from "./FlowNumber";
import { DeckArtwork, CoverDesigner, useCoverImage } from "./DeckCover";
import { deckDesign, coverPresets, type DeckDesign } from "./deck-designs";
import { ALL_MCQS, answerMcq, mcqAttempt, mcqDefinition, mcqRunResults, orderedMcqOptions } from "./mcq.mjs";
import { MCQCard } from "./MCQCard";
import { QuizFeedback, QuizReactionSettings, type ReactionSettings } from "./QuizReactions";
import {LibraryDialog,FolderArtwork,FolderBox,FolderEditor,DeckManager,type FolderDraft} from './StudyFolders';
import {Sheet} from './Sheet';
import {studyFolders,deckFolder,moveStudyDeck} from './study-library.mjs';
import type {User} from 'firebase/auth';
import {VoiceReview,type VoiceResult} from './VoiceReview';
import {displayText} from './relations.mjs';

type Props = {
  doc: Workspace;
  assets: Map<string, Blob>;
  disabled: boolean;
  onChange: (doc: Workspace) => void;
  onLibraryChange: (doc: Workspace) => void;
  onSaveFolder: (draft:FolderDraft,file?:File)=>Promise<void>;
  onSource: (id: string) => void;
  onSaveDesign: (id: string, design: DeckDesign, file?: File) => Promise<void>;
  onSaveReactions: (settings: ReactionSettings, files: { correct: File[]; wrong: File[] }) => Promise<void>;
  onDuplicates?: () => void;
  user?: User | null;
};
export function StudyDesk({ doc, assets, disabled, onChange, onLibraryChange, onSaveFolder, onSource, onSaveDesign, onSaveReactions, onDuplicates, user }: Props) {
  const [screen, setScreen] = useState<"library" | "topics" | "session">("library"),
    [topicDeck, setTopicDeck] = useState<string | null>(null),
    [editingCard, setEditingCard] = useState(false),
    [editingNodeId, setEditingNodeId] = useState<string|null>(null),
    [inlineCaret, setInlineCaret] = useState<{id:string;offset:number}|null>(null),
    [inlineEditor, setInlineEditor] = useState<Editor|null>(null),
    [cardMenuOpen,setCardMenuOpen] = useState(false),
    [scheduleInfo,setScheduleInfo] = useState(false),
    [studyError,setStudyError] = useState(''),
    [showRevealHint,setShowRevealHint] = useState(true),
    [activeFolder,setActiveFolder] = useState<string|null>(null),
    [folderEditor,setFolderEditor] = useState<{id?:string}|null>(null),
    [manageDeck,setManageDeck] = useState<{id:string;title:string}|null>(null),
    [draggedDeck,setDraggedDeck] = useState<string|null>(null),
    [dropFolder,setDropFolder] = useState<string|null>(null),
    [libraryNotice,setLibraryNotice] = useState(''),
    [filter, setFilter] = useState(""), [deskMenu, setDeskMenu] = useState(false), [searchOpen, setSearchOpen] = useState(false), deskMenuButton = useRef<HTMLButtonElement>(null),
    [settings, setSettings] = useState<string | null>(null),
    [coverEditor, setCoverEditor] = useState<{ id: string; title: string } | null>(null),
    [reactionEditor, setReactionEditor] = useState(false),
    [preferImmersive, setPreferImmersive] = useState(false),
    [bulletRevealMode, setBulletRevealMode] = useState<"step" | "all">(() => {
      try {
        const saved = window.localStorage.getItem('remo-study-bullet-reveal');
        return saved === 'all' ? 'all' : 'step';
      } catch {
        return 'step';
      }
    }),
    [revealedBullets, setRevealedBullets] = useState<number>(1),
    [cardZoom, setCardZoom] = useState(() => { try { const value = Number(window.localStorage.getItem('remo-study-card-zoom')); return value >= 70 && value <= 150 ? Math.round(value / 10) * 10 : 100; } catch { return 100; } }),
    [clock, setClock] = useState(Date.now()),
    shownAt = useRef(Date.now()),
    storedSession = doc.tables.study_sessions.find(s => s.id === STUDY_SESSION) || doc.tables.study_sessions[0],
    session = storedSession ? separateFlashcardSession(doc, storedSession) : undefined,
    queue = session ? sessionQueue(session) : [],
    currentId = session ? queue[session.cursor] : null,
    card = doc.tables.cards.find(card => card.id === currentId),
    sources = useMemo(() => new Map(flashcardSources(doc.tables.bullets, doc.tables.decks.filter(deck => doc.web.deckTypes?.[deck.rootId] !== "MCQ"), doc.tables.media).map(source => [source.id, source])), [doc.tables.bullets, doc.tables.decks, doc.tables.media, doc.web.deckTypes]),
    source = sources.get(currentId),
    idx = useMemo(() => index(doc.tables.bullets), [doc.tables.bullets]);
  const mode = doc.web.lastStudyMode === 'NORMAL' ? 'NORMAL' : 'SPACED';
  const setMode = (value:string) => { if(!disabled)onChange({...doc,web:{...doc.web,lastStudyMode:value}}); };
  const occlusion = currentId ? occlusionDefinition(doc,currentId) : null;
  const currentMcq = currentId ? mcqDefinition(doc, currentId, idx) : null;
  const isFlashcard = !currentMcq && !occlusion;
  const totalBullets = isFlashcard ? (source?.answerRows?.length ?? (card?.answer ? card.answer.split('\n').filter(Boolean).length : 0)) : 0;
  const hasStepBullets = isFlashcard && totalBullets > 1 && bulletRevealMode === 'step';
  const isAllBulletsRevealed = !hasStepBullets || revealedBullets >= totalBullets;
  // Voice review: answer a text flashcard aloud and get a suggested grade.
  const [voiceOpen, setVoiceOpen] = useState(false), [voiceResult, setVoiceResult] = useState<VoiceResult | null>(null);
  const voicePoints = isFlashcard && source?.answerRows ? source.answerRows.map(row => displayText(row.node.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20) : [];
  const canVoice = !!user && voicePoints.length > 0;
  useEffect(() => { setVoiceOpen(false); setVoiceResult(null); }, [currentId, session?.tag, screen, editingCard]);
  const studyContext = useMemo(() => createStudyContext(doc, clock), [doc, clock]);
  const folders=studyFolders(doc),currentFolder=folders.find(f=>f.id===activeFolder);
  useEffect(()=>{if(activeFolder&&!currentFolder)setActiveFolder(null);},[activeFolder,!!currentFolder]);
  const moveDeckTo=(id:string,folderId:string|null)=>{if(disabled)return;onLibraryChange(moveStudyDeck(doc,id,folderId));setLibraryNotice(folderId?`Deck moved to ${folders.find(f=>f.id===folderId)?.name}.`:'Deck moved to unfiled.');setDraggedDeck(null);setDropFolder(null);};
  const folderDrop=(id:string|null)=>({
    onDragOver:(event:React.DragEvent)=>{if(disabled||!draggedDeck)return;event.preventDefault();event.dataTransfer.dropEffect='move';setDropFolder(id||'__unfiled__');},
    onDragLeave:(event:React.DragEvent)=>{if(!event.currentTarget.contains(event.relatedTarget as globalThis.Node))setDropFolder(null);},
    onDrop:(event:React.DragEvent)=>{event.preventDefault();if(draggedDeck&&event.dataTransfer.getData('application/x-remo-study-deck')===draggedDeck)moveDeckTo(draggedDeck,id);setDraggedDeck(null);setDropFolder(null);}
  });
  const storedAttempt = session ? mcqAttempt(doc, session) : null;
  const attempt = storedAttempt?.fingerprint === currentMcq?.fingerprint ? storedAttempt : null;
  const options = currentMcq?.valid ? orderedMcqOptions(currentMcq, `${session?.tag || "legacy"}:${currentId}`) : [];
  const choiceLock = useRef(false), docRef = useRef(doc), inlineEditorRef = useRef<Editor | null>(null);
  docRef.current = doc;
  const touchStart = useRef<{ id: number; x: number; y: number; time: number; scroll: number; cardId:string|null; revealed:boolean } | null>(null), navigationLock = useRef(false);
  useEffect(() => { navigationLock.current = false; }, [session?.cursor, session?.tag, session?.revealed]);
  useEffect(() => { choiceLock.current = false; }, [currentId, session?.tag, currentMcq?.fingerprint]);
  const deskDesign = deckDesign(doc, "__desk__"), sessionDesign = deckDesign(doc, session?.scope || "__all__");
  const deskImage = useCoverImage(assets.get(deskDesign.image)), sessionImage = useCoverImage(assets.get(sessionDesign.image));
  const backdropStyle = (design: DeckDesign, image: string) => {
    const preset = coverPresets.find(preset => preset.id === design.preset) || coverPresets[0];
    return design.backdrop ? { "--study-art": image ? `url(${JSON.stringify(image)})` : `linear-gradient(135deg, ${preset.color}, ${preset.accent})`, backgroundPosition: `50% ${design.position}%` } as CSSProperties : undefined;
  };
  const pinned: string[] = Array.isArray(doc.web.pinnedDecks) ? doc.web.pinnedDecks.filter((id: unknown) => typeof id === "string") : [];
  const { rootRef, immersive, fullscreenNotice, enterImmersive, exitImmersive, lastNativeExit } = useImmersiveStudy(screen === "session"),
    cardScroll = useRef<HTMLDivElement>(null);
  const celebrateCorrect = useStudyConfetti(rootRef, screen === "session", session ? session.tag || "legacy" : null, currentId || null, !!session && queue.length > 0 && session.cursor >= queue.length && session.reviewed > 0);
  useEntranceMotion(rootRef, `${screen}:${activeFolder}:${session?.tag}:${session?.cursor}`, {
    selector: screen === "session" ? ".study-question-layout, .study-finished" : ".study-heading, .study-stats, .study-decks, .study-topic-list",
  });
  useEntranceMotion(rootRef, `${session?.tag}:${session?.cursor}:${session?.revealed}`, {
    selector: ".flashcard-answer", kind: "reveal", active: screen === "session" && !!session?.revealed && !currentMcq && !editingCard,
  });
  useEffect(()=>{setCardMenuOpen(false);setScheduleInfo(false);touchStart.current=null;setRevealedBullets(bulletRevealMode === 'all' ? 9999 : 1);setEditingCard(false);setEditingNodeId(null);setInlineCaret(null);setInlineEditor(null);inlineEditorRef.current=null;},[currentId,screen,session?.cursor,session?.tag]);
  const showLibrary = () => { exitImmersive(); setScreen("library"); };
  const resizeCard = (value: number) => {
    const next = Math.max(70, Math.min(150, value)); setCardZoom(next);
    try { window.localStorage.setItem('remo-study-card-zoom', String(next)); } catch {}
  };
  const resume = () => { setShowRevealHint(true); if(session)onChange(saveSession({...doc,web:{...doc.web,lastStudyMode:session.mode}},session)); setScreen("session"); if (preferImmersive) enterImmersive(); };
  const updateSession = (value: RecordData) => onChange(saveSession({...doc,web:{...doc.web,lastStudyMode:value.mode}}, value));
  const start = (scope: string | null, topicId: string | null = null) => {
    setShowRevealHint(true);
    updateSession({ ...newStudySession(doc, scope, mode, Date.now(), Math.random, topicId), tag: crypto.randomUUID() });
    setScreen("session");
    if (preferImmersive) enterImmersive();
  };
  useEffect(()=>{
    const open=()=>{
      const target=(window as any).remoWidgetStudy;
      if(!target||disabled)return;
      delete (window as any).remoWidgetStudy;
      const scope=target.deck==='__all_flashcards__'?null:target.deck;
      const next=newStudySession(doc,scope,mode,Date.now(),Math.random,null);
      const ids=JSON.parse(next.queueJson);
      if(target.card&&ids.includes(target.card)){
        next.queueJson=JSON.stringify([target.card,...ids.filter((id:string)=>id!==target.card)]);
        next.cursor=0;
      }
      updateSession({...next,tag:crypto.randomUUID()});
      setScreen('session');
      if(target.voice)(window as any).remoWidgetVoiceCard=target.card;
    };
    open();window.addEventListener('remo-widget-study',open);
    return ()=>window.removeEventListener('remo-widget-study',open);
  },[disabled,doc]);
  useEffect(()=>{
    if(currentId&&(window as any).remoWidgetVoiceCard===currentId&&canVoice){
      delete (window as any).remoWidgetVoiceCard;
      setVoiceOpen(true);
    }
  },[currentId,screen,canVoice]);
  const openDeck = (scope: string | null) => {
    if (scope && deckTopics(doc, scope, Date.now()).length) { setTopicDeck(scope); setScreen('topics'); }
    else start(scope);
  };
  const reveal = (allAtOnce = false) => {
    if (session && card && availableCard(card, Date.now())) {
      setShowRevealHint(false);
      setRevealedBullets(allAtOnce || bulletRevealMode === 'all' ? 9999 : 1);
      updateSession({ ...session, revealed: 1, updatedAt: Date.now() });
    }
  };
  const nextBullet = () => {
    if (hasStepBullets && revealedBullets < totalBullets) {
      setRevealedBullets(prev => Math.min(prev + 1, totalBullets));
      return true;
    }
    return false;
  };
  const showAllBullets = () => {
    setRevealedBullets(totalBullets || 9999);
  };
  const toggleBulletRevealMode = () => {
    const next = bulletRevealMode === 'step' ? 'all' : 'step';
    setBulletRevealMode(next);
    try { window.localStorage.setItem('remo-study-bullet-reveal', next); } catch {}
    if (next === 'all') {
      setRevealedBullets(9999);
    } else {
      setRevealedBullets(1);
    }
  };
  const grade = (value: string) => {
    if (disabled || !session || !card || !session.revealed || !availableCard(card, Date.now())) return;
    try{setStudyError('');onChange(reviewCard(doc, session, value, Date.now() - shownAt.current));}catch(error){setStudyError((error as Error).message);}
  };
  const navigate = (direction: 'previous' | 'next') => {
    if (disabled || !session || navigationLock.current) return;
    const next = navigateStudyCard(doc, session, direction);
    if (next !== doc) { navigationLock.current = true; onChange(next); }
  };
  const tapNext = () => {
    if (!session || disabled || navigationLock.current) return;
    if (currentMcq) { if (attempt) navigate('next'); return; }
    if (!session.revealed) reveal();
    else if (hasStepBullets && revealedBullets < totalBullets) nextBullet();
    else if (session.mode === 'NORMAL') grade('GOOD');
    else navigate('next');
  };
  const choose = (id: string, option: HTMLButtonElement) => {
    if (disabled || !session || !currentMcq?.valid || !card || !availableCard(card, Date.now()) || attempt || choiceLock.current) return;
    choiceLock.current = true;
    const next = answerMcq(doc, session, id);
    onChange(next);
    if (next !== doc && id === currentMcq.config.correctOptionId) celebrateCorrect(option);
  };
  const continueMcq = () => { if (attempt) grade(attempt.correct ? "GOOD" : "AGAIN"); };
  const practiceMissed = () => {
    if (!session) return;
    const ids = mcqRunResults(doc, session).missedIds.filter(id => mcqDefinition(doc, id)?.valid && doc.tables.cards.some(card => card.id === id && availableCard(card, Date.now())));
    updateSession({ ...newStudySession(doc, session.scope, "NORMAL", Date.now(), Math.random, session.topicId || null), queueJson: JSON.stringify(ids), tag: crypto.randomUUID() });
  };
  const skip = () => { if (session) updateSession({ ...session, cursor: session.cursor + 1, ...(session.furthestCursor !== undefined ? {furthestCursor: Math.max(studyFrontier(session), session.cursor + 1)} : {}), revealed: 0, updatedAt: Date.now() }); };
  const pauseCard = (suspend: boolean) => {
    if (!card || !session) return;
    onChange(saveSession({ ...doc, tables: { ...doc.tables, cards: doc.tables.cards.map(item => item.id === card.id ? { ...item, ...(suspend ? { suspended: 1 } : { buriedUntilEpochMillis: tomorrow(Date.now()) }) } : item) } }, { ...session, cursor: session.cursor + 1, revealed: 0, updatedAt: Date.now() }));
  };
  useEffect(() => { shownAt.current = Date.now(); }, [currentId, screen]);
  useEffect(() => { if (screen === "session" && attempt) rootRef.current?.querySelector<HTMLButtonElement>("[data-mcq-continue]")?.focus({ preventScroll: true }); }, [attempt?.answeredAt, screen]);
  useLayoutEffect(() => {
    if (cardScroll.current) cardScroll.current.scrollTop = 0;
  }, [currentId, screen]);
  useLayoutEffect(() => {
    if (immersive) rootRef.current?.querySelector<HTMLElement>(".study-dock-main button:not(:disabled)")?.focus({ preventScroll: true });
  }, [immersive, currentId, session?.revealed, isAllBulletsRevealed]);
  useEffect(() => {
    const scroll = cardScroll.current, answer = scroll?.querySelector<HTMLElement>(".flashcard-answer");
    if (!session?.revealed || !scroll || !answer) return;
    const viewport = scroll.getBoundingClientRect(), bounds = answer.getBoundingClientRect();
    if (viewport.height > 0 && bounds.top > viewport.bottom - 64)
      scroll.scrollTo({ top: scroll.scrollTop + bounds.top - viewport.top - 24, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [session?.revealed]);
  useEffect(() => {
    if (!session?.revealed || revealedBullets <= 1) return;
    const scroll = cardScroll.current;
    const rows = scroll?.querySelectorAll<HTMLElement>(".flashcard-answer-row");
    if (!rows || !rows.length || !scroll) return;
    const lastRow = rows[Math.min(revealedBullets - 1, rows.length - 1)];
    if (!lastRow) return;
    const viewport = scroll.getBoundingClientRect(), bounds = lastRow.getBoundingClientRect();
    if (viewport.height > 0 && bounds.bottom > viewport.bottom - 48) {
      const nextTop = scroll.scrollTop + bounds.bottom - viewport.bottom + 56;
      if (typeof scroll.scrollTo === 'function')
        scroll.scrollTo({ top: nextTop, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      else scroll.scrollTop = nextTop;
    }
  }, [revealedBullets, session?.revealed]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : document.body;
      if (screen !== "session" || event.isComposing || editingCard || target.closest("dialog[open]")) return;
      if (cardMenuOpen||scheduleInfo) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (event.repeat || Date.now() - lastNativeExit.current < 350) return;
        if (immersive) exitImmersive(); else showLibrary();
        return;
      }
      if (target.closest("input, select, textarea, a, [contenteditable=true]") || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === "f" && !event.repeat) { event.preventDefault(); if (immersive) exitImmersive(); else enterImmersive(); return; }
      if (disabled) return;
      if (event.key === 'ArrowLeft' && !event.repeat) { event.preventDefault(); navigate('previous'); return; }
      if (event.key === 'ArrowRight' && !event.repeat) { event.preventDefault(); tapNext(); return; }
      if ((event.key === 'a' || event.key === 'A') && !event.repeat && isFlashcard && session?.revealed && hasStepBullets && revealedBullets < totalBullets) {
        event.preventDefault();
        showAllBullets();
        return;
      }
      if (event.key === 'ArrowUp' && !event.repeat && isFlashcard && session?.revealed && hasStepBullets && revealedBullets > 1) {
        event.preventDefault();
        setRevealedBullets(prev => Math.max(1, prev - 1));
        return;
      }
      if (event.key === 'ArrowDown' && !event.repeat && isFlashcard && session?.revealed && hasStepBullets && revealedBullets < totalBullets) {
        event.preventDefault();
        nextBullet();
        return;
      }
      if (event.repeat) { if (event.key === " ") event.preventDefault(); return; }
      if (currentMcq) {
        if (!attempt && ["1", "2", "3", "4"].includes(event.key)) { event.preventDefault(); rootRef.current?.querySelectorAll<HTMLButtonElement>(".mcq-option")[Number(event.key) - 1]?.click(); }
        if (event.key === " " && !target.closest("button")) { event.preventDefault(); if (attempt) continueMcq(); }
        return;
      }
      if (event.key === " " && target.closest("button")) return;
      if (event.key === " " && card && !session?.revealed) { event.preventDefault(); if (event.shiftKey) reveal(true); else reveal(); return; }
      if (event.key === " " && session?.revealed) {
        if (hasStepBullets && revealedBullets < totalBullets) {
          event.preventDefault();
          if (event.shiftKey) showAllBullets();
          else nextBullet();
          return;
        }
        if (session.mode === "NORMAL") { event.preventDefault(); grade("GOOD"); return; }
      }
      if (session?.revealed && voiceResult && event.key === "Enter" && !(event.target as HTMLElement)?.closest?.("input,textarea,button,[contenteditable=true]")) { event.preventDefault(); grade(session.mode === "SPACED" ? voiceResult.suggested : "GOOD"); return; }
      if (session?.revealed && ["1", "2", "3", "4"].includes(event.key)) { event.preventDefault(); grade(["AGAIN", "HARD", "GOOD", "EASY"][Number(event.key) - 1]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, session, card, doc, disabled, immersive, attempt, editingCard, cardMenuOpen, scheduleInfo, isFlashcard, hasStepBullets, revealedBullets, totalBullets, voiceResult]);

  const all = [...scopedCards(doc, null, clock, studyContext), ...scopedCards(doc, ALL_MCQS, clock, studyContext)], due = [...dueCards(doc, null, clock, studyContext), ...dueCards(doc, ALL_MCQS, clock, studyContext)],
    today = new Date(clock).toDateString(),
    todayCount = doc.tables.review_logs.filter(log => new Date(log.reviewedAtEpochMillis).toDateString() === today).length;
  const inlineEligible = isFlashcard && !!source,
    inlineEditing = editingCard && inlineEligible,
    answerRows = source?.answerRows || [],
    visibleAnswerRows = inlineEditing ? answerRows : hasStepBullets ? answerRows.slice(0, revealedBullets) : answerRows;
  const endInlineEditing = () => {
    setEditingCard(false);
    setEditingNodeId(null);
    setInlineCaret(null);
    setInlineEditor(null);
    inlineEditorRef.current = null;
  };
  const revealForEdit = () => {
    if (session && !session.revealed) reveal(true);
  };
  const enterInlineEditing = () => {
    if (disabled) return;
    revealForEdit();
    setEditingCard(true);
    setEditingNodeId(null);
    setInlineCaret(null);
  };
  const toggleCardEditing = () => {
    if (inlineEditing) { endInlineEditing(); return; }
    if (inlineEligible) { enterInlineEditing(); return; }
    setEditingCard(true);
  };
  const updateInlineNode = (id: string, value: { text: string; formatting: string }) => {
    const current = docRef.current,
      target = current.tables.bullets.find(node => node.id === id)?.mirrorSourceId || id,
      next = withNodes(current, current.tables.bullets.map(node => node.id === target ? { ...node, text: value.text, formatting: value.formatting } : node) as Node[]);
    docRef.current = next;
    onChange(next);
  };
  const handleInlineReady = (editor: Editor | null) => {
    inlineEditorRef.current = editor;
    setInlineEditor(editor);
  };
  const activateInlineRowAtEnd = (nodeId: string) => {
    if (disabled) return;
    const node = index(docRef.current.tables.bullets).byId.get(nodeId) as Node | undefined;
    if (!node) return;
    setEditingNodeId(nodeId);
    setInlineCaret({ id: nodeId, offset: node.text.length });
    setInlineEditor(null);
  };
  const activateInlineRow = (nodeId: string, element: HTMLElement, event: React.MouseEvent) => {
    if (disabled) return;
    const node = index(docRef.current.tables.bullets).byId.get(nodeId) as Node | undefined;
    if (!node) return;
    const { anchor } = readerSelection(element, event.clientX, event.clientY, node.text.length);
    setEditingNodeId(nodeId);
    setInlineCaret({ id: nodeId, offset: anchor });
    setInlineEditor(null);
  };
  const addAnswerBullet = (after?: Node | null) => {
    if (disabled || !source) return;
    revealForEdit();
    const current = docRef.current,
      parentId = after ? after.parentId : source.node.id;
    if (!parentId) return;
    const siblings = index(current.tables.bullets).children.get(parentId) || [],
      at = after ? siblings.findIndex((node: Node) => node.id === after.id) + 1 : siblings.length,
      newId = crypto.randomUUID(),
      next = withNodes(current, move([...current.tables.bullets, bullet(newId, { parentId })], newId, parentId, at < 0 ? siblings.length : at));
    docRef.current = next;
    onChange(next);
    setEditingCard(true);
    setEditingNodeId(newId);
    setInlineCaret({ id: newId, offset: 0 });
  };
  const removeAnswerBullet = (id: string) => {
    if (disabled || !source) return;
    const current = docRef.current,
      idx = index(current.tables.bullets),
      questionId = (source.node as Node).mirrorSourceId || source.node.id,
      targetId = (idx.byId.get(id) as Node | undefined)?.mirrorSourceId || id,
      target = idx.byId.get(targetId) as Node | undefined;
    if (!target || targetId === questionId) return;
    const siblings = idx.children.get(target.parentId) || [],
      at = siblings.findIndex((node: Node) => node.id === targetId),
      children = idx.children.get(targetId) || [],
      rowIds = answerRows.map((row: any) => row.node.id as string),
      from = rowIds.indexOf(id),
      neighbour = [...rowIds.slice(from >= 0 ? from + 1 : 0), ...(from > 0 ? rowIds.slice(0, from).reverse() : [])].find(candidate => candidate !== id);
    let nodes = current.tables.bullets.filter(node => node.id !== targetId) as Node[];
    for (const [offset, child] of children.entries()) nodes = move(nodes, child.id, target.parentId, at + offset);
    const next = withNodes(current, nodes);
    docRef.current = next;
    onChange(next);
    if (neighbour && next.tables.bullets.some((node: RecordData) => node.id === neighbour)) activateInlineRowAtEnd(neighbour);
    else endInlineEditing();
  };
  const focusInlineRow = (direction: -1 | 1) => {
    const ids = [source?.node.id, ...answerRows.map((row: any) => row.node.id)].filter(Boolean) as string[],
      at = ids.indexOf(editingNodeId || ""),
      nextId = ids[at + direction];
    if (nextId) activateInlineRowAtEnd(nextId);
  };
  const runInlineCommand = (action: string, id: string, start: number) => {
    if (action === "stop") { endInlineEditing(); return; }
    if (action === "previous") { focusInlineRow(-1); return; }
    if (action === "next") { focusInlineRow(1); return; }
    if (action === "merge") {
      const node = docRef.current.tables.bullets.find(item => item.id === id) as Node | undefined,
        questionId = source ? (source.node as Node).mirrorSourceId || source.node.id : null;
      if (!node || (node.mirrorSourceId || node.id) === questionId || node.text) return;
      removeAnswerBullet(id);
      return;
    }
    if (action !== "enter") return;
    const node = docRef.current.tables.bullets.find(item => item.id === id) as Node | undefined;
    if (!node) return;
    if (start < node.text.length) { inlineEditorRef.current?.commands.setHardBreak(); return; }
    addAnswerBullet(id === source?.node.id ? null : node);
  };
  const pasteInline = (_id: string, _start: number, _end: number, input: ClipboardInput) => {
    const editor = inlineEditorRef.current,
      lines = (typeof input === "string" ? input : input.text || "").replace(/\r\n?/g, "\n").split("\n");
    if (!editor || !lines.some((line: string) => line.length)) return;
    const nodes = lines.flatMap((line: string, i: number) => [
      ...(i ? [{ type: "hardBreak" }] : []),
      ...(line ? [{ type: "text", text: line }] : []),
    ]);
    editor.chain().focus().insertContent(nodes).run();
  };
  const inlineField = (node: Node, label: string) => inlineEditing
    ? (editingNodeId === node.id
      ? <div className="study-inline-editor-wrap"><BulletEditor node={node} caret={inlineCaret?.id === node.id ? inlineCaret.offset : null} onChange={updateInlineNode} onCommand={runInlineCommand} onOutlinePaste={pasteInline} onReady={handleInlineReady} disabled={disabled} study /></div>
      : <div className="flashcard-edit-hit" role="button" tabIndex={disabled ? -1 : 0} aria-label={label} onClick={event => activateInlineRow(node.id, event.currentTarget, event)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateInlineRowAtEnd(node.id); } }}>{node.text ? <RichRead node={node} /> : <span className="study-inline-placeholder">Click to edit</span>}</div>)
    : <RichRead node={node} />;

  if (screen === "session" && session) {
    const done = session.cursor >= queue.length,
      history = session.cursor < studyFrontier(session),
      valid = card && availableCard(card, Date.now()) && (!currentMcq || currentMcq.valid) && (!occlusion || occlusion.valid),
      deckTitle = session.scope === ALL_MCQS ? "All MCQs" : session.scope ? idx.byId.get(session.scope)?.text || "Study session" : "All flashcards",
      title = session.topicId ? `${deckTitle} · ${idx.byId.get(session.topicId)?.text || 'Topic'}` : deckTitle;
    const results = mcqRunResults(doc, session),memory=card?memoryInfo(card,clock):null;
    const readyAgain=done&&session.mode==='SPACED'?dueCards(doc,session.scope,clock,studyContext,session.topicId||null).length:0;
    const nextLearning=done&&session.mode==='SPACED'?scopedCards(doc,session.scope,clock,studyContext,session.topicId||null).filter((c:RecordData)=>{const info=memoryInfo(c,clock);return info&&(info.state==='Learning'||info.state==='Relearning')&&c.dueAtEpochMillis>clock;}).sort((a:RecordData,b:RecordData)=>a.dueAtEpochMillis-b.dueAtEpochMillis)[0]:null;
    const zoomControls = <div className="study-card-sizing" role="group" aria-label="Study card size"><span>Card size</span><button className="icon-button" aria-label="Zoom out study card" title="Smaller card" disabled={cardZoom <= 70} onClick={() => resizeCard(cardZoom - 10)}><Icon name="zoomOut" size={16} /></button><button className="study-zoom-reset" aria-label={`Reset study card zoom (${cardZoom}%)`} title="Reset to 100%" onClick={() => resizeCard(100)}><FlowNumber value={cardZoom} suffix="%" /></button><button className="icon-button" aria-label="Zoom in study card" title="Larger card" disabled={cardZoom >= 150} onClick={() => resizeCard(cardZoom + 10)}><Icon name="zoomIn" size={16} /></button></div>;
    return <section ref={rootRef} data-card-enlarged={cardZoom > 100} className={`study-session ${immersive ? "is-immersive" : ""} ${sessionDesign.backdrop ? "has-study-background" : ""}`} style={{ ...backdropStyle(sessionDesign, sessionImage), '--study-card-zoom': cardZoom / 100 } as CSSProperties} role={immersive ? "dialog" : undefined} aria-modal={immersive || undefined} aria-label={immersive ? "Immersive study" : "Study session"} tabIndex={-1}
      onPointerDownCapture={event=>{
        touchStart.current=null;
        if(event.isPrimary===false||event.button>0||disabled||editingCard||cardMenuOpen||scheduleInfo||done||!valid)return;
        const target=event.target as HTMLElement;
        if(target.closest('button,a,input,select,textarea,summary,dialog,video,audio,iframe,[role="button"],[role="menu"],.masked-text,.notation,[contenteditable]'))return;
        touchStart.current={id:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now(),scroll:cardScroll.current?.scrollTop||0,cardId:currentId,revealed:!!session.revealed};
      }}
      onPointerCancelCapture={()=>{touchStart.current=null;}}
      onPointerUpCapture={event=>{
        const first=touchStart.current;touchStart.current=null;
        if(!first||first.id!==event.pointerId||first.cardId!==currentId||first.revealed!==!!session.revealed||disabled||editingCard||cardMenuOpen||scheduleInfo||done||!valid||Date.now()-first.time>400||Math.hypot(event.clientX-first.x,event.clientY-first.y)>12||Math.abs((cardScroll.current?.scrollTop||0)-first.scroll)>3||window.getSelection()?.isCollapsed===false)return;
        if((event.target as HTMLElement).closest('button,a,input,select,textarea,summary,dialog,video,audio,iframe,[role="button"],[role="menu"],.masked-text,.notation,[contenteditable]'))return;
        if(!session.revealed){if(!currentMcq)reveal();return;}
        const bounds=event.currentTarget.getBoundingClientRect(),width=bounds.width||window.innerWidth;
        if(event.clientX<bounds.left+width/2)navigate('previous');else tapNext();
      }}>
      <div inert={editingCard} className="session-topline session-controls"><button className="study-text-button" aria-label={done ? "Study Desk" : "Pause and return"} onClick={showLibrary}><Icon name="back" size={16} /><span className="study-btn-label">{done ? "Study Desk" : "Pause & return"}</span></button>{immersive&&<span className="session-inline-title" title={title}><span><EmojiText text={title}/></span><small>{Math.min(session.cursor + (done ? 0 : 1), queue.length)} / {queue.length}</small></span>}<div className="session-view-controls">{immersive?<details className="study-size-menu"><summary aria-label="Card size and options" title="Card size"><Icon name="more" size={18}/></summary><div>{zoomControls}</div></details>:zoomControls}<span className="study-mode-chip">{session.mode === "NORMAL" ? (immersive ? "Cram" : "Cram · outline order") : (immersive ? "Spaced" : "Spaced repetition")}</span><button className="study-text-button immersive-toggle" aria-label={immersive ? "Exit immersive mode" : "Enter immersive mode"} aria-pressed={immersive} title={immersive ? "Exit immersive mode · Esc" : "Immersive fullscreen · F"} onClick={() => immersive ? exitImmersive() : enterImmersive()}><Icon name={immersive ? "fullscreenExit" : "fullscreen"} size={16} /><span>{immersive ? "Exit immersive" : "Immersive"}</span></button></div></div>
      {studyError&&<p className="fullscreen-notice" role="alert">{studyError}</p>}
      {fullscreenNotice && <p className="fullscreen-notice" role="status">{fullscreenNotice}</p>}
      {disabled && <p className="fullscreen-notice" role="status">Study controls are paused. Return to Study Desk to check the save status.</p>}
      <div className="session-scroll" ref={cardScroll}><div className="session-content">
      <h1><EmojiText text={title}/></h1>
      {scheduleInfo&&card&&<LibraryDialog title="Review schedule" onClose={()=>setScheduleInfo(false)}><p>{card.question}</p><dl className="study-memory-details"><dt>Next review</dt><dd>{new Date(card.dueAtEpochMillis).toLocaleString()}</dd><dt>Scheduler</dt><dd>{memory?'FSRS-6':'Moves to FSRS on its next spaced review'}</dd>{memory&&<><dt>State</dt><dd>{memory.state}</dd><dt>Estimated recall now</dt><dd>{Math.round(memory.retrievability*100)}%</dd><dt>Stability</dt><dd>{memory.stability.toFixed(1)} days</dd><dt>Difficulty</dt><dd>{memory.difficulty.toFixed(1)} / 10</dd><dt>Reviews / lapses</dt><dd>{memory.reps} / {memory.lapses}</dd></>}</dl><p>Recall is an estimate. Cram practice leaves this schedule unchanged.</p></LibraryDialog>}
      <div className="study-progress-label"><NumberGroup key={session.tag || 'legacy'}><span><FlowNumber value={session.reviewed} /> reviewed</span><span><FlowNumber value={Math.min(session.cursor + (done ? 0 : 1), queue.length)} /> / <FlowNumber value={queue.length} /></span></NumberGroup></div>
      <progress className="study-progress" value={session.cursor} max={Math.max(1, queue.length)} />
      {done ? <div className="study-finished"><div className="study-success"><Icon name="check" size={30} /></div><h2>{queue.length ? "Session complete" : "You’re caught up"}</h2><p>{queue.length ? `You reviewed ${session.reviewed} cards.` : session.mode === "SPACED" ? "No cards are due within your daily limits right now." : "There are no available cards in this selection."}</p>{results.answered > 0 && <div className="mcq-score"><strong>{results.correct} / {results.answered}</strong><span>MCQs correct on the first attempt</span>{results.missedIds.length > 0 && <button disabled={disabled} onClick={practiceMissed}>Practice {results.missedIds.length} missed questions</button>}</div>}<p>{session.mode === "NORMAL" ? "Cram practice leaves your review schedule unchanged." : "Your next reviews have been saved. Learning cards return when due; start another review to continue."}</p>{nextLearning&&<p>Next learning review: {new Date(nextLearning.dueAtEpochMillis).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}. You can leave and return; your place is saved.</p>}</div> : !valid ? <div className="study-finished"><h2>This card is no longer available</h2><p>{currentMcq?.error || "Its source may have changed, or the card may be suspended or hidden."}</p></div> : <>
        <div className="study-question-layout">
        <article className="flashcard" aria-label="Flashcard" onKeyDown={event => {
          if (!inlineEditing) return;
          if (event.key === 'Escape') { event.preventDefault(); endInlineEditing(); return; }
          if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) event.stopPropagation();
        }}>
{editingCard && !occlusion && !inlineEligible ? <StudyCardEditor key={card.id} doc={doc} id={card.id} disabled={disabled} onSave={onChange} onClose={()=>{setEditingCard(false);shownAt.current=Date.now();}}/> : <>           <div className="flashcard-label"><span>QUESTION</span><div className="study-card-tools"><button className="study-text-button" aria-pressed={inlineEditing} disabled={disabled} onClick={toggleCardEditing}><Icon name={inlineEditing?'check':'edit'} size={13}/>{inlineEditing?'Done editing':'Edit card'}</button>{inlineEligible && <button className="study-text-button" disabled={disabled} onClick={()=>addAnswerBullet(null)}><Icon name="plus" size={13}/>Add bullet</button>}{source && <button className="study-text-button" onClick={() => { endInlineEditing(); exitImmersive(); onSource(card.id); }}><Icon name="link" size={13} />Open source</button>}            <div className="study-more-actions">
              <ActionMenu open={cardMenuOpen} onOpenChange={setCardMenuOpen} trigger={<button className="study-text-button study-card-more" aria-label="Card actions" title="More card actions" disabled={disabled||done||!valid||editingCard}><Icon name="more" size={18}/></button>}>
                <div className="study-more-menu" aria-label="Card actions"><ActionMenuItem onClick={()=>{setCardMenuOpen(false);setScheduleInfo(true);}}>Review schedule</ActionMenuItem><ActionMenuItem onClick={()=>{setCardMenuOpen(false);pauseCard(false);}}>Hide until tomorrow</ActionMenuItem><ActionMenuItem onClick={()=>{setCardMenuOpen(false);pauseCard(true);}}>Suspend card</ActionMenuItem></div>
              </ActionMenu>
            </div></div></div>
          <div className={`flashcard-question ${inlineEditing && editingNodeId === source?.node.id ? 'is-inline-editing' : ''}`}>{occlusion ? <><RichRead node={source?.node as Node || idx.byId.get(card.id) as Node}/><OcclusionStudyImage definition={occlusion} blob={assets.get("media/"+occlusion.media.fileName)} revealed={!!session.revealed}/></> : source ? <>{inlineField(source.node as Node, 'Edit question')}<MediaContent nodeId={source.node.id} text={source.node.text} media={doc.tables.media} assets={assets} /></> : card.question}</div>
          {currentMcq ? <MCQCard key={`${session.tag}:${card.id}:${currentMcq.fingerprint}`} definition={currentMcq} options={options} attempt={attempt} doc={doc} assets={assets} disabled={disabled} onChoose={choose} /> : (!!session.revealed || inlineEditing) && <div className="flashcard-answer">
            <div className="flashcard-label">
              <div className="flashcard-answer-heading">
                <span>ANSWER</span>
              </div>
              <div className="study-card-tools">
                {!inlineEditing && hasStepBullets && revealedBullets < totalBullets && <button type="button" className="study-text-button flashcard-show-all-btn" title="Show all bullets at once · A" disabled={disabled} onClick={() => showAllBullets()}>Show full bullets</button>}
                {!inlineEditing && isFlashcard && totalBullets > 1 && <button type="button" className="study-text-button flashcard-toggle-reveal-mode" title={bulletRevealMode === 'step' ? "Currently showing 1 by 1. Click to show full bullets at once by default" : "Currently showing full bullets. Click to show bullets 1 by 1 by default"} disabled={disabled} onClick={() => toggleBulletRevealMode()}><Icon name="notes" size={13} />{bulletRevealMode === 'step' ? "1-by-1" : "Full bullets"}</button>}
              </div>
            </div>
            {!inlineEditing && hasStepBullets && totalBullets > 1 && totalBullets <= 16 && (
              <div className="flashcard-bullet-dots" role="progressbar" aria-label="Answer reveal progress" aria-valuemin={0} aria-valuemax={totalBullets} aria-valuenow={Math.min(revealedBullets,totalBullets)}>
                {Array.from({ length: totalBullets }).map((_, i) => (
                  <span key={i} aria-hidden="true" className={`bullet-dot ${i < revealedBullets ? 'is-revealed' : ''}`} />
                ))}
              </div>
            )}
            {occlusion ? <div className="flashcard-plain">{occlusion.masks.find((mask:any)=>mask.id===occlusion.maskId)?.label || "Look at the revealed region above."}</div> : source ? visibleAnswerRows.map(({ node, depth, ordinal }: any, rowIndex: number) => {
              const active = inlineEditing && editingNodeId === node.id;
              return <div key={node.id} data-node-id={node.id} className={`flashcard-answer-row ${node.taskState === "DONE" ? "answer-done" : ""} ${hasStepBullets && rowIndex === revealedBullets - 1 && revealedBullets > 1 ? "is-newly-revealed" : ""} ${active ? "is-inline-editing" : ""}`} style={{ paddingLeft: Math.min(depth, 10) * 20 }}><span className="answer-dot">{node.taskState === "DONE" ? "✓" : node.taskState === "TODO" ? "☐" : node.listType === "ORDERED" ? `${ordinal}.` : "•"}</span><div>{inlineField(node, `Edit answer ${rowIndex + 1}`)}<MediaContent nodeId={node.id} text={node.text} media={doc.tables.media} assets={assets} /></div>{inlineEditing && <button type="button" className="study-row-remove" aria-label={`Remove answer ${rowIndex + 1}`} title="Remove this bullet · Backspace on an empty bullet" disabled={disabled} onClick={() => removeAnswerBullet(node.id)}><Icon name="trash" size={14} /></button>}</div>;
            }) : <div className="flashcard-plain">{hasStepBullets && card.answer ? card.answer.split('\n').slice(0, revealedBullets).join('\n') : card.answer}</div>}
          </div>}
</>}        </article>
        {currentMcq && attempt && <aside className={`study-reaction-rail ${attempt.correct ? "reaction-left" : "reaction-right"}`} aria-label={attempt.correct ? "Correct answer reaction" : "Wrong answer reaction"}><QuizFeedback key={`${session.tag}:${currentId}:${attempt.answeredAt}`} correct={attempt.correct} seed={attempt.answeredAt} doc={doc} assets={assets} /></aside>}
        </div>
      </>}
      </div></div>
      <footer inert={editingCard} className="study-action-dock" aria-label="Flashcard controls">
        <div className="study-dock-inner">
          <nav className="study-card-navigation" aria-label="Card navigation">
            <button className="study-nav-arrow" aria-label="Previous card" title="Previous card" disabled={disabled||session.cursor===0} onClick={()=>navigate('previous')}><Icon name="back" size={18}/></button>
            <div className={`study-dock-main ${!done&&valid?(!session.revealed?"reveal-actions":session.mode==="NORMAL"?"cram-actions":""):""}`}>
              {done?readyAgain?<button className="study-primary dock-primary" disabled={disabled} onClick={()=>start(session.scope,session.topicId||null)}>Continue {readyAgain} due {readyAgain===1?'card':'cards'}</button>:<button className="study-primary dock-primary" onClick={showLibrary}>Back to Study Desk</button>:!valid?<button className="study-primary dock-primary" disabled={disabled} onClick={skip}>Continue</button>:currentMcq?<button className="study-primary dock-primary" data-mcq-continue disabled={disabled||!attempt} onClick={continueMcq}>{attempt?'Continue':'Choose an answer above'}</button>:session.revealed&&session.mode==='SPACED'&&!history&&isAllBulletsRevealed?<div className="study-grades">{['AGAIN','HARD','GOOD','EASY'].map((value,i)=><button key={value} className={`grade-${value.toLowerCase()}${voiceResult?.suggested===value?' is-suggested':''}`} aria-keyshortcuts={String(i+1)} disabled={disabled} onClick={()=>grade(value)}><span>{value[0]+value.slice(1).toLowerCase()}</span><small>{intervalLabel(card,value,clock,doc)}</small></button>)}</div>:<button className={`study-primary dock-primary ${session.revealed&&hasStepBullets&&revealedBullets<totalBullets?'study-step-actions':''}`} disabled={disabled} onClick={event=>{if(event.detail>1)return;if(!session.revealed)reveal();else if(hasStepBullets&&revealedBullets<totalBullets)nextBullet();else grade('GOOD');}}>{!session.revealed?'Show answer':hasStepBullets&&revealedBullets<totalBullets?'Next bullet':'Next card'}</button>}
            </div>
            <button className="study-nav-arrow" aria-label="Next card" title="Next card" disabled={disabled||done||!valid||!session.revealed||!!currentMcq&&!attempt} onClick={tapNext}><Icon name="forward" size={18}/></button>

          </nav>
          {canVoice&&!done&&valid&&!currentMcq&&!session.revealed&&!voiceOpen&&<div className="study-dock-secondary"><button className="study-voice-button" disabled={disabled} onClick={()=>setVoiceOpen(true)}><Icon name="mic" size={16}/>Answer aloud</button></div>}
          {voiceOpen&&user&&card&&<VoiceReview key={currentId||""} user={user} question={displayText(source?.node?.text||card.question||"")} points={voicePoints} onResult={r=>{setVoiceResult(r);reveal(true);}} onClose={()=>{setVoiceOpen(false);setVoiceResult(null);}}/>}
          <p className="study-dock-hint" aria-live="polite">{done?'Session complete':!valid?'Continue to the next available card':currentMcq?!attempt?'Choose an answer to continue':<><span className="study-keyboard-hint">Use ← / → to navigate</span><span className="study-touch-hint">Tap left for previous · right for next</span></>:!session.revealed?showRevealHint?<><span className="study-keyboard-hint">Press Space to reveal the answer · or click the card</span><span className="study-touch-hint">Tap the card to reveal the answer</span></>:null:hasStepBullets&&revealedBullets<totalBullets?null:session.mode==='SPACED'&&!history?'Rate to schedule':<><span className="study-keyboard-hint">Use ← / → to navigate</span><span className="study-touch-hint">Tap left for previous · right for next</span></>}</p>
        </div>
      </footer>
      {editingCard && card && occlusion?.valid && <OcclusionEditor doc={doc} item={occlusion.media} assets={assets} groupId={occlusion.groupId} disabled={disabled} onSave={next=>onChange({...next,tables:{...next.tables,study_sessions:next.tables.study_sessions.map(s=>s.id===session.id?{...s,revealed:0}:s)}})} onClose={()=>{setEditingCard(false);shownAt.current=Date.now();}}/>}
      {inlineEditing && <SelectionFormatting editor={inlineEditor} disabled={disabled} />}

    </section>;
  }
  if (screen === 'topics' && topicDeck) {
    const topics = deckTopics(doc, topicDeck, clock, studyContext), title = idx.byId.get(topicDeck)?.text || 'Study deck';
    const cards = scopedCards(doc, topicDeck, clock, studyContext), due = dueCards(doc, topicDeck, clock, studyContext);
    return <section className="study-desk study-topic-picker"><button className="study-text-button" onClick={showLibrary}><Icon name="back" size={16} />Study Desk</button><div className="study-heading"><div><span className="eyebrow">CHOOSE A TOPIC</span><h1><EmojiText text={title}/></h1><p>Study one topic, or review the whole deck.</p></div></div><div className="study-mode-switch" aria-label="Topic study mode">{[['SPACED','Spaced repetition'],['NORMAL','Cram']].map(([value,label])=><button key={value} className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={()=>setMode(value)}>{label}</button>)}</div><div className="study-topic-list"><button className="study-topic" disabled={disabled || !(mode === 'SPACED' ? due.length : cards.length)} onClick={()=>start(topicDeck)}><span><strong>All topics</strong><small>{cards.length} cards · {due.length} due</small></span><Icon name="forward" size={18} /></button>{topics.map((topic: {id:string; title:string; cards:number; due:number})=><button key={topic.id} className="study-topic" aria-label={`Study topic ${topic.title}`} disabled={disabled || !(mode === 'SPACED' ? topic.due : topic.cards)} onClick={()=>start(topicDeck,topic.id)}><span><strong><EmojiText text={topic.title}/></strong><small>{topic.cards} cards · {topic.due} due</small></span><Icon name="forward" size={18} /></button>)}</div></section>;
  }
  const decks = [{ rootId: null, title: "All flashcards", description: "Every flashcard across your outline" }, { rootId: ALL_MCQS, title: "All MCQs", description: "Every MCQ, including questions outside a notebook" }, ...doc.tables.decks.map(deck => ({ rootId: deck.rootId, title: idx.byId.get(deck.rootId)?.text || "Untitled deck", description: "Linked to your notes · updates automatically" }))];
  return <section ref={rootRef} className={`study-desk ${deskDesign.backdrop ? "has-study-background" : ""}`} style={backdropStyle(deskDesign, deskImage)}>
    <header className="study-head rn-head"><h1>Study Desk</h1><span className="rn-count"/><button className="rn-icon-btn" aria-label="Search decks" aria-pressed={searchOpen||!!filter} title="Find a deck" onClick={()=>{setSearchOpen(o=>!o||!!filter);requestAnimationFrame(()=>rootRef.current?.querySelector<HTMLInputElement>('.study-filter input')?.focus());}}><Icon name="search" size={18}/></button><button className="study-text-button study-new-folder" disabled={disabled} onClick={()=>setFolderEditor({})}><Icon name="folder" size={16}/>New folder</button><button ref={deskMenuButton} className="rn-icon-btn" aria-label="Study Desk options" aria-expanded={deskMenu} title="More" onClick={()=>setDeskMenu(o=>!o)}><Icon name="more" size={18}/></button></header>
    {deskMenu&&<Sheet anchor={deskMenuButton.current} label="Study Desk options" onClose={()=>setDeskMenu(false)}><button className="rn-sheet-item" disabled={disabled} onClick={()=>{setDeskMenu(false);setReactionEditor(true);}}>Quiz reactions</button>{onDuplicates&&<button className="rn-sheet-item" onClick={()=>{setDeskMenu(false);onDuplicates();}}>Find duplicates</button>}<button className="rn-sheet-item" disabled={disabled} onClick={()=>{setDeskMenu(false);setCoverEditor({ id: "__desk__", title: "Study Desk" });}}>Personalize space</button><button className="rn-sheet-item" onClick={()=>{setDeskMenu(false);window.dispatchEvent(new CustomEvent('remo-open-settings',{detail:'study'}));}}>Study settings</button><label className="rn-sheet-item immersive-preference"><input type="checkbox" checked={preferImmersive} onChange={event => setPreferImmersive(event.target.checked)} /><span>Start in immersive mode<small>Fullscreen · only your card and controls</small></span></label><hr style={{border:0,borderTop:'1px solid var(--line)',margin:'6px 0'}}/><a className="rn-sheet-item" href="/guides/study" target="_blank" rel="noopener noreferrer">Flashcard guide</a><a className="rn-sheet-item" href="/guides/mcqs" target="_blank" rel="noopener noreferrer">MCQ guide</a></Sheet>}
    {(searchOpen||filter)&&<div className="study-filter"><Icon name="search" size={15} /><input aria-label="Find a deck" placeholder="Find a deck" value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setFilter('');setSearchOpen(false);}}}/></div>}
    <div className="study-strip"><div className="study-strip-stats"><div><strong><FlowNumber value={due.length} /></strong><span>Due</span></div><div><strong><FlowNumber value={all.length} /></strong><span>Cards</span></div><div><strong><FlowNumber value={todayCount} /></strong><span>Done today</span></div></div><div className="study-mode-switch rn-seg" aria-label="Study mode">{[["SPACED", "Spaced repetition"], ["NORMAL", "Cram"]].map(([value, label]) => <button key={value} aria-pressed={mode === value} className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>{label}</button>)}</div></div>
    {session && session.cursor < queue.length && <div className="study-resume"><div><strong>Pick up where you left off</strong><p>{session.mode === "NORMAL" ? "Cram" : "Spaced repetition"} · <NumberGroup><FlowNumber value={session.reviewed} /> reviewed · <FlowNumber value={queue.length - session.cursor} /> remaining</NumberGroup></p></div><button className="study-primary" disabled={disabled} onClick={resume}>Resume</button></div>}
    {(currentFolder||draggedDeck)&&<div className="study-folder-navigation"><button className={`study-folder-breadcrumb ${dropFolder==='__unfiled__'?'is-drop-target':''}`} onClick={()=>{setActiveFolder(null);setFilter('');}} {...folderDrop(null)}><Icon name="study" size={16}/>{currentFolder?'Study Desk':'All decks'}{draggedDeck&&<small>Drop to unfile</small>}</button>{currentFolder&&<><Icon name="chevron" size={14}/><span>{currentFolder.name}</span><button className="icon-button" disabled={disabled} aria-label={`Edit ${currentFolder.name} folder`} onClick={()=>setFolderEditor({id:currentFolder.id})}><Icon name="more" size={17}/></button></>}</div>}
    {!currentFolder&&folders.length>0&&<div className="study-folders" aria-label="Study deck folders">{folders.filter(f=>!filter||f.name.toLowerCase().includes(filter.toLowerCase())||doc.tables.decks.some(d=>deckFolder(doc,d.rootId)===f.id&&(idx.byId.get(d.rootId)?.text||'').toLowerCase().includes(filter.toLowerCase()))).map(folder=>{const count=doc.tables.decks.filter(d=>deckFolder(doc,d.rootId)===folder.id).length;return <article key={folder.id} className={`study-folder ${dropFolder===folder.id?'is-drop-target':''}`} {...folderDrop(folder.id)}><button className="study-folder-open" aria-label={`Open ${folder.name} folder`} onClick={()=>{setActiveFolder(folder.id);setFilter('');setLibraryNotice('');}}><FolderBox color={folder.color} logo={folder.logo} name={folder.name} count={dropFolder===folder.id?'Drop deck here':`${count} ${count===1?'deck':'decks'}`} spines={doc.tables.decks.filter(d=>deckFolder(doc,d.rootId)===folder.id).map(d=>(coverPresets.find(p=>p.id===deckDesign(doc,d.rootId).preset)||coverPresets[0]).color)}/><strong className="sr-only">{folder.name}</strong></button><button className="icon-button folder-options" disabled={disabled} aria-label={`Edit ${folder.name} folder`} onClick={()=>setFolderEditor({id:folder.id})}><Icon name="more" size={18}/></button></article>;})}</div>}
    <div className="study-folder-section"><h2>{currentFolder?currentFolder.name:filter?'Search results':folders.length?'Unfiled decks':'Your decks'}</h2><span>{draggedDeck?'Drop on a folder to move':currentFolder?'Drag decks onto Study Desk to unfile':folders.length?'Drag a deck onto a folder to file it':''}</span></div>
    {libraryNotice&&<p className="study-library-notice" role="status">{libraryNotice}</p>}
    <div className="study-decks">{decks.filter(deck => deck.title.toLowerCase().includes(filter.toLowerCase())&&(currentFolder?deckFolder(doc,deck.rootId)===currentFolder.id:filter||!deckFolder(doc,deck.rootId))).sort((a, b) => Number(pinned.includes(b.rootId || "__all__")) - Number(pinned.includes(a.rootId || "__all__"))).map(deck => {
      const cards = scopedCards(doc, deck.rootId, clock, studyContext), ready = dueCards(doc, deck.rootId, clock, studyContext),
        count = mode === "SPACED" ? ready.length : cards.length,
        limitId = deck.rootId && deck.rootId !== ALL_MCQS ? deck.rootId : "__default__",
        limit = doc.tables.study_limits.find(item => item.deckId === limitId),
        designId = deck.rootId || "__all__", design = deckDesign(doc, designId);
      const movable=!!deck.rootId&&deck.rootId!==ALL_MCQS,folder=folders.find(f=>f.id===deckFolder(doc,designId));
      return <article className={`study-deck ${draggedDeck===designId?'is-dragging':''}`} key={deck.rootId || "all"} draggable={!disabled&&movable} onDragStart={event=>{if(disabled||!movable){event.preventDefault();return;}event.dataTransfer.setData('application/x-remo-study-deck',designId);event.dataTransfer.setData('text/plain',deck.title);event.dataTransfer.effectAllowed='move';setDraggedDeck(designId);}} onDragEnd={()=>{setDraggedDeck(null);setDropFolder(null);}}>
        <div className="study-notebook-cover"><button className="cover-start" aria-label={`Open ${deck.title} notebook`} disabled={disabled || !count} onClick={() => openDeck(deck.rootId)}><DeckArtwork title={deck.title} design={design} image={assets.get(design.image)} /></button><button className="cover-edit" aria-label={`Customize ${deck.title} cover`} disabled={disabled} onClick={() => setCoverEditor({ id: designId, title: deck.title })}><Icon name="image" size={14} />Cover</button></div>
        <div className="deck-pin-row"><h2 className="deck-name"><EmojiText text={deck.title}/></h2><div>{deck.rootId && deck.rootId !== ALL_MCQS && <button className="icon-button" title="Open deck source" aria-label={`Open ${deck.title} source`} onClick={() => onSource(deck.rootId!)}><Icon name="link" size={15} /></button>}<button className="icon-button" aria-label={`${pinned.includes(designId) ? "Unpin" : "Pin"} ${deck.title} notebook`} aria-pressed={pinned.includes(designId)} title={pinned.includes(designId) ? "Unpin notebook" : "Pin to top"} disabled={disabled} onClick={() => onLibraryChange({ ...doc, web: { ...doc.web, pinnedDecks: pinned.includes(designId) ? pinned.filter(id => id !== designId) : [...pinned, designId] } })}><Icon name="star" size={15} /></button>{movable&&<button className="icon-button" disabled={disabled} aria-label={`Manage ${deck.title} deck`} title="Move or delete deck" onClick={()=>setManageDeck({id:designId,title:deck.title})}><Icon name="more" size={17}/></button>}</div></div>
        {folder&&filter&&<span className="deck-folder-label"><Icon name="folder" size={12}/>{folder.name}</span>}
        {movable&&Object.values(doc.web.occlusions||{}).some((config:any)=>config.groupId===designId)&&<span className="mcq-deck-badge">IMAGE OCCLUSION</span>}
        {(designId === ALL_MCQS || doc.web.deckTypes?.[designId] === "MCQ") && <span className="mcq-deck-badge">MULTIPLE CHOICE</span>}

        {(designId === ALL_MCQS || doc.web.deckTypes?.[designId] === "MCQ") && !cards.length && <p className="mcq-notebook-empty">Add a question with four child options, then choose “Turn into MCQ…” or bulk-convert a branch with @Answer markers.</p>}
        <div className="study-deck-actions"><span className="deck-meta"><NumberGroup><span><FlowNumber value={cards.length} /> {(designId === ALL_MCQS || doc.web.deckTypes?.[designId] === "MCQ")?'questions':'cards'}</span>{ready.length>0?<b className="due-badge"><FlowNumber value={ready.length} /> due</b>:cards.length?<span className="deck-uptodate">up to date</span>:null}</NumberGroup></span><button className="study-primary" disabled={disabled || !count} title={mode === "NORMAL" ? "Start cram" : "Review due cards"} onClick={() => openDeck(deck.rootId)}>{mode === "NORMAL" ? "Cram" : "Review"}</button><button className="icon-button deck-settings-button" aria-label={`Review settings for ${deck.title}`} title="Review settings" aria-expanded={settings === designId} onClick={() => setSettings(settings === designId ? null : designId)}><Icon name="settings" size={15} /><span className="sr-only">Review settings</span></button></div>
        {settings === designId && <div className="study-limits"><p>{deck.rootId && deck.rootId !== ALL_MCQS ? "Daily spaced-review limits" : "Shared daily limits for questions outside a deck"} · −1 means unlimited</p>{[["newCards", "New cards"], ["reviewCards", "Review cards"]].map(([key, label]) => <label key={key}>{label}<input type="number" aria-label={`${label} per day for ${deck.title}`} min={-1} max={100000} value={limit?.[key] ?? -1} disabled={disabled} onChange={event => {
          const value = Number(event.target.value);
          if (!Number.isInteger(value) || value < -1 || value > 100000) return;
          const next = { deckId: limitId, newCards: -1, reviewCards: -1, ...limit, [key]: value };
          onChange({ ...doc, tables: { ...doc.tables, study_limits: [...doc.tables.study_limits.filter(item => item.deckId !== limitId), next] } });
        }} /></label>)}<DeckRetention key={String(limit?.retention)} value={limit?.retention??null} defaultValue={fsrsSettings(doc).retention} disabled={disabled} title={deck.title} onChange={retention=>{const next={deckId:limitId,newCards:-1,reviewCards:-1,...limit,retention};onChange({...doc,columns:{...doc.columns,study_limits:[...new Set([...doc.columns.study_limits,'retention'])]},tables:{...doc.tables,study_limits:[...doc.tables.study_limits.filter(item=>item.deckId!==limitId),next]}});}}/></div>}
      </article>;
    })}</div>
    {currentFolder&&!decks.some(deck=>deckFolder(doc,deck.rootId)===currentFolder.id&&deck.title.toLowerCase().includes(filter.toLowerCase()))&&<div className="study-folder-empty">{filter?<StudyEmptyArtwork search/>:<FolderArtwork color={currentFolder.color} logo={currentFolder.logo} image={assets.get(currentFolder.image)} imagePosition={currentFolder.imagePosition}/>} <h2>{filter?'No matching decks':'Your folder is ready'}</h2><p>{filter?'Try a different deck name.':'Return to Study Desk and drag a deck here, or choose this folder from a deck’s menu.'}</p><button className="study-text-button" onClick={()=>{setActiveFolder(null);setFilter('');}}>Back to all decks</button></div>}
    {!all.length && <div className="study-empty"><StudyEmptyArtwork/><h2>Build your first flashcard</h2><p>Open a bullet’s actions and choose “Turn into question”. Its children become the answer. Or choose “Make Q&A deck” on a parent to convert a whole branch.</p><button onClick={() => onSource("")}>Open my notes</button></div>}
    {doc.tables.cards.some(card => card.suspended) && <details className="suspended-cards"><summary>Suspended cards ({doc.tables.cards.filter(card => card.suspended && card.state === "ACTIVE").length})</summary>{doc.tables.cards.filter(card => card.suspended && card.state === "ACTIVE").map(card => <div key={card.id}><span>{card.question}</span><button disabled={disabled} onClick={() => onChange({ ...doc, tables: { ...doc.tables, cards: doc.tables.cards.map(item => item.id === card.id ? { ...item, suspended: 0 } : item) } })}>Unsuspend</button></div>)}</details>}
    <p className="study-local-note"><Icon name="check" size={13} />Progress is saved on this device and included in your backups.</p>
    {coverEditor && <CoverDesigner key={coverEditor.id} title={coverEditor.title} design={deckDesign(doc, coverEditor.id)} assets={assets} desk={coverEditor.id === "__desk__"} onSave={(design, file) => onSaveDesign(coverEditor.id, design, file)} onClose={() => setCoverEditor(null)} />}
    {reactionEditor && <QuizReactionSettings doc={doc} assets={assets} onSave={onSaveReactions} onClose={() => setReactionEditor(false)} />}
    {folderEditor&&<FolderEditor key={folderEditor.id||'new'} doc={doc} id={folderEditor.id} assets={assets} disabled={disabled} onChange={onLibraryChange} onSave={onSaveFolder} onClose={()=>setFolderEditor(null)}/>}
    {manageDeck&&doc.tables.decks.some(d=>d.rootId===manageDeck.id)&&<DeckManager key={manageDeck.id} doc={doc} id={manageDeck.id} title={manageDeck.title} disabled={disabled} onChange={next=>{onLibraryChange(next);setLibraryNotice(next.tables.decks.some(d=>d.rootId===manageDeck.id)?'Deck moved.':'Deck deleted. Original notes were kept, or moved to Trash as selected.');}} onClose={()=>setManageDeck(null)}/>}
  </section>;
}
