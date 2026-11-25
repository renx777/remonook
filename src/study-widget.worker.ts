import { createWidgetSnapshot } from "./study-widget.mjs";
// Plain workspace data only: no credentials, DOM, storage or native commands.
self.onmessage = (event) => {
  const { id, doc, scope, workspaceName } = event.data;
  try {
    self.postMessage({
      id,
      snapshot: createWidgetSnapshot(doc, scope, workspaceName),
    });
  } catch {
    self.postMessage({ id, error: true });
  }
};
