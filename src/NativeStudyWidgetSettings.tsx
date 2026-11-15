import React from "react";
import { isApp } from "./desktop";
export function NativeStudyWidgetSettings({
  widget,
}: {
  widget: {
    enabled: boolean;
    pending: number;
    error: string;
    desktop: boolean;
    setEnabled: (on: boolean) => Promise<void>;
    open: () => unknown;
    refresh: () => void;
  };
}) {
  if (!isApp()) return null;
  return (
    <section
      className="native-widget-settings"
      aria-label="Study outside the app"
    >
      <h3>Study outside the main window</h3>
      <p>
        Review due text flashcards in a compact desktop study window or an
        Android home-screen widget. MCQs, images and unsupported rich content
        stay in Study Desk.
      </p>
      <label className="native-widget-enable">
        <input
          type="checkbox"
          checked={widget.enabled}
          onChange={(event) => void widget.setEnabled(event.target.checked)}
        />
        Enable widgets for this workspace on this device
      </label>
      <p className="dialog-muted">
        This caches question and answer text in private app storage on this
        device. Turn it off to clear the visible card cache. Pending reviews
        remain safely associated with their original workspace.
      </p>
      {widget.enabled && (
        <>
          {widget.desktop ? (
            <button onClick={() => void widget.open()}>
              Open study window
            </button>
          ) : (
            <p>
              On your Android home screen, open{" "}
              <strong>Widgets → RemoNook → Study flashcards</strong>, then
              choose a deck. Reveal, grade and advance without opening RemoNook.
            </p>
          )}
          <button onClick={widget.refresh}>Refresh widget cache</button>
          <p role="status">
            {widget.pending
              ? `${widget.pending} review${widget.pending === 1 ? "" : "s"} saved on this device · pending app processing`
              : "Reviews use normal saving and synchronization after the app processes them."}
          </p>
        </>
      )}
      <p className="dialog-muted">
        Android can queue reviews while the app is closed. Open RemoNook to
        process them and refresh due cards. Desktop study windows use the
        background app; they are app windows, not OS Widgets-board or macOS
        WidgetKit extensions.
      </p>
      {widget.error && <p role="alert">{widget.error}</p>}
    </section>
  );
}
