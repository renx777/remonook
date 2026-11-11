import {retireDesktopOfflineShell} from './desktop';
import {restoreLocalBook,isBookPath} from './local-books';
import {AiAssistBoundary} from './AiAssistBoundary';
import {outlineUndoState} from './outline-history.mjs';
import {aiContext,insertAi} from './ai-assist.mjs';
import {useResearchDrafts} from './ai-drafts';
import type {ResearchDraft} from './data';
import {planTrashPurge} from './trash-purge';
import {cacheArticle,articleAccount} from './article-cache.mjs';
import {uploadCachedArticles} from './article-api';
import {createUiSignal} from './ui-signal';
import {KeyboardShortcuts} from './KeyboardShortcuts';
import {FsrsPreferences} from './FsrsPreferences';
/** Settings sections, grouped as shown in the section list. */
const SETTINGS_GROUPS:[string,[string,string,string][]][]=[
  ["You",[["appearance","Appearance","settings"],["account","Account and sync","people"]]],
  ["Notes",[["study","Study","study"],["storage","Storage","folder"],["backups","Backups","folder"]]],
  ["Apps",[["ai","AI apps","globe"],["connections","Connections","connections"],["desktop","Desktop","settings"]]],
  ["Help",[["shortcuts","Keyboard shortcuts","help"]]],
];
import {CommandPalette} from './CommandPalette';
import {bindWorkspaceShortcuts,modLabel,shortcutAllowed} from './workspace-shortcuts';
import {GuidedTours} from './GuidedTours';
import {VisualToolsContext,VisualToolLoader,type DiagramTarget} from './VisualTools';
import {saveDiagram} from './visual-notes.mjs';
import {ReadingSources,ReaderBoundary,ReaderStartup} from './ReadingSources';
import {addReadingNote,captureReadingImage,readingBook,readingPosition,readingSources,validateReading} from './reading.mjs';
import {BookStorage} from './BookStorage';
import {GoogleTasksProvider,GoogleTasksConnection} from './GoogleTasks';
import {snapshotIndex,paneSnapshot} from './outline-snapshot.mjs';
import {useSidebarMotion} from './useSidebarMotion';
import {restoreDeviceState,historyAfterSync} from './cloud-model.mjs';
import {MobileEditToolbar} from './MobileEditToolbar';
import {RemoLogo} from './RemoLogo';
import {WorkspaceSwitcher} from './WorkspaceSwitcher';
import {isApp,isDesktop,isMobileApp,installDesktopLinks} from './desktop';
import {DesktopSignIn} from './DesktopSignIn';
import {DesktopUpdate} from './DesktopUpdate';
import {DesktopSettings} from './DesktopSettings';
import {AndroidUpdate} from './AndroidUpdate';
import {FocusPill} from './FocusPill';
import {LocalSyncPairing,LocalSyncSettings} from './LocalSyncSettings';
import {QuickCapture} from './QuickCapture';
import {useDesktop} from './useDesktop';
import {useLocalSync} from './local-sync';
import {importFromFolder} from './workspace-folder';
import './workspaces.css';
import {activeLocalWorkspace,protectDeviceStorage,workspaceStorageName} from './workspaces';
import {copyTargets,copyBranch} from './workspace-copy';
import {ReleaseUpdate} from './ReleaseUpdate';
import {CloudDeviceSaveIndicator,CloudAccountStatus} from './SaveIndicator';
import {FlowNumber} from './FlowNumber';
import {useEntranceMotion} from './useEntranceMotion';
import {AuthGate,openAccountSignIn,AccountSecurity,googleSignOut,setAccountTransitionHandler,type User,authenticatedUid} from './CloudAccount';
import {useCloudSync} from './useCloudSync';
import './cloud.css';
import './settings.css';
import {checkUploadFile,checkAttachmentBudget,checkNewAssets,attachmentBytes,MAX_ATTACHMENT_BYTES} from './upload-limits.mjs';
import {MusicProvider} from './Music';
import {GalleryContext} from './Gallery';
import {TableContext} from './NoteTable';
import {tableText} from './table.mjs';
import {SearchBox,SearchContext} from "./SearchBox";
import {useWorkspacePanes,PaneDivider} from "./WorkspacePanes";
import {PaneSearchBar} from "./PaneSearchBar";
import {ConnectionContext,ConnectionChooser,ConnectionPanel} from "./Connections";
import {createMirror,detachMirror,internalLink,sourceId} from "./relations.mjs";
import {OcclusionEditor} from "./OcclusionEditor";
import {ReminderTabs,ReminderEditor,useReminderClock,type ReminderTarget} from './CalendarReminders';
import {CalendarAgenda,MiniMonth,WorkdaysLine} from './CalendarAgenda';
import {articleSnapshotHashes} from './bookmarks.mjs';
import {CalendarTrackers} from './CalendarTrackers';
import {patchMindmapStyle,renameMindmapBullet} from './mindmap-style.mjs';
import {calendarEvents,eventsOnDate} from './calendar-events.mjs';
import {enableStudyBranch,saveStudyFolder} from './study-library.mjs';
import type {FolderDraft} from './StudyFolders';
import React, { startTransition, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/core";
import { parseClipboard, type ClipboardInput } from "./clipboard";
import { SelectionFormatting } from "./SelectionFormatting";
import { textColors } from "./color-palettes";
import { prepareCoverImage, type DeckDesign } from "./deck-designs";
import { configureMcq, configureMcqBranch, bulkMcqPlan, validateReactionGif } from "./mcq.mjs";
import { NOTE_FILTERS, noteCatalog } from "./notes-filter.mjs";
import { TagHeader } from "./TagHeader";
import { isTagQuery, sanitizeTagSettings, setTagRegistry, renameTagInNodes, renameTagSettings, resolveDateTags, hasTag, tagKey } from "./tags.mjs";
import { TagSettingsContext } from "./TagSettingsContext";
import { TagSettingsForm } from "./TagSettings";
import { AiApps } from "./AiApps";
import { marks as markRanges, encode as encodeMarks } from "./domain.mjs";
import { ProfileMenu } from "./ProfileMenu";
import { TablePicker } from "./TablePicker";
import { APP_ENV } from "./cloud-config";
import { useViewSwipe, SWIPE_VIEWS, SWIPE_LABELS, type SwipeView } from "./view-swipe";
import { MCQEditor } from "./MCQEditor";
import { BulkMCQEditor } from "./BulkMCQEditor";
import {retireLegacyFolderSync} from './retire-folder-sync.mjs';
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
  updateBulletContent,
  getAssets,
  archive,
  parseArchive,
  download,
  recovery,
  androidBlockers,
  references,
  type Workspace,
  type Node,
  storageAccountKey,
  syncOperation,
} from "./data";
import { OutlineView } from "./OutlineView";
import { OutlinePopover, OutlineSidebar } from "./OutlineChrome";
import { StudyDesk } from "./StudyDesk";
import { imageType, mediaLink } from "./media.mjs";
import { EmojiProvider } from './AnimatedEmoji';
import {BulletMenuBody} from './BulletMenuBody';
import {useEmojiAssetRepair} from './useEmojiAssetRepair';
import { EmojiPicker } from './EmojiPicker';
import {WorkdayMarker,WorkMode} from './WorkMode';
import {workdaysV2} from './workdays-v2.mjs';
import {workdays,validateWorkdays} from './workdays.mjs';
import { decodeAnimation, insertEmoji } from './emoji.mjs';
import { downloadCatalogEmoji, getCatalogEmoji, isCatalogEmoji, catalogAssetPaths } from './emoji-catalog.mjs';
import {cachedEmojiPreview} from './emoji-preview-cache.mjs';
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
const Bookmarks=React.lazy(()=>import('./Bookmarks').then(module=>({default:module.Bookmarks})));
const ReaderBookNotes = React.lazy(()=>import('./ReaderBookNotes').then(module=>({default:module.ReaderBookNotes})));
const AiAssist = React.lazy(()=>import('./AiAssist'));
const AiDraftList = React.lazy(()=>import('./AiAssist').then(m=>({default:m.AiDraftList})));
const BookReader = React.lazy(()=>import('./BookReader').then(module=>({default:module.BookReader})));
const Bookshelf = React.lazy(()=>import('./Bookshelf').then(module=>({default:module.Bookshelf})));
const Dashboard = React.lazy(()=>import('./Dashboard').then(module=>({default:module.Dashboard})));
const MindmapView = React.lazy(()=>import('./MindmapView').then(module=>({default:module.MindmapView})));
let recoveryDraft: () => { doc: Workspace | null; assets: Map<string, Blob> } = () => ({ doc: null, assets: new Map() });
async function downloadRecovery() {
  const draft = recoveryDraft();
  const doc = draft.doc || await load();
  if (!doc) throw new Error("No workspace is available yet. Reload to retry loading.");
  const assets = draft.doc ? draft.assets : await getAssets();
  download(await archive(doc, assets, false), "RemoNook-recovery.remo.zip");
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
    const active = document.activeElement as HTMLElement | null;
    const previous = !active || active===document.body || active.closest("[data-command-palette]") ? document.querySelector<HTMLElement>('.topbar [aria-label="Commands & notes"]') : active;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEntranceMotion(ref, true, { kind: "dialog", active:className!=="shortcuts-dialog" });
  return (
    <dialog
      ref={ref}
      aria-label={title}
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
const DiagramEditor=React.lazy(()=>import('./DiagramEditor').then(m=>({default:m.DiagramEditor})));
const DrawingEditor=React.lazy(()=>import('./DrawingEditor').then(m=>({default:m.DrawingEditor})));
export function App({cloudUser=null}: {cloudUser?:User|null} = {}) {
  const research=useResearchDrafts(storageAccountKey());
  const [researchTarget,setResearchTarget]=useState<string|null>(null);
  const researchBusy=useRef(false),researchOrigin=useRef<HTMLElement|null>(null);
  const [readerTarget,setReaderTarget]=useState<{hash:string;unit?:number;id?:string}|null>(null);
  const readerOrigin=useRef<HTMLElement|null>(null);
  const closeReader=React.useCallback(()=>{if(viewTimer.current)publishView(true);setReaderTarget(null);requestAnimationFrame(()=>{const element=readerOrigin.current?.isConnected?readerOrigin.current:document.querySelector<HTMLElement>('.topbar button');element?.focus();});},[]);
  const readerOpenHandler=useRef<(hash:string,unit?:number,id?:string)=>void>(()=>{});
  const openReader=React.useCallback((hash:string,unit?:number,id?:string)=>readerOpenHandler.current(hash,unit,id),[]);
  const views=useWorkspacePanes();
  const {scope,setScope,search,setSearch}=views;
  const [occlusionImage,setOcclusionImage]=useState<string|null>(null);
  const [diagramTarget,setDiagramTarget]=useState<DiagramTarget|null>(null),[drawingTarget,setDrawingTarget]=useState<{id:string;mediaId?:string;account:string}|null>(null);
  useEffect(()=>{setDiagramTarget(null);setDrawingTarget(null);},[cloudUser?.uid]);
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
    [editing, setEditingState] = useState<string | null>(null),
    [caret, setCaret] = useState<number | null>(null),
    [tab, setTab] = useState("notes"),
    [bookmarkTarget,setBookmarkTarget]=useState<{id:string;highlight?:string;snapshotHash?:string}|null>(null),
    [mindmapTarget,setMindmapTarget]=useState<string|null>(null),
    [calendarDate, setCalendarDate] = useState(() => getLocalDateString()),
    [connectionTarget,setConnectionTarget]=useState<{mode:string;id:string;start:number;end:number}|null>(null),
    [nodeDate,setNodeDate]=useState<{id:string;date:string}|null>(null),
    [reminderEditor,setReminderEditor]=useState<ReminderTarget|null>(null),
    [workdaysOpen,setWorkdaysOpen]=useState(false),
    [remindersVisible,setRemindersVisible]=useState(true),
    [deviceStatus] = useState(()=>createUiSignal("Loading")),
    [error, setError] = useState<string | null>(null),
    [fatal, setFatal] = useState(false),
    failed = useRef(false),
    cloudApplying = useRef(false),
    [dialog, setDialog] = useState<string | null>(null),
    [settingsPanel,setSettingsPanel] = useState("appearance"),
    // On a phone, Settings opens as a list of sections; a section then fills the screen.
    [settingsList,setSettingsList] = useState(true),
    [mcqEditing, setMcqEditing] = useState<string | null>(null),
    [bulkMcqEditing, setBulkMcqEditing] = useState<string | null>(null),
    [menu, setMenu] = useState<string | null>(null),
    menuAnchor = useRef<HTMLElement | null>(null),
    menuSelection = useRef<string[]>([]),
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
  const setStatus=deviceStatus.set;
  const viewTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cancelView=()=>{if(viewTimer.current)clearTimeout(viewTimer.current);viewTimer.current=null;};
  const publishView=(immediate=false)=>{cancelView();if(!docRef.current)return;const publish=()=>{setDoc(docRef.current);setHistoryTick(t=>t+1);};if(immediate)publish();else startTransition(publish);};
  const setEditing=(value:string|null)=>{if(viewTimer.current)publishView(true);setEditingState(value);};
  const queueView=()=>{cancelView();viewTimer.current=setTimeout(()=>publishView(),220);};
  useEffect(()=>()=>{if(viewTimer.current)clearTimeout(viewTimer.current);},[]);
  // Keep the active mobile destination visible by scrolling only the bottom bar, never the page.
  useEffect(()=>{
    const nav=document.querySelector<HTMLElement>('.mobile-nav');
    const active=nav?.querySelector<HTMLElement>('.nav-active');
    if(!nav||!active||nav.scrollWidth<=nav.clientWidth)return;
    const left=active.offsetLeft,right=left+active.offsetWidth;
    if(left>=nav.scrollLeft&&right<=nav.scrollLeft+nav.clientWidth)return;
    nav.scrollTo({left:left<nav.scrollLeft?left:right-nav.clientWidth,behavior:'smooth'});
  },[tab]);
  // While an article is open the sidebar steps aside without changing the saved preference.
  const [readerFocus,setReaderFocus]=useState(false),sidebarShown=sidebarOpen&&!(readerFocus&&tab==="bookmarks");
  const sidebarMotion=useSidebarMotion(sidebarShown);
  recoveryDraft = () => ({ doc: docRef.current, assets });
  useEffect(() => {
    (async () => {
      try {
        // Desktop: a folder workspace opens the folder's version when it was changed elsewhere.
        const folderWorkspace = activeLocalWorkspace();
        if (isDesktop() && folderWorkspace?.folder) {
          try { await importFromFolder(folderWorkspace, workspaceStorageName(folderWorkspace)); }
          catch (e) { setError(`Could not read the folder “${folderWorkspace.folder}”: ${e instanceof Error ? e.message : String(e)} This workspace opens from the app's own copy.`); }
        }
        const [stored, a] = await Promise.all([load(), getAssets()]);
        let initial = stored;
        // Signed-in accounts and device-only workspaces start empty; the guest workspace gets the sample notes.
        if (!initial) initial = await save(null, cloudUser || activeLocalWorkspace() ? empty() : sample(), "initialize");
        if (activeLocalWorkspace()) void protectDeviceStorage();
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
    sidebarMotion.capture();
    if (readerFocus && tab === "bookmarks" && sidebarOpen) {
      setReaderFocus(false);
      return;
    }
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
          if(!viewTimer.current)setDoc(next);
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
  // How sync (cloud, or local sync between devices) reads and updates the open workspace.
  const syncHost = {onNotice:setNotice,revision:doc?.revision,ready:!!doc&&!failed.current,
    get:()=>({doc:docRef.current,assets:assetsRef.current}),flush,
    canApply:()=>!dirty.current&&!activeEditor?.view.composing&&!document.querySelector('[data-composing="true"],[data-article-note]:focus,[data-article-editing="true"],.calendar-draft:focus,.mind-input:focus')&&!working&&!failed.current&&!cloudApplying.current,
    selection:()=>editing&&activeEditor?.isFocused?{id:editing,anchor:Math.max(0,activeEditor.state.selection.anchor-1),head:Math.max(0,activeEditor.state.selection.head-1)}:null,
    apply:async(remote:Workspace,remoteAssets:Map<string,Blob>,sync?:{state?:string;selection?:any})=>{
      if(dirty.current||activeEditor?.view.composing||document.querySelector('[data-composing="true"],[data-article-note]:focus,[data-article-editing="true"],.calendar-draft:focus,.mind-input:focus')||working||failed.current||cloudApplying.current)throw Object.assign(Error('Waiting for this edit to save.'),{deferred:true});
      validate(remote.tables.bullets);validateWorkdays(remote.web.workdays);
      const previous=docRef.current!;
      const incoming={...restoreDeviceState(remote,previous),revision:previous.revision+1} as Workspace;
      // Publish the incoming view synchronously so typing during the IndexedDB
      // transaction builds on it. Later edits queue behind the durable adoption.
      cloudApplying.current=true;
      docRef.current=incoming;assetsRef.current=remoteAssets;pendingAssets.current.clear();history.current=historyAfterSync(history.current,previous,incoming);
      if(editing&&activeEditor&&!activeEditor.isDestroyed){
        const node=incoming.tables.bullets.find(n=>n.id===editing);
        if(node){activeEditor.chain().setContent(toEditor(node as Node),{emitUpdate:false}).setMeta('addToHistory',false).run();
          const sel=sync?.selection;if(sel?.id===editing)activeEditor.commands.setTextSelection({from:Math.min(sel.anchor+1,activeEditor.state.doc.content.size-1),to:Math.min(sel.head+1,activeEditor.state.doc.content.size-1)});
        }else{activeEditor.commands.blur();setEditing(null);}
      }
      setDoc(incoming);setAssets(remoteAssets);
      const applying=chain.current.then(async()=>{
        const next=await save(persisted.current,incoming,'cloud download',remoteAssets,true,[],sync?.state);
        persisted.current=next;
        if(docRef.current===incoming){docRef.current=next;setDoc(next);if(!dirty.current)setStatus('Saved on this device');}
      });
      chain.current=applying.catch(e=>{failed.current=true;dirty.current=true;setStatus('Changes not saved');showError(e);});
      try{await applying;}finally{cloudApplying.current=false;}
    }
  };
  const cloud = useCloudSync({...syncHost,user:cloudUser});
  useLocalSync(syncHost);
  useEffect(()=>{const open=(e:Event)=>{const panel=(e as CustomEvent).detail;if(typeof panel==='string')setSettingsPanel(panel);setSettingsList(false);setDialog('settings');};window.addEventListener('remo-open-settings',open);return()=>window.removeEventListener('remo-open-settings',open);},[]);
  useEffect(()=>setAccountTransitionHandler(async()=>{await flush();if(failed.current)throw Error('Export your unsaved changes before reloading to change accounts.');}));
  const accountAction = async(signOut=false)=>{try{await flush();if(failed.current)throw Error('Save or export your changes before changing accounts.');if(signOut)await googleSignOut();else await openAccountSignIn();}catch(e){showError(e);}};
  const commit = (next: Workspace, group?: string, record = true, immediate = true) => {
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
      if(immediate)setHistoryTick((x) => x + 1);
    }
    docRef.current = next;
    if(immediate){cancelView();setDoc(next);}else queueView();
    dirty.current = true;
    setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 180);
  };
  useDesktop({ready:!!doc&&!failed.current,getDoc:()=>docRef.current,commit:next=>commit(next),flush,onError:message=>setError(message||null),onNotice:setNotice});
  useEmojiAssetRepair({emojis:doc?.tables.emojis||[],assets,ready:!!doc&&!failed.current,store:async(item,recovered)=>{
    const current=docRef.current;
    if(!current||failed.current||!current.tables.emojis.some(e=>e.token===item.token))return;
    const nextAssets=new Map(assetsRef.current),added=new Map<string,Blob>();
    for(const [path,blob]of recovered)if(!nextAssets.has(path)){nextAssets.set(path,blob);added.set(path,blob);}
    if(!added.size)return;
    try{checkAttachmentBudget(nextAssets);}catch(e){showError(e);throw e;}
    for(const [path,blob]of added)pendingAssets.current.set(path,blob);
    assetsRef.current=nextAssets;setAssets(nextAssets);
    // Save recovered files through the ordinary durable outbox, without editing
    // note text or creating an outline undo step.
    commit({...current},undefined,false);await flush();
  }});
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
  const changeBulletContent=(id:string,value:{text:string;formatting:string},immediate=true)=>{
    try{const current=docRef.current!,next=updateBulletContent(current,id,value);if(next!==current)commit(next,id,true,immediate);}catch(e){showError(e);}
  };
  // Publish to the authoritative model immediately; only passive React views wait
  // for a typing pause. Saving and structural commands always read docRef.
  const changeEditorContent=(id:string,value:{text:string;formatting:string})=>changeBulletContent(id,value,false);
  const [emptyTrashIds,setEmptyTrashIds]=React.useState<string[]>([]);
  const calendarToday=useReminderClock();
  const [notesFilter,setNotesFilter]=useState('all');
  const [tablePicker,setTablePicker]=useState<string|null>(null);
  const [tagEditor,setTagEditor]=useState<string|null>(null);
  const tagSettings=React.useMemo(()=>sanitizeTagSettings(doc?.web?.tags),[doc?.web?.tags]);
  setTagRegistry(tagSettings);
  const saveTagSetting=(key:string,patch:Record<string,any>)=>{
    const current=docRef.current!,all={...(current.web.tags&&typeof current.web.tags==='object'?current.web.tags:{})},merged:Record<string,any>={...(all[key]||{}),...patch};
    for(const k of Object.keys(merged))if(merged[k]===null||merged[k]===undefined||merged[k]==='')delete merged[k];
    if(Object.keys(merged).length)all[key]=merged;else delete all[key];
    commit({...current,web:{...current.web,tags:all}});
  };
  /** Renames, merges or (to=null) removes a tag in every bullet, carrying its settings, as one undo step. */
  const renameTag=(from:string,to:string|null)=>{
    try{
      const current=docRef.current!,result=renameTagInNodes(current.tables.bullets,from,to,markRanges,encodeMarks),tags=renameTagSettings(current.web.tags||{},from,to);
      commit(withNodes({...current,web:{...current.web,tags}},result.nodes));
      const active=isTagQuery(search)?tagKey(search.trim()):null,f=tagKey(from);
      if(active&&(active===f||active.startsWith(f+'/')))setSearch(to===null?'':'#'+to.replace(/^#/,'')+active.slice(f.length));
      setNotice(to===null?`Removed #${f} from ${result.changed} bullet${result.changed===1?'':'s'}.`:`Updated ${result.changed} bullet${result.changed===1?'':'s'} to #${to.replace(/^#/,'')}.`);
    }catch(e){showError(e);}
  };
  // When a bullet stops being edited: #today/#tomorrow become its date, #review makes it a flashcard.
  const lastEdited=useRef<string|null>(null);
  useEffect(()=>{
    const previous=lastEdited.current;lastEdited.current=editing;
    if(!previous||previous===editing||!docRef.current)return;
    const n=(docRef.current.tables.bullets as Node[]).find(x=>x.id===previous);
    if(!n||n.codeLanguage||n.mirrorSourceId||!n.text.includes('#'))return;
    const dated=resolveDateTags(n,getLocalDateString(),markRanges,encodeMarks),review=n.kind==='NOTE'&&hasTag(dated?.text??n.text,'review');
    if(!dated&&!review)return;
    mutate(ns=>ns.map(x=>x.id===previous?{...x,...(dated||{}),...(review?{kind:'QUESTION'}:{})}:x));
    if(dated)setNotice(`Dated ${dated.dueDate}.`);else setNotice('Added to Study Desk as a flashcard (#review).');
  },[editing]);
  const insertTable=(id:string,grid:string[][])=>{
    const text=tableText(grid,{header:true});
    mutate(ns=>{const n=ns.find(n=>n.id===id);if(!n)return ns;return n.text.trim()?[...ns.map(x=>x.id===id?{...x,collapsed:false}:x),bullet(crypto.randomUUID(),{parentId:id,position:ns.filter(x=>x.parentId===id).length,text})]:ns.map(x=>x.id===id?{...x,text,formatting:'',codeLanguage:'',blockStyle:'paragraph'}:x);});
    setTablePicker(null);
  };
  const [viewHint,setViewHint]=useState<{view:SwipeView;at:number}|null>(null);
  useEffect(()=>{if(!viewHint)return;const t=setTimeout(()=>setViewHint(null),1400);return()=>clearTimeout(t);},[viewHint?.at]);
  const swipeTo=async(view:SwipeView)=>{
    try{await flush();if(failed.current)throw Error('Saving needs attention before changing views.');}catch(e){showError(e);return;}
    setEditing(null);setSearch('');if(view==='mindmap')setMindmapTarget(null);setTab(view);setViewHint({view,at:Date.now()});
  };
  useViewSwipe(tab,()=>tab==='notes'||tab==='study'||(tab==='mindmap'&&!!document.querySelector('.mindmap-library'))||(tab==='bookmarks'&&!!document.querySelector('.bookmark-library'))||(tab==='bookshelf'&&!document.querySelector('.book-reader')),view=>void swipeTo(view));
  const notesCatalog=React.useMemo(()=>doc&&tab==='notes'?noteCatalog(doc):null,[tab,doc?.tables.bullets,doc?.tables.decks,doc?.web.mcqs,doc?.web.bookmarkNoteRoots,doc?.web.readingNoteRoots]);
  const notesFilterCounts=React.useMemo(()=>notesCatalog?.counts(views.active.global&&views.active.search?null:views.active.scope)||{},[notesCatalog,views.active.scope,views.active.global,views.active.search]) as Record<string,number>;
  const notesFilterRoots=React.useMemo(()=>notesCatalog?Object.fromEntries(views.panes.map(pane=>[pane.id,notesCatalog.roots(notesFilter,pane.global&&pane.search?null:pane.scope)||[]])):null,[notesCatalog,notesFilter,views.panes]) as Record<string,string[]>|null;
  const calendarWorkdays=React.useMemo(()=>workdaysV2(doc||{web:{}}),[doc?.web.workdays]);
  const readCurrentNode=(id:string)=>docRef.current?.tables.bullets.find(n=>n.id===id) as Node|undefined;
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
    commit(withNodes(outlineUndoState(current,next),next.tables.bullets as Node[]),undefined,false);
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
  const openBulletMenu = (id: string, anchor?: HTMLElement, selectedIds?: string[]) => {
    if(viewTimer.current)publishView(true);
    menuAnchor.current = anchor || [...document.querySelectorAll<HTMLElement>("[data-node-id]")].find(el => el.dataset.nodeId === id) || null;
    menuSelection.current = selectedIds?.includes(id) ? selectedIds : [id];
    setViewMenu(false);
    setMenu(id);
  };
  const openAi=async(id:string,mode:'general'|'web'='general')=>{
    if(!research.state)return;const selected=menuSelection.current.includes(id)?[...menuSelection.current]:[];try{
      await flush();if(failed.current)throw Error('Save your notes before opening AI assist.');const current=docRef.current!,context=aiContext(current.tables.bullets,id,selected),node=current.tables.bullets.find(n=>n.id===context.id);
      researchOrigin.current=menuAnchor.current;setMenu(null);setEditing(null);
      const prior=research.state.drafts[context.id];
      if(!prior?.ai)await research.put({id:context.id,query:node?.text||'',answer:prior?.answer||'',updatedAt:Date.now(),ai:{operation:'answer',mode,context:context.context,sourceIds:context.sourceIds,selectionIds:selected,sourceTexts:context.sourceIds.map(id=>current.tables.bullets.find(n=>n.id===id)?.text||''),complete:false}},context.id);
      setResearchTarget(context.id);
    }catch(e){showError(e);}
  };
  const openReaderAi=async(book:any,selection:any,fingerprint:string)=>{
    const id='reader-'+fingerprint;try{if(!research.state)throw Error('Drafts are still loading.');
      if(!research.state.drafts[id])await research.put({id,query:'Explain this passage',answer:'',updatedAt:Date.now(),ai:{operation:'explain',mode:'general',context:selection.quote,sourceIds:[],sourceTexts:[],complete:false,reader:{hash:book.hash,selection,fingerprint}}},id);
      closeReader();setResearchTarget(id);
    }catch(e){showError(e);}
  };
  const insertAiDraft=async(draft:ResearchDraft,acknowledgedContext:string)=>{
    if(researchBusy.current)return;researchBusy.current=true;const account=storageAccountKey();
    try{if(failed.current)throw Error('Saving is paused. Your draft is kept.');
      const insertion=draft.insertedId||crypto.randomUUID(),saved={...draft,insertedId:insertion};await research.put(saved,draft.id);
      if(account!==storageAccountKey())throw Error('Your account changed. Reopen the draft in its original account.');
      if(failed.current)throw Error('Saving is paused. Your draft is kept.');
      const current=docRef.current!;if(!draft.ai?.reader&&aiContext(current.tables.bullets,draft.ai!.sourceIds[0],draft.ai!.selectionIds||[]).context!==acknowledgedContext)throw Error('The source changed again. Review the context before adding.');const next=insertAi(current,saved);if(next!==current)commit(withNodes(next,next.tables.bullets as Node[]));
      await flush();if(account!==storageAccountKey())throw Error('Your account changed. The draft is kept in its original account.');if(failed.current||!persisted.current?.tables.bullets.some(n=>n.id===insertion))throw Error('Your insertion could not be saved. The draft is kept; retry saving.');
      await research.put(null,draft.id);setResearchTarget(null);navigateAiResult(insertion);setNotice('Added to your notes. Undo restores the previous outline.');
    }finally{researchBusy.current=false;}
  };
  const navigateAiResult=(id:string)=>{setTab('notes');setSearch('');setScope(docRef.current!.tables.bullets.find(n=>n.id===id)?.parentId||null);setEditing(id);setCaret(null);};
  const closeResearch=()=>{setResearchTarget(null);requestAnimationFrame(()=>{if(researchOrigin.current?.isConnected)researchOrigin.current.focus();});};
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
      if (current.tables.emojis.filter(item => !isCatalogEmoji(item)).length + added.length > 500) throw Error('This workspace supports up to 500 custom emojis. Google and Microsoft catalog emojis do not use this allowance.');
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
    const target = emojiTarget.current, { id, start, end } = target, known = getCatalogEmoji(item.token), controller = new AbortController();
    const originalText = docRef.current!.tables.bullets.find(n => n.id === id)?.text;
    const insertionEditor = editor.current;
    emojiDownload.current = controller;
    const added = new Map<string, Blob>();
    try {
      let record = docRef.current!.tables.emojis.find(e => e.token === item.token);
      if (known) {
        if (catalogAssetPaths(known).some(path => !assetsRef.current.has(path))) {
          setWorking(true);
          for (const [path, blob] of cachedEmojiPreview(known.token) || await downloadCatalogEmoji(known, controller.signal)) added.set(path, blob);
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
      } else if (!inline) setEditing(null);
      setDialog(null); setNotice('Animated emoji inserted and saved for offline use. Undo removes it.');
    } finally { if (emojiDownload.current === controller) { emojiDownload.current = null; setWorking(false); } }
  };
  const toggleStar = (id: string) => {
    const current = docRef.current!,
      starred: string[] = Array.isArray(current.web.starredNodes) ? current.web.starredNodes : [];
    commit({ ...current, web: { ...current.web, starredNodes: starred.includes(id) ? starred.filter(value => value !== id) : [...starred, id] } });
  };
  const toggleSearchStar = () => {
    const current = docRef.current!,
      saved: string[] = Array.isArray(current.web.starredSearches) ? current.web.starredSearches : [];
    if (!search.trim()) return;
    commit({ ...current, web: { ...current.web, starredSearches: saved.includes(search.trim()) ? saved.filter(value => value !== search.trim()) : [...saved, search.trim()] } });
  };
  const add = (customParent?: any) => {
    const mirrorParent=typeof customParent==="string"?docRef.current!.tables.bullets.find(n=>n.id===customParent):null;
    const mirrorContext=mirrorParent?.mirrorRootId||docRef.current!.tables.bullets.find(n=>n.id===editing)?.mirrorRootId;
    const parentId = typeof customParent === "string" || customParent === null ? customParent : undefined;
    const id = crypto.randomUUID();
    mutate((ns) => {
      const idx = index(ns),
        displayNode=idx.byId.get(editing),
        n = displayNode?.mirrorSourceId&&displayNode.mirrorRootId!==displayNode.id?idx.byId.get(displayNode.mirrorSourceId):displayNode,
        parent = parentId !== undefined ? (typeof parentId==="string"?sourceId(ns,parentId):parentId) : (n ? n.parentId : scope),
        at = n && parentId === undefined
          ? (idx.children.get(parent) || []).findIndex(
              (b: Node) => b.id === n.id,
            ) + 1
          : (idx.children.get(parent) || []).length;
      return move([...ns, bullet(id)], id, parent, at);
    });
    focus(mirrorContext?(docRef.current!.tables.bullets.find(n=>n.mirrorRootId===mirrorContext&&n.mirrorSourceId===id)?.id||id):id, 0);
  };
  const addCalendarBullet = (date: string, text = "", edit = true) => {
    const bulletId = crypto.randomUUID();
    mutate((ns) => {
      const { nodes: updatedNodes, dayId } = ensureCalendarHierarchy(ns, date);
      const child = bullet(bulletId, {
        parentId: dayId,
        text,
      });
      return move([...updatedNodes, child], bulletId, dayId, (index(updatedNodes).children.get(dayId) || []).length);
    });
    if(edit)focus(bulletId, text.length);
    return bulletId;
  };
  const openCalendarDate = (date:string) => {setCalendarDate(date);setEditing(null);};
  const remove = (id: string) => {
    removeMultiple([id]);
  };
  const removeMultiple = (idsToDelete: string[]) => {
    try {
      if (!idsToDelete.length) return;
      idsToDelete=idsToDelete.map(id=>{const n=docRef.current!.tables.bullets.find(n=>n.id===id);return n?.mirrorSourceId&&n.mirrorRootId!==id?n.mirrorSourceId:id;});
      const current = docRef.current!,
        ns = current.tables.bullets as Node[];
      const allIds = new Set<string>();
      for (const id of idsToDelete) {
        for (const d of descendants(ns, id)) {
          allIds.add(d);
        }
      }
      if (allIds.size === 0) return;
      const firstRoot = ns.find((n) => idsToDelete.includes(n.id));
      const entryTitle =
        idsToDelete.length === 1 && firstRoot
          ? firstRoot.text || "Empty bullet"
          : `${idsToDelete.length} bullets`;
      const entry = {
        id: crypto.randomUUID(),
        title: entryTitle,
        deletedAt: Date.now(),
        nodeCount: allIds.size,
        payload: JSON.stringify({
          nodes: ns.filter((n) => allIds.has(n.id)),
          media: current.tables.media.filter((m) => allIds.has(m.bulletId)),
          decks: current.tables.decks.filter((d) => allIds.has(d.rootId)),
        }),
      };
      const next = withNodes(
        current,
        ns.filter((n) => !allIds.has(n.id)),
      );
      next.tables.trash = [...current.tables.trash, entry];
      commit(next);
      if (editing && !next.tables.bullets.some(n=>n.id===editing)) setEditing(null);
      if (scope && !next.tables.bullets.some(n=>n.id===scope)) {
        const root = ns.find((n) => n.id === scope);
        setScope(root?.parentId || null);
      }
      setMenu(null);
      setNotice(
        idsToDelete.length === 1
          ? "Branch moved to Trash"
          : `${idsToDelete.length} bullets moved to Trash`,
      );
    } catch (e) {
      showError(e);
    }
  };
  const restoreBranch = (id: string) => {
    try {
      const current = docRef.current!,
        entry = current.tables.trash.find((t) => t.id === id)!,
        p = JSON.parse(entry.payload),
        ids = new Set(p.nodes.map((n: Node) => n.id)),
        ns = current.tables.bullets as Node[],
        existing = new Set(ns.map((n) => n.id));
      if (p.nodes.some((n: Node) => existing.has(n.id)))
        throw Error("This branch already exists in Notes");
      const incoming = p.nodes.map((n: Node) => ({
        ...n,
        parentId:
          ids.has(n.parentId) || existing.has(n.parentId || "")
            ? n.parentId
            : null,
      }));
      let combined = [...ns, ...incoming];
      const groups = new Map<any, Node[]>();
      for (const n of incoming.filter((n: Node) => !ids.has(n.parentId))) {
        const a = groups.get(n.parentId) || [];
        a.push(n);
        groups.set(n.parentId, a);
      }
      for (const [parent, added] of groups) {
        const old = (index(ns).children.get(parent) || []).slice(),
          sorted = added.sort((a, b) => a.position - b.position),
          ordered: Node[] = [];
        let i = 0,
          j = 0;
        while (i < old.length || j < sorted.length)
          ordered.push(
            j < sorted.length &&
              (i === old.length || sorted[j].position <= ordered.length)
              ? sorted[j++]
              : old[i++],
          );
        const changes = new Map(
          ordered.map((n, pos) => [n.id, { ...n, position: pos }]),
        );
        combined = combined.map((n) => changes.get(n.id) || n);
      }
      const next = withNodes(
        {
          ...current,
          web:{...current.web,deckFolders:{...current.web.deckFolders,...p.studyDeckFolders}},
          tables: {
            ...current.tables,
            media: [...current.tables.media, ...p.media],
            decks: [...current.tables.decks, ...p.decks],
            trash: current.tables.trash.filter((t) => t.id !== id),
          },
        },
        combined,
      );
      commit(next);
      setNotice("Branch restored with its original IDs");
    } catch (e) {
      showError(e);
    }
  };
  const mirrorHere = (at:string,source:string) => {
    try {const result=createMirror(docRef.current!.tables.bullets,at,source);mutate(()=>result.nodes);focus(result.id);setConnectionTarget(null);setMenu(null);setNotice('Mirror created. Edits update every location.');}catch(error){showError(error);}
  };
  const bulletTargets = (id: string, selectedIds?: string[]) => new Set((selectedIds?.includes(id) ? selectedIds : menu === id ? menuSelection.current : [id]).map(target => sourceId(docRef.current!.tables.bullets, target)));
  const command = (action: string, id: string, start: number, end: number, selectedIds?: string[]) => {
    const targets = bulletTargets(id, selectedIds);
    if (action.startsWith('list:')) {
      const listType = action.slice(5);
      if (['NONE','UNORDERED','ORDERED'].includes(listType)) mutate(ns => ns.map(node => targets.has(node.id) ? {...node,listType} : node));
      return;
    }
    if (action.startsWith('kind:')) {
      const kind = action.slice(5);
      if (['NOTE','QUESTION','ANSWER'].includes(kind)) mutate(ns => ns.map(node => targets.has(node.id) ? {...node,kind,autoHighlight:false} : node));
      return;
    }
    if (action === 'task:toggle') {
      mutate(ns => {
        const selected = ns.filter(n => targets.has(n.id));
        const allTasks = selected.length > 0 && selected.every(n => n.taskState === 'TODO' || n.taskState === 'DONE');
        return ns.map(n => targets.has(n.id) ? { ...n, taskState: allTasks ? 'NONE' : 'TODO' } : n);
      });
      return;
    }
    if(action==='action:diagram'){openDiagram({id});return;}
    if(action==='action:drawing'){openDrawing(id);return;}
    if(action==='action:pane'){openPane(id);return;}
    if(action==='action:countdown'){const n=docRef.current!.tables.bullets.find(n=>n.id===id);setReminderEditor({date:n?.dueDate||getLocalDateString(),kind:'target',title:n?.text.slice(0,160)||''});return;}
    if(action==='action:date'){const n=docRef.current!.tables.bullets.find(n=>n.id===id);setNodeDate({id,date:n?.dueDate||getLocalDateString()});setMenu(null);return;}
    if(action==='action:music'){const current=docRef.current!;commit({...current,web:{...current.web,musicNodes:{...current.web.musicNodes,[id]:!current.web.musicNodes?.[id]}}});setMenu(null);setEditing(null);return;}
    if(action==='action:gallery'){const current=docRef.current!;commit({...current,web:{...current.web,galleryNodes:{...current.web.galleryNodes,[id]:!current.web.galleryNodes?.[id]}}});setMenu(null);setEditing(null);return;}
    if(action==='action:mindmap'){const n=docRef.current!.tables.bullets.find(n=>n.id===id);mutate(ns=>ns.map(x=>x.id===id?{...x,mindmap:!x.mindmap}:x));setMenu(null);setNotice(n?.mindmap?'Mindmap removed.':'Mindmap created. Open it from the Mindmap tab or its icon.');return;}
    if(action==='action:table'){setTablePicker(id);setEditing(null);setMenu(null);return;}
    if(action==='action:image'){mediaTarget.current=id;imageInput.current?.click();return;}
    if(action==='action:complete'){command('complete',id,start,end);return;}
    if(action.startsWith('relation:')){setConnectionTarget({mode:action.slice(9),id,start,end});setMenu(null);return;}
    const actual=docRef.current!.tables.bullets.find(n=>n.id===id) as Node|undefined,instance=(actual?{...actual,collapsed:views.active.collapsed[id]??actual.collapsed}:actual) as Node|undefined,mirrorRoot=instance?.mirrorRootId;
    const commandFocus=(target:string,pos:number|null=null)=>{
      const all=docRef.current!.tables.bullets,local=mirrorRoot?all.find(n=>n.mirrorRootId===mirrorRoot&&n.mirrorSourceId===target):null;
      if(mirrorRoot&&!local&&!rows(all,tab==='calendar'?`journal-${calendarDate}`:scope).some((r:any)=>r.bullet.id===target)){
        setTab('notes');setScope(all.find(n=>n.id===target)?.parentId||null);setSearch('');
      }
      focus(local?.id||target,pos);
    };
    if(action==='action:divider'){
      const current = docRef.current!.tables.bullets as Node[], n = index(current).byId.get(id);
      if(!n) return;
      const at = (index(current).children.get(n.parentId) || []).findIndex((item: Node) => item.id === id);
      const dividerId = n.text || n.codeLanguage ? crypto.randomUUID() : id, nextId = crypto.randomUUID();
      mutate(ns => {
        const divided = dividerId === id ? ns.map(node => node.id === id ? { ...node, blockStyle: 'divider', listType: 'NONE', taskState: 'NONE', kind: 'NOTE' } : node) : move([...ns, bullet(dividerId, { blockStyle: 'divider' })], dividerId, n.parentId, at + 1);
        return move([...divided, bullet(nextId)], nextId, n.parentId, at + (dividerId === id ? 1 : 2));
      });
      commandFocus(dividerId === id ? dividerId : nextId, 0);
      return;
    }
    if(instance?.mirrorSourceId&&!['toggleCollapse','expandBranch','collapseBranch','zoomIn','zoomOut','stop','undo','redo','previous','next','moveUp','moveDown'].includes(action)){
      if(instance.id===mirrorRoot&&['merge','indent','outdent'].includes(action)&&!selectedIds){setNotice('Open the mirror source to change its parent or merge its root.');return;}
      const rootSplitHere=action==='enter'&&instance.id===mirrorRoot&&!(start===instance.text.length&&start===end&&!instance.collapsed&&(index(docRef.current!.tables.bullets).children.get(instance.id)||[]).length);
      if(!rootSplitHere)id=instance.mirrorSourceId;
    }

    const outlineScope = tab === "calendar" ? `journal-${calendarDate}` : scope;
    if (
      ["enter", "merge"].includes(action) &&
      unsupportedFormatting(
        docRef.current!.tables.bullets.find((n) => n.id === id) as Node,
      )
    ) {
      showError(
        Error(
          "This bullet contains unsupported formatting. Split/merge is paused to preserve it.",
        ),
      );
      return;
    }
    if (action.startsWith("dividerStyle:")) {
      const style = action.slice("dividerStyle:".length);
      mutate(ns => ns.map(n => n.id === id ? { ...n, dividerStyle: style } : n));
      return;
    }
    if (action.startsWith("dividerColor:")) {
      const color = action.slice("dividerColor:".length);
      mutate(ns => ns.map(n => n.id === id ? { ...n, dividerColor: color } : n));
      return;
    }
    if (action === "deleteDivider") {
      const current = docRef.current!,
        ns = current.tables.bullets as Node[],
        rs = rows(ns, outlineScope),
        at = rs.findIndex((r: any) => r.bullet.id === id);
      if (at < 0) return;
      const targetBullet = at > 0 ? rs[at - 1].bullet : rs[1]?.bullet;
      if (targetBullet) {
        const children = index(ns).children.get(id) || [];
        const parentId = at > 0 ? rs[at - 1].bullet.parentId : (rs[1]?.bullet.parentId ?? null);
        let nextNodes = ns.filter(node => node.id !== id);
        for (const child of children) {
          nextNodes = move(nextNodes, child.id, parentId, (index(nextNodes).children.get(parentId) || []).length);
        }
        commit(withNodes(current, nextNodes));
        commandFocus(targetBullet.id, at > 0 ? targetBullet.text.length : 0);
      } else {
        const nextNodes = ns.map(node => node.id === id ? { ...node, blockStyle: 'paragraph', text: '', formatting: '', dividerStyle: undefined, dividerColor: undefined } : node);
        commit(withNodes(current, nextNodes));
        commandFocus(id, 0);
      }
      return;
    }
    if (action.startsWith("block:") || action.startsWith("language:")) {
      const type = action.split(":")[1];
      if (action === "block:mcq") { setMcqEditing(id); return; }
      if (type === 'divider') {
        const current = docRef.current!.tables.bullets as Node[], n = index(current).byId.get(id);
        if (!n) return;
        const at = (index(current).children.get(n.parentId) || []).findIndex((item: Node) => item.id === id);
        if (!n.text && !n.codeLanguage) {
          const nextId = crypto.randomUUID();
          mutate(ns => {
            const divided = ns.map(node => node.id === id ? { ...node, blockStyle: 'divider', listType: 'NONE', taskState: 'NONE', kind: 'NOTE' } : node);
            return move([...divided, bullet(nextId)], nextId, n.parentId, at + 1);
          });
          commandFocus(id, 0);
        } else {
          mutate(ns => ns.map(node => node.id === id ? { ...node, blockStyle: 'divider', listType: 'NONE', taskState: 'NONE', kind: 'NOTE' } : node));
          commandFocus(id, n.text.length);
        }
        return;
      }
      mutate(ns => ns.map(n => {
        if (!targets.has(n.id)) return n;
        if (action.startsWith('language:')) return { ...n, codeLanguage: type };
        const normal = { ...n, blockStyle: 'paragraph', codeLanguage: '' };
        if (/^h[1-3]$/.test(type) || type === 'paragraph' || type === 'quote') return { ...normal, blockStyle: type, listType: 'NONE' };
        if (type === 'code') return { ...normal, codeLanguage: n.codeLanguage || 'javascript', listType: 'NONE' };
        if (type === 'plain') return { ...normal, listType: 'NONE', taskState: 'NONE', kind: 'NOTE' };
        if (type === 'numbered' || type === 'bulleted') return { ...normal, listType: type === 'numbered' ? 'ORDERED' : 'UNORDERED' };
        if (type === 'task') return { ...normal, taskState: 'TODO' };
        return { ...normal, kind: 'QUESTION' };
      }));
      return;
    }
    if (action === "exitCode") {
      const current = docRef.current!.tables.bullets, n = index(current).byId.get(id);
      const siblings = index(current).children.get(n.parentId) || [], newId = crypto.randomUUID();
      mutate(ns => move([...ns, bullet(newId)], newId, n.parentId, siblings.findIndex((item: Node) => item.id === id) + 1));
      commandFocus(newId, 0);
      return;
    }
    if (action === "stop") {
      setEditing(null);
      void flush();
      return;
    }
    if (action === "undo" || action === "redo") {
      undo(action === "redo");
      return;
    }
    if (action === "previous" || action === "next") {
      const visible = rows(docRef.current!.tables.bullets as Node[], outlineScope),
        at = visible.findIndex((row: any) => row.bullet.id === id),
        target = visible[at + (action === "previous" ? -1 : 1)]?.bullet;
      if (target)
        commandFocus(target.id, action === "previous" ? target.text.length : 0);
      return;
    }
    if (action === "moveUp" || action === "moveDown") {
      mutate((ns) => moveSibling(ns, id, action === "moveUp" ? -1 : 1));
      setNotice(action === "moveUp" ? "Branch moved up" : "Branch moved down");
      return;
    }
    if (action === "complete") {
      mutate((ns) =>
        ns.map((n) =>
          n.id === id
            ? {
                ...n,
                taskState: n.taskState === "DONE" ? "TODO" : "DONE",
              }
            : n,
        ),
      );
      return;
    }
    if (action === "toggleCollapse") {
      mutate((ns) => {
        const hasChildren = (index(ns).children.get(id) || []).length > 0;
        return hasChildren
          ? ns.map((n) =>
              n.id === id ? { ...n, collapsed: !n.collapsed } : n,
            )
          : ns;
      });
      return;
    }
    if (action === "expandBranch" || action === "collapseBranch") {
      mutate(ns => {
        const branch = descendants(ns, id);
        return ns.map(node => branch.has(node.id) ? { ...node, collapsed: action === "collapseBranch" } : node);
      });
      if (action === "collapseBranch") setEditing(null);
      return;
    }
    if (action === "zoomIn") {
      setTab("notes");
      setScope(id);
      setEditing(null);
      setSearch("");
      return;
    }
    if (action === "zoomOut") {
      if (outlineScope) {
        setTab("notes");
        setScope(
          index(docRef.current!.tables.bullets).byId.get(outlineScope)?.parentId ||
            null,
        );
      }
      setEditing(null);
      return;
    }
    if (action === "indent" || action === "outdent") {
      const roots = [...targets].filter(target => {
        const parent = index(docRef.current!.tables.bullets).byId.get(target)?.parentId;
        return parent === null || parent === undefined || !targets.has(parent);
      });
      mutate((ns) => {
        let out = ns;
        for (const target of roots) {
          const node = index(out).byId.get(target);
          if (!node || node.mirrorRootId) continue;
          if (action === "outdent" && tab === "calendar" && node.parentId === outlineScope) continue;
          out = (action === "indent" ? indent : outdent)(out, target);
        }
        return out;
      });
      if (roots.some(target => index(docRef.current!.tables.bullets).byId.get(target)?.mirrorRootId)) setNotice('Mirror roots stay anchored — open the source to move them.');
      return;
    }
    if (action === "enter") {
      const calendarNode = index(docRef.current!.tables.bullets).byId.get(id);
      // Enter on an empty daily bullet must not move it beside its date.
      if (tab === "calendar" && calendarNode?.parentId === outlineScope && !calendarNode.text && !(index(docRef.current!.tables.bullets).children.get(id) || []).length) return;
      const newId = crypto.randomUUID();
      const atStart = start === 0 && end === 0 && !!docRef.current!.tables.bullets.find(n => n.id === id)?.text.length;
      mutate((ns) => {
        const source=ns.find(n=>n.id===id)!;
        const splitNodes=split(instance?ns.map(n=>n.id===id?{...n,collapsed:instance.collapsed}:n):ns,id,start,end,newId);
        return instance?splitNodes.map((n:Node)=>n.id===id?{...n,collapsed:source.collapsed}:n):splitNodes;
      });
      commandFocus(docRef.current!.tables.bullets.some(n => n.id === newId)
        ? (atStart ? id : newId) : id, 0);
    }
    if (action === "merge") {
      try {
        const current = docRef.current!,
          ns = current.tables.bullets as Node[];
        const targetBullet = ns.find(n => n.id === id);
        if (targetBullet?.blockStyle === 'divider' && !targetBullet.text.trim()) {
          command('deleteDivider', id, start, end);
          return;
        }
        const result = merge(ns, id, outlineScope);
        if (result) {
          const withMedia = {
            ...current,
            tables: {
              ...current.tables,
              media: current.tables.media.map((m) =>
                m.bulletId === id ? { ...m, bulletId: result.id } : m,
              ),
            },
          };
          commit(withNodes(withMedia, result.nodes));
          commandFocus(result.id, result.caret);
        }
      } catch (e) {
        showError(e);
      }
    }
  };
  const pasteAsOutline = (
    id: string,
    start: number,
    end: number,
    value: ClipboardInput,
  ) => {
    try {
      const instance=docRef.current!.tables.bullets.find(n=>n.id===id),mirrorRoot=instance?.mirrorRootId;
      id=sourceId(docRef.current!.tables.bullets,id);
      const { lines, format } = parseClipboard(value);
      const newIds = Array.from(
        { length: Math.max(0, lines.length - 1) },
        () => crypto.randomUUID(),
      );
      const pasted: { result: ReturnType<typeof pasteOutline> } = {
        result: null,
      };
      mutate((ns) => {
        pasted.result = pasteOutline(ns, id, start, end, lines, newIds);
        return pasted.result?.nodes || ns;
      });
      if (pasted.result) {
        if (pasted.result.lastId === id && editor.current && !editor.current.isDestroyed) {
          const updated = docRef.current!.tables.bullets.find(n => n.id === id) as Node;
          editor.current.commands.setContent(toEditor(updated), { emitUpdate: false });
          editor.current.commands.setTextSelection(pasted.result.caret + 1);
        }
        focus(mirrorRoot?(docRef.current!.tables.bullets.find(n=>n.mirrorRootId===mirrorRoot&&n.mirrorSourceId===pasted.result?.lastId)?.id||pasted.result.lastId):pasted.result.lastId, pasted.result.caret);
        setNotice(`${format} pasted · ${pasted.result.count} bullet${pasted.result.count === 1 ? "" : "s"}`);
      }
    } catch (e) {
      showError(e);
    }
  };
  const onMove = (id: string, target: string, zone: string) => {
    const ns=docRef.current!.tables.bullets,from=ns.find(n=>n.id===id),to=ns.find(n=>n.id===target);
    if(from?.mirrorSourceId&&from.mirrorRootId!==id)id=from.mirrorSourceId;
    if(to?.mirrorSourceId&&(zone==='inside'||to.mirrorRootId!==target))target=to.mirrorSourceId;
    const moved=mutate((ns) => {
      const idx = index(ns),
        t = idx.byId.get(target),
        parent = zone === "inside" ? target : t.parentId,
        siblings = (idx.children.get(parent) || []).filter(
          (n: Node) => n.id !== id,
        ),
        at =
          zone === "inside"
            ? siblings.length
            : siblings.findIndex((n: Node) => n.id === target) +
              (zone === "after" ? 1 : 0);
      return move(ns, id, parent, at).map((n: Node) =>
        n.id === parent ? { ...n, collapsed: false } : n,
      );
    });
    if(moved)setNotice("Branch moved");
  };
  const backup = async (android = false) => {
    setWorking(true);
    try {
      await flush();
      const blob = await archive(docRef.current!, assets, android);
      download(
        blob,
        `RemoNook-Web-W1-${android ? "Android" : "Full"}-${new Date().toISOString().slice(0, 10)}.remo.zip`,
      );
      setNotice("Backup downloaded");
    } catch (e) {
      showError(e);
    } finally {
      setWorking(false);
    }
  };
  const importBackup = async (file: File) => {
    setWorking(true);
    try {
      await flush();
      if (failed.current)
        throw Error("Save or export current edits before restoring");
      const prepared = await parseArchive(file);
      setRestore(prepared);
      setDialog("restore");
    } catch (e) {
      showError(e);
    } finally {
      setWorking(false);
    }
  };
  const applyRestore = async (prepared: NonNullable<typeof restore>) => {
    setWorking(true);
    try {
      await flush();
      if (failed.current) throw Error("Current changes could not be saved");
      const restoredAssets=new Map(prepared.assets);
      if(cloudUser&&[...restoredAssets.keys()].some(isBookPath))throw Error('This backup contains device-local book originals. Restore it in a device-only workspace, or add the originals to your account through Bookshelf.');
      for(const [path,blob]of restoredAssets)if(isBookPath(path)){if(!await restoreLocalBook(prepared.doc,storageAccountKey(),path,blob))throw Error("A book original in this backup has no matching bookshelf entry. The current notes were kept.");restoredAssets.delete(path);}
      for(const [path,blob]of prepared.assets){const match=path.match(/^articles\/([a-f0-9]{64})\.json$/);if(match){await cacheArticle(articleAccount(cloudUser?.uid),match[1],blob,!!cloudUser);restoredAssets.delete(path);}}
      if(cloudUser){if(!navigator.onLine)throw Error('Reconnect to restore saved webpages to your account. Your backup and current notes are unchanged.');await uploadCachedArticles(cloudUser,articleSnapshotHashes(prepared.doc));}
      const restoredDoc = {
        ...prepared.doc,
        web: { ...prepared.doc.web, deviceId: persisted.current!.web.deviceId },
      };
      const next = await save(
        persisted.current,
        restoredDoc,
        "restore",
        restoredAssets,
        true,
      );
      persisted.current = next;
      docRef.current = next;
      dirty.current = false;
      setDoc(next);
      setAssets(restoredAssets);
      assetsRef.current = restoredAssets;
      pendingAssets.current.clear();
      history.current = { undo: [], redo: [] };
      setScope(null);
      setEditing(null);
      setRestore(null);
      setDialog(null);
      setStatus("Saved on this device");
      setNotice(
        "Backup restored. A pre-restore recovery snapshot is available.",
      );
    } catch (e) {
      showError(e);
    } finally {
      setWorking(false);
    }
  };
  const prefs = (key: string, value: any) => {
    const current = docRef.current!;
    commit({
      ...current,
      preferences: {
        ...current.preferences,
        appearance: { ...current.preferences.appearance, [key]: value },
      },
    });
  };
  const editorPrefs = (key: string, value: any) => {
    const current = docRef.current!;
    commit({
      ...current,
      preferences: {
        ...current.preferences,
        editor_tools: { ...current.preferences.editor_tools, [key]: value },
      },
    });
  };
  // Retire existing saved folder permissions, not the user's files or offline notes.
  useEffect(() => { void retireLegacyFolderSync(storageAccountKey()).catch(() => {
    // Legacy connection cleanup must never block loading or editing notes.
  }); }, []);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void flush();
    };
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current || deviceStatus.get() === "Saving…") {
        void flush();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", before);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", before);
    };
  }, [deviceStatus]);
  useEffect(()=>{if(!doc)return;const ids=snapshotIndex(doc.tables.bullets).byId;for(const pane of views.panes)if(pane.scope&&!ids.has(pane.scope))views.update(pane.id,{scope:null,search:'',back:pane.back.filter(id=>id===null||ids.has(id)),forward:pane.forward.filter(id=>id===null||ids.has(id))});},[doc?.tables.bullets,views.panes]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const unbind=bindWorkspaceShortcuts(window,{
      command:()=>{if(viewTimer.current)publishView(true);setMenu(null);setViewMenu(false);setDialog(value=>value==='jump'?null:'jump');},
      save:()=>void flush(),sidebar:toggleSidebar,pane:()=>openPane(),
      panePrev:()=>{if(tab!=='notes'||editing)return;setEditing(null);views.switchPane(-1);},
      paneNext:()=>{if(tab!=='notes'||editing)return;setEditing(null);views.switchPane(1);},
      paneClose:()=>{if(tab!=='notes'||editing||views.panes.length<2)return;setEditing(null);views.close(views.activePane);},
    });
    const undoKey=(e:KeyboardEvent)=>{
      if(!shortcutAllowed(e)||dialog||menu||editing||(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable="true"]')))return;
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}
    };
    window.addEventListener('keydown',undoKey);
    return()=>{unbind();window.removeEventListener('keydown',undoKey);};
  }, [editing, dialog, menu, doc, views.panes, views.activePane, tab]);
  readerOpenHandler.current=(hash,unit,id)=>{void (async()=>{try{await flush();if(failed.current)throw Error('Save your changes before opening a book.');readerOrigin.current=document.activeElement as HTMLElement|null;setEditing(null);setDialog(null);setReaderTarget({hash,unit,id});}catch(e){showError(e);}})();};
  const readingSourceMap=React.useMemo(()=>doc?{...readingSources(doc),...Object.fromEntries(Object.entries(doc.web.bookmarkSources||{}).map(([id,s]:[string,any])=>[id,{kind:"web",bookmarkId:s.bookmarkId,highlightId:s.highlightId||"",url:s.url,snapshotHash:s.snapshotHash,label:s.title||"Web article"}])),
    // Each saved article's and book's own bullet opens it (Library, src/library-outline.mjs).
    ...Object.fromEntries(Object.entries(doc.web.bookmarkNoteRoots||{}).filter(([id])=>doc.web.bookmarks?.[id]&&!doc.web.bookmarks[id].deleted).map(([id,root]:[string,any])=>[root,{kind:"web",bookmarkId:id,highlightId:"",url:doc.web.bookmarks[id].url,label:"Article",chip:true}])),
    ...Object.fromEntries(Object.entries(doc.web.readingNoteRoots||{}).filter(([hash])=>readingBook(doc,hash)).map(([hash,root]:[string,any])=>[root,{hash,unit:readingPosition(doc,readingBook(doc,hash)),id:"",label:"Book",chip:true}]))}:{},[doc?.web.readingHighlights,doc?.tables.media,doc?.web.bookmarkSources,doc?.web.bookmarkNoteRoots,doc?.web.readingNoteRoots,doc?.web.bookmarks,doc?.web.readingBooks,doc?.web.readingProgress]);
  // Every bookmark and book gets its bullet (new ones under Library).
  const readingSourceValue=React.useMemo(()=>({sources:readingSourceMap,open:openReader,openWeb:(id:string,highlight:string,snapshotHash?:string)=>{setEditing(null);setBookmarkTarget({id,highlight,snapshotHash});setTab("bookmarks");}}),[readingSourceMap,openReader]);
  if (!doc)
    return (
      <div className="startup">
        <div className="brand">
          <RemoLogo/>RemoNook
        </div>
        <p>{fatal ? error : "Opening your notes…"}</p>
      </div>
    );
  const nodes = doc.tables.bullets as Node[],
    idx = snapshotIndex(nodes),
    calendarDay = idx.byId.get(`journal-${calendarDate}`),
    calendarMonth = idx.byId.get(calendarDay?.parentId),
    calendarYear = idx.byId.get(calendarMonth?.parentId),
    calendarRoot = idx.byId.get(calendarYear?.parentId),
    calendarReminders = tab==='calendar'?calendarEvents(doc):[],
    current = idx.byId.get(scope),
    ancestors: Node[] = [];
  let ancestor = current;
  while (ancestor) {
    ancestors.push(ancestor);
    ancestor = idx.byId.get(ancestor.parentId);
  }
  ancestors.reverse();
  const visibleAncestors = ancestors.length > 6 ? [ancestors[0], ...ancestors.slice(-5)] : ancestors;
  const selected = idx.byId.get(editing),
    menuNode = idx.byId.get(menu),
    ap = doc.preferences.appearance,
    showCompleted = doc.preferences.editor_tools?.showCompleted !== false,
    disabled = working || failed.current;
  const paneCompleted = tab === "notes" && views.panes.length > 1 ? (views.active.completed ?? showCompleted) : showCompleted;
  const menuTargets = menuNode ? [...bulletTargets(menuNode.id)].map(id => idx.byId.get(id)).filter(Boolean) : [];
  const menuListStyle = new Set(menuTargets.map(node => node.listType)).size > 1 ? '' : menuNode?.listType;
  const menuBulletKind = new Set(menuTargets.map(node => node.kind)).size > 1 ? '' : menuNode?.kind;
  const starred: string[] = Array.isArray(doc.web.starredNodes) ? doc.web.starredNodes : [],
    savedSearches: string[] = Array.isArray(doc.web.starredSearches) ? doc.web.starredSearches : [];
  const navigateTo = (id: string | null) => {
    setTab("notes");
    setScope(id);
    setEditing(null);
    setSearch("");
    setDialog(null);
  };
  const theme =
    (ap.theme === "System"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "Dark"
        : "Light"
      : ap.theme) || "Light";
  const style: React.CSSProperties = {
    "--reading-size": `${ap.size || 16}px`,
    "--outline-line-height": `${(ap.size || 16) * 1.5}px`,
    "--reading-font":
      ap.font === "Serif"
        ? "Georgia, serif"
        : ap.font === "Mono"
          ? "ui-monospace, monospace"
          : ap.font === "Rounded"
            ? "ui-rounded, system-ui, sans-serif"
            : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  } as React.CSSProperties;
  const openDiagram=(target:DiagramTarget)=>{if(disabled)return;setMenu(null);setEditing(null);setDiagramTarget({...target,id:sourceId(docRef.current!.tables.bullets,target.id)});};
  const openDrawing=(id:string,mediaId?:string)=>{if(disabled)return;setMenu(null);setEditing(null);setDrawingTarget({id:sourceId(docRef.current!.tables.bullets,id),mediaId,account:storageAccountKey()});};
  const saveDrawing=(blob:Blob,title:string)=>{
    const target=drawingTarget,current=docRef.current;
    if(!target||target.account!==storageAccountKey()||!current||disabled||failed.current)throw Error('Saving is unavailable. Your drawing is still open; retry when saving is available.');
    if(!current.tables.bullets.some(n=>n.id===target.id))throw Error('The destination note was removed. Your drawing is still open.');
    if(blob.size>2*1024*1024)throw Error('Drawings must fit within 2 MB.');
    const id=crypto.randomUUID(),fileName=id+'.png',nextAssets=new Map(assetsRef.current);nextAssets.set('media/'+fileName,blob);checkAttachmentBudget(nextAssets);
    const item={id,bulletId:target.id,fileName,mimeType:'image/png',sourceUrl:'',credit:title+'.excalidraw.png',licenseUrl:''};
    pendingAssets.current.set('media/'+fileName,blob);assetsRef.current=nextAssets;setAssets(nextAssets);
    commit(withNodes({...current,tables:{...current.tables,media:[...current.tables.media,item]}},current.tables.bullets as Node[]));setDrawingTarget(null);setNotice('Drawing added to your note.');
  };
  const insertNotation = (id: string, diagram: boolean) => {
    const node = docRef.current!.tables.bullets.find(node => node.id === id);
    if (!node || unsupportedFormatting(node as Node)) return;
    const source = diagram ? "```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n```" : "$E = mc^2$";
    const prefix = node.text ? `${node.text}\n` : "";
    mutate(ns => ns.map(node => node.id === id ? { ...node, text: prefix + source } : node));
    setMenu(null);
    focus(id, prefix.length);
  };
  return (
    <GoogleTasksProvider key={cloudUser?.uid||'guest'} user={cloudUser} onSignIn={()=>accountAction()}><ReadingSources.Provider value={readingSourceValue}><MusicProvider assets={assets}><GalleryContext.Provider value={{doc,onAdd:disabled?undefined:id=>{mediaTarget.current=id;imageInput.current?.click();}}}><TableContext.Provider value={disabled?null:(id,text)=>mutate(ns=>ns.map(n=>n.id===id?{...n,text}:n))}><SearchContext.Provider value={{times:doc.web.noteTimes||{}}}><VisualToolsContext.Provider value={disabled?{}:{diagram:openDiagram,drawing:openDrawing}}>
    <TagSettingsContext.Provider value={tagSettings}><ConnectionContext.Provider value={{nodes,onOpenPane:openPane,onNavigate:id=>navigateTo(id),onTag:tag=>{navigateTo(null);setNotesFilter('all');setSearch(tag);},onMirror:mirrorHere}}>
    <EmojiProvider emojis={doc.tables.emojis} assets={assets} animate={doc.preferences.appearance.animateEmojis !== false} onInsert={async (item, id, start, end) => {
      emojiTarget.current = { id, start, end };
      await chooseEmoji(item, true);
    }}>
    <div className="app" data-theme={theme} data-page={tab} data-editing={!!selected && (tab==='notes'||tab==='calendar')} style={style}>
      <aside
        className={`sidebar ${sidebarShown ? "" : "collapsed"}`}
        aria-hidden={!sidebarShown}
        inert={!sidebarShown}
      >
        <div className="sidebar-inner">
          <div className="sidebar-header">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setScope(null);
                setTab("notes");
              }}
            >
              <RemoLogo/>RemoNook
              <span className="local-label">{isMobileApp()?"APP":isDesktop()?"DESKTOP":"WEB"}</span>
            </a>
            <button
              className="icon-button sidebar-toggle-btn"
              aria-label="Collapse sidebar"
              title="Collapse sidebar (Ctrl+\)"
              onClick={toggleSidebar}
            >
              <Icon name="sidebarCollapse" />
            </button>
          </div>
          <WorkspaceSwitcher/>
          <button className="sidebar-jump" onClick={() => {if(viewTimer.current)publishView(true);setMenu(null);setViewMenu(false);setDialog("jump");}}><Icon name="search" size={16} /><span>Commands & notes</span><kbd>{modLabel()} K</kbd></button>
          <nav aria-label="Main navigation">
            {[
              ["dashboard", "Dashboard", "dashboard"],
              ["notes", "Notes", "notes"],
              ["calendar", "Calendar", "calendar"],
              ["study", "Study Desk", "study"],
              ["bookshelf", "Bookshelf", "study"],
              ["mindmap", "Mindmap", "mindmap"],
              ["bookmarks", "Bookmarks", "link"],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                className={tab === id ? "nav-active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  if(id==='mindmap')setMindmapTarget(null);setTab(id);
                  if (id === "notes") { setScope(null); setSearch(""); }
                  setEditing(null);
                  void flush();
                }}
              >
                <Icon name={icon} />
                <span>{label}</span>
                {id === "notes" && (
                  <span className="nav-count"><FlowNumber value={nodes.length} /></span>
                )}
              </button>
            ))}
          </nav>
          <OutlineSidebar nodes={nodes} scope={scope} starred={starred} savedSearches={savedSearches} search={search} tagSettings={tagSettings} onEditTag={setTagEditor} disabled={disabled} onNavigate={navigateTo} onSearch={query => { navigateTo(null); setNotesFilter('all'); setSearch(query); }} onAdd={parent => { setTab("notes"); setScope(parent); setSearch(""); add(parent); }} />
          <div className="sidebar-bottom">
            <button onClick={async()=>{await flush();if(failed.current){showError(Error('Save or export your changes before returning home.'));return;}window.location.hash='home';}}><Icon name="home" size={16}/>RemoNook home</button>
            <button disabled={disabled} onClick={() => { setTab("notes"); setScope(null); setSearch(""); add(null); }}><Icon name="plus" /><span>New node</span></button>
            <button onClick={() => setDialog("trash")}>
              <Icon name="trash" />
              <span>Trash</span>
              {doc.tables.trash.length > 0 && (
                <span className="nav-count"><FlowNumber value={doc.tables.trash.length} /></span>
              )}
            </button>
            <button onClick={() => setDialog("settings")}>
              <Icon name="settings" />
              <span>Settings & backups</span>
            </button>
            <button onClick={()=>setDialog("help")}><Icon name="learn"/><span>Show me how</span></button>
            <button onClick={() => setDialog("shortcuts")}><Icon name="help" /><span>Keyboard shortcuts</span></button>
            <a className="feature-guide-link" href="/guides" target="_blank" rel="noopener noreferrer"><Icon name="learn"/><span>Guides & tutorials</span><Icon name="forward" size={12}/></a>
            <div className="storage-note">
              <span
                className={failed.current ? "status-dot error-dot" : "status-dot"}
              />
              {activeLocalWorkspace()?.peerSync?"Syncs with your devices · never RemoNook cloud":activeLocalWorkspace()?.folder?"Folder workspace · this computer · never synced":activeLocalWorkspace()?"Device-only workspace · never synced":cloudUser?"Local-first · syncing to your account":"Local-first · no account"}
            </div>
          </div>
        </div>
      </aside>
      {isDesktop()&&<DesktopUpdate flush={flush}/>}
      {isMobileApp()&&<AndroidUpdate/>}
      {isApp()&&<LocalSyncPairing/>}
      <main ref={sidebarMotion.mainRef}>
        <header className="topbar">
          <button
            className={`icon-button sidebar-toggle-btn topbar-sidebar-toggle ${sidebarShown ? "is-open" : "is-collapsed"}`}
            aria-label={sidebarShown ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarShown ? "Collapse sidebar (Ctrl+\\)" : "Expand sidebar (Ctrl+\\)"}
            onClick={toggleSidebar}
          >
            <Icon name={sidebarShown ? "sidebarCollapse" : "menu"} />
          </button>
          {tab === "notes" && scope && <button className="icon-button outline-back" aria-label="Go to parent" title="Go to parent" onClick={() => navigateTo(current?.parentId || null)}><Icon name="back" size={16} /></button>}
          {tab === "notes" && views.panes.length > 1 && <><button className="icon-button" aria-label="Pane back" title="Pane back" disabled={!views.active.back.length} onClick={() => { views.history(views.activePane); setEditing(null); }}><Icon name="back" size={16} /></button><button className="icon-button" aria-label="Pane forward" title="Pane forward" disabled={!views.active.forward.length} onClick={() => { views.history(views.activePane, true); setEditing(null); }}><Icon name="forward" size={16} /></button></>}
          <div className="breadcrumbs">
            {tab === "bookmarks" ? <button onClick={()=>setTab("bookmarks")}><Icon name="link" size={16}/>Bookmarks</button> : tab === "bookshelf" ? <button onClick={()=>setTab('bookshelf')}><Icon name="study" size={16}/>Bookshelf</button> : tab === "dashboard" ? <button onClick={()=>setTab('dashboard')}><Icon name="dashboard" size={15}/>Dashboard</button> : tab === "study" ? <button onClick={() => setTab("study")}><Icon name="study" size={16} />Study Desk</button> : tab === "mindmap" ? <button onClick={() => setTab("mindmap")}><Icon name="mindmap" size={16}/>Mindmap</button> : tab === "calendar" ? (
              <>
                <button onClick={() => navigateTo(calendarRoot?.id || null)}>
                  <Icon name="calendar" size={14} />
                  <span>Calendar</span>
                </button>
                <Icon name="chevron" size={12} />
                <button onClick={() => navigateTo(calendarYear?.id || null)}>
                  {parseLocalDate(calendarDate).getFullYear()}
                </button>
                <Icon name="chevron" size={12} />
                <button onClick={() => navigateTo(calendarMonth?.id || null)}>
                  {parseLocalDate(calendarDate).toLocaleDateString("en-US", { month: "short" })}
                </button>
                <Icon name="chevron" size={12} />
                <button>{formatDatePill(calendarDate)}</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setScope(null);
                    setEditing(null);
                  }}
                >
                  <Icon name="home" size={16} />
                  My notes
                </button>
                {visibleAncestors.map((n, i) => (
                  <React.Fragment key={n.id}>
                    {ancestors.length > 6 && i === 1 && <><Icon name="chevron" size={12} /><button aria-label="Find an ancestor page" title={`${ancestors.length - 6} ancestor pages omitted. Search to navigate to any page.`} onClick={() => setDialog("jump")}>…</button></>}
                    <Icon name="chevron" size={12} />
                    <button
                      onClick={() => {
                        setScope(n.id);
                        setEditing(null);
                      }}
                    >
                      {n.text || "Untitled"}
                    </button>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
          <div id="topbar-reminders" className="topbar-reminders" data-visible={remindersVisible}>
            <ReminderTabs doc={doc} onManage={()=>{setTab('calendar');setEditing(null);setSearch('');}} onOpen={(id,date)=>{setTab('calendar');setCalendarDate(date);setEditing(null);setSearch('');setReminderEditor({id,date});}}/>
          </div>
          <div className="topbar-right">
            <FocusPill doc={doc} disabled={disabled} onChange={update=>{const current=docRef.current!,next=update(current);if(next!==current)commit(next,undefined,false);}} onOpen={()=>{setTab('dashboard');setEditing(null);}}/>
            <button className="icon-button reminders-toggle" aria-label={remindersVisible?'Hide reminders':'Show reminders'} title={remindersVisible?'Hide reminders':'Show reminders'} aria-expanded={remindersVisible} aria-controls="topbar-reminders" onClick={()=>setRemindersVisible(visible=>!visible)}><Icon name="bell" size={18}/></button>
            {tab !== "bookmarks" && <SearchBox value={search} onChange={q=>{setSearch(q);setEditing(null);}} nodes={nodes} global={views.active.global} onGlobal={all=>{views.update(views.activePane,{global:all});if(all)setTab('notes');}}/>}
            {tab === "notes" && (scope || search.trim()) && <button className={`icon-button star-page ${(search.trim() ? savedSearches.includes(search.trim()) : starred.includes(scope!)) ? "is-starred" : ""}`} aria-label={search.trim() ? (savedSearches.includes(search.trim()) ? "Unstar search" : "Star search") : (starred.includes(scope!) ? "Unstar page" : "Star page")} title={search.trim() ? "Star this search" : "Star this page"} disabled={disabled} onClick={() => search.trim() ? toggleSearchStar() : toggleStar(scope!)}><Icon name="star" size={17} /></button>}
            <button
              className={`icon-button completed-toggle ${paneCompleted ? "is-active" : ""}`}
              title={paneCompleted ? "Hide completed bullets" : "Show completed bullets"}
              aria-label={paneCompleted ? "Hide completed bullets" : "Show completed bullets"}
              aria-pressed={paneCompleted}
              disabled={disabled}
              onClick={() => tab === "notes" && views.panes.length > 1 ? views.update(views.activePane, { completed: !paneCompleted }) : editorPrefs("showCompleted", !paneCompleted)}
            >
              <Icon name="check" />
            </button>
            <button
              className="icon-button"
              title="Undo"
              aria-label="Undo"
              disabled={!history.current.undo.length || disabled}
              onClick={() => undo()}
            >
              <Icon name="undo" />
            </button>
            <button
              className="icon-button"
              title="Redo"
              aria-label="Redo"
              disabled={!history.current.redo.length || disabled}
              onClick={() => undo(true)}
            >
              <Icon name="redo" />
            </button>
            <button className="icon-button" aria-label="Commands & notes" title={`Commands & notes (${modLabel()} K)`} onClick={()=>{if(viewTimer.current)publishView(true);setMenu(null);setViewMenu(false);setDialog("jump");}}><Icon name="commands" size={17}/></button>
            <button data-guide-help className="icon-button" aria-label="Show me how" title="Show me how" onClick={()=>{setViewMenu(false);setMenu(null);setDialog("help");}}><Icon name="help" size={17}/></button>
            <CloudDeviceSaveIndicator signal={deviceStatus} isPending={()=>!!cloudUser&&(dirty.current||persisted.current?.revision!==cloud.acknowledgedRevision)} cloudSignal={cloud.signal} connected={!!cloudUser} onOpen={()=>{setSettingsPanel('account');setDialog('settings');}}/>
            {<button className="icon-button" aria-label="Outline options" aria-expanded={viewMenu} title="Outline options" onClick={event => { viewAnchor.current = event.currentTarget; setViewMenu(value => !value); setMenu(null); }}><Icon name="more" /></button>}
            {tab==='notes'&&views.panes.length>1&&<button className="icon-button" aria-label="Close pane" title="Close pane · Alt+W" onClick={()=>{views.close(views.activePane);setEditing(null);}}><Icon name="close" size={16}/></button>}
            {tab==='notes'&&<button className="icon-button" aria-label="New pane" title="New pane · Alt+R" onClick={()=>openPane()}><Icon name="pane" size={17}/></button>}
            <ProfileMenu user={cloudUser} environment={APP_ENV} signal={cloud.signal} onSettings={panel=>{setSettingsPanel(panel);setDialog('settings');}} onSignIn={()=>void accountAction()} onSignOut={()=>void accountAction(true)}/>
          </div>
        </header>
        {viewHint&&<div className="view-dots" role="status" aria-live="polite">{SWIPE_VIEWS.map(v=><span key={v} className={v===viewHint.view?'is-current':''}>{v===viewHint.view?SWIPE_LABELS[v]:''}</span>)}</div>}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            {failed.current && !fatal && (
              <button
                onClick={() => {
                  failed.current = false;
                  setError(null);
                  void flush();
                }}
              >
                Retry saving
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {tab === "notes" ? (
          <>
            <section className="page-heading page-heading-hidden" aria-hidden="true"><h1>{current?.text||"My notes"}</h1><button className="primary" disabled={disabled} onClick={()=>add()}>Add bullet</button></section>
            {isTagQuery(search)&&<TagHeader nodes={nodes} tag={search.trim()} settings={tagSettings} disabled={disabled} onEdit={setTagEditor} onFlashcards={ids=>{const set=new Set(ids);if(mutate(ns=>ns.map(n=>set.has(n.id)&&n.kind==='NOTE'?{...n,kind:'QUESTION'}:n)))setNotice(`Made ${ids.length} flashcard${ids.length===1?'':'s'}. Answers are the bullets under each question.`);}} onTag={tag=>{setSearch(tag);}} onClose={()=>setSearch('')}/>}
            <div className="notes-filter" hidden={isTagQuery(search)} role="tablist" aria-label="Show bullets" onKeyDown={e=>{
              if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
              const tabs=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')),at=tabs.indexOf(document.activeElement as HTMLButtonElement);
              if(at<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(at+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();
            }}>
              {NOTE_FILTERS.filter(([kind])=>['all','notes','calendar'].includes(kind)||kind===notesFilter||notesFilterCounts[kind]).map(([kind,label,emoji])=><button key={kind} id={`notes-filter-${kind}`} role="tab" aria-controls="notes-filter-panel" tabIndex={notesFilter===kind?0:-1} aria-selected={notesFilter===kind} onClick={()=>{setNotesFilter(kind);setEditing(null);}}>{emoji&&<i aria-hidden="true">{emoji}</i>}{label}{kind!=='all'&&<span>{notesFilterCounts[kind]||0}</span>}</button>)}
            </div>
            <div id="notes-filter-panel" role="tabpanel" aria-labelledby={`notes-filter-${notesFilter}`} className={`notes-panes ${views.panes.length===1?'is-single':''}`} aria-label="Note panes">
            {views.panes.map((pane,i)=><React.Fragment key={pane.id}><section className={`note-pane ${views.activePane===pane.id?'is-active':''}`} data-pane-id={pane.id} aria-label={`Note pane ${i+1}`} style={{flex:`0 0 ${pane.width}px`}} onPointerDownCapture={()=>{if(views.activePane!==pane.id){views.setActivePane(pane.id);setEditing(null);}}}>
            {views.panes.length>1&&<div className="pane-bar">
             <PaneSearchBar value={pane.search} onChange={q=>views.update(pane.id,{search:q})} label={`Search pane ${i+1}`} onFocus={()=>{if(views.activePane!==pane.id){views.setActivePane(pane.id);setEditing(null);}}}/>
             <button className="icon-button pane-close" aria-label={`Close pane ${i+1}`} title="Close pane" onClick={()=>views.close(pane.id)}><Icon name="close" size={14}/></button>
            </div>}
            {notesFilter!=='all'&&notesFilterRoots&&!notesFilterRoots[pane.id]?.length?<p className="notes-filter-empty">No {({notes:'notes',calendar:'calendar entries',flashcards:'flashcards',mcqs:'MCQs',mindmaps:'mindmaps',bookmarks:'bookmark notes',docs:'PDF or EPUB notes'} as Record<string,string>)[notesFilter]} {pane.scope?'on this page':'yet'}.</p>:<OutlineView
              rootIds={notesFilterRoots?.[pane.id]||null}
              excludedIds={notesFilter==='notes'?notesCatalog?.excluded:undefined}
              nodes={pane.id==='main'?nodes:paneSnapshot(nodes,pane.collapsed)}
              scope={pane.global&&pane.search?null:pane.scope}
              search={pane.search}
              showCompleted={pane.completed??showCompleted}
              readingSize={ap.size || 16}
              onImages={(id, files) => { void attachImages(id, files); }}
              onRemoveMedia={removeMedia}
              onResizeMedia={resizeMedia}
              onOccludeMedia={setOcclusionImage}
              editing={views.activePane===pane.id?editing:null}
              caret={caret}
              disabled={disabled}
              assets={assets}
              media={doc.tables.media}
              onAdd={(parentId) => add(parentId===undefined?pane.scope:parentId)}
              onEdit={(id) => {
                views.setActivePane(pane.id);
                if (id) focus(id);
                else setEditing(null);
              }}
              onZoom={(id) => {
                views.setActivePane(pane.id);views.navigate(pane.id,id);setEditing(null);
              }}
              onMindmap={(id)=>{setMindmapTarget(id);setTab('mindmap');setScope(id);setEditing(null);}}
              onOpenPane={openPane}
              onToggle={id=>{if(pane.id==='main')mutate(ns=>ns.map(n=>n.id===id?{...n,collapsed:!n.collapsed}:n));else views.update(pane.id,{collapsed:{...pane.collapsed,[id]:!(pane.collapsed[id]??idx.byId.get(id)?.collapsed)}});}}
              onChange={changeBulletContent}
              onEditorChange={changeEditorContent}
              readCurrentNode={readCurrentNode}
              onCommand={(action,id,start,end,selectedIds)=>{if(pane.id!=='main'&&['toggleCollapse','expandBranch','collapseBranch'].includes(action)){const ids=action==='toggleCollapse'?new Set([id]):descendants(nodes,id),collapsed={...pane.collapsed};for(const key of ids)collapsed[key]=action==='toggleCollapse'?!(collapsed[key]??idx.byId.get(key)?.collapsed):action==='collapseBranch';views.update(pane.id,{collapsed});return;}command(action,id,start,end,selectedIds);}}
              onOutlinePaste={pasteAsOutline}
              onReady={(e) => {
                if(views.activePane===pane.id){editor.current=e;setActiveEditor(e);}
              }}
              onMove={onMove}
              onTask={(id) =>
                mutate((ns) =>
                  ns.map((n) =>
                    n.id === id
                      ? {
                          ...n,
                          taskState: n.taskState === "DONE" ? "TODO" : "DONE",
                        }
                      : n,
                  ),
                )
              }
              onMenu={openBulletMenu}
              onDeleteNodes={removeMultiple}
              setNotice={setNotice}
            />}
              <ConnectionPanel id={pane.scope||(views.activePane===pane.id?editing:null)}/>
            </section>{i<views.panes.length-1&&<PaneDivider onResize={delta=>views.resize(pane.id,views.panes[i+1].id,delta)}/>}</React.Fragment>)}
            </div>
            {selected&&<SelectionFormatting editor={activeEditor} disabled={disabled||unsupportedFormatting(selected)} blockStyle={selected.blockStyle||'paragraph'} onBlock={type=>command('block:'+type,selected.id,0,0)} dividerStyle={selected.dividerStyle} dividerColor={selected.dividerColor} onDividerStyle={style=>command('dividerStyle:'+style,selected.id,0,0)} onDividerColor={color=>command('dividerColor:'+color,selected.id,0,0)}/>}
          </>
        ) : tab === "dashboard" ? (
          <React.Suspense fallback={<section className="secondary-page" role="status">Loading dashboard…</section>}><Dashboard doc={doc} disabled={disabled} onRead={openReader} onLibrary={()=>{setTab('bookshelf');setEditing(null);}} onChange={update=>commit(update(docRef.current!),undefined,false)} onCapture={text=>{
            if(disabled||failed.current)throw Error('Resolve the saving error before adding a note.');
            const current=docRef.current!,id=crypto.randomUUID(),position=current.tables.bullets.filter(node=>!node.parentId).reduce((max,node)=>Math.max(max,node.position+1),0);
            commit(withNodes(current,[...(current.tables.bullets as Node[]),bullet(id,{text,position})]));return id;
          }} onNote={id=>navigateTo(id||null)} onStudy={()=>{setTab('study');setEditing(null);}} onCalendar={date=>{setTab('calendar');setCalendarDate(date);setEditing(null);}} onTask={id=>mutate(ns=>ns.map(node=>node.id===id?{...node,taskState:'DONE'}:node))}/></React.Suspense>
        ) : tab === "bookmarks" ? (
          <React.Suspense fallback={<p role="status">Loading bookmarks…</p>}><Bookmarks onReaderChange={setReaderFocus} readCurrentNote={readCurrentNode} onUndo={undo} onText={changeEditorContent} target={bookmarkTarget} user={cloudUser} doc={doc} assets={assets} disabled={disabled||failed.current} onNotes={navigateTo} onChange={(update,added)=>{if(failed.current)throw Error("Saving needs attention.");if(added){checkNewAssets(assetsRef.current,added);const files=new Map(assetsRef.current);for(const [path,blob] of added){files.set(path,blob);pendingAssets.current.set(path,blob);}assetsRef.current=files;setAssets(files);}const next=update(docRef.current!);commit(withNodes(next,next.tables.bullets as Node[]));}}/></React.Suspense>
        ) : tab === "bookshelf" ? (
          <React.Suspense fallback={<section className="secondary-page" role="status">Loading bookshelf…</section>}><Bookshelf key={cloudUser?.uid||'guest'} user={cloudUser} doc={doc} disabled={disabled} onRead={openReader} onNotes={id=>navigateTo(id)} onSignIn={()=>accountAction()} onChange={async update=>{const current=docRef.current!,next=update(current);if(next!==current){commit(next,undefined,false);await flush();if(failed.current)throw Error('Book metadata could not be saved. The original remains on this device; try adding it again.');}}}/></React.Suspense>
        ) : tab === "study" ? (
          <StudyDesk doc={doc} assets={assets} disabled={disabled} onChange={next => commit(next, undefined, false)} onLibraryChange={next=>commit(next)} onSaveFolder={saveFolderDesign} onSource={id => navigateTo(id || null)} onSaveDesign={saveDeckDesign} onSaveReactions={saveQuizReactions} />
        ) : tab === "mindmap" ? (
          <React.Suspense fallback={<section className="secondary-page" role="status">Loading mindmap…</section>}><MindmapView styles={doc.web.mindmapStyles||{}} onStyle={(id,patch,branch)=>commit(patchMindmapStyle(docRef.current!,sourceId(nodes,id),patch,branch))} nodes={nodes} scope={mindmapTarget} disabled={disabled} onOpen={id=>{setTab('notes');setScope(id);setEditing(null);}} onConvert={id=>{if(!disabled)mutate(ns=>ns.map(n=>n.id===id?{...n,mindmap:true}:n));}} onNotes={()=>{setTab('notes');setEditing(null);}} onToggleCollapse={id=>command('toggleCollapse',sourceId(nodes,id),0,0)} onExpandBranch={id=>command('expandBranch',sourceId(nodes,id),0,0)} onCollapseBranch={id=>command('collapseBranch',sourceId(nodes,id),0,0)} onAddChild={(parentId,newId)=>{const pid=sourceId(nodes,parentId);mutate(ns=>{const kids=index(ns).children.get(pid)||[];return move([...ns.map(n=>n.id===pid?{...n,collapsed:false}:n),bullet(newId)],newId,pid,kids.length);});}} onAddSibling={(id,newId)=>{const sid=sourceId(nodes,id);mutate(ns=>{const n=ns.find(x=>x.id===sid);if(!n)return ns;const sibs=(index(ns).children.get(n.parentId)||[]) as Node[];return move([...ns,bullet(newId)],newId,n.parentId,sibs.findIndex(x=>x.id===sid)+1);});}} onRename={(id,text)=>{const sid=sourceId(nodes,id);mutate(ns=>renameMindmapBullet(ns,sid,text));}} onDelete={id=>remove(sourceId(nodes,id))} onReorder={(id,at)=>{const sid=sourceId(nodes,id);mutate(ns=>{const n=ns.find(x=>x.id===sid);if(!n)return ns;return move(ns,sid,n.parentId,at);});}}/></React.Suspense>
        ) : (
          <>
          <CalendarView
            autoOpen={false}
            workdayMarker={calendarWorkdays.enabled?date=><WorkdayMarker w={calendarWorkdays} date={date}/>:undefined}
            trackers={<CalendarTrackers workModeInHeader workspaceOpen={workdaysOpen} onWorkspace={setWorkdaysOpen} onDate={date=>{setCalendarDate(date);setEditing(null);}} doc={doc} date={calendarDate} disabled={disabled} onChange={update=>commit(update(docRef.current!))}/>}
            headerExtra={calendarWorkdays.enabled?<WorkMode compact doc={doc} date={calendarDate} disabled={disabled} onChange={update=>commit(update(docRef.current!))}/>:null}
            aside={<>
              <MiniMonth doc={doc} date={calendarDate} today={calendarToday} workdays={!!calendarWorkdays.enabled} onSelectDate={date=>{setCalendarDate(date);setEditing(null);}}/>
              {calendarWorkdays.enabled&&<WorkdaysLine doc={doc} date={calendarDate} today={calendarToday} onOpen={()=>setWorkdaysOpen(true)}/>}
              <CalendarAgenda doc={doc} date={calendarDate} disabled={disabled} onChange={next=>commit(next)} onEdit={setReminderEditor} onSelectDate={date=>{setCalendarDate(date);setEditing(null);}}/>
            </>}
            onCreateNote={(date,value,id)=>mutate(ns=>{const prepared=ensureCalendarHierarchy(ns,date);return move([...prepared.nodes,bullet(id,{parentId:prepared.dayId,...value})],id,prepared.dayId,(index(prepared.nodes).children.get(prepared.dayId)||[]).length);})}
            monthView={false}
            hasReminder={date=>eventsOnDate(calendarReminders,date).length>0}
            nodes={nodes}
            selectedDate={calendarDate}
            onSelectDate={date=>{setCalendarDate(date);setEditing(null);}}
            onAddBullet={addCalendarBullet}
            onOpenDate={openCalendarDate}
            onEdit={(id) => {
              if (search) setSearch("");
              if (id) focus(id);
              else setEditing(null);
            }}
            onZoom={(id) => {
              setScope(id);
              setTab("notes");
              setEditing(null);
              setSearch("");
            }}
            onMindmap={(id) => {
              setMindmapTarget(id);setScope(id);
              setTab("mindmap");
              setEditing(null);
              setSearch("");
            }}
            onToggle={(id) =>
              mutate((ns) =>
                ns.map((n) =>
                  n.id === id ? { ...n, collapsed: !n.collapsed } : n,
                ),
              )
            }
            onChange={changeBulletContent}
            onEditorChange={changeEditorContent}
            readCurrentNode={readCurrentNode}
            onCommand={command}
            onOutlinePaste={pasteAsOutline}
            onReady={(e) => {
              editor.current = e;
              setActiveEditor(e);
            }}
            onMove={onMove}
            onTask={(id) =>
              mutate((ns) =>
                ns.map((n) =>
                  n.id === id
                    ? {
                        ...n,
                        taskState: n.taskState === "DONE" ? "TODO" : "DONE",
                      }
                    : n,
                ),
              )
            }
            onMenu={openBulletMenu}
            editing={editing}
            caret={caret}
            disabled={disabled}
            assets={assets}
            media={doc.tables.media}
            search={search}
            showCompleted={showCompleted}
            readingSize={ap.size || 16}
            onImages={(id, files) => { void attachImages(id, files); }}
            onRemoveMedia={removeMedia}
              onResizeMedia={resizeMedia}
              onOccludeMedia={setOcclusionImage}
            onDeleteNodes={removeMultiple}
            setNotice={setNotice}
          />
          {selected && <SelectionFormatting editor={activeEditor} disabled={disabled || unsupportedFormatting(selected)} blockStyle={selected.blockStyle || 'paragraph'} onBlock={type => command('block:' + type, selected.id, 0, 0)} dividerStyle={selected.dividerStyle} dividerColor={selected.dividerColor} onDividerStyle={style => command('dividerStyle:' + style, selected.id, 0, 0)} onDividerColor={color => command('dividerColor:' + color, selected.id, 0, 0)} />}
          </>
        )}
        {selected && tab!=="study" && tab!=="dashboard" && tab!=="bookshelf" && tab!=="bookmarks" && tab!=="mindmap" && !dialog && !mcqEditing && !bulkMcqEditing && <MobileEditToolbar editor={activeEditor} disabled={disabled} formattingDisabled={unsupportedFormatting(selected)||!!selected.codeLanguage} blockStyle={selected.blockStyle||'paragraph'} dividerStyle={selected.dividerStyle} dividerColor={selected.dividerColor} onCommand={action=>command(action,selected.id,0,0)} onDone={()=>{activeEditor?.commands.blur();command('stop',selected.id,0,0);}}/>}
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {[
            ["dashboard", "Dashboard", "dashboard"],
            ["notes", "Notes", "notes"],
            ["calendar", "Calendar", "calendar"],
            ["study", "Study Desk", "study"],
              ["bookshelf", "Bookshelf", "study"],
              ["mindmap", "Mindmap", "mindmap"],
              ["bookmarks", "Bookmarks", "link"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              aria-current={tab===id?"page":undefined}
              className={tab === id ? "nav-active" : ""}
              onClick={() => {
                if(id==='mindmap')setMindmapTarget(null);setTab(id);
                setEditing(null);
              }}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
      </main>
      {tagEditor&&<Dialog title={`Tag settings · #${tagEditor}`} onClose={()=>setTagEditor(null)}><TagSettingsForm key={tagEditor} nodes={nodes} tag={tagEditor} settings={tagSettings} disabled={disabled} onSave={saveTagSetting} onRename={renameTag} onClose={()=>setTagEditor(null)}/></Dialog>}
      {nodeDate&&<Dialog title="Bullet date" onClose={()=>setNodeDate(null)}><form onSubmit={e=>{e.preventDefault();mutate(ns=>ns.map(n=>n.id===nodeDate.id?{...n,dueDate:nodeDate.date}:n));setNodeDate(null);}}><label className="field-label">Date<input data-autofocus type="date" aria-label="Bullet date" value={nodeDate.date} onChange={e=>setNodeDate({...nodeDate,date:e.target.value})}/></label><button type="submit" className="study-primary">Save date</button></form></Dialog>}
      {connectionTarget&&<Dialog title={connectionTarget.mode==='mirror'?'Mirror a bullet':connectionTarget.mode==='link'?'Link to a bullet':'Backlinks & mirrors'} onClose={()=>setConnectionTarget(null)}><ConnectionChooser key={connectionTarget.mode+connectionTarget.id} mode={connectionTarget.mode} at={connectionTarget.id} onChoose={n=>{const target=connectionTarget;if(target.mode==='mirror'){mirrorHere(target.id,n.id);}else if(target.mode==='link'){pasteAsOutline(target.id,target.start,target.end,{text:internalLink(n)});setConnectionTarget(null);}else{setConnectionTarget(null);navigateTo(n.id);}}}/></Dialog>}
      {bulkMcqEditing && <BulkMCQEditor doc={doc} id={bulkMcqEditing} onClose={() => setBulkMcqEditing(null)} onSave={() => {
        try {
          const current = docRef.current!, plan = bulkMcqPlan(current, bulkMcqEditing), next: Workspace = configureMcqBranch(current, bulkMcqEditing);
          commit(withNodes(next, next.tables.bullets as Node[]));
          setBulkMcqEditing(null);
          setNotice(`${plan.ready.length} MCQs linked to this notebook. ${plan.skipped.length} skipped; mark one option with @Answer to include them next time.`);
        } catch (error) { showError(error); }
      }} />}
      {mcqEditing && <MCQEditor doc={doc} id={mcqEditing} onClose={() => setMcqEditing(null)} onSave={value => {
        try {
          let next: Workspace = configureMcq(docRef.current!, mcqEditing, value);
          if (value.notebook) next = { ...next, web: { ...next.web, deckTypes: { ...next.web.deckTypes, [mcqEditing]: "MCQ" } }, tables: { ...next.tables, decks: next.tables.decks.some(deck => deck.rootId === mcqEditing) ? next.tables.decks : [...next.tables.decks, { rootId: mcqEditing, createdAt: Date.now(), pinned: 0 }] } };
          commit(withNodes(next, next.tables.bullets as Node[]));
          setMcqEditing(null);
          setNotice("MCQ saved. Study it in Study Desk, or make an MCQ notebook from its parent branch.");
        } catch (error) { showError(error); }
      }} />}
      {researchTarget!==null&&research.state?.drafts[researchTarget]?.ai&&<AiAssistBoundary key={researchTarget+storageAccountKey()} onClose={closeResearch}><React.Suspense fallback={<div className="research-panel" role="status">Opening AI assist…</div>}><AiAssist key={researchTarget+storageAccountKey()} draft={research.state.drafts[researchTarget]} doc={doc} user={cloudUser} disabled={disabled||failed.current} error={research.error} onEdit={draft=>research.put(draft,draft.id)} onInsert={insertAiDraft} onClose={closeResearch} onDiscard={async()=>{await research.put(null,researchTarget);setResearchTarget(null);}}/></React.Suspense></AiAssistBoundary>}
      {researchTarget===''&&<React.Suspense fallback={null}><AiDraftList drafts={Object.values(research.state?.drafts||{})} onChoose={setResearchTarget} onClose={closeResearch}/></React.Suspense>}
      {menuNode && (
        <OutlinePopover className="bullet-actions-menu" key={menuNode.id} title="Bullet actions" anchor={menuAnchor.current} onClose={() => setMenu(null)}>
<BulletMenuBody><div className="popover-quick-actions">
            <button disabled={!research.state} onClick={()=>void openAi(menuNode.id)}><Icon name="star" size={16}/><span>Ask AI</span></button>
            <button onClick={()=>openPane(menuNode.id)}><Icon name="pane" size={16}/><span>Open in pane</span><kbd>Alt+click</kbd></button>
            <button disabled={disabled} onClick={()=>command('action:mindmap',menuNode.id,0,0)}><Icon name="mindmap" size={16}/><span>{menuNode.mindmap?'Remove mindmap':'Mindmap'}</span></button>
            <button disabled={disabled} onClick={()=>command('action:date',menuNode.id,0,0)}><Icon name="calendar" size={16}/><span>Add date…</span></button>
            <button disabled={disabled} onClick={() => { command("complete", menuNode.id, 0, 0); setMenu(null); }}><Icon name="check" size={16} /><span>{menuNode.taskState === "DONE" ? "Uncomplete" : "Complete"}</span><kbd>Ctrl ↵</kbd></button>
            <button disabled={disabled} onClick={() => { toggleStar(menuNode.id); setMenu(null); }}><Icon name="star" size={16} /><span>{starred.includes(menuNode.id) ? "Unstar" : "Star"}</span></button>
            {(idx.children.get(menuNode.id) || []).length > 0 && <button disabled={disabled} onClick={() => { command("toggleCollapse", menuNode.id, 0, 0); setMenu(null); }}><Icon name={menuNode.collapsed ? "expand" : "collapse"} size={16} /><span>{menuNode.collapsed ? "Expand" : "Collapse"}</span><kbd>Ctrl Space</kbd></button>}
</div><details data-tour="format-category" className="bullet-action-section"><summary><Icon name="format" size={16}/><span>Format & type</span><Icon name="chevron" size={13}/></summary><div className="bullet-section-content">            <label className="field-label">Text style<select aria-label="Bullet text style" disabled={disabled} value={['h1','h2','h3','quote','divider'].includes(menuNode.blockStyle) ? menuNode.blockStyle : 'paragraph'} onChange={event => command('block:' + event.target.value, menuNode.id, 0, 0)}><option value="paragraph">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="quote">Quote</option><option value="divider">Divider</option></select></label>
            {menuNode.blockStyle === 'divider' && (
              <>
                <label className="field-label">Divider line style
                  <select aria-label="Divider line style" disabled={disabled} value={menuNode.dividerStyle || 'straight'} onChange={e => { mutate(ns => ns.map(n => n.id === menuNode.id ? { ...n, dividerStyle: e.target.value } : n)); }}>
                    <option value="straight">Straight line</option>
                    <option value="squiggly">Squiggly line</option>
                    <option value="dotted">Dotted line</option>
                  </select>
                </label>
                <label className="field-label">Divider color
                  <select aria-label="Divider color" disabled={disabled} value={menuNode.dividerColor || ''} onChange={e => { mutate(ns => ns.map(n => n.id === menuNode.id ? { ...n, dividerColor: e.target.value } : n)); }}>
                    <option value="">Default color</option>
                    {textColors.map(([name, hex]) => <option key={hex} value={'#' + hex}>{name}</option>)}
                  </select>
                </label>
              </>
            )}
            <button disabled={disabled} onClick={() => { command('action:divider', menuNode.id, 0, 0); setMenu(null); }}><Icon name="divider" size={16}/><span>Insert horizontal divider</span></button>
            <button disabled={disabled} onClick={() => { command("block:code", menuNode.id, 0, 0); focus(menuNode.id); setMenu(null); }}><Icon name="code" size={16}/><span>Turn into code block</span><kbd>Ctrl Alt C</kbd></button>
            <button disabled={disabled} onClick={() => { mutate(ns => ns.map(node => node.id === menuNode.id ? { ...node, taskState: node.taskState === "NONE" ? "TODO" : "NONE", dueDate: "" } : node)); setMenu(null); }}><Icon name="check" size={16} /><span>{menuNode.taskState === "NONE" ? "Turn into task" : "Remove task checkbox"}</span></button>
            <button disabled={disabled} onClick={() => { mutate(ns => ns.map(node => node.id === menuNode.id ? { ...node, kind: node.kind === "QUESTION" ? "NOTE" : "QUESTION" } : node)); setMenu(null); setNotice(menuNode.kind === "QUESTION" ? "Question unmarked" : "Question marked. Its children are the answer."); }}><Icon name="study" size={16} /><span>{menuNode.kind === "QUESTION" ? "Remove question mark" : "Turn into question"}</span></button>
          <label className="field-label">
            List style
            <select
              disabled={disabled}
              aria-label="List style"
              value={menuListStyle}
              onChange={e => command('list:' + e.target.value, menuNode.id, 0, 0)}
            >
              <option value="" disabled>Mixed</option>
              <option value="NONE">None</option>
              <option value="UNORDERED">Bulleted</option>
              <option value="ORDERED">Numbered</option>
            </select>
          </label>
          <label className="field-label">
            Bullet type
            <select
              disabled={disabled}
              aria-label="Bullet type"
              value={menuBulletKind}
              onChange={e => command('kind:' + e.target.value, menuNode.id, 0, 0)}
            >
              <option value="" disabled>Mixed</option>
              <option value="NOTE">Note</option>
              <option value="QUESTION">Question</option>
              <option value="ANSWER">Answer</option>
            </select>
          </label>
</div></details><details data-tour="insert-category" className="bullet-action-section"><summary><Icon name="insert" size={16}/><span>Insert</span><Icon name="chevron" size={13}/></summary><div className="bullet-section-content"><button disabled={disabled} onClick={()=>command('action:music',menuNode.id,0,0)}><Icon name="music" size={16}/><span>{doc.web.musicNodes?.[menuNode.id]?"Turn off music gallery":"Music gallery"}</span></button><button disabled={disabled} onClick={()=>command('action:gallery',menuNode.id,0,0)}><Icon name="image" size={16}/><span>{doc.web.galleryNodes?.[menuNode.id]?"Turn off gallery":"Show as gallery"}</span></button><button disabled={disabled} onClick={()=>command('action:table',menuNode.id,0,0)}><Icon name="table" size={16}/><span>Insert table</span></button>            <button disabled={disabled || unsupportedFormatting(menuNode as Node)} onClick={() => insertNotation(menuNode.id, false)}><Icon name="equation" size={16}/><span>Insert LaTeX equation</span></button>
            <button disabled={disabled || unsupportedFormatting(menuNode as Node)} data-tour="create-diagram" data-keywords="diagram flowchart mindmap chart sequence" onClick={() => openDiagram({id:menuNode.id})}><Icon name="diagram" size={16}/><span>Create diagram…</span></button><button disabled={disabled} data-tour="create-drawing" data-keywords="drawing sketch excalidraw canvas whiteboard" onClick={()=>openDrawing(menuNode.id)}><Icon name="sketch" size={16}/><span>Draw with Excalidraw…</span></button>
            <button data-tour="insert-image" disabled={disabled} onClick={() => { mediaTarget.current = menuNode.id; imageInput.current?.click(); }}><Icon name="image" size={16} /><span>Add images…</span></button>
            <button disabled={disabled || unsupportedFormatting(menuNode as Node)} onClick={() => openEmojiPicker(menuNode.id)}><Icon name="emoji" size={16} /><span>Insert animated emoji…</span></button>
            <button disabled={disabled} onClick={() => { mediaTarget.current = menuNode.id; setEmbedValue(""); setMenu(null); setDialog("embed"); }}><Icon name="play" size={16} /><span>Insert media link…</span></button>
</div></details><details className="bullet-action-section"><summary><Icon name="connections" size={16}/><span>Connections</span><Icon name="chevron" size={13}/></summary><div className="bullet-section-content">            <button disabled={disabled} onClick={()=>command('relation:link',menuNode.id,menuNode.text.length,menuNode.text.length)}><Icon name="link" size={16}/><span>Link to a bullet…</span><kbd>[[</kbd></button>
            <button disabled={disabled} onClick={()=>command('relation:mirror',menuNode.id,menuNode.text.length,menuNode.text.length)}><Icon name="mirror" size={16}/><span>Mirror a bullet here…</span><kbd>((</kbd></button>
            <button onClick={()=>command('relation:backlinks',menuNode.id,0,0)}><Icon name="backlinks" size={16}/><span>Backlinks & mirrors…</span></button>
            {menuNode.mirrorSourceId&&<button onClick={()=>{navigateTo(menuNode.mirrorSourceId);setMenu(null);}}><Icon name="mirror" size={16}/><span>Open mirror source</span></button>}
            {menuNode.mirrorSourceId&&<button disabled={disabled} onClick={()=>{mutate(ns=>detachMirror(ns,menuNode.id));setMenu(null);setNotice('Mirror detached. This branch is now independent.');}}><Icon name="mirror" size={16}/><span>Detach mirror</span></button>}

</div></details><details className="bullet-action-section"><summary><Icon name="organize" size={16}/><span>Organize branch</span><Icon name="chevron" size={13}/></summary><div className="bullet-section-content">
          {copyTargets().map(target => <button key={target.key} className="wide action" disabled={disabled} onClick={async () => {
            setMenu(null);
            try { await flush(); const count = await copyBranch(docRef.current!, menuNode.id, target); setNotice(`Copied ${count} bullet${count === 1 ? "" : "s"} to “${target.name}”.${target.synced ? " It syncs the next time you open that workspace." : ""} Images and attachments are not copied.`); }
            catch (e) { setNotice(e instanceof Error ? e.message : String(e)); }
          }}><Icon name="upload" />Copy to “{target.name}”</button>)}
          <div className="action-grid">
            {(idx.children.get(menuNode.id) || []).length > 0 && <>
              <button disabled={disabled} onClick={() => { command("expandBranch", menuNode.id, 0, 0); setMenu(null); }}><Icon name="expand" size={16} />Expand entire branch</button>
              <button disabled={disabled} onClick={() => { command("collapseBranch", menuNode.id, 0, 0); setMenu(null); }}><Icon name="collapse" size={16} />Collapse entire branch</button>
            </>}
            <button
              onClick={() => {
                setScope(menuNode.id);
                setEditing(null);
                setMenu(null);
              }}
            >
              <Icon name="link" />
              Zoom into branch
            </button>
            <button
              disabled={disabled}
              onClick={() => {
                mutate((ns) => indent(ns, menuNode.id));
                setMenu(null);
              }}
            >
              <Icon name="indent" />
              Indent
            </button>
            <button
              disabled={disabled}
              onClick={() => {
                mutate((ns) => outdent(ns, menuNode.id));
                setMenu(null);
              }}
            >
              <Icon name="outdent" />
              Outdent
            </button>
          </div>
</div></details>{menuNode.blockStyle !== 'divider' && <details data-tour="study-category" className="bullet-action-section"><summary><Icon name="learn" size={16}/><span>Study</span><Icon name="chevron" size={13}/></summary><div className="bullet-section-content">            <button disabled={disabled} onClick={() => { setMcqEditing(menuNode.id); setMenu(null); }}><span aria-hidden="true">Ⓐ</span><span>{doc.web.mcqs?.[menuNode.id] ? "Edit MCQ…" : "Turn into MCQ…"}</span></button>
          <button
            className="wide action"
            disabled={disabled}
            onClick={() => {
              const now = Date.now(),
                id = menuNode.id;
              const ns = nodes;
              const current = docRef.current!,
                layout = inferDeckLayout(ns, id),
                decks = current.tables.decks.some((d) => d.rootId === id)
                  ? current.tables.decks.map(deck => deck.rootId === id ? { ...deck, layout } : deck)
                  : [
                      ...current.tables.decks,
                      { rootId: id, createdAt: now, pinned: 0, layout },
                    ];
              commit(
                withNodes(
                  enableStudyBranch({ ...current, tables: { ...current.tables, decks } },id),
                  ns,
                ),
              );
              setMenu(null);
              setNotice("Deck linked. Open Study Desk to start learning.");
            }}
          >
            <Icon name="study" />
            Make Q&A deck
          </button>
          <button className="wide action" disabled={disabled} onClick={() => {
            const plan = bulkMcqPlan(docRef.current!, menuNode.id);
            if (plan.ready.some(item => item.id !== menuNode.id) || plan.skipped.some(item => item.id !== menuNode.id)) { setBulkMcqEditing(menuNode.id); setMenu(null); }
            else if ((idx.children.get(menuNode.id) || []).length === 4 && !doc.web.mcqs?.[menuNode.id]) { setMcqEditing(menuNode.id); setMenu(null); }
            else makeMcqNotebook(menuNode.id);
          }}><Icon name="study" />Make MCQ notebook</button>
          <button className="wide action" disabled={disabled} onClick={() => { setBulkMcqEditing(menuNode.id); setMenu(null); }}><Icon name="study" />Bulk convert branch to MCQs…</button>
          {doc.web.mcqs?.[menuNode.id] && <button className="wide action" disabled={disabled} onClick={() => {
            const current = docRef.current!, mcqs = { ...current.web.mcqs }, deckTypes = { ...current.web.deckTypes };
            delete mcqs[menuNode.id]; delete deckTypes[menuNode.id];
            commit({ ...current, web: { ...current.web, mcqs, deckTypes } }); setMenu(null);
          }}>Convert MCQ to regular flashcard</button>}
          <p className="deck-preview">{generatedCards(nodes, [{ rootId: menuNode.id }], doc.tables.media).length} cards · nested question/answer pairs are included. A single pair uses this bullet as the question.</p>
</div></details>}</BulletMenuBody><div className="bullet-menu-danger">          <button
            className="wide danger action"
            disabled={disabled}
            onClick={() => remove(menuNode.id)}
          >
            <Icon name="trash" />
            Move branch to Trash
          </button>
</div>        </OutlinePopover>
      )}
      <input ref={imageInput} type="file" className="media-file-input" aria-label="Choose images for bullet" accept="image/*,audio/*,video/mp4,video/webm,video/ogg,.heic,.heif,.tif,.tiff,.jxl,.psd,.raw" multiple onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ""; if (mediaTarget.current) void attachImages(mediaTarget.current, files); }} />
      {dialog === 'emoji' && <Dialog title="Animated emojis" onClose={() => { emojiDownload.current?.abort(); emojiTarget.current = null; setDialog(null); }}><EmojiPicker emojis={doc.tables.emojis} assets={assets} disabled={disabled} onChoose={chooseEmoji} onImport={importEmojiFiles} /></Dialog>}
      {dialog === "embed" && <Dialog title="Insert media link" onClose={() => setDialog(null)}><form onSubmit={event => {
        event.preventDefault();
        const raw = embedValue.trim(), iframeSource = raw.match(/<iframe[^>]+src\s*=\s*["']([^"']+)["']/i)?.[1],
          item = mediaLink(iframeSource || raw), id = mediaTarget.current;
        if (!item || !id) { showError(Error("Enter a valid image, YouTube, Instagram, Vimeo, or web link.")); return; }
        mutate(ns => ns.map(node => node.id === id ? { ...node, text: node.text + (node.text ? "\n" : "") + (iframeSource || raw) } : node));
        setDialog(null);
        setNotice("Link added to the bullet");
      }}><label className="field-label">Share URL or embed code<input data-autofocus aria-label="Media share URL" placeholder="Paste a YouTube, Instagram or image link" value={embedValue} onChange={event => setEmbedValue(event.target.value)} /></label><p className="dialog-muted">Supported share links become players in your notes and flashcards. Players load when you choose to open them.</p><button className="study-primary" type="submit" disabled={disabled || !embedValue.trim()}>Insert link</button></form></Dialog>}
      {viewMenu && <OutlinePopover title="Outline options" anchor={viewAnchor.current} onClose={() => setViewMenu(false)}>
        <div className="popover-quick-actions">
          <button disabled={!research.state} onClick={()=>{setViewMenu(false);setResearchTarget('');}}>AI drafts</button>
          <button disabled={disabled} onClick={() => editorPrefs("showCompleted", !showCompleted)}><Icon name="check" size={16} /><span>{showCompleted ? "Hide completed" : "Show completed"}</span></button>
          {[false, true].map(collapsed => <button key={String(collapsed)} disabled={disabled} onClick={() => { mutate(ns => { const ids = new Set(rows(ns, scope, true).map((row: any) => row.bullet.id)); return ns.map(n => ids.has(n.id) ? { ...n, collapsed } : n); }); setViewMenu(false); }}><Icon name={collapsed ? "collapse" : "expand"} size={16} /><span>{collapsed ? "Collapse all" : "Expand all"}</span></button>)}
          <button onClick={() => { toggleSidebar(); setViewMenu(false); }}><Icon name="sidebar" size={16} /><span>{sidebarShown ? "Hide sidebar" : "Show sidebar"}</span><kbd>Ctrl \</kbd></button>
          <button onClick={() => { setDialog("settings"); setViewMenu(false); }}><Icon name="settings" size={16}/><span>Settings & backups</span></button>
          {cloudUser && <button onClick={() => { setViewMenu(false); void accountAction(true); }}><Icon name="logout" size={16}/><span>Sign out</span></button>}
          <button onClick={()=>{setDialog("help");setViewMenu(false);}}><Icon name="learn" size={16}/><span>Show me how</span></button>
          <button onClick={() => { setDialog("shortcuts"); setViewMenu(false); }}><Icon name="help" size={16} /><span>Keyboard shortcuts</span></button>
          <a className="feature-guide-link" href="/guides" target="_blank" rel="noopener noreferrer"><Icon name="learn" size={16}/><span>Guides & tutorials</span><Icon name="forward" size={12}/></a>
        </div>
      </OutlinePopover>}
      <GuidedTours key={cloudUser?.uid||'guest'} open={dialog==='help'} account={storageAccountKey()} signedIn={!!cloudUser} onOpenChange={open=>setDialog(open?'help':null)} onCloseMenus={()=>{setMenu(null);setViewMenu(false);}} onNavigate={async nextTab=>{await flush();if(failed.current)throw Error('Saving needs attention before changing views.');if(readerTarget)closeReader();setMenu(null);setViewMenu(false);setEditing(null);setTab(nextTab);if(nextTab==='notes'){setScope(null);setSearch('');}}} onBulletMenu={()=>{document.querySelector('[data-tour-active-bullet]')?.removeAttribute('data-tour-active-bullet');const row=[...document.querySelectorAll<HTMLElement>('.outline-row[data-node-id]')].find(el=>el.getClientRects().length>0&&docRef.current?.tables.bullets.some(n=>n.id===el.dataset.nodeId&&n.blockStyle!=='divider')),button=row&&[...row.querySelectorAll<HTMLButtonElement>('[aria-label="Bullet actions"]')].find(el=>el.getClientRects().length>0);if(!button)return false;button.setAttribute('data-tour-active-bullet','');return true;}}/>
      {readerTarget&&<ReaderBoundary key={readerTarget.hash} onClose={closeReader}><React.Suspense fallback={<ReaderStartup onClose={closeReader}/>}><BookReader onHelp={()=>setDialog("help")} user={cloudUser} doc={doc} target={readerTarget} disabled={disabled||failed.current} onClose={closeReader} onAi={openReaderAi} onNote={id=>navigateTo(id)} renderNotes={()=> <React.Suspense fallback={<p role="status">Loading book notes…</p>}><ReaderBookNotes onCommit={()=>{if(viewTimer.current)publishView(true);}} doc={doc} hash={readerTarget.hash} assets={assets} disabled={disabled||failed.current} onText={changeEditorContent} readCurrentNode={readCurrentNode} onUndo={undo} canUndo={history.current.undo.length>0} canRedo={history.current.redo.length>0} onFullNotes={id=>{closeReader();navigateTo(id);}} onAdd={()=>{if(failed.current)throw Error('Saving is paused. Open Account settings to retry.');const current=docRef.current!,book=readingBook(current,readerTarget.hash),id=crypto.randomUUID();const next=addReadingNote(current,book,id);commit(withNodes(next,next.tables.bullets as Node[]));return id;}}/></React.Suspense>} onScreenshot={async(unit,blob)=>{
        if(cloudUser&&authenticatedUid()!==cloudUser.uid)throw Error('Your account changed. Open the book again to capture a page.');
        if(failed.current||working||!readerTarget)throw Error('Wait for saving to finish, then try again.');
        const current=docRef.current!,book=readingBook(current,readerTarget.hash);if(!book)throw Error('The original book is no longer available.');
        const id=crypto.randomUUID(),fileName=id+(blob.type==='image/png'?'.png':'.webp'),path='media/'+fileName;
        const result=captureReadingImage(current,book,unit,{id,fileName,mimeType:blob.type}),added=new Map([[path,blob]]);checkNewAssets(assetsRef.current,added);
        const nextAssets=new Map(assetsRef.current);nextAssets.set(path,blob);pendingAssets.current.set(path,blob);assetsRef.current=nextAssets;setAssets(nextAssets);
        commit(withNodes(result.doc,result.doc.tables.bullets as Node[]));await flush();if(failed.current)throw Error('The capture is in your notes, but saving needs attention. Open Account settings to retry.');
      }} onChange={(update,undo=false)=>{if(failed.current)throw Error('Saving has stopped. Your existing notes are safe; reopen Account settings to retry.');const current=docRef.current!,next=update(current);if(next!==current){validateReading(next.web);commit(next.tables.bullets!==current.tables.bullets?withNodes(next,next.tables.bullets as Node[]):next,undefined,undo);}}}/></React.Suspense></ReaderBoundary>}
      {dialog === "jump" && <CommandPalette nodes={nodes} onClose={()=>setDialog(value=>value==='jump'?null:value)} onChoose={async id=>{await flush();if(failed.current)throw Error('Saving needs attention before changing views.');navigateTo(id);}} actions={[
        ...[['notes','Open notes','notes'],['dashboard','Open dashboard','dashboard'],['bookmarks','Open Bookmarks','link'],['bookshelf','Open bookshelf','study'],['study','Open Study Desk','study'],['calendar','Open calendar','calendar'],['mindmap','Open Mindmaps','mindmap']].map(([id,label,icon])=>({id,label,icon,keywords:id==='study'?['review','cards','learn']:id==='bookshelf'?['pdf','epub','reader','books']:[],run:async()=>{await flush();if(failed.current)throw Error('Saving needs attention before changing views.');setEditing(null);if(id==='mindmap')setMindmapTarget(null);setTab(id);setSearch('');if(id==='notes')setScope(null);}})),
        {id:'new-note',label:'Create a new note',icon:'plus',keywords:['add','bullet'],disabled,run:async()=>{await flush();if(failed.current)throw Error('Saving needs attention before adding a note.');setTab('notes');setScope(null);setSearch('');add(null);}},
        {id:'sidebar',label:'Toggle sidebar',icon:'pane',run:toggleSidebar},
        {id:'settings',label:'Open settings & backups',icon:'settings',run:()=>setDialog('settings')},
        {id:'help',label:'Show me how',icon:'help',keywords:['tour','walkthrough','guide'],run:()=>setDialog('help')},
        {id:'shortcuts',label:'Keyboard shortcuts',icon:'help',run:()=>setDialog('shortcuts')},
      ]}/>}
      {dialog === "shortcuts" && <Dialog title="Keyboard shortcuts" className="shortcuts-dialog" onClose={() => setDialog(null)}><KeyboardShortcuts/></Dialog>}
      {dialog === "settings" && (
        <Dialog title="Settings" className="settings-dialog" onClose={() => setDialog(null)}>
          <nav className="settings-navigation" aria-label="Settings sections" data-mobile-shown={settingsList}>
            {SETTINGS_GROUPS.map(([group,items])=><div key={group} className="settings-group"><span className="settings-group-title">{group}</span>
              {items.filter(([id])=>id!=='desktop'||isApp()).map(([id,label,icon])=>[id,id==='desktop'&&isMobileApp()?'This device':label,icon]).map(([id,label,icon])=><button key={id} aria-current={settingsPanel===id?"page":undefined} onClick={()=>{setSettingsPanel(id);setSettingsList(false);}}><Icon name={icon} size={15}/><span>{label}</span><Icon name="forward" size={14}/></button>)}
            </div>)}
          </nav>
          <div className="settings-content" key={settingsPanel} data-mobile-shown={!settingsList}>
          <button className="settings-back" onClick={()=>setSettingsList(true)}><Icon name="back" size={16}/>All settings</button>
          {settingsPanel==="study" && <section aria-label="Study"><div className="settings-section-heading"><h3>Study</h3><p>How Study Desk schedules your flashcards and multiple-choice questions.</p></div><FsrsPreferences open doc={doc} disabled={disabled} onChange={next=>commit(next,undefined,false)}/></section>}
          {settingsPanel==="shortcuts" && <section aria-label="Keyboard shortcuts"><KeyboardShortcuts/></section>}
          {settingsPanel==="appearance" && <section aria-label="Appearance"><div className="settings-section-heading"><h3>Feel at home.</h3><p>Choose how your workspace looks and reads.</p></div>
          <div className="settings-tabs">
            <label className="field-label">
              Theme
              <select
                value={ap.theme || "System"}
                disabled={disabled}
                onChange={(e) => prefs("theme", e.target.value)}
              >
                {[
                  "System",
                  "Light",
                  "Dark",
                  "Dracula",
                  "Nord",
                  "Gruvbox",
                  "Catppuccin Mocha",
                  "Catppuccin Latte",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Font
              <select
                value={ap.font || "Sans"}
                disabled={disabled}
                onChange={(e) => prefs("font", e.target.value)}
              >
                {["Sans", "Serif", "Mono", "Rounded"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field-label">
            Reading size · {ap.size || 16}px
            <input
              type="range"
              min="14"
              max="26"
              value={ap.size || 16}
              disabled={disabled}
              onChange={(e) => prefs("size", Number(e.target.value))}
            />
          </label>
          
          <label className="emoji-setting"><input type="checkbox" checked={ap.animateEmojis !== false} disabled={disabled} onChange={event => prefs('animateEmojis', event.target.checked)} />Animate emojis</label>
          <p className="dialog-muted">Motion follows your device’s reduced-motion preference.</p>
          </section>}
          {settingsPanel==="account" && <section aria-label="Account">
          <section className="cloud-account">
            <div className="cloud-account-heading"><div><h3>{cloudUser ? 'Your account' : 'Your notes, everywhere'}</h3><p>{cloudUser?.email || 'Sign in to keep a private workspace.'}</p></div><CloudAccountStatus signal={cloud.signal}/></div>
            {cloudUser ? <><AccountSecurity user={cloudUser}/><div className="cloud-account-actions"><button className="action" onClick={()=>void accountAction(true)}>Sign out</button></div><p className="dialog-muted">Edits save securely in this browser first, including while offline. Your signed-in workspace syncs to the cloud and your other devices when connected.</p><details className="settings-disclosure"><summary>Sync details & limits</summary><button className="action" onClick={async()=>{try{const entries=await syncOperation('recovery-export');if(!entries.length){setNotice('No sync recovery entries on this device.');return;}download(new Blob([JSON.stringify({format:'remonook-sync-recovery-v1',entries},null,2)],{type:'application/json'}),'remonook-sync-recovery.json');}catch(e){showError(e);}}}>Download device sync recovery</button><p className="dialog-muted">Your changes save on this device first and update across devices automatically when connected. RemoNook keeps recovery copies in the background. Note attachments: 2 MiB each · 20 MiB total. Books: 25 MiB each. Combined cloud storage: 100 MiB. Notes: 900 KiB per workspace.</p></details>

            {!doc.tables.bullets.length&&<button className="wide action" disabled={disabled} onClick={async()=>{try{await flush();const guest=await load('remo-web'),guestAssets=await getAssets('remo-web');if(!guest)throw Error('No device-only notes found.');if(!confirm('Copy device-only notes into this account? They will upload to your private cloud workspace.'))return;const next=await save(persisted.current,{...guest,web:{...guest.web,deviceId:docRef.current!.web.deviceId}},'copy device notes',guestAssets,true);persisted.current=next;docRef.current=next;assetsRef.current=guestAssets;setDoc(next);setAssets(guestAssets);}catch(e){showError(e);}}}>Import existing device-only notes…</button>}
</> : <><button className="wide action cloud-google" disabled={disabled} onClick={()=>void accountAction()}>Sign in or create account</button><p className="dialog-muted">Your current notes stay in the device-only workspace. After signing in, you can choose to import them. Sign out to return to these notes.</p></>}
            <CloudAccountStatus signal={cloud.signal} error/>
          </section>
          <section className="upload-storage-status"><h3>Attachment storage</h3><p className="dialog-muted">{(attachmentBytes(assets)/1024/1024).toFixed(1)} MB / 20 MB used · 2 MB per file</p><progress aria-label="Attachment storage used" max={MAX_ATTACHMENT_BYTES} value={Math.min(attachmentBytes(assets),MAX_ATTACHMENT_BYTES)}/><p className="dialog-muted">Note attachments in this workspace. Books have separate on-demand storage in Settings → Storage. Embedded links use no space.</p></section>
          </section>}
          {settingsPanel==="connections"&&<GoogleTasksConnection/>}
          {settingsPanel==="ai"&&<AiApps user={cloudUser}/>}
          {settingsPanel==="desktop"&&isDesktop()&&<DesktopSettings/>}
          {settingsPanel==="desktop"&&isMobileApp()&&<section className="ai-apps" aria-label="This device"><LocalSyncSettings/></section>}
          {settingsPanel==="storage"&&<BookStorage key={cloudUser?.uid||'guest'} user={cloudUser} doc={doc} disabled={disabled} onRead={openReader} onSignIn={()=>accountAction()} onChange={async update=>{const current=docRef.current!,next=update(current);if(next!==current){commit(next,undefined,false);await flush();if(failed.current)throw Error('Book metadata could not be saved. The original remains on this device; try adding it again.');}}}/>}
          {settingsPanel==="backups" && <section aria-label="Backups"><div className="settings-section-heading"><h3>Your notes. Your copy.</h3><p>A full backup includes notes, media, decks and study progress.</p></div><div className="settings-backup-actions">
          <button
            className="wide action"
            disabled={working}
            onClick={() => backup()}
          >
            <Icon name="download" />
            Download full backup
          </button>
          <button
            className="wide action"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" />
            Restore from backup…
          </button>
          </div><p className="dialog-muted">Automatic folder syncing has been retired. Existing RemoNook folder ZIPs were not deleted; use “Restore from backup…” to import a copy when needed.</p>
          <details className="settings-disclosure"><summary><Icon name="history" size={16}/>Recovery & more</summary><div className="settings-advanced">
          <button
            className="wide action"
            disabled={working || androidBlockers(doc).length > 0}
            title={androidBlockers(doc).join("; ")}
            onClick={() => backup(true)}
          >
            <Icon name="download" />
            Download Android-compatible backup
          </button>
          {androidBlockers(doc).length > 0 && (
            <p className="dialog-muted">
              Android export is blocked because this data contains extensions.
              Full backup preserves them.
            </p>
          )}
          <button
            className="wide action"
            disabled={disabled}
            onClick={async () => {
              try {
                const r = await recovery();
                if (!r) throw Error("No pre-restore recovery snapshot yet");
                setRestore({
                  doc: r.document,
                  assets: new Map(r.assets),
                  warnings: [],
                });
                setDialog("restore");
              } catch (e) {
                showError(e);
              }
            }}
          >
            <Icon name="undo" />
            Recover pre-restore notes…
          </button>
          <button className="wide action" onClick={() => setDialog("trash")}>
            <Icon name="trash" />
            Open Trash
          </button>
          <button
            className="wide action"
            disabled={working}
            onClick={async () => {
              try {
                const ok = await navigator.storage?.persist?.();
                setNotice(
                  ok
                    ? "Persistent storage granted"
                    : "Browser did not grant persistent storage. Keep downloadable backups.",
                );
              } catch (e) {
                showError(e);
              }
            }}
          >
            <Icon name="check" />
            Request persistent browser storage
          </button>
          </div></details><p className="settings-footnote">Notes save automatically in this browser. Keep a backup somewhere safe.</p></section>}
          </div>
        </Dialog>
      )}
      {dialog === "restore" && restore && (
        <Dialog
          title="Restore backup?"
          onClose={() => {
            setDialog(null);
            setRestore(null);
          }}
        >
          <p>
            This will replace this browser’s notes and settings. A recovery
            snapshot of the current data will be saved first.
          </p>
          <div className="preview-counts">
            <span>
              <b>{restore.doc.tables.bullets.length}</b> bullets
            </span>
            <span>
              <b>{restore.doc.tables.cards.length}</b> cards
            </span>
            <span>
              <b>{restore.assets.size}</b> attachments
            </span>
          </div>
          {restore.warnings.length > 0 && (
            <p className="dialog-muted">
              Additional fields are preserved. Android export will remain
              blocked until compatible: {restore.warnings.join("; ")}
            </p>
          )}
          <div className="dialog-buttons">
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
          {!!doc.tables.trash.length&&<div className="trash-summary"><span>{doc.tables.trash.length} deleted {doc.tables.trash.length===1?'item':'items'} · {doc.tables.trash.reduce((n,t)=>n+t.nodeCount,0)} bullets</span><button className="danger" disabled={disabled} onClick={()=>{setEmptyTrashIds(docRef.current!.tables.trash.map(t=>t.id));setDialog('purge:all');}}>Empty trash</button></div>}
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
          title={dialog==='purge:all'?"Empty trash?":"Permanently delete branch?"}
          onClose={() => setDialog("trash")}
        >
          <p>
            {dialog==='purge:all'?`Permanently delete ${emptyTrashIds.length} selected deleted ${emptyTrashIds.length===1?'item':'items'} and their unused attachments? This cannot be undone.`:'Permanently delete this branch and its unused attachments? This cannot be undone.'} Live notes and existing backups are kept.
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
                  const ids=dialog==='purge:all'?emptyTrashIds:[dialog.slice(6)],current=docRef.current!,purged=planTrashPurge(current,ids),next=purged.next,removed=purged.removed;
                  if(!purged.count){setDialog('trash');setNotice('These items are no longer in Trash.');return;}
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
                  const nextAssets=new Map([...assetsRef.current].filter(([path])=>!removed.includes(path)));assetsRef.current=nextAssets;setAssets(nextAssets);for(const path of removed)pendingAssets.current.delete(path);
                  setDialog("trash");
                  setNotice(purged.count===1?"Item permanently deleted":`${purged.count} items permanently deleted`);
                } catch (e) {
                  showError(e);
                } finally {
                  setWorking(false);
                }
              }}
            >
              {working?'Deleting…':dialog==='purge:all'?'Empty trash permanently':'Delete permanently'}
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
      {tablePicker&&<TablePicker onClose={()=>setTablePicker(null)} onPick={grid=>insertTable(tablePicker,grid)}/>}
      {reminderEditor&&<ReminderEditor key={`${reminderEditor.id||'new'}:${reminderEditor.date}`} doc={doc} target={reminderEditor} disabled={disabled} onChange={next=>commit(next)} onClose={()=>setReminderEditor(null)}/>}
      {diagramTarget&&<VisualToolLoader title="Diagram workspace" onClose={()=>setDiagramTarget(null)}><DiagramEditor source={diagramTarget.source} editing={!!diagramTarget.original} disabled={disabled} onClose={()=>setDiagramTarget(null)} onSave={source=>{if(disabled)throw Error('Saving is unavailable.');const next=saveDiagram(docRef.current!.tables.bullets,diagramTarget,source);commit(withNodes(docRef.current!,next));setDiagramTarget(null);setNotice('Diagram saved to your note.');}}/></VisualToolLoader>}
      {drawingTarget&&<VisualToolLoader title="Drawing workspace" onClose={()=>setDrawingTarget(null)}><DrawingEditor blob={drawingTarget.mediaId?assets.get('media/'+doc.tables.media.find(m=>m.id===drawingTarget.mediaId)?.fileName):undefined} title={drawingTarget.mediaId?doc.tables.media.find(m=>m.id===drawingTarget.mediaId)?.credit:undefined} theme={['Light','Catppuccin Latte'].includes(theme)?'light':'dark'} disabled={disabled} onClose={()=>setDrawingTarget(null)} onSave={saveDrawing}/></VisualToolLoader>}
      {occlusionImage && doc.tables.media.some(item=>item.id===occlusionImage) && <OcclusionEditor groupId={(Object.values(doc.web.occlusions||{}) as any[]).find(config=>config.mediaId===occlusionImage)?.groupId} doc={doc} item={doc.tables.media.find(item=>item.id===occlusionImage)!} assets={assets} disabled={disabled} onSave={next=>{commit(next);setNotice('Image occlusion cards saved to Study Desk.');}} onClose={()=>setOcclusionImage(null)}/>}
      <ReleaseUpdate enabled={import.meta.env.PROD} onApply={async()=>{
        if(working||cloudApplying.current||activeEditor?.view.composing||document.querySelector('dialog[open],[role="dialog"],[data-composing="true"]'))throw Error('Finish the open editor or dialog before updating.');
        await flush();
        if(failed.current||dirty.current||pendingAssets.current.size||cloudApplying.current||docRef.current!==persisted.current)throw Error('Your latest changes need to finish saving before updating.');
        location.reload();
      }}/>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          {notice}
        </div>
      )}
    </div>
    </EmojiProvider>
    </ConnectionContext.Provider></TagSettingsContext.Provider>
    </VisualToolsContext.Provider></SearchContext.Provider></TableContext.Provider></GalleryContext.Provider></MusicProvider></ReadingSources.Provider></GoogleTasksProvider>
  );
}
export const appRoot = createRoot(document.getElementById("root")!);
// The browser half of desktop Google sign-in runs on its own page (see DesktopSignIn).
appRoot.render(<RecoveryBoundary onBackup={downloadRecovery}>{window.location.hash === "#desktop-signin" && !isApp() ? <DesktopSignIn/> : window.location.hash === "#quick-capture" && isDesktop() ? <QuickCapture/> : (import.meta.env.PROD || import.meta.env?.DEV) ? <AuthGate>{user=><App cloudUser={user}/>}</AuthGate> : <App />}</RecoveryBoundary>);

// The desktop app bundles its files, so it needs no offline service worker.
if (import.meta.env.PROD && "serviceWorker" in navigator && !isApp())
  navigator.serviceWorker.register("/sw.js").catch(() => {});
installDesktopLinks();
void retireDesktopOfflineShell().catch(()=>{});
