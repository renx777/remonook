import React, { useEffect, useRef, useState } from "react";
import { desktopInvoke } from "./desktop";
import {
  widgetDrafts,
  saveWidgetDraft,
  removeWidgetDraft,
} from "./study-widget-drafts";
import "./study-widget.css";
type Card = {
  id: string;
  fingerprint: string;
  question: string;
  answer: string;
};
type Deck = { id: string; title: string; cards: Card[] };
type View = {
  snapshot: null | {
    scope: string | null;
    workspaceName: string;
    updatedAt: number;
    decks: Deck[];
  };
  pending: number;
};

export function StudyWidget() {
  const [view, setView] = useState<View | null>(null),
    [deckId, setDeckId] = useState(""),
    [revealed, setRevealed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState<any>(null);
  const lock = useRef(false),
    current = useRef<Card | null>(null),
    event = useRef<any>(null);
  const refresh = async () => {
    try {
      const next = await desktopInvoke<View>("study_widget_state");
      setView(next);
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, []);
  const snapshot = view?.snapshot,
    deck = snapshot?.decks.find((d) => d.id === deckId) || snapshot?.decks[0],
    card = deck?.cards[0] || null;
  useEffect(() => {
    setRevealed(false);
    event.current = null;
    current.current = card;
    setRetry(null);
    try {
      const pending = snapshot?.scope
        ? widgetDrafts(snapshot.scope).find((d) => !d.widgetIssue)
        : null;
      if (pending && pending.scope === snapshot?.scope) {
        event.current = pending;
        setRetry(pending);
        setError(
          "A previous review still needs to be saved. Retry keeps the same review ID.",
        );
      }
    } catch {
      setError(
        "A pending review draft could not be read. It has not been removed.",
      );
    }
  }, [snapshot?.scope, card?.id, card?.fingerprint]);
  const send = async (intent: any) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      saveWidgetDraft(intent);
      await desktopInvoke("study_widget_submit", { intent });
      removeWidgetDraft(intent.id);
      setRetry(null);
      event.current = null;
      setRevealed(false);
      await refresh();
    } catch (e) {
      event.current = intent;
      setRetry(intent);
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (snapshot?.scope) {
      const id = localStorage.getItem(
        "remo-study-window-deck:" + snapshot.scope,
      );
      if (id) setDeckId(id);
    }
  }, [snapshot?.scope]);
  const grade = (value: string) => {
    if (!snapshot?.scope || !deck || !card || !revealed || retry) return;
    const intent = {
      schema: 1,
      id: crypto.randomUUID(),
      scope: snapshot.scope,
      deckId: deck.id,
      cardId: card.id,
      fingerprint: card.fingerprint,
      grade: value,
      reviewedAt: Date.now(),
      question: card.question,
      answer: card.answer,
      widgetId: "desktop-study-window",
    };
    event.current = intent;
    void send(intent);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,select,textarea")) return;
      if (e.key === " " && card && !revealed && !busy) {
        e.preventDefault();
        setRevealed(true);
      }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        grade(["AGAIN", "HARD", "GOOD", "EASY"][Number(e.key) - 1]);
      }
      if (e.key === "Escape") void desktopInvoke("study_widget_hide");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [snapshot, deck, card, revealed, busy, retry]);
  return (
    <main className="study-widget-window">
      <header data-tauri-drag-region>
        <div data-tauri-drag-region>
          <small>REMONOOK · STUDY</small>
          <strong>{snapshot?.workspaceName || "Your study space"}</strong>
        </div>
        <button
          aria-label="Hide study window"
          onClick={() => void desktopInvoke("study_widget_hide")}
        >
          ×
        </button>
      </header>
      {snapshot?.scope ? (
        <>
          <label className="study-widget-deck">
            Deck
            <select
              aria-label="Study deck"
              value={deck?.id || ""}
              disabled={busy || !!retry}
              onChange={(e) => {
                setDeckId(e.target.value);
                setRevealed(false);
                if (snapshot?.scope)
                  localStorage.setItem(
                    "remo-study-window-deck:" + snapshot.scope,
                    e.target.value,
                  );
              }}
            >
              {snapshot.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} · {d.cards.length} cached
                </option>
              ))}
            </select>
          </label>
          {card ? (
            <>
              <article aria-label="Flashcard question">
                <small>QUESTION</small>
                <p>{card.question}</p>
              </article>
              {revealed && (
                <article
                  className="study-widget-answer"
                  aria-label="Flashcard answer"
                >
                  <small>ANSWER</small>
                  <p>{card.answer}</p>
                </article>
              )}
              <footer>
                {!revealed ? (
                  <button
                    className="primary"
                    disabled={busy || !!retry}
                    onClick={() => setRevealed(true)}
                  >
                    Reveal answer <kbd>Space</kbd>
                  </button>
                ) : (
                  <div className="study-widget-grades">
                    {["Again", "Hard", "Good", "Easy"].map((label, i) => (
                      <button
                        key={label}
                        disabled={busy || !!retry}
                        onClick={() => grade(label.toUpperCase())}
                      >
                        {label}
                        <kbd>{i + 1}</kbd>
                      </button>
                    ))}
                  </div>
                )}
              </footer>
            </>
          ) : (
            <div className="study-widget-empty">
              <h1>A little room to breathe.</h1>
              <p>
                No supported due cards are cached in this deck. Open RemoNook to
                refresh the queue.
              </p>
            </div>
          )}
          <p className="study-widget-status" role="status">
            {view?.pending
              ? `${view.pending} review${view.pending === 1 ? "" : "s"} saved on this device · pending app`
              : "Cached cards · reviews use the background app"}
            <br />
            Last refreshed{" "}
            {new Date(snapshot.updatedAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </>
      ) : (
        <div className="study-widget-empty">
          <h1>A small space to study.</h1>
          <p>
            Enable study widgets in RemoNook Settings → Study for the workspace
            you want to review.
          </p>
        </div>
      )}
      {error && (
        <p className="study-widget-error" role="alert">
          {error}
        </p>
      )}
      {retry && (
        <button disabled={busy} onClick={() => void send(retry)}>
          Retry saving this review
        </button>
      )}
      <button
        className="study-widget-open"
        onClick={() => void desktopInvoke("show_main_window")}
      >
        Open RemoNook
      </button>
    </main>
  );
}
