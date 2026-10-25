import {MobileEditToolbar} from './MobileEditToolbar';
import {RemoLogo} from './RemoLogo';
import {SaveIndicator} from './SaveIndicator';
import {AuthGate,googleSignIn,googleSignOut,setAccountTransitionHandler,type User} from './CloudAccount';
import {useCloudSync} from './useCloudSync';
import './cloud.css';
import './settings.css';
import {checkUploadFile,checkAttachmentBudget,checkNewAssets,attachmentBytes,MAX_ATTACHMENT_BYTES} from './upload-limits.mjs';
import {MusicProvider} from './Music';
import {GalleryContext} from './Gallery';
import {TableContext} from './NoteTable';
import {tableText} from './table.mjs';
import {SearchBox,SearchContext} from "./SearchBox";
import {useWorkspacePanes,PaneHeader,PaneDivider} from "./WorkspacePanes";
import {ConnectionContext,ConnectionChooser,ConnectionPanel} from "./Connections";
import {createMirror,detachMirror,internalLink,sourceId} from "./relations.mjs";
import {OcclusionEditor} from "./OcclusionEditor";
import {CalendarReminders,ReminderTabs,ReminderEditor,type ReminderTarget} from './CalendarReminders';
import {calendarEvents,eventsOnDate} from './calendar-events.mjs';
import {enableStudyBranch,saveStudyFolder} from './study-library.mjs';
import type {FolderDraft} from './StudyFolders';
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/core";
import { parseClipboard, type ClipboardInput } from "./clipboard";
import { SelectionFormatting } from "./SelectionFormatting";
import { prepareCoverImage, type DeckDesign } from "./deck-designs";
import { configureMcq, configureMcqBranch, bulkMcqPlan, validateReactionGif } from "./mcq.mjs";
import { MCQEditor } from "./MCQEditor";
import { BulkMCQEditor } from "./BulkMCQEditor";
import { FolderStoragePanel, useFolderStorage } from './FolderStorage';
import type { ReactionSettings } from "./QuizReactions";
import {
  bullet,
  inferDeckLayout,
  index,
  rows,
  move,
  indent,
  outdent,
  moveSibling,
  split,
  merge,
  pasteOutline,
  generatedCards,
  descendants,
  validate,
} from "./domain.mjs";
import {
  load,
  save,
  sample,
  empty,
  withNodes,
  getAssets,
  archive,
  parseArchive,
  download,
  recovery,
  androidBlockers,
  references,
  type Workspace,
  type Node,
} from "./data";
import { OutlineView } from "./OutlineView";
import { JumpTo, OutlinePopover, OutlineSidebar } from "./OutlineChrome";
import { StudyDesk } from "./StudyDesk";
import { imageType, mediaLink } from "./media.mjs";
import { EmojiProvider } from './AnimatedEmoji';
import { EmojiPicker } from './EmojiPicker';
import {WorkdaysCalendar} from './WorkdaysCalendar';
import {workdays,validateWorkdays} from './workdays.mjs';
import { decodeAnimation, insertEmoji } from './emoji.mjs';
import { downloadNotoEmoji, getNotoEmoji, isNotoEmoji, notoPosterPath, NOTO_CREDIT_PATH } from './noto-emojis.mjs';
import './emoji.css';
import {
  CalendarView,
  getLocalDateString,
  formatDatePill,
  parseLocalDate,
  ensureCalendarHierarchy,
} from "./CalendarView";
import { unsupportedFormatting, toEditor } from "./editor";
import { Icon } from "./icons";
import { RecoveryBoundary } from "./RecoveryBoundary";
import "./styles.css";
import "./outline-chrome.css";
import "./study.css";
import "./mcq.css";
import "./mobile.css";
let recoveryDraft: () => { doc: Workspace | null; assets: Map<string, Blob> } = () => ({ doc: null, assets: new Map() });
async function downloadRecovery() {
  const draft = recoveryDraft();
  const doc = draft.doc || await load();
  if (!doc) throw new Error("No workspace is available yet. Reload to retry loading.");
  const assets = draft.doc ? draft.assets : await getAssets();
  download(await archive(doc, assets, false), "Remo-recovery.remo.zip");
}
function Dialog({
  title,
  onClose,
  children,
  className,
}: {
  className?: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function App({cloudUser=null}: {cloudUser?:User|null} = {}) {
  const views=useWorkspacePanes();
  const {scope,setScope,search,setSearch}=views;
  const [occlusionImage,setOcclusionImage]=useState<string|null>(null);
  const [doc, setDoc] = useState<Workspace | null>(null),
    docRef = useRef<Workspace | null>(null),
    persisted = useRef<Workspace | null>(null),
    [assets, setAssets] = useState(new Map<string, Blob>()),
    assetsRef = useRef(new Map<string, Blob>()),
    pendingAssets = useRef(new Map<string, Blob>()),
    imageInput = useRef<HTMLInputElement>(null),
    mediaTarget = useRef<string | null>(null),
    emojiTarget = useRef<{ id: string; start: number; end: number } | null>(null),
    emojiDownload = useRef<AbortController | null>(null),
    [embedValue, setEmbedValue] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [caret, setCaret] = useState<number | null>(null),
    [tab, setTab] = useState("notes"),
    [calendarDate, setCalendarDate] = useState(() => getLocalDateString()),
    [connectionTarget,setConnectionTarget]=useState<{mode:string;id:string;start:number;end:number}|null>(null),
    [nodeDate,setNodeDate]=useState<{id:string;date:string}|null>(null),
    [reminderEditor,setReminderEditor]=useState<ReminderTarget|null>(null),
    [status, setStatus] = useState("Loading"),
    [error, setError] = useState<string | null>(null),
    [fatal, setFatal] = useState(false),
    failed = useRef(false),
    [dialog, setDialog] = useState<string | null>(null),
    [settingsPanel,setSettingsPanel] = useState("appearance"),
    [mcqEditing, setMcqEditing] = useState<string | null>(null),
    [bulkMcqEditing, setBulkMcqEditing] = useState<string | null>(null),
    [menu, setMenu] = useState<string | null>(null),
    menuAnchor = useRef<HTMLElement | null>(null),
    [viewMenu, setViewMenu] = useState(false),
    viewAnchor = useRef<HTMLElement | null>(null),
    [restore, setRestore] = useState<Awaited<
      ReturnType<typeof parseArchive>
    > | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [sidebarOpen, setSidebarOpen] = useState(() => {
      try {
        const saved = localStorage.getItem("remo_sidebar_open");
        if (saved !== null) return saved === "true";
      } catch {}
      return true;
    }),
    [working, setWorking] = useState(false),
    [historyTick, setHistoryTick] = useState(0),
    history = useRef<{ undo: Workspace[]; redo: Workspace[] }>({
      undo: [],
      redo: [],
    }),
    lastText = useRef({ id: "", at: 0 }),
    editor = useRef<Editor | null>(null),
    [activeEditor, setActiveEditor] = useState<Editor | null>(null),
    input = useRef<HTMLInputElement>(null),
    chain = useRef(Promise.resolve()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dirty = useRef(false);
  recoveryDraft = () => ({ doc: docRef.current, assets });
  useEffect(() => {
    (async () => {
      try {
        const [stored, a] = await Promise.all([load(), getAssets()]);
        let initial = stored;
        if (!initial) initial = await save(null, cloudUser ? empty() : sample(), "initialize");
        if (initial.web.studyVersion !== 2) {
          const upgraded = withNodes(initial, initial.tables.bullets as Node[]);
          initial = await save(initial, { ...upgraded, web: { ...upgraded.web, studyVersion: 2 } }, "study upgrade");
        }
        // Older daily pages may still live at the outline root. Preserve their
        // identities and content while attaching them to the Calendar tree.
        const originalCalendarNodes = initial.tables.bullets as Node[];
        let calendarNodes = originalCalendarNodes;
        for (const node of calendarNodes.filter(n => /^journal-\d{4}-\d{2}-\d{2}$/.test(n.id))) {
          calendarNodes = ensureCalendarHierarchy(calendarNodes, node.id.slice(8)).nodes;
        }
        if (calendarNodes.length !== originalCalendarNodes.length || calendarNodes.some((n, i) => n !== originalCalendarNodes[i])) {
          initial = await save(initial, withNodes(initial, calendarNodes), "calendar hierarchy upgrade");
        }
        persisted.current = initial;
        docRef.current = initial;
        setDoc(initial);
        setAssets(a);
        assetsRef.current = a;
        setStatus("Saved on this device");
      } catch (e) {
        failed.current = true;
        setFatal(true);
        setError("Could not open local storage. " + String(e));
        setStatus("Storage unavailable");
      }
    })();
  }, []);
  const showError = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("remo_sidebar_open", String(next));
      } catch {}
      return next;
    });
  };
  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current || !docRef.current || failed.current)
      return chain.current;
    const target = docRef.current;
    const assetChanges = new Map(pendingAssets.current);
    dirty.current = false;
    setStatus("Saving…");
    chain.current = chain.current.then(async () => {
      if (failed.current) return;
      try {
        const next = await save(persisted.current, target, "edit", assetChanges.size ? assetChanges : undefined);
        for (const [path, blob] of assetChanges)
          if (pendingAssets.current.get(path) === blob) pendingAssets.current.delete(path);
        persisted.current = next;
        if (docRef.current === target) {
          docRef.current = next;
          setDoc(next);
        }
        if (!dirty.current && docRef.current === next)
          setStatus("Saved on this device");
      } catch (e) {
        failed.current = true;
        dirty.current = true;
        setStatus("Changes not saved");
        showError(e);
      }
    });
    return chain.current;
  };
  const cloud = useCloudSync({user:cloudUser,revision:doc?.revision,ready:!!doc&&!failed.current,
    get:()=>({doc:docRef.current,assets:assetsRef.current}),flush,
    canApply:()=>!dirty.current&&!activeEditor?.isFocused&&!working&&!failed.current,
    apply:async(remote,remoteAssets)=>{
      if(dirty.current||activeEditor?.isFocused||working||failed.current)throw Error('Finish editing before loading cloud notes.');
      validate(remote.tables.bullets);
      validateWorkdays(remote.web.workdays);
      const next=await save(persisted.current,{...remote,revision:persisted.current!.revision,web:{...remote.web,deviceId:persisted.current!.web.deviceId}},'cloud download',remoteAssets,true);
      persisted.current=next;docRef.current=next;assetsRef.current=remoteAssets;pendingAssets.current.clear();history.current={undo:[],redo:[]};
      setDoc(next);setAssets(remoteAssets);setEditing(null);setStatus('Saved on this device');
    }
  });
  useEffect(()=>setAccountTransitionHandler(async()=>{await flush();if(failed.current)throw Error('Export your unsaved changes before reloading to change accounts.');}));
  const accountAction = async(signOut=false)=>{try{await flush();if(failed.current)throw Error('Save or export your changes before changing accounts.');if(signOut)await googleSignOut();else await googleSignIn();}catch(e){showError(e);}};
  const commit = (next: Workspace, group?: string, record = true) => {
    if (failed.current) {
      setError(
        "Saving has stopped. Retry saving or export your unsaved work first.",
      );
      return;
    }
    const current = docRef.current!;
    if (record) {
      const now = Date.now();
      if (
        !group ||
        lastText.current.id !== group ||
        now - lastText.current.at > 700
      ) {
        history.current.undo.push(current);
        const cap = Math.max(
          1,
          Math.min(
            30,
            Math.floor(100000 / Math.max(1, current.tables.bullets.length)),
          ),
        );
        while (history.current.undo.length > cap) history.current.undo.shift();
      }
      history.current.redo = [];
      lastText.current = { id: group || "", at: now };
      setHistoryTick((x) => x + 1);
    }
    docRef.current = next;
    setDoc(next);
    dirty.current = true;
    setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 180);
  };
  const mutate = (fn: (nodes: Node[]) => Node[], group?: string) => {
    try {
      const current = docRef.current!;
      const changed=fn(current.tables.bullets as Node[]);
      let next=current;
      if(current.web.studyExcludedCards?.length){const prior=new Map(current.tables.bullets.map(n=>[n.id,n.kind]));for(const node of changed)if(node.kind==='QUESTION'&&prior.get(node.id)!=='QUESTION')next=enableStudyBranch(next,node.id);}
      commit(withNodes(next, changed), group);
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  };
  const undo = (redo = false) => {
    const h = history.current,
      from = redo ? h.redo : h.undo,
      to = redo ? h.undo : h.redo,
      next = from.pop();
    if (!next) return;
    to.push(docRef.current!);
    lastText.current = { id: "", at: 0 };
    const current = docRef.current!;
    // Outline undo must not roll back reviews completed after that outline edit.
    commit(withNodes({ ...next, tables: { ...next.tables, cards: current.tables.cards, review_logs: current.tables.review_logs, study_sessions: current.tables.study_sessions, study_limits: current.tables.study_limits } }, next.tables.bullets as Node[]), undefined, false);
    setHistoryTick((x) => x + 1);
    if (editing && !next.tables.bullets.some(n => n.id === editing)) {
      const target = next.tables.bullets.at(-1);
      setEditing(target?.id || null);
      setCaret(target?.text.length ?? null);
    }
    setNotice(redo ? "Change restored" : "Change undone");
  };
  const focus = (id: string, pos: number | null = null) => {
    setEditing(id);
    setCaret(pos);
  };
  const openPane=(id:string|null=scope)=>{if(!docRef.current)return;views.add(id,docRef.current.tables.bullets as Node[]);setTab('notes');setEditing(null);setMenu(null);};
  const openBulletMenu = (id: string, anchor?: HTMLElement) => {
    menuAnchor.current = anchor || [...document.querySelectorAll<HTMLElement>("[data-node-id]")].find(el => el.dataset.nodeId === id) || null;
    setViewMenu(false);
    setMenu(id);
  };
  const attachImages = async (id: string, files: File[]) => {
    id=sourceId(docRef.current!.tables.bullets,id);
    if (working || failed.current || !files.length) return;
    setWorking(true);
    try {
      files.forEach(checkUploadFile);
      const accepted = files.map(file => ({ file, mime: /^(video\/(mp4|webm|ogg)|audio\/[a-zA-Z0-9.+-]+)$/.test(file.type)?file.type:imageType(file.name, file.type) }));
      if (accepted.some(({ file, mime }) => !mime || file.size > 2 * 1024 * 1024))
        throw Error("Choose images, audio or MP4/WebM/OGG videos up to 2 MB each. Unsupported previews keep their original file for download.");
      const nextAssets = new Map(assetsRef.current), added = [];
      for (const { file, mime } of accepted) {
        const mediaId = crypto.randomUUID(), extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "img",
          fileName = mediaId + "." + extension,
          blob = new Blob([await file.arrayBuffer()], { type: mime });
        nextAssets.set("media/" + fileName, blob);
        added.push({ id: mediaId, bulletId: id, fileName, mimeType: mime, sourceUrl: "", credit: file.name, licenseUrl: "" });
      }
      checkAttachmentBudget(nextAssets);
      const current = docRef.current!;
      if (!current.tables.bullets.some(node => node.id === id)) throw Error("This bullet no longer exists.");
      for (const item of added) pendingAssets.current.set("media/" + item.fileName, nextAssets.get("media/" + item.fileName)!);
      assetsRef.current = nextAssets;
      setAssets(nextAssets);
      commit(withNodes({ ...current, tables: { ...current.tables, media: [...current.tables.media, ...added] } }, current.tables.bullets as Node[]));
      setMenu(null);
      setNotice(`${added.length} media file${added.length === 1 ? "" : "s"} added`);
    } catch (error) { showError(error); }
    finally { setWorking(false); }
  };
  const resizeMedia = (id:string,width:number) => {
    const current=docRef.current!;
    const next:Workspace={...current,tables:{...current.tables,media:current.tables.media.map(item=>item.id===id?{...item,displayWidth:Math.max(15,Math.min(100,Math.round(width)))}:item)}};
    commit(withNodes(next,next.tables.bullets as Node[]));
  };
  const removeMedia = (id: string) => {
    const current = docRef.current!;
    commit(withNodes({ ...current, tables: { ...current.tables, media: current.tables.media.filter(item => item.id !== id) } }, current.tables.bullets as Node[]));
    setNotice("Image removed from this bullet. Undo restores it.");
  };
  const saveFolderDesign = async (draft:FolderDraft,file?:File) => {
    if(failed.current)throw Error('Resolve the save error before changing your folder.');
    if(file)checkUploadFile(file);
    const blob=file?await prepareCoverImage(file):undefined,current=docRef.current!;
    const image=blob?`media/folder-bg-${crypto.randomUUID()}.${blob.type==='image/webp'?'webp':'png'}`:draft.image;
    const next=saveStudyFolder(current,{...draft,image});
    if(blob){
      checkNewAssets(assetsRef.current,new Map([[image,blob]]));
      const nextAssets=new Map(assetsRef.current);nextAssets.set(image,blob);pendingAssets.current.set(image,blob);assetsRef.current=nextAssets;setAssets(nextAssets);
    }
    commit(next);await flush();
    if(failed.current)throw Error('Your folder is in memory, but saving failed. Export a full backup to keep it.');
    setNotice('Folder saved. Full backups include its image and subject logo.');
  };
  const saveDeckDesign = async (id: string, design: DeckDesign, file?: File) => {
    if (failed.current) throw Error("Resolve the save error before changing your cover.");
    if(file)checkUploadFile(file);
    let image = design.image;
    const blob = file ? await prepareCoverImage(file) : undefined;
    const current = docRef.current!;
    if (blob) {
      checkNewAssets(assetsRef.current,new Map([["new-cover",blob]]));
      image = `media/deck-cover-${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "png"}`;
      const nextAssets = new Map(assetsRef.current);
      nextAssets.set(image, blob);
      pendingAssets.current.set(image, blob);
      assetsRef.current = nextAssets;
      setAssets(nextAssets);
    }
    commit({ ...current, web: { ...current.web, deckDesigns: { ...current.web.deckDesigns, [id]: { ...design, image } } } });
    await flush();
    if (failed.current) throw Error("Your design is in memory, but saving failed. Export a full backup to keep it.");
    setNotice("Design saved on this device. Full backups include your covers and images.");
  };
  const saveQuizReactions = async (settings: ReactionSettings, files: { correct: File[]; wrong: File[] }) => {
    if (failed.current) throw Error("Resolve the save error before adding GIFs.");
    const nextAssets = new Map(assetsRef.current), additions = new Map<string, Blob>(), saved = { ...settings };
    for (const kind of ["correct", "wrong"] as const) {
      if (files[kind].length > 6) throw Error("Choose up to six GIFs for each outcome.");
      if (!files[kind].length) continue;
      saved[kind] = [];
      for (const file of files[kind]) {
        checkUploadFile(file);
        await validateReactionGif(file);
        const path = `media/quiz-${crypto.randomUUID()}.gif`, blob = new Blob([await file.arrayBuffer()], { type: "image/gif" });
        additions.set(path, blob);
        saved[kind].push({ path, label: file.name.replace(/\.gif$/i, "").slice(0, 100) });
      }
    }
    for (const [path, blob] of additions) nextAssets.set(path, blob);
    checkAttachmentBudget(nextAssets);
    for (const [path, blob] of additions) pendingAssets.current.set(path, blob);
    assetsRef.current = nextAssets;
    setAssets(nextAssets);
    const current = docRef.current!;
    commit({ ...current, web: { ...current.web, quizReactions: saved } });
    await flush();
    if (failed.current) throw Error("GIFs are in memory, but saving failed. Export a full backup to keep them.");
    setNotice("Quiz reactions saved. Full backups include your GIFs.");
  };
  const makeMcqNotebook = (id: string) => {
    const current = docRef.current!, now = Date.now();
    const next: Workspace = { ...current, web: { ...current.web, deckTypes: { ...current.web.deckTypes, [id]: "MCQ" } }, tables: { ...current.tables, decks: current.tables.decks.some(deck => deck.rootId === id) ? current.tables.decks : [...current.tables.decks, { rootId: id, createdAt: now, pinned: 0 }] } };
    commit(withNodes(enableStudyBranch(next,id), next.tables.bullets as Node[]));
    setMenu(null);
    setNotice("MCQ notebook linked. Add MCQs inside this branch to study them together.");
  };
  const openEmojiPicker = (id: string) => {
    id=sourceId(docRef.current!.tables.bullets,id);
    const node = docRef.current!.tables.bullets.find(n => n.id === id);
    if (!node || unsupportedFormatting(node as Node)) return;
    const selection = editing === id ? editor.current?.state.selection : null;
    emojiTarget.current = { id, start: selection ? selection.from - 1 : node.text.length, end: selection ? selection.to - 1 : node.text.length };
    setMenu(null); setDialog('emoji');
  };
  const importEmojiFiles = async (files: File[]) => {
    if (working || failed.current) throw Error('Wait for saving to finish before importing.');
    if (files.length > 20) throw Error('Import up to 20 emoji files at a time.');
    setWorking(true);
    try {
      const added = [], nextAssets = new Map(assetsRef.current);
      for (const file of files) {
        checkUploadFile(file);
        if (!/\.(json|tgs)$/i.test(file.name)) throw Error('Choose Lottie .json or Telegram .tgs files.');
        await decodeAnimation(file);
        const id = crypto.randomUUID(), extension = file.name.toLowerCase().endsWith('.tgs') ? 'tgs' : 'json',
          fileName = id + '.' + extension,
          blob = new Blob([await file.arrayBuffer()], { type: extension === 'tgs' ? 'application/gzip' : 'application/json' });
        nextAssets.set('emoji/' + fileName, blob);
        added.push({ token: ':remo_' + id + ':', fileName, label: file.name.replace(/\.(json|tgs)$/i, '').slice(0, 100) || 'Emoji' });
      }
      const current = docRef.current!;
      if (current.tables.emojis.filter(item => !isNotoEmoji(item)).length + added.length > 500) throw Error('This workspace supports up to 500 custom emojis. Noto catalog emojis do not use this allowance.');
      checkAttachmentBudget(nextAssets);
      if (failed.current) throw Error('Saving is paused. Return to Settings to recover your draft.');
      for (const item of added) pendingAssets.current.set('emoji/' + item.fileName, nextAssets.get('emoji/' + item.fileName)!);
      assetsRef.current = nextAssets; setAssets(nextAssets);
      commit({ ...current, tables: { ...current.tables, emojis: [...current.tables.emojis, ...added] } });
      setNotice(`${added.length} animated emoji${added.length === 1 ? '' : 's'} imported. Choose one to insert.`);
    } finally { setWorking(false); }
  };
  const chooseEmoji = async (item: Record<string, any>, inline = false) => {
    if (working || failed.current || !emojiTarget.current) return;
    const target = emojiTarget.current, { id, start, end } = target, known = getNotoEmoji(item.token), controller = new AbortController();
    const originalText = docRef.current!.tables.bullets.find(n => n.id === id)?.text;
    const insertionEditor = editor.current;
    emojiDownload.current = controller;
    const added = new Map<string, Blob>();
    try {
      let record = docRef.current!.tables.emojis.find(e => e.token === item.token);
      if (known) {
        if (!assetsRef.current.has('emoji/' + known.fileName) || !assetsRef.current.has(notoPosterPath(known)) || !assetsRef.current.has(NOTO_CREDIT_PATH)) {
          setWorking(true);
          for (const [path, blob] of await downloadNotoEmoji(known, controller.signal)) added.set(path, blob);
        }
        record = { token: known.token, fileName: known.fileName, label: known.label };
      } else if (!record && item.data) {
        record = { token: item.token, fileName: item.token.replace(/:/g, '') + '.json', label: item.label };
        added.set('emoji/' + record.fileName, new Blob([JSON.stringify(item.data)], { type: 'application/json' }));
      }
      if (controller.signal.aborted || emojiTarget.current !== target || !record) return;
      if (failed.current) throw Error('Saving is paused. Export your draft before trying again.');
      const current = docRef.current!, node = current.tables.bullets.find(n => n.id === id);
      if (!node || unsupportedFormatting(node as Node)) return;
      if (inline && node.text !== originalText) throw Error('This bullet changed while downloading. Choose the emoji again.');
      const nextAssets = new Map(assetsRef.current);
      for (const [path, blob] of added) {checkUploadFile(blob);nextAssets.set(path, blob);}
      checkAttachmentBudget(nextAssets);
      const updated = insertEmoji(node, item.token, start, end), registered = current.tables.emojis.some(e => e.token === item.token),
        next = { ...current, tables: { ...current.tables, emojis: registered ? current.tables.emojis.map(existing => existing.token === record!.token ? record! : existing) : [...current.tables.emojis, record] } };
      for (const [path, blob] of added) pendingAssets.current.set(path, blob);
      assetsRef.current = nextAssets; setAssets(nextAssets);
      commit(withNodes(next, current.tables.bullets.map(n => n.id === id ? updated : n) as Node[]));
      emojiTarget.current = null;
      if (inline && editing === id && editor.current === insertionEditor && editor.current && !editor.current.isDestroyed) {
        editor.current.commands.setContent(toEditor(updated as Node), { emitUpdate: false });
        editor.current.commands.setTextSelection(start + item.token.length + 1);
      } else if (!inl…20384 tokens truncated…ialog-buttons">
            <button
              onClick={() => {
                setDialog(null);
                setRestore(null);
              }}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={disabled}
              onClick={() => applyRestore(restore)}
            >
              Replace and restore
            </button>
          </div>
        </Dialog>
      )}
      {dialog === "trash" && (
        <Dialog title="Trash" onClose={() => setDialog(null)}>
          <p className="dialog-muted">
            Deleted branches keep their original IDs and attachments.
          </p>
          {!doc.tables.trash.length ? (
            <p className="dialog-muted">Trash is empty.</p>
          ) : (
            doc.tables.trash.map((t) => (
              <div className="trash-item" key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <span>
                    {t.nodeCount} bullets ·{" "}
                    {new Date(t.deletedAt).toLocaleDateString()}
                  </span>
                </div>
                <button disabled={disabled} onClick={() => restoreBranch(t.id)}>
                  Restore
                </button>
                <button
                  className="icon-button danger"
                  aria-label={"Permanently delete " + t.title}
                  disabled={disabled}
                  onClick={() => {
                    setMenu(null);
                    setDialog("purge:" + t.id);
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))
          )}
        </Dialog>
      )}
      {dialog?.startsWith("purge:") && (
        <Dialog
          title="Permanently delete branch?"
          onClose={() => setDialog("trash")}
        >
          <p>
            This removes the branch from Trash. Its previous backups will remain
            available.
          </p>
          <div className="dialog-buttons">
            <button onClick={() => setDialog("trash")}>Cancel</button>
            <button
              className="danger"
              disabled={disabled}
              onClick={async () => {
                setWorking(true);
                try {
                  await flush();
                  if (failed.current)
                    throw Error("Current edits could not be saved");
                  const id = dialog.slice(6),
                    current = docRef.current!,
                    entry = current.tables.trash.find((t) => t.id === id)!,
                    payload = JSON.parse(entry.payload),
                    next = {
                      ...current,
                      tables: {
                        ...current.tables,
                        trash: current.tables.trash.filter((t) => t.id !== id),
                      },
                    };
                  const refs = references(next),
                    removed = androidBlockers(current).length
                      ? []
                      : payload.media
                          .map((m: any) => "media/" + m.fileName)
                          .filter((path: string) => !refs.has(path));
                  const written = await save(
                    persisted.current,
                    next,
                    "purge",
                    undefined,
                    false,
                    removed,
                  );
                  persisted.current = written;
                  docRef.current = written;
                  setDoc(written);
                  history.current = { undo: [], redo: [] };
                  setHistoryTick((x) => x + 1);
                  setAssets(
                    (a) =>
                      new Map(
                        [...a].filter(([path]) => !removed.includes(path)),
                      ),
                  );
                  setDialog("trash");
                  setNotice("Branch permanently deleted");
                } catch (e) {
                  showError(e);
                } finally {
                  setWorking(false);
                }
              }}
            >
              Delete permanently
            </button>
          </div>
        </Dialog>
      )}
      <input
        ref={input}
        type="file"
        accept=".zip,.remo.zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importBackup(file);
          e.target.value = "";
        }}
      />
      {reminderEditor&&<ReminderEditor key={`${reminderEditor.id||'new'}:${reminderEditor.date}`} doc={doc} target={reminderEditor} disabled={disabled} onChange={next=>commit(next)} onClose={()=>setReminderEditor(null)}/>}
      {occlusionImage && doc.tables.media.some(item=>item.id===occlusionImage) && <OcclusionEditor groupId={(Object.values(doc.web.occlusions||{}) as any[]).find(config=>config.mediaId===occlusionImage)?.groupId} doc={doc} item={doc.tables.media.find(item=>item.id===occlusionImage)!} assets={assets} disabled={disabled} onSave={next=>{commit(next);setNotice('Image occlusion cards saved to Study Desk.');}} onClose={()=>setOcclusionImage(null)}/>}
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          {notice}
        </div>
      )}
    </div>
    </EmojiProvider>
    </ConnectionContext.Provider>
    </SearchContext.Provider></TableContext.Provider></GalleryContext.Provider></MusicProvider>
  );
}
export const appRoot = createRoot(document.getElementById("root")!);
appRoot.render(<RecoveryBoundary onBackup={downloadRecovery}>{(import.meta.env.PROD || import.meta.env?.DEV) ? <AuthGate>{user=><App cloudUser={user}/>}</AuthGate> : <App />}</RecoveryBoundary>);

if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
