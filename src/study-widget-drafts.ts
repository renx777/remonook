// One key per immutable intent avoids cross-window read/modify/write loss.
export const WIDGET_DRAFT_PREFIX = "remo-study-widget-intent:";
export function widgetDrafts(scope: string) {
  const out: any[] = [];
  const issues: any[] = [];
  for (const key of Object.keys(localStorage).filter((key) =>
    key.startsWith(WIDGET_DRAFT_PREFIX),
  )) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let value: any;
    try {
      value = JSON.parse(raw);
    } catch {
      issues.push({
        widgetIssue:
          "An unreadable study review draft is retained on this device.",
      });
      continue;
    }
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.scope !== "string"
    ) {
      issues.push({
        widgetIssue:
          "A study review draft with no workspace identity is retained on this device.",
      });
      continue;
    }
    if (value.scope === scope) {
      if (typeof value.id !== "string" || !Number.isFinite(value.reviewedAt))
        issues.push({
          widgetIssue:
            "An invalid study review draft is retained on this device.",
        });
      else out.push(value);
    }
  }
  return [
    ...issues,
    ...out.sort(
      (a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id),
    ),
  ];
}
export function saveWidgetDraft(intent: any) {
  const key = WIDGET_DRAFT_PREFIX + intent.id,
    value = JSON.stringify(intent),
    prior = localStorage.getItem(key);
  if (prior && prior !== value)
    throw Error(
      "This review ID already has different content. Its original draft was kept.",
    );
  localStorage.setItem(key, value);
}
export function removeWidgetDraft(id: string) {
  localStorage.removeItem(WIDGET_DRAFT_PREFIX + id);
}
