import {Children,isValidElement,useId,useRef,useState,type ReactElement,type ReactNode} from 'react';
import {Icon} from './icons';

type Element = ReactElement<any>;
const words = (node:ReactNode):string => Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<any>(child) && child.type !== 'kbd' ? words((child as Element).props.children) : '').join(' ');
const controls = (node:ReactNode):Element[] => Children.toArray(node).flatMap(child => !isValidElement<any>(child) ? [] : child.type === 'button' || child.type === 'label' ? [child as Element] : controls((child as Element).props.children));
const descriptions = ['Text, lists & bullet types','Images, emoji, tables & media','Links, mirrors & backlinks','Indent, expand & navigate','Flashcards, quizzes & decks'];

export function BulletMenuBody({children}:{children:ReactNode}) {
  const items = Children.toArray(children);
  const sections = items.filter((c):c is Element => isValidElement(c) && c.type === 'details').map(section => {
    const [summary,...content] = Children.toArray(section.props.children) as Element[];
    return {label:words(summary.props.children).trim(),icon:Children.toArray(summary.props.children)[0],content};
  });
  const common = items.filter(c => !isValidElement(c) || c.type !== 'details');
  const [active,setActive] = useState<number|null>(null), [query,setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null), id = useId();
  const searching = query.trim().length > 0;
  const groups = [{label:'Quick actions',content:common},...sections];
  const matches = groups.map(group => ({...group,actions:controls(group.content).filter(action => (words(action.props.children)+' '+(action.props['data-keywords']||'')).toLowerCase().includes(query.trim().toLowerCase()))})).filter(group => group.actions.length);
  function open(index:number|null) {
    setActive(index);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(index === null ? `[data-category="${active}"]` : '.bullet-category-back')?.focus());
  }
  return <div ref={root} className="bullet-menu-body" data-escape-local={searching || active !== null} onKeyDownCapture={event => {
    if(event.key === 'Escape' && (searching || active !== null)) {
      event.preventDefault();event.stopPropagation();
      if(searching){setQuery('');root.current?.querySelector<HTMLInputElement>('input')?.focus();}else open(null);
    }
  }}>
    <div className="bullet-action-search"><Icon name="search" size={16}/><input aria-label="Find a bullet action" placeholder="Find an action…" value={query} onChange={event=>setQuery(event.target.value)}/>{query && <button aria-label="Clear action search" onClick={()=>{setQuery('');root.current?.querySelector<HTMLInputElement>('input')?.focus();}}><Icon name="close" size={14}/></button>}</div>
    <div className="bullet-action-scroll">
      {searching ? <div className="bullet-search-results" aria-label="Matching actions">{matches.length ? matches.map(group=><section key={group.label}><h3>{group.label}</h3><div className="bullet-section-content">{group.actions}</div></section>) : <p className="bullet-no-results" role="status">No matching actions.<br/><span>Try “emoji”, “task” or “link”.</span></p>}</div> : active === null ? <>
        <h3 className="bullet-group-label">Quick actions</h3>{common}
        <div className="bullet-category-list">{sections.map((section,i)=><button key={section.label} data-category={i} aria-controls={`${id}-category`} onClick={()=>open(i)}>{section.icon}<span><strong>{section.label}</strong><small>{descriptions[i]}</small></span><Icon name="chevron" size={14}/></button>)}</div>
      </> : <section id={`${id}-category`} aria-label={sections[active].label}>
        <button className="bullet-category-back" onClick={()=>open(null)}><Icon name="categoryBack" size={15}/><span>All actions</span></button>
        <h3 className="bullet-category-title">{sections[active].label}</h3>
        {sections[active].content}
      </section>}
    </div>
  </div>;
}
