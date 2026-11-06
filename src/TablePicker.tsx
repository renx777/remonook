import {useEffect, useRef, useState} from 'react';
import './table-picker.css';

export type TableTemplate = {id: string; name: string; rows: string[][]};

const blank = (rows: number, cols: number) => Array.from({length: rows}, () => Array(cols).fill(''));

export const TABLE_TEMPLATES: TableTemplate[] = [
  {id: 'budget', name: 'Budget', rows: [['Item', 'Amount', 'Paid by'], ['', '', ''], ['', '', '']]},
  {id: 'checklist', name: 'Checklist', rows: [['Task', 'Done'], ['', ''], ['', '']]},
  {id: 'comparison', name: 'Comparison', rows: [['Option', 'Pros', 'Cons'], ['', '', ''], ['', '', '']]},
];

const GRID = 8;

/** Choose a size by hovering a grid, or start from a template. Escape or the backdrop closes it. */
export function TablePicker({onPick, onClose}: {onPick: (rows: string[][]) => void; onClose: () => void}) {
  const [hover, setHover] = useState<[number, number]>([3, 3]);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.querySelectorAll<HTMLButtonElement>('.table-picker-cells button')[2 * GRID + 2]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  const [rows, cols] = hover;
  return (
    <div className="table-picker-backdrop" onMouseDown={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Insert table"
        className="table-picker"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="table-picker-head">
          <strong>Insert table</strong>
          <span aria-live="polite">{rows} × {cols}</span>
        </div>
        <div className="table-picker-cells" role="group" aria-label="Table size, rows by columns" onMouseLeave={() => setHover([3, 3])}>
          {Array.from({length: GRID * GRID}, (_, i) => {
            const r = Math.floor(i / GRID) + 1, c = (i % GRID) + 1;
            return (
              <button
                key={i}
                type="button"
                className={r <= rows && c <= cols ? 'is-on' : ''}
                aria-label={`${c} column${c === 1 ? '' : 's'}, ${r} row${r === 1 ? '' : 's'}`}
                onMouseEnter={() => setHover([r, c])}
                onFocus={() => setHover([r, c])}
                onClick={() => onPick(blank(r, c))}
              />
            );
          })}
        </div>
        <div className="table-picker-templates" role="group" aria-label="Templates">
          {TABLE_TEMPLATES.map(t => (
            <button key={t.id} type="button" onClick={() => onPick(t.rows.map(row => [...row]))}>{t.name}</button>
          ))}
        </div>
        <p className="table-picker-hint">Pick a size, or start from a template. You can add and remove rows and columns afterwards.</p>
      </div>
    </div>
  );
}
