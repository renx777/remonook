import { useEffect, useRef, useState } from "react";
import type { Workspace } from "./data";
import { WorkdayDialog } from "./WorkdayDialog";
import { workdaysV2, importHolidaysV2 } from "./workdays-v2.mjs";
import { parseHolidaySource, parsePdfPages } from "./workday-holidays.mjs";
import { validEventDate } from "./calendar-events.mjs";
export default function WorkdayHolidayImport({
  doc,
  date,
  disabled,
  onChange,
  onClose,
}: {
  doc: Workspace;
  date: string;
  disabled: boolean;
  onChange: (fn: (d: Workspace) => Workspace) => void;
  onClose: () => void;
}) {
  const w = workdaysV2(doc),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [format, setFormat] = useState(""),
    [year, setYear] = useState(date.slice(0, 4)),
    [dateColumn, setDateColumn] = useState(1),
    [nameColumn, setNameColumn] = useState(2),
    [csv, setCsv] = useState(false),
    [pages, setPages] = useState("1"),
    [ocr, setOcr] = useState(false),
    [rows, setRows] = useState<any[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [replace, setReplace] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const parse = async () => {
    setError("");
    setReplace([]);
    const c = new AbortController();
    controller.current?.abort();
    controller.current = c;
    setBusy("Preparing preview…");
    try {
      let next: any[] = [];
      if (
        file?.type === "application/pdf" ||
        file?.name.toLowerCase().endsWith(".pdf")
      ) {
        const selected = parsePdfPages(pages);
        const { extractHolidayPdf } = await import("./workday-pdf-import");
        for (const source of await extractHolidayPdf(
          file,
          selected,
          ocr,
          c.signal,
          setBusy,
        )) {
          const parsed = parseHolidaySource(source.text, {
            year,
            format,
            source: "Page " + source.page + " · line",
          });
          next.push(...parsed.rows);
        }
      } else {
        const content = file ? await file.text() : text;
        if (file && file.size > 1024 * 1024)
          throw Error("Choose a CSV/text file under 1 MB.");
        const parsed = parseHolidaySource(content, {
          year,
          format,
          csv: csv || !!file?.name.toLowerCase().endsWith(".csv"),
          dateColumn: dateColumn - 1,
          nameColumn: nameColumn - 1,
        });
        next = parsed.rows;
        if (parsed.errors.length) setError(parsed.errors.join(". "));
      }
      if (c.signal.aborted) return;
      if (next.length > 1000)
        throw Error("Review fewer than 1,000 rows; select fewer pages.");
      setRows(next);
      if (!next.length)
        setError(
          "No dates found. Try text recognition for a scanned PDF, or paste/edit the list.",
        );
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (controller.current === c) setBusy("");
    }
  };
  const accepted = rows.filter((r) => r.selected),
    counts = new Map<string, number>();
  for (const r of accepted) counts.set(r.date, (counts.get(r.date) || 0) + 1);
  const invalid = accepted.some(
    (r) =>
      !validEventDate(r.date) ||
      !r.name.trim() ||
      r.name.length > 160 ||
      counts.get(r.date) !== 1 ||
      r.issue,
  );
  const edit = (id: string, patch: any) =>
    setRows((v) =>
      v.map((r) => (r.id === id ? { ...r, ...patch, issue: ("date" in patch || "name" in patch) ? "" : r.issue } : r)),
    );
  return (
    <WorkdayDialog title="Import holidays" wide onClose={onClose}>
      <div className="wd2-import">
        <p className="wd2-muted">
          Files are processed on your device. Review every date before saving;
          attendance and plans are kept.
        </p>
        <label>
          Company holiday list
          <input
            type="file"
            accept=".csv,.txt,.pdf,text/plain,text/csv,application/pdf"
            disabled={!!busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setRows([]);
            }}
          />
        </label>
        {file && <button disabled={!!busy} onClick={()=>{setFile(null);setRows([]);setError("");}}>Use pasted text instead</button>}
        {!file && (
          <label>
            Or paste the list
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"2027-01-01 New Year\n2027-12-25 Christmas"}
            />
          </label>
        )}
        <div className="wd2-form-grid">
          <label>
            Default year
            <input
              required
              type="number"
              min="1900"
              max="2199"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label>
            Numeric date order
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="">Choose for ambiguous dates</option>
              <option value="DMY">Day / Month / Year</option>
              <option value="MDY">Month / Day / Year</option>
            </select>
          </label>
        </div>
        {file?.name.toLowerCase().endsWith(".pdf") ? (
          <>
            <label>
              Pages (up to ten)
              <input
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                placeholder="1-3, 5"
              />
            </label>
            <label className="wd2-check">
              <input
                type="checkbox"
                checked={ocr}
                onChange={(e) => setOcr(e.target.checked)}
              />
              Use text recognition for scanned pages
            </label>
            <small className="wd2-muted">
              English OCR downloads on first use, then runs locally. Large scans
              can take a moment.
            </small>
          </>
        ) : (
          <>
            <label className="wd2-check">
              <input
                type="checkbox"
                checked={csv || !!file?.name.toLowerCase().endsWith(".csv")}
                disabled={!!file?.name.toLowerCase().endsWith(".csv")}
                onChange={(e) => setCsv(e.target.checked)}
              />
              CSV / spreadsheet columns
            </label>
            {(csv || file?.name.toLowerCase().endsWith(".csv")) && (
              <div className="wd2-form-grid">
                <label>
                  Date column
                  <input
                    min="1"
                    max="30"
                    type="number"
                    value={dateColumn}
                    onChange={(e) => setDateColumn(Number(e.target.value))}
                  />
                </label>
                <label>
                  Holiday name column
                  <input
                    min="1"
                    max="30"
                    type="number"
                    value={nameColumn}
                    onChange={(e) => setNameColumn(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
          </>
        )}
        <button
          disabled={disabled || !!busy || (!file && !text.trim())}
          onClick={() => void parse()}
        >
          Review holidays
        </button>
        {busy && (
          <div role="status">
            {busy}
            <button
              onClick={() => {
                controller.current?.abort();
                setBusy("");
              }}
            >
              Cancel extraction
            </button>
          </div>
        )}
        <button disabled={disabled||!!busy||rows.length>=1000} onClick={()=>setRows(v=>[...v,{id:crypto.randomUUID(),date:"",name:"",original:"",source:"Manual row "+(v.length+1),selected:true,issue:"Check date and name"}])}>Add holiday row</button>
        {rows.length > 0 && (
          <>
            <p className="wd2-muted">
              {accepted.length} selected · Invalid/uncertain rows start
              unchecked. Uncheck unrelated headings.
            </p>
            <div className="wd2-import-rows">
              {rows.map((r) => (
                <div className="wd2-import-row" key={r.id}>
                  <input
                    aria-label={"Import " + r.source}
                    type="checkbox"
                    checked={r.selected}
                    onChange={(e) => edit(r.id, { selected: e.target.checked })}
                  />
                  <div>
                    <input
                      aria-label={"Holiday date " + r.source}
                      type="date"
                      value={r.date}
                      onChange={(e) => edit(r.id, { date: e.target.value })}
                    />
                    <input
                      aria-label={"Holiday name " + r.source}
                      maxLength={160}
                      value={r.name}
                      onChange={(e) => edit(r.id, { name: e.target.value })}
                    />
                    <small>
                      {r.source} · {r.original}
                    </small>
                    {r.issue && (
                      <small className="wd2-warning">{r.issue}</small>
                    )}
                    {counts.get(r.date) !== undefined &&
                      counts.get(r.date)! > 1 && (
                        <small className="wd2-warning">
                          Duplicate date: keep one row
                        </small>
                      )}
                    {w.entries[r.date] && (
                      <small className="wd2-warning">
                        Work records overlap · they will be kept
                      </small>
                    )}
                    {w.holidays[r.date] && w.holidays[r.date] !== r.name && (
                      <label className="wd2-check">
                        <input
                          type="checkbox"
                          checked={replace.includes(r.date)}
                          onChange={(e) =>
                            setReplace((v) =>
                              e.target.checked
                                ? [...v, r.date]
                                : v.filter((d) => d !== r.date),
                            )
                          }
                        />
                        Replace “{w.holidays[r.date]}”
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button
            className="wd2-primary"
            disabled={
              disabled ||
              !!busy ||
              invalid ||
              accepted.length === 0 ||
              accepted.length > 366
            }
            onClick={() => {
              try {
                onChange((d) => importHolidaysV2(d, accepted, replace));
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Import {accepted.length || ""} holidays
          </button>
        </footer>
      </div>
    </WorkdayDialog>
  );
}
