import {
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { NoteMetadataContext } from "./NoteMetadataContext";
import { accountLocalKey, storageAccountKey } from "./data";
import { uuid } from "./domain.mjs";
import { ImageDialog } from "./ImageTools";
import {
  weeklyReview,
  saveWeeklyReview,
  weekKey,
  dayKey,
} from "./weekly-review.mjs";
import {
  createStudyGoal,
  studyGoals,
  goalForecast,
  archiveStudyGoal,
} from "./study-goals.mjs";
import { createStudyContext } from "./study.mjs";
import { addDays } from "./natural-date.mjs";
import "./review-planning.css";
function usePanelClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return now;
}
function useDraft(key: string, initial: () => any) {
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v && typeof v === "object" ? { ...initial(), ...v } : initial();
    } catch {
      return initial();
    }
  };
  const [value, setValue] = useState(read),
    [stored, setStored] = useState(true);
  useLayoutEffect(() => {
    setValue(read());
    setStored(true);
  }, [key]);
  const change = (v: any) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
      setStored(true);
    } catch {
      setStored(false);
    }
  };
  return [value, change, stored] as const;
}
export function WeeklyReviewLauncher() {
  const ctx = useContext(NoteMetadataContext),
    [open, setOpen] = useState(false),
    account = storageAccountKey();
  useLayoutEffect(() => setOpen(false), [account]);
  return (
    <>
      <button
        type="button"
        className="phase6-link"
        onClick={() => setOpen(true)}
      >
        Weekly review
      </button>
      {open && ctx && (
        <WeeklyReviewPanel key={account} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function WeeklyReviewPanel({ onClose }: { onClose: () => void }) {
  const ctx = useContext(NoteMetadataContext)!,
    account = storageAccountKey(),
    clock = usePanelClock(),
    [week] = useState(weekKey),
    key = accountLocalKey("remo-weekly-review:" + week),
    [draft, setDraft, stored] = useDraft(key, () => ({
      id: uuid(),
      wins: "",
      next: "",
      reviewed: [],
    })),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    lock = useRef(false),
    summary = useMemo(() => weeklyReview(ctx.doc, clock), [ctx.doc, clock]),
    saved = ctx.doc.tables.bullets.find((n) => n.id === draft.id),
    reviewed = new Set<string>(
      Array.isArray(draft.reviewed) ? draft.reviewed : [],
    );
  const guard = () => {
    if (account !== storageAccountKey())
      throw Error("Open the original workspace to continue.");
  };
  const open = (id: string) => {
    onClose();
    ctx.openNote?.(id);
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      guard();
      await ctx.save!((d) => {
        guard();
        return saveWeeklyReview(d, draft);
      });
      guard();
      onClose();
      ctx.openNote?.(draft.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <ImageDialog
      title="Weekly review"
      onClose={() => {
        if (!busy) onClose();
      }}
      className="phase6-dialog"
    >
      <p className="phase6-muted">
        Past seven days ·{" "}
        {new Date(summary.from + "T12:00:00").toLocaleDateString()} –{" "}
        {new Date().toLocaleDateString()}
      </p>
      <div className="phase6-stats">
        <span>
          <strong>{summary.inbox.length}</strong>Inbox
        </span>
        <span>
          <strong>{summary.overdue.length}</strong>Overdue deadlines
        </span>
        <span>
          <strong>{summary.reviews}</strong>Spaced reviews
        </span>
      </div>
      <p className="phase6-muted">
        {summary.distinctCards} cards reviewed · {summary.recordedMinutes}{" "}
        minutes of recorded responses, not total study time. {summary.completed}{" "}
        completed tasks (all time).{" "}
        {summary.unmeasured > 0
          ? summary.unmeasured + " reviews have no usable duration."
          : ""}
      </p>
      {(
        [
          ["Inbox", summary.inbox],
          ["Overdue deadlines", summary.overdue],
          ["Waiting", summary.waiting],
          ["Next seven days", summary.upcoming],
          ["Recently edited notes", summary.recent],
        ] as [string, any[]][]
      ).map(([name, list]) => (
        <details
          key={name}
          open={name === "Inbox" || name === "Overdue deadlines"}
        >
          <summary>
            {name} · {list.length}
          </summary>
          {!list.length && (
            <p className="phase6-muted">Nothing to review here.</p>
          )}
          {list.slice(0, 30).map((n) => (
            <div className="phase6-review-row" key={n.id}>
              <input
                type="checkbox"
                aria-label={"Reviewed " + n.text}
                checked={reviewed.has(n.id)}
                onChange={() => {
                  const next = new Set(reviewed);
                  next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                  setDraft({ ...draft, reviewed: [...next].slice(-500) });
                }}
              />
              <button type="button" onClick={() => open(n.id)}>
                {n.text || "Untitled"}
              </button>
            </div>
          ))}
          {list.length > 30 && (
            <p className="phase6-muted">
              {list.length - 30} more remain in the original view.
            </p>
          )}
        </details>
      ))}
      <p className="phase6-muted">
        Reviewed checkboxes stay on this device; they never complete tasks.
      </p>
      <label>
        Wins
        <textarea
          aria-label="Wins"
          value={typeof draft.wins === "string" ? draft.wins : ""}
          maxLength={4000}
          readOnly={!!saved}
          onChange={(e) => setDraft({ ...draft, wins: e.target.value })}
        />
      </label>
      <label>
        Next week
        <textarea
          aria-label="Next week"
          value={typeof draft.next === "string" ? draft.next : ""}
          maxLength={4000}
          readOnly={!!saved}
          onChange={(e) => setDraft({ ...draft, next: e.target.value })}
        />
      </label>
      {!stored && (
        <p role="status">
          Browser storage is unavailable. Keep this panel open until your review
          note is saved.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && (
        <p className="phase6-muted">
          This review note is saved. Open it to continue editing.
        </p>
      )}
      <footer>
        {saved ? (
          <button onClick={() => open(saved.id)}>Open saved review</button>
        ) : (
          <button
            disabled={busy || ctx.disabled || !ctx.save}
            onClick={() => void save()}
          >
            Save review note
          </button>
        )}
      </footer>
    </ImageDialog>
  );
}
export function StudyGoalsLauncher({
  onReview,
  resumeCurrent = false,
}: {
  onReview: (deck: string) => void;
  resumeCurrent?: boolean;
}) {
  const ctx = useContext(NoteMetadataContext),
    [open, setOpen] = useState(false),
    account = storageAccountKey();
  useLayoutEffect(() => setOpen(false), [account]);
  return (
    <>
      <button
        className="phase6-link"
        type="button"
        onClick={() => setOpen(true)}
      >
        Study goals
      </button>
      {open && ctx && (
        <StudyGoalsPanel
          resumeCurrent={resumeCurrent}
          key={account}
          onClose={() => setOpen(false)}
          onReview={(deck) => {
            setOpen(false);
            onReview(deck);
          }}
        />
      )}
    </>
  );
}
function StudyGoalsPanel({
  onClose,
  onReview,
  resumeCurrent,
}: {
  onClose: () => void;
  onReview: (deck: string) => void;
  resumeCurrent: boolean;
}) {
  const ctx = useContext(NoteMetadataContext)!,
    account = storageAccountKey(),
    clock = usePanelClock(),
    [draft, setDraft, stored] = useDraft(
      accountLocalKey("remo-study-goal-draft"),
      () => ({
        id: uuid(),
        title: "",
        deck: ctx.doc.tables.decks[0]?.rootId || "",
        target: addDays(dayKey(), 14),
        minutes: 20,
        count: 20,
        seconds: null,
      }),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    lock = useRef(false),
    goals = useMemo(() => studyGoals(ctx.doc), [ctx.doc]),
    forecasts = useMemo(() => {
      const context = createStudyContext(ctx.doc, clock);
      return new Map<string, ReturnType<typeof goalForecast>>(
        goals
          .slice(0, 50)
          .map(
            (goal: any) =>
              [goal.id, goalForecast(ctx.doc, goal, clock, context)] as [
                string,
                ReturnType<typeof goalForecast>,
              ],
          ),
      );
    }, [ctx.doc, clock, goals]);
  const guard = () => {
    if (account !== storageAccountKey())
      throw Error("Open the original workspace to continue.");
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      guard();
      await ctx.save!((d) => {
        guard();
        return createStudyGoal(d, draft);
      });
      guard();
      setDraft({
        id: uuid(),
        title: "",
        deck: draft.deck,
        target: addDays(dayKey(), 14),
        minutes: 20,
        count: 20,
        seconds: null,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <ImageDialog
      title="Study goals"
      onClose={() => {
        if (!busy) onClose();
      }}
      className="phase6-dialog"
    >
      {goals.slice(0, 50).map((goal: any) => {
        const f = forecasts.get(goal.id)!;
        return (
          <article className="phase6-goal" key={goal.id}>
            <h3>{goal.title}</h3>
            {f.error ? (
              <p role="status">{f.error}</p>
            ) : (
              <>
                <p>
                  {f.completed} / {f.total} new cards introduced ·{" "}
                  {f.unavailable} unavailable ·{" "}
                  {(f.days || 0) > 0
                    ? f.days + " calendar days left"
                    : "target date passed"}
                </p>
                <div className="phase6-stats">
                  <span>
                    <strong>{f.reviews}</strong>Due reviews today
                  </span>
                  <span>
                    <strong>{f.newToday}</strong>New cards suggested today
                  </span>
                  <span>
                    <strong>{goal.minutes} min</strong>Daily budget
                  </span>
                </div>
                <p className="phase6-muted">
                  {f.seconds}s per review using {f.pace}. New cards reserve two
                  passes. {f.knownMinutes} minutes of known work to target;
                  future repeats/relearning may add work. Review uses your
                  normal deck queue and daily limits.
                </p>
                {f.overBudget && (
                  <p role="status">
                    Your budget may be too small for the known workload.
                  </p>
                )}
                {f.unavailable > 0 && (
                  <p role="status">
                    Unavailable cards remain outstanding; they are not counted
                    as completed.
                  </p>
                )}
              </>
            )}
            <div className="phase6-actions">
              <button
                disabled={ctx.disabled || !!f.error}
                onClick={() => onReview(goal.deck)}
              >
                {resumeCurrent ? "Resume current session" : "Study due cards"}
              </button>
              <button
                onClick={() => {
                  onClose();
                  ctx.openNote?.(goal.id);
                }}
              >
                Open goal note
              </button>
              <button
                disabled={busy || ctx.disabled || !ctx.save}
                onClick={() => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError("");
                  void ctx.save!((d) => {
                    guard();
                    return archiveStudyGoal(d, goal.id);
                  })
                    .catch((e) => setError(e.message))
                    .finally(() => {
                      lock.current = false;
                      setBusy(false);
                    });
                }}
              >
                Archive goal
              </button>
            </div>
          </article>
        );
      })}
      {goals.length > 50 && (
        <p className="phase6-muted">
          Showing 50 goals. Other goals remain available in Notes.
        </p>
      )}
      {resumeCurrent && (
        <p className="phase6-muted">
          Your unfinished session resumes first; its queue is never silently
          replaced.
        </p>
      )}
      <details open={!goals.length}>
        <summary>New study goal</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Goal title
            <input
              maxLength={160}
              required
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Deck
            <select
              aria-label="Deck"
              required
              value={draft.deck}
              onChange={(e) => setDraft({ ...draft, deck: e.target.value })}
            >
              <option value="">Choose a deck</option>
              {ctx.doc.tables.decks.map((deck) => (
                <option key={deck.rootId} value={deck.rootId}>
                  {ctx.doc.tables.bullets.find((n) => n.id === deck.rootId)
                    ?.text || "Unavailable deck"}
                </option>
              ))}
            </select>
          </label>
          <div className="phase6-fields">
            <label>
              Target date
              <input
                required
                type="date"
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              />
            </label>
            <label>
              Minutes per day
              <input
                required
                type="number"
                min={1}
                max={240}
                value={draft.minutes}
                onChange={(e) =>
                  setDraft({ ...draft, minutes: Number(e.target.value) })
                }
              />
            </label>
            <label>
              New cards to introduce
              <input
                required
                type="number"
                min={1}
                max={500}
                value={draft.count}
                onChange={(e) =>
                  setDraft({ ...draft, count: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Seconds per card (optional)
              <input
                type="number"
                min={5}
                max={600}
                placeholder="Use recent history or 45s"
                value={draft.seconds ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    seconds: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
          </div>
          <p className="phase6-muted">
            Goals retain a snapshot of new card sources. Due dates, FSRS
            settings and daily limits stay unchanged. Estimates do not promise
            readiness by your target date.
          </p>
          <button
            disabled={
              busy || ctx.disabled || !ctx.save || !ctx.doc.tables.decks.length
            }
          >
            Create study goal
          </button>
        </form>
      </details>
      {!stored && (
        <p role="status">
          This draft is only available in the open panel because browser storage
          is unavailable.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </ImageDialog>
  );
}
