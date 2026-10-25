import {RemoLogo} from './RemoLogo';
import React from "react";

export class RecoveryBoundary extends React.Component<{
  children: React.ReactNode;
  onBackup: () => Promise<void>;
}, { error: Error | null; backupError: string | null }> {
  state = { error: null as Error | null, backupError: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  private onError = (event: ErrorEvent) => {
    this.setState({ error: event.error instanceof Error ? event.error : new Error(event.message || "Unexpected browser error") });
  };
  private onRejection = (event: PromiseRejectionEvent) => {
    this.setState({ error: event.reason instanceof Error ? event.reason : new Error(String(event.reason)) });
  };
  componentDidMount() {
    window.addEventListener("error", this.onError);
    window.addEventListener("unhandledrejection", this.onRejection);
  }
  componentWillUnmount() {
    window.removeEventListener("error", this.onError);
    window.removeEventListener("unhandledrejection", this.onRejection);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="recovery-screen" role="alert">
      <div className="recovery-brand"><RemoLogo/>remo</div>
      <h1>Remo needs to recover</h1>
      <p>An unexpected error interrupted this screen. Your stored notes have not been cleared.</p>
      <p>Download a backup of the current draft before reloading. If this happens again, share the error details below.</p>
      <div className="recovery-actions">
        <button onClick={() => void this.props.onBackup().catch(error => this.setState({ backupError: String(error) }))}>Download recovery backup</button>
        <button onClick={() => location.reload()}>Reload Remo</button>
      </div>
      {this.state.backupError && <p>Backup could not be downloaded: {this.state.backupError}</p>}
      <details open><summary>Error details</summary><pre>{this.state.error.stack || String(this.state.error)}</pre></details>
    </main>;
  }
}
