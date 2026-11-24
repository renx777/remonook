import type { Workspace } from "./data";

type Snapshot = {
  schema: number;
  appearance: {palette:string;dynamic:boolean};
  scope: string | null;
  workspaceName: string;
  revision: number;
  updatedAt: number;
  decks: any[];
  today?: any[];
  focus?: any;
  rhythm?: any;
  resurface?: any;
  resurfaceCards?: any[];
};
type Request = {
  resolve: (snapshot: Snapshot) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
let worker: Worker | null = null,
  sequence = 0;
const pending = new Map<number, Request>();
/** Keep expensive outline traversal and fingerprinting off the editor thread. */
export function disposeWidgetCache(
  message = "Widget cache refresh was interrupted. Pending reviews remain on this device.",
) {
  const previous = worker;
  worker = null;
  previous?.terminate();
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(Error(message));
  }
  pending.clear();
}
function cacheWorker() {
  if (worker) return worker;
  if (typeof Worker === "undefined")
    throw Error(
      "Study widgets need a system webview with worker support. Pending reviews remain on this device.",
    );
  const next = new Worker(
    new URL("./study-widget.worker.ts", import.meta.url),
    { type: "module" },
  );
  next.onmessage = (event) => {
    if (worker !== next) return;
    const { id, snapshot, error } = event.data || {},
      request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    if (error || !snapshot)
      request.reject(
        Error(
          "The widget cache could not refresh. Pending reviews remain on this device.",
        ),
      );
    else request.resolve(snapshot);
  };
  next.onerror = () => {
    if (worker === next)
      disposeWidgetCache(
        "The widget cache could not refresh. Pending reviews remain on this device.",
      );
  };
  next.onmessageerror = () => {
    if (worker === next)
      disposeWidgetCache(
        "The widget cache could not be read. Pending reviews remain on this device.",
      );
  };
  worker = next;
  return next;
}
export function buildWidgetSnapshot(
  doc: Workspace,
  scope: string,
  workspaceName: string,
): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    let current: Worker;
    try {
      current = cacheWorker();
    } catch (error) {
      reject(error);
      return;
    }
    const id = ++sequence;
    const timer = setTimeout(
      () =>
        disposeWidgetCache(
          "The widget cache timed out. Pending reviews remain on this device.",
        ),
      30000,
    );
    pending.set(id, { resolve, reject, timer });
    try {
      current.postMessage({ id, doc, scope, workspaceName });
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      reject(
        Error(
          "The widget cache could not be copied safely. Pending reviews remain on this device.",
        ),
      );
    }
  });
}
