import * as Popover from "@radix-ui/react-popover";
import type { ClipboardInput } from "./clipboard";
import React, { useState, useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { Icon } from "./icons";
import { OutlineView } from "./OutlineView";
import type { Node } from "./data";
import { index } from "./domain.mjs";

export function getLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDatePill(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  return `${weekday}, ${month} ${day}`;
}

export function formatDateBadge(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = parseLocalDate(dateStr);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  return `${weekday}, ${month} ${day}`;
}

export function getRelativeDatePrefix(dateStr: string): string {
  const today = getLocalDateString(new Date());
  const d = parseLocalDate(dateStr);
  const t = parseLocalDate(today);
  const diffDays = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today, ";
  if (diffDays === -1) return "Yesterday, ";
  if (diffDays === 1) return "Tomorrow, ";
  return "";
}

export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

import { bullet } from "./domain.mjs";

export function ensureCalendarHierarchy(nodes: Node[], dateStr: string): { nodes: Node[]; dayId: string } {
  const [yearStr, monthNumStr] = dateStr.split("-");
  const d = parseLocalDate(dateStr);
  const monthName = d.toLocaleDateString("en-US", { month: "long" });
  const dayText = formatDatePill(dateStr);

  const calRootId = "cal-root";
  const yearId = `cal-year-${yearStr}`;
  const monthId = `cal-month-${yearStr}-${monthNumStr}`;
  const dayId = `journal-${dateStr}`;

  let list = [...nodes];

  // 1. Calendar root node
  let calRoot = list.find((n) => n.id === calRootId || (n.parentId === null && /^(?:🗓️?|📆|📅)?\s*Calendar$/i.test(n.text.trim())));
  if (!calRoot) {
    calRoot = bullet(calRootId, {
      parentId: null,
      text: "🗓️ Calendar",
      journalDate: "",
      position: nodes.reduce((last, n) => n.parentId === null ? Math.max(last, n.position) : last, -1) + 1,
    }) as Node;
    list.push(calRoot);
  }

  // 2. Year node under calRoot
  const calRootNodeId = calRoot.id;
  let yearNode = list.find((n) => n.id === yearId || (n.parentId === calRootNodeId && n.text === yearStr));
  if (!yearNode) {
    yearNode = bullet(yearId, {
      parentId: calRootNodeId as any,
      text: yearStr,
      position: Number(yearStr),
      journalDate: "",
    }) as Node;
    list.push(yearNode);
  } else if (yearNode.parentId !== calRootNodeId) {
    yearNode = { ...yearNode, parentId: calRootNodeId as any };
    list = list.map((n) => (n.id === yearNode!.id ? yearNode! : n));
  }

  // 3. Month node under yearNode
  const yearNodeId = yearNode!.id;
  let monthNode = list.find(
    (n) => n.id === monthId || (n.parentId === yearNodeId && n.text.toLowerCase() === monthName.toLowerCase())
  );
  if (!monthNode) {
    monthNode = bullet(monthId, {
      parentId: yearNodeId as any,
      text: monthName,
      position: Number(monthNumStr),
      journalDate: "",
    }) as Node;
    list.push(monthNode);
  } else if (monthNode.parentId !== yearNodeId) {
    monthNode = { ...monthNode, parentId: yearNodeId as any };
    list = list.map((n) => (n.id === monthNode!.id ? monthNode! : n));
  }

  // 4. Day node under monthNode
  const monthNodeId = monthNode!.id;
  let dayNode = list.find((n) => n.id === dayId);
  if (!dayNode) {
    dayNode = bullet(dayId, {
      parentId: monthNodeId as any,
      text: dayText,
      position: d.getDate(),
      journalDate: dateStr,
    }) as Node;
    list.push(dayNode);
  } else if (dayNode.parentId !== monthNodeId) {
    dayNode = { ...dayNode, parentId: monthNodeId as any };
    list = list.map((n) => (n.id === dayId ? dayNode! : n));
  }

  return { nodes: list, dayId };
}

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const WEEKDAY_NAMES_2 = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type CalendarViewProps = {
  workdays?: React.ReactNode;
  trackers?: React.ReactNode;
  onCreateNote?:(date:string,text:string)=>string;
  monthView?: boolean;
  autoOpen?: boolean;
  reminders?: React.ReactNode;
  hasReminder?: (date:string)=>boolean;
  nodes: Node[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onAddBullet: (date: string) => void;
  onOpenDate: (date: string) => void;
  onEdit: (id: string | null) => void;
  onZoom: (id: string) => void;
  onMindmap?: (id: string) => void;
  onToggle: (id: string) => void;
  onChange: (id: string, value: { text: string; formatting: string }) => void;
  onEditorChange?: (id: string, value: { text: string; formatting: string }) => void;
  readCurrentNode?: (id: string) => Node | undefined;
  onCommand: (action: string, id: string, start: number, end: number, selectedIds?: string[]) => void;
  onOutlinePaste: (id: string, start: number, end: number, text: ClipboardInput) => void;
  onReady: (editor: Editor | null) => void;
  onMove: (id: string, target: string, zone: string) => void;
  onTask: (id: string) => void;
  onMenu: (id: string, anchor?: HTMLElement, selectedIds?: string[]) => void;
  editing: string | null;
  caret: number | null;
  disabled: boolean;
  assets: Map<string, Blob>;
  media: any[];
  search: string;
  showCompleted: boolean;
  readingSize?: number;
  onImages?: (id: string, files: File[]) => void;
  onRemoveMedia?: (id: string) => void;
  onResizeMedia?: (id:string,width:number)=>void;
  onOccludeMedia?: (id:string)=>void;
  onDeleteNodes?: (ids: string[]) => void;
  setNotice?: (msg: string) => void;
};

export function CalendarView(props: CalendarViewProps) {
  const { selectedDate, onSelectDate, nodes, onAddBullet } = props;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pillBtnRef = useRef<HTMLButtonElement>(null);
  const stripScrollRef = useRef<HTMLDivElement>(null);

  const [draft,setDraft]=useState(''),[drafting,setDrafting]=useState(false),draftId=useRef<string|null>(null);
  useEffect(()=>{setDraft('');setDrafting(false);draftId.current=null;},[selectedDate]);
  const saveDraft=()=>{setDrafting(false);draftId.current=null;};
  const updateDraft=(text:string,composing=false)=>{setDraft(text);if(composing)return;if(!draftId.current&&text.trim()&&props.onCreateNote)draftId.current=props.onCreateNote(selectedDate,text);else if(draftId.current)(props.onEditorChange||props.onChange)(draftId.current,{text,formatting:''});};
  // Picker month navigation state
  const [pickerYear, setPickerYear] = useState(() => parseLocalDate(selectedDate).getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => parseLocalDate(selectedDate).getMonth());

  // Popover mode: "month" | "year"
  const [popoverMode, setPopoverMode] = useState<"month" | "year">("month");

  // Year range start for 12-year window (e.g. 2019 for 2019 - 2030)
  const [yearRangeStart, setYearRangeStart] = useState(() => {
    const y = parseLocalDate(selectedDate).getFullYear();
    return Math.floor((y - 2019) / 12) * 12 + 2019;
  });

  // Keep picker in sync when selectedDate changes externally
  useEffect(() => {
    const d = parseLocalDate(selectedDate);
    const y = d.getFullYear();
    setPickerYear(y);
    setPickerMonth(d.getMonth());
    setYearRangeStart(Math.floor((y - 2019) / 12) * 12 + 2019);
  }, [selectedDate]);

  const yearRangeList = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 12; i++) {
      list.push(yearRangeStart + i);
    }
    return list;
  }, [yearRangeStart]);

  // Find all dates that have notes
  const datesWithNotes = useMemo(() => {
    const set = new Set<string>();
    const idx=index(nodes);
    for(const n of nodes)if(n.journalDate&&(idx.children.get(n.id)||[]).some((child:Node)=>child.text.trim()||props.media?.some(m=>m.bulletId===child.id)))set.add(n.journalDate);
    return set;
  }, [nodes,props.media]);

  // Find daily root for currently selected date
  const rootId = `journal-${selectedDate}`;
  const idx = useMemo(() => index(nodes), [nodes]);
  const dailyRoot = idx.byId.get(rootId);
  const dailyBullets = dailyRoot ? idx.children.get(rootId) || [] : [];
  const hasBulletsForDay = dailyBullets.length > 0;

  // Generate 45 days for horizontal date strip centered around selectedDate
  const stripDays = useMemo(() => {
    const list: { dateStr: string; dayNum: number; weekday: string; monthLabel?: string; isFirstOfMonth: boolean }[] = [];
    const base = parseLocalDate(selectedDate);
    const start = new Date(base);
    start.setDate(start.getDate() - 10);

    let lastMonth = -1;
    for (let i = 0; i < 40; i++) {
      const cur = new Date(start);
      cur.setDate(cur.getDate() + i);
      const curMonth = cur.getMonth();
      const isFirstOfMonth = cur.getDate() === 1 || i === 0;
      const monthLabel = (isFirstOfMonth || curMonth !== lastMonth)
        ? MONTH_NAMES_SHORT[curMonth].toUpperCase()
        : undefined;
      lastMonth = curMonth;

      list.push({
        dateStr: getLocalDateString(cur),
        dayNum: cur.getDate(),
        weekday: WEEKDAY_NAMES_2[cur.getDay()],
        monthLabel,
        isFirstOfMonth: cur.getDate() === 1,
      });
    }
    return list;
  }, [selectedDate]);

  // Mini calendar grid generation for picker
  const pickerCalendarDays = useMemo(() => {
    const firstDay = new Date(pickerYear, pickerMonth, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(pickerYear, pickerMonth, 0).getDate();

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(pickerYear, pickerMonth - 1, d);
      days.push({
        dateStr: getLocalDateString(prevDate),
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      const curDate = new Date(pickerYear, pickerMonth, i);
      days.push({
        dateStr: getLocalDateString(curDate),
        dayNum: i,
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill complete grid
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining + 7; i++) {
      if (days.length >= 35 && remaining === 0) break;
      const nextDate = new Date(pickerYear, pickerMonth + 1, i);
      days.push({
        dateStr: getLocalDateString(nextDate),
        dayNum: i,
        isCurrentMonth: false,
      });
      if (days.length >= 42) break;
    }

    return days;
  }, [pickerYear, pickerMonth]);

  const prevMonth = () => {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear((y) => y - 1);
    } else {
      setPickerMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear((y) => y + 1);
    } else {
      setPickerMonth((m) => m + 1);
    }
  };

  const relativePrefix = getRelativeDatePrefix(selectedDate);
  const datePillText = formatDatePill(selectedDate);

  // Jump to specific month
  const jumpToMonth = (year: number, monthIndex: number) => {
    const target = new Date(year, monthIndex, 1);
    onSelectDate(getLocalDateString(target));
  };

  return (
    <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}><div className={`calendar-view ${props.autoOpen===false?'has-workdays':''}`}>
      {/* Top Heading */}
      <div className="calendar-header-row">
        <div className="calendar-title-wrap">
          <span className="calendar-prefix">{relativePrefix}</span>
          <Popover.Trigger asChild><button
            ref={pillBtnRef}
            className={`calendar-date-pill ${popoverOpen ? "active" : ""}`}
            aria-label="Toggle calendar picker"
            aria-expanded={popoverOpen}
          >
            {datePillText}
          </button></Popover.Trigger>
        </div>
      </div>

      {/* Date Picker Popover Dropdown */}
      {popoverOpen && (
        <Popover.Portal container={document.querySelector(".app")||document.body}><Popover.Content ref={popoverRef} className="calendar-popover" sideOffset={8} align="start" collisionPadding={12} aria-label="Date picker">
          <div className="calendar-popover-header">
            <span>{datePillText}</span>
          </div>

          <div className="calendar-quick-options">
            <button
              onClick={() => {
                onSelectDate(getLocalDateString());
                setPopoverOpen(false);
              }}
            >
              <Icon name="sun" size={16} />
              <span>Today</span>
            </button>
            <button
              onClick={() => {
                onSelectDate(addDays(getLocalDateString(), 1));
                setPopoverOpen(false);
              }}
            >
              <Icon name="moon" size={16} />
              <span>Tomorrow</span>
            </button>
            <button
              onClick={() => {
                onSelectDate(addDays(getLocalDateString(), 7));
                setPopoverOpen(false);
              }}
            >
              <Icon name="calendar" size={16} />
              <span>Next week</span>
            </button>
          </div>

          {/* Month or Year View based on popoverMode */}
          {popoverMode === "year" ? (
            <>
              <div className="calendar-year-nav">
                <button
                  className="calendar-year-range-title"
                  onClick={() => setPopoverMode("month")}
                  title="Switch to month view"
                >
                  {yearRangeStart} - {yearRangeStart + 11}
                </button>
                <div className="calendar-mini-nav-btns">
                  <button
                    className="icon-button"
                    onClick={() => setYearRangeStart((s) => s - 12)}
                    aria-label="Previous 12 years"
                  >
                    <Icon name="back" size={14} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setYearRangeStart((s) => s + 12)}
                    aria-label="Next 12 years"
                  >
                    <Icon name="chevron" size={14} />
                  </button>
                </div>
              </div>

              <div className="calendar-year-grid">
                {yearRangeList.map((y) => {
                  const isSelected = y === parseLocalDate(selectedDate).getFullYear();
                  return (
                    <button
                      key={y}
                      className={`calendar-year-cell ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setPickerYear(y);
                        const curD = parseLocalDate(selectedDate);
                        curD.setFullYear(y);
                        onSelectDate(getLocalDateString(curD));
                        setPopoverMode("month");
                      }}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Mini Month Grid */}
              <div className="calendar-mini-nav">
                <button
                  className="calendar-mini-month-year-btn"
                  onClick={() => setPopoverMode("year")}
                  title="Choose year"
                >
                  {MONTH_NAMES_SHORT[pickerMonth]} {pickerYear}
                </button>
                <div className="calendar-mini-nav-btns">
                  <button className="icon-button" onClick={prevMonth} aria-label="Previous month">
                    <Icon name="back" size={14} />
                  </button>
                  <button className="icon-button" onClick={nextMonth} aria-label="Next month">
                    <Icon name="chevron" size={14} />
                  </button>
                </div>
              </div>

              <div className="calendar-mini-weekdays">
                {WEEKDAY_NAMES_2.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>

              <div className="calendar-mini-grid">
                {pickerCalendarDays.map((item) => {
                  const isSelected = item.dateStr === selectedDate;
                  const hasNotes = datesWithNotes.has(item.dateStr);
                  return (
                    <button
                      key={item.dateStr}
                      aria-pressed={isSelected} aria-label={item.dateStr} className={`calendar-mini-day ${item.isCurrentMonth ? "in-month" : "out-month"} ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        onSelectDate(item.dateStr);
                        setPopoverOpen(false);
                      }}
                    >
                      <span className="mini-day-num">{item.dayNum}</span>
                      {(hasNotes||props.hasReminder?.(item.dateStr)) && <span className={`mini-day-dot ${props.hasReminder?.(item.dateStr)?'has-reminder':''}`} title={props.hasReminder?.(item.dateStr)?'Calendar reminders':''}/>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="calendar-popover-footer">
            <button className="popover-action-item" onClick={()=>setPopoverOpen(false)}>Done</button>
          </div>
        </Popover.Content></Popover.Portal>
      )}

      {/* Horizontal Date Strip (Timeline) */}
      {props.workdays}
      {!props.monthView && <div className="calendar-strip-container">
        <div className="calendar-strip-nav-left">
          <button
            className="icon-button strip-arrow-btn"
            title="Previous day"
            aria-label="Previous day"
            onClick={() => onSelectDate(addDays(selectedDate, -1))}
          >
            <Icon name="back" size={15} />
          </button>
          <button
            className={`icon-button strip-calendar-btn ${popoverOpen ? "active" : ""}`}
            title="Pick date"
            aria-label="Pick date"
            onClick={() => setPopoverOpen((v) => !v)}
          >
            <Icon name="calendar" size={16} />
          </button>
          <button
            className="icon-button strip-arrow-btn"
            title="Next day"
            aria-label="Next day"
            onClick={() => onSelectDate(addDays(selectedDate, 1))}
          >
            <Icon name="chevron" size={15} />
          </button>
        </div>

        <div ref={stripScrollRef} className="calendar-strip-scroll">
          {stripDays.map((d) => {
            const isSelected = d.dateStr === selectedDate;
            const hasNotes = datesWithNotes.has(d.dateStr);
            return (
              <div key={d.dateStr} className="strip-day-col">
                {d.monthLabel ? (
                  <span className="strip-month-label">{d.monthLabel}</span>
                ) : (
                  <span className="strip-month-label-placeholder" />
                )}
                <button
                  aria-pressed={isSelected} aria-label={d.dateStr} className={`strip-day-btn ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectDate(d.dateStr)}
                >
                  <span className="strip-weekday">{d.weekday}</span>
                  <span className="strip-day-num">{d.dayNum}</span>
                  <span className={`strip-dot ${hasNotes||props.hasReminder?.(d.dateStr) ? "visible" : ""} ${props.hasReminder?.(d.dateStr)?'has-reminder':''}`} title={props.hasReminder?.(d.dateStr)?'Calendar reminders':''}/>
                </button>
              </div>
            );
          })}
        </div>

        {/* Right upcoming years and months jump targets */}
        <div className="calendar-strip-right-shortcuts">
          <button
            className="shortcut-year-btn"
            title="Choose year"
            onClick={() => {
              setPickerYear(parseLocalDate(selectedDate).getFullYear());
              setPopoverMode("year");
              setPopoverOpen(true);
            }}
          >
            {parseLocalDate(selectedDate).getFullYear()}
          </button>
          <button
            className="shortcut-year-btn muted"
            title="Choose year"
            onClick={() => {
              setPickerYear(parseLocalDate(selectedDate).getFullYear() + 1);
              setPopoverMode("year");
              setPopoverOpen(true);
            }}
          >
            {parseLocalDate(selectedDate).getFullYear() + 1}
          </button>
          <div className="shortcut-months">
            {MONTH_NAMES_SHORT.slice(
              parseLocalDate(selectedDate).getMonth() + 1,
              parseLocalDate(selectedDate).getMonth() + 4
            ).map((mName, idxOffset) => (
              <button
                key={mName}
                className="shortcut-month-btn"
                onClick={() =>
                  jumpToMonth(
                    parseLocalDate(selectedDate).getFullYear(),
                    parseLocalDate(selectedDate).getMonth() + 1 + idxOffset
                  )
                }
              >
                {mName}
              </button>
            ))}
          </div>
        </div>
      </div>

      }
      {/* Daily Notes Content Area */}
      {props.trackers}
      {props.reminders}
      <div className="calendar-notes-section">
        {hasBulletsForDay&&!drafting ? (
          <OutlineView
            key={rootId}
            hideTitle
            nodes={nodes}
            scope={rootId}
            search={props.search}
            showCompleted={props.showCompleted}
            readingSize={props.readingSize}
            onImages={props.onImages}
            onRemoveMedia={props.onRemoveMedia}
            onResizeMedia={props.onResizeMedia}
            onOccludeMedia={props.onOccludeMedia}
            editing={props.editing}
            caret={props.caret}
            disabled={props.disabled}
            assets={props.assets}
            media={props.media}
            onEdit={props.onEdit}
            onZoom={props.onZoom}
            onMindmap={props.onMindmap}
            onToggle={props.onToggle}
            onChange={props.onChange}
            onEditorChange={props.onEditorChange}
            readCurrentNode={props.readCurrentNode}
            onCommand={props.onCommand}
            onOutlinePaste={props.onOutlinePaste}
            onReady={props.onReady}
            onMove={props.onMove}
            onTask={props.onTask}
            onMenu={props.onMenu}
            onAdd={() => props.onAddBullet(props.selectedDate)}
            onDeleteNodes={props.onDeleteNodes}
            setNotice={props.setNotice}
          />
        ) : (
          <div className="calendar-empty-day-outline">{drafting?<><textarea className="calendar-draft" autoFocus aria-label="Write a daily note" placeholder="What would you like to remember?" value={draft} onChange={e=>updateDraft(e.target.value,(e.nativeEvent as InputEvent).isComposing)} onCompositionEnd={e=>updateDraft(e.currentTarget.value)} onBlur={saveDraft} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();saveDraft();}}}/><div className="calendar-draft-actions"><button disabled={!draft.trim()||props.disabled} onClick={saveDraft}>Done</button></div></>:<><h3>Your day, a fresh page</h3><p>Browse freely. A daily note is created only when you write something.</p><button className="calendar-write-note" disabled={props.disabled} onClick={()=>{draftId.current=null;setDraft('');setDrafting(true);}}><Icon name="plus" size={17}/>Write a note</button></>}</div>
        )}
      </div>
    </div></Popover.Root>
  );
}
