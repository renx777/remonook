import { useEffect, useRef, useState } from "react";
import { desktopInvoke, desktopListen, isApp, isDesktop } from "./desktop";
import { storageAccountKey, type Workspace } from "./data";
import { activeLocalWorkspace } from "./workspaces";
import { widgetDrafts, removeWidgetDraft } from "./study-widget-drafts";
import {applyWidgetCompletion} from "./widget-suite.mjs";
import { applyWidgetReview } from "./study-widget.mjs";
import { buildWidgetSnapshot, disposeWidgetCache } from "./study-widget-cache";

import {widgetAppearance} from "./widget-appearance";
const preference = (scope: string) => "remo-native-study-widget:" + scope;
export const widgetEnabled = (scope: string) => {
  try {
    return localStorage.getItem(preference(scope)) === "true";
  } catch {
    return false;
  }
};
let serial: Promise<unknown> = Promise.resolve(),
  generation = 0,
  suspended = false;
const exclusive = <T>(fn: () => Promise<T>) => {
  const run = serial.then(fn);
  serial = run.catch(() => {});
  return run;
};
const emptySnapshot = () => ({
  schema: 3,
  appearance: widgetAppearance(),
  scope: null,
  workspaceName: "",
  revision: 0,
  updatedAt: Date.now(),
  decks: [],
  resurface: null as any,
});
/** Clear presentation before an account/workspace transition, retaining every pending intent. */
export async function clearNativeStudyWidget() {
  if (!isApp()) return;
  suspended = true;
  generation++;
  disposeWidgetCache();
  await exclusive(() =>
    desktopInvoke("study_widget_publish", { snapshot: emptySnapshot() }),
  );
}
type Options = {
  ready: boolean;
  revision?: number;
  getDoc: () => Workspace | null;
  canApply: () => boolean;
  apply: (doc: Workspace) => Promise<void>;
  onNotice: (message: string) => void;
  resurface?: (doc: Workspace) => any;
};
export function useStudyWidget(options: Options) {
  const scope = storageAccountKey(),
    latest = useRef(options);
  latest.current = options;
  const [sharing, setOn] = useState(() => ({
      scope,
      enabled: widgetEnabled(scope),
    })),
    [error, setError] = useState(""),
    [pending, setPending] = useState(0),
    [refresh, setRefresh] = useState(0);
  const enabled =
    sharing.scope === scope ? sharing.enabled : widgetEnabled(scope);
  const tick = useRef<() => void>(() => {});
  useEffect(() => {
    if (!isApp()) return;
    const token = ++generation;
    suspended = false;
    let disposed = false,
      running = false,
      lastSnapshot = "",
      lastDoc: Workspace | null = null,
      lastBuiltAt = 0;
    const valid = () =>
      !disposed &&
      !suspended &&
      generation === token &&
      storageAccountKey() === scope;
    const run = async () => {
      if (!valid() || running) return;
      running = true;
      try {
        await exclusive(async () => {
          if (!valid()) return;
          if (!latest.current.ready) {
            await desktopInvoke("study_widget_publish", {
              snapshot: emptySnapshot(),
            });
            return;
          }
          const issues: string[] = [];
          // The main app alone commits through its current document and durable save chain.
          if (latest.current.canApply()) {
            const native = await desktopInvoke<any[]>("study_widget_inbox", {
                scope,
              }),
              drafts = widgetDrafts(scope),
              nativeIds = new Set(native.map((i) => i.id));
            const intents = [
              ...drafts.filter((d) => !nativeIds.has(d.id)),
              ...native,
            ].sort(
              (a, b) =>
                (a.reviewedAt ?? a.at) - (b.reviewedAt ?? b.at) ||
                String(a.id).localeCompare(String(b.id)),
            );
            for (const intent of intents) {
              if (!valid() || !latest.current.canApply()) break;
              const current = latest.current.getDoc();
              if (!current) break;
              if (intent.widgetIssue) {
                issues.push(intent.widgetIssue);
                continue;
              }
              try {
                const result = (intent.type === "complete" ? applyWidgetCompletion : applyWidgetReview)(
                  current,
                  intent,
                  scope,
                  Date.now(),
                );
                if (result.doc !== current)
                  await latest.current.apply(result.doc as Workspace);
                if (!valid()) return;
                // Replace the presentation before archiving. Otherwise removing a pending
                // event could briefly expose its old cached card for a second grade.
                if (!latest.current.canApply()) break;
                const saved = latest.current.getDoc();
                if (!saved) break;
                const snapshot = enabled
                  ? await buildWidgetSnapshot(
                      saved,
                      scope,
                      activeLocalWorkspace()?.name || "My notes",
                    )
                  : emptySnapshot();
                if (
                  !valid() ||
                  !latest.current.canApply() ||
                  latest.current.getDoc() !== saved
                )
                  break;
                snapshot.appearance = widgetAppearance();
                snapshot.resurface = enabled ? latest.current.resurface?.(saved) ?? null : null;
                await desktopInvoke("study_widget_publish", { snapshot });
                lastSnapshot = JSON.stringify({
                  ...snapshot,
                  updatedAt: 0,
                  revision: 0,
                });
                lastDoc = saved;
                lastBuiltAt = Date.now();
                if (!valid()) return;
                // A durable log receipt/recovery precedes archive; failed saves never acknowledge.
                if (nativeIds.has(intent.id))
                  await desktopInvoke("study_widget_ack", {
                    scope,
                    ids: [intent.id],
                  });
                removeWidgetDraft(intent.id);
                if ("notice" in result && result.notice)
                  latest.current.onNotice(String(result.notice));
              } catch (e) {
                issues.push(e instanceof Error ? e.message : String(e));
                if (!latest.current.canApply()) break;
              }
            }
          }
          if (!valid()) return;
          if (!enabled) {
            await desktopInvoke("study_widget_publish", {
              snapshot: emptySnapshot(),
            });
            const state = await desktopInvoke<{ pending: number }>(
              "study_widget_state",
            );
            setPending(state.pending);
            setError(issues.join(" "));
            return;
          }
          if (!latest.current.canApply()) return;
          const current = latest.current.getDoc();
          if (!current) return;
          if (current !== lastDoc || Date.now() - lastBuiltAt > 30000) {
            const snapshot = await buildWidgetSnapshot(
              current,
              scope,
              activeLocalWorkspace()?.name || "My notes",
            );
            if (
              !valid() ||
              !latest.current.canApply() ||
              latest.current.getDoc() !== current
            )
              return;
            snapshot.appearance = widgetAppearance();
            snapshot.resurface = latest.current.resurface?.(current) ?? null;
            const key = JSON.stringify({
              ...snapshot,
              updatedAt: 0,
              revision: 0,
            });
            if (key !== lastSnapshot) {
              snapshot.appearance = widgetAppearance();
                await desktopInvoke("study_widget_publish", { snapshot });
              lastSnapshot = key;
            }
            lastDoc = current;
            lastBuiltAt = Date.now();
          }
          const state = await desktopInvoke<{ pending: number }>(
            "study_widget_state",
          );
          if (valid()) {
            setPending(state.pending);
            setError(issues.join(" "));
          }
        });
      } catch (e) {
        if (valid())
          setError(
            (e instanceof Error ? e.message : String(e)) +
              " Pending widget reviews remain on this device.",
          );
      } finally {
        running = false;
      }
    };
    tick.current = () => {
      void run();
    };
    void run();
    const interval = setInterval(() => void run(), 2500),
      focus = () => void run();
    window.addEventListener("focus", focus);
    window.addEventListener("storage", focus);
    document.addEventListener("visibilitychange", focus);
    const stop = desktopListen("study-widget-review", focus),
      stopRefresh = desktopListen("study-widget-refresh", focus);
    return () => {
      disposed = true;
      disposeWidgetCache();
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", focus);
      document.removeEventListener("visibilitychange", focus);
      void stop.then((f) => f());
      void stopRefresh.then((f) => f());
    };
  }, [scope, enabled, options.ready, refresh]);
  useEffect(() => {
    tick.current();
  }, [options.revision]);
  const setEnabled = async (on: boolean) => {
    try {
      if (!on) await clearNativeStudyWidget();
      localStorage.setItem(preference(scope), String(on));
      suspended = false;
      setOn({ scope, enabled: on });
      setRefresh((v) => v + 1);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return {
    enabled,
    error,
    pending,
    setEnabled,
    open: () =>
      desktopInvoke("study_widget_open").catch((e) => setError(String(e))),
    refresh: () => setRefresh((v) => v + 1),
    desktop: isDesktop(),
  };
}
