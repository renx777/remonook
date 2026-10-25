import { useEffect, useId, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import {Icon} from './icons';

export const blockCommands = [
  {id:'music',label:'Music gallery',detail:'Audio files, YouTube Music and Spotify',keys:'',terms:'music audio playlist spotify youtube',icon:'music'},
  {id:'gallery',label:'Gallery',detail:'Images, GIFs and videos in a media grid',keys:'',terms:'gallery photos images video album',icon:'image'},
  {id:'table',label:'Table',detail:'Cells with simple spreadsheet formulas',keys:'',terms:'table spreadsheet sum formula',icon:'notes'},
  {id:'bulleted',label:'Bullets',detail:'Unordered list',keys:'Ctrl Shift 8',terms:'bullet unordered list',icon:'notes'},
  {id:'task',label:'To-do',detail:'Add a checkbox',keys:'Ctrl Alt T',terms:'task todo checkbox',icon:'check'},
  {id:'h1',label:'Heading 1',detail:'Large heading',keys:'Ctrl Alt 1',terms:'h1 heading title',icon:'H1'},
  {id:'h2',label:'Heading 2',detail:'Medium heading',keys:'Ctrl Alt 2',terms:'h2 heading subtitle',icon:'H2'},
  {id:'h3',label:'Heading 3',detail:'Small heading',keys:'Ctrl Alt 3',terms:'h3 heading',icon:'H3'},
  {id:'paragraph',label:'Paragraph',detail:'Normal text size',keys:'Ctrl Alt 0',terms:'paragraph text normal',icon:'¶'},
  {id:'quote',label:'Quote',detail:'Quoted text',keys:'',terms:'quote blockquote',icon:'quote'},
  {id:'code',label:'Code Block',detail:'Syntax highlighting',keys:'Ctrl Alt C',terms:'code programming snippet',icon:'code'},
  {id:'divider',label:'Divider',detail:'Horizontal line',keys:'',terms:'divider horizontal line separator',icon:'divider'},
  {id:'image',label:'Upload image',detail:'Add an image from this device',keys:'',terms:'upload image file picture',icon:'image'},
  {id:'numbered',label:'Number',detail:'Numbered list',keys:'Ctrl Shift 7',terms:'number ordered list',icon:'numbered'},
  {id:'complete',label:'Complete',detail:'Complete or reopen this bullet',keys:'Ctrl Enter',terms:'complete done uncomplete',icon:'check'},
  {id:'date',label:'Add date',detail:'Attach a date to this bullet',keys:'',terms:'date calendar due deadline',icon:'calendar'},
  {id:'countdown',label:'Countdown',detail:'Track days left to an exam or target date',keys:'',terms:'countdown target exam days left',icon:'renewal'},
  {id:'pane',label:'Open in pane',detail:'Open a separate view of this bullet',keys:'Alt+click',terms:'pane split view window',icon:'pane'},
  {id:'question',label:'Flashcard question',detail:'Child bullets form the answer',keys:'',terms:'question flashcard answer',icon:'study'},
  {id:'mcq',label:'MCQ',detail:'Multiple choice question',keys:'Ctrl Alt M',terms:'mcq quiz multiple choice question',icon:'study'},
  {id:'link',label:'Link to a bullet',detail:'Create a backlink',keys:'[[',terms:'link backlink reference',icon:'link'},
  {id:'mirror',label:'Mirror a bullet',detail:'Live shared branch',keys:'((',terms:'mirror synced live copy',icon:'link'},
  {id:'backlinks',label:'View backlinks',detail:'Links and mirror locations',keys:'',terms:'backlinks references connections',icon:'link'},
  {id:'plain',label:'Plain bullet',detail:'Reset block styling',keys:'',terms:'plain note reset',icon:'notes'},
];
export function SlashMenu({ editor, enabled, keyHandler, onChoose }: { editor: Editor; enabled: boolean; keyHandler: MutableRefObject<((event: KeyboardEvent) => boolean) | null>; onChoose: (id: string) => void }) {
  const [query, setQuery] = useState<{ from: number; to: number; text: string } | null>(null), [active, setActive] = useState(0), [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 360 });
  const dismissed = useRef(''), popup = useRef<HTMLDivElement>(null), listId = useId();
  const items = blockCommands.filter(item => !query?.text || `${item.label} ${item.terms}`.toLowerCase().includes(query.text.toLowerCase())).sort((a,b)=>query?.text?Number(b.label.toLowerCase().startsWith(query.text.toLowerCase()))-Number(a.label.toLowerCase().startsWith(query.text.toLowerCase())):0);
  useEffect(() => {
    const update = () => {
      const { from, to, $from } = editor.state.selection;
      const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n');
      // Match a command at the caret, at line start or following whitespace.
      const match = enabled && editor.isFocused && from === to && /(?:^|\s)(\/[a-z0-9 ]*)$/i.exec(before);
      if (!match) { dismissed.current='';setQuery(null);return; }
      if(dismissed.current===before){setQuery(null);return;}
      const commandText=match[1];
      setQuery(previous => { if (previous?.text !== commandText.slice(1)) setActive(0); return { from: from-commandText.length, to: from, text: commandText.slice(1) }; });
      try {
        const caret = editor.view.coordsAtPos(from), width = Math.min(260, window.innerWidth - 16), below = window.innerHeight - caret.bottom - 12, above = caret.top - 12;
        const height = Math.min(560, Math.max(80, Math.max(below, above)));
        setPosition({ left: Math.max(8, Math.min(caret.left, window.innerWidth - width - 8)), top: below >= height ? caret.bottom + 6 : Math.max(8, caret.top - height - 6), maxHeight: height });
      } catch { /* Detached editor. */ }
    };
    const blur = () => setQuery(null);
    editor.on('transaction', update); editor.on('focus', update); editor.on('blur', blur);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true); update();
    return () => { editor.off('transaction', update); editor.off('focus', update); editor.off('blur', blur); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [editor, enabled]);
  const choose = (id: string) => {
    if (!query) return;
    setQuery(null);
    editor.commands.deleteRange({ from: query.from, to: query.to });
    onChoose(id);
  };
  keyHandler.current = event => {
    if (!query || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === 'Escape') { dismissed.current = editor.state.selection.$from.parent.textBetween(0,editor.state.selection.$from.parentOffset,'\n','\n'); setQuery(null); return true; }
    if (items.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) { setActive(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length); return true; }
    if (items.length && !event.shiftKey && ['Enter', 'Tab'].includes(event.key)) { choose(items[Math.min(active, items.length - 1)].id); return true; }
    return false;
  };
  useEffect(() => { popup.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [active]);
  useEffect(() => () => { keyHandler.current = null; }, [keyHandler]);
  if (!query) return null;
  return createPortal(<div className="slash-menu action-slash-menu" ref={popup} style={position} onPointerDown={e => e.stopPropagation()} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}>
    <div className="slash-heading">ACTIONS</div>
    <div id={listId} role="listbox" aria-label="Bullet commands">{items.map((item, i) => <button type="button" role="option" aria-selected={active === i} key={item.id} onMouseEnter={() => setActive(i)} onClick={() => choose(item.id)}><span className="slash-action-icon" aria-hidden="true">{['H1','H2','H3','¶'].includes(item.icon)?item.icon:<Icon name={item.icon} size={16}/>}</span><span title={item.detail}>{item.label}</span><kbd>{item.keys.replace('Ctrl', /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl')}</kbd></button>)}</div>
    {!items.length && <p>No commands found. Press Escape to keep your text.</p>}
  </div>, editor.view.dom.closest('.app') || document.body);
}
