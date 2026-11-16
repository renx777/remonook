import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { desktopInvoke, isMobileApp } from "./desktop";
import { storageAccountKey } from "./data";
import { activeLocalWorkspace } from "./workspaces";
import { useBackClose } from "./back-stack";
import "./incoming-share.css";
const draftKey = (id: string) => "remo-incoming-share-draft:" + id;
export function IncomingAndroidShare({
  ready,
  onSave,
  accountLabel = "On this device",
}: {
  ready: boolean;
  accountLabel?: string;
  onSave: (
    entry: any,
    text: string,
    kind: string,
    scope: string,
  ) => Promise<void>;
}) {
  const [entry, setEntry] = useState<any>(null),
    [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [kind, setKind] = useState("note"),
    [destination, setDestination] = useState({
      scope: "",
      name: "",
      account: "",
    }),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState("");
  const latest = useRef({ ready, onSave, accountLabel });
  latest.current = { ready, onSave, accountLabel };
  const current = useRef<any>(null),
    dismissed = useRef(new Set<string>()),
    lock = useRef(false),
    dialog = useRef<HTMLDialogElement>(null);
  const scope = storageAccountKey(),
    sameScope = destination.scope === scope;
  useEffect(() => {
    if (!ready || !isMobileApp()) return;
    let alive = true,
      running = false;
    const check = async () => {
      if (running || current.current) return;
      running = true;
      try {
        const owner = storageAccountKey();
        const items = await desktopInvoke<any[]>("android_share_inbox", {
          scope: owner,
        });
        if (!alive || storageAccountKey() !== owner) return;
        const item = items.find(
          (v) =>
            v.schema === 1 &&
            typeof v.text === "string" &&
            !dismissed.current.has(v.id),
        );
        if (item) {
          setFrozen(false);
          current.current = item;
          setEntry(item);
          setDestination({
            scope: storageAccountKey(),
            name: activeLocalWorkspace()?.name || "My notes",
            account: latest.current.accountLabel,
          });
          let draft;
          try {
            draft = JSON.parse(
              localStorage.getItem(draftKey(item.id)) || "null",
            );
          } catch {}
          setText(
            draft?.text ??
              [
                item.subject && item.subject.trim() !== item.text.trim()
                  ? item.subject
                  : "",
                item.text,
              ]
                .filter(Boolean)
                .join("\n\n"),
          );
          setKind(
            draft?.kind ||
              (/^https?:\/\/\S+$/.test(item.text.trim()) ? "bookmark" : "note"),
          );
          setError("");
          setOpen(true);
        } else if (items.some((v) => v.shareIssue))
          setError("An unreadable incoming share is retained on this device.");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        running = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 2000);
    window.addEventListener("focus", check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [ready, scope]);
  const close = () => {
    if (!lock.current) {
      if (entry) dismissed.current.add(entry.id);
      setOpen(false);
    }
  };
  useBackClose(open, close);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const target = dialog.current;
    const app = document.querySelector(".app");
    if (app && target) {
      const style = getComputedStyle(app);
      for (const key of [
        "--bg",
        "--panel",
        "--text",
        "--accent",
        "--line",
        "--muted",
      ])
        target.style.setProperty(key, style.getPropertyValue(key));
    }
    target?.showModal();
    return () => {
      target?.close();
      previous?.isConnected && previous.focus();
    };
  }, [open]);
  function update(value: string, nextKind = kind) {
    setText(value);
    setKind(nextKind);
    try {
      if (entry)
        localStorage.setItem(
          draftKey(entry.id),
          JSON.stringify({ text: value, kind: nextKind }),
        );
    } catch {
      setError(
        "The draft could not be saved locally. Keep this preview open and copy your edits before closing.",
      );
    }
  }
  async function save() {
    if (lock.current || !entry || !sameScope) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await desktopInvoke("android_share_claim", {
        id: entry.id,
        scope: destination.scope,
      });
      await latest.current.onSave(entry, text, kind, destination.scope);
      setFrozen(true);
      if (storageAccountKey() !== destination.scope)
        throw Error(
          "The workspace changed. Your original share remains on this device.",
        );
      await desktopInvoke("android_share_ack", {
        id: entry.id,
        scope: destination.scope,
      });
      localStorage.removeItem(draftKey(entry.id));
      current.current = null;
      setEntry(null);
      setOpen(false);
    } catch (e) {
      if ((e as any)?.captureApplied) setFrozen(true);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!isMobileApp()) return null;
  return (
    <>
      {entry && !open && sameScope && (
        <button className="incoming-share-resume" onClick={() => setOpen(true)}>
          Resume incoming share
        </button>
      )}
      {open &&
        entry &&
        createPortal(
          <dialog
            ref={dialog}
            className="incoming-share-dialog"
            aria-labelledby="incoming-share-title"
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <header>
              <h2 id="incoming-share-title">Save to RemoNook</h2>
              <button
                aria-label="Close incoming share"
                disabled={busy}
                onClick={close}
              >
                ×
              </button>
            </header>
            {sameScope ? (
              <>
                <p>
                  Save in <strong>{destination.name}</strong>
                  <br />
                  <small>{destination.account}</small>
                </p>
                <label>
                  Save as
                  <select
                    disabled={busy || frozen}
                    value={kind}
                    onChange={(e) => update(text, e.target.value)}
                  >
                    <option value="note">Note in Inbox</option>
                    <option value="bookmark">Bookmark</option>
                  </select>
                </label>
                <label>
                  Shared text
                  <textarea
                    value={text}
                    disabled={busy || frozen}
                    onChange={(e) => update(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p>
                Your workspace changed. This share is retained for its original
                destination.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            <footer>
              <button disabled={busy} onClick={close}>
                Later
              </button>
              <button
                className="primary"
                disabled={busy || !sameScope || !text.trim()}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : frozen ? "Retry saving" : "Save"}
              </button>
            </footer>
          </dialog>,
          document.body,
        )}
      {error && !open && <p role="status">{error}</p>}
    </>
  );
}
