import * as Popover from "@radix-ui/react-popover";
import {activeLocalWorkspace} from './workspaces';
import { useState } from "react";
import type { User } from "firebase/auth";
import { CloudAccountStatus } from "./SaveIndicator";
import { Icon } from "./icons";
import "./profile-menu.css";

type Signal = Parameters<typeof CloudAccountStatus>[0]["signal"];

function provider(user: User) {
  const id = user.providerData?.[0]?.providerId || "";
  return id === "google.com" ? "Google" : id === "password" ? "Email and password" : id || "Account";
}

function Avatar({ user, size }: { user: User | null; size: number }) {
  const [broken, setBroken] = useState(false);
  const name = user?.displayName || user?.email || "";
  if (user?.photoURL && !broken)
    return (
      <img className="profile-avatar" src={user.photoURL} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    );
  return (
    <span className="profile-avatar is-initial" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {user ? (name.trim()[0] || "?").toUpperCase() : <Icon name="people" size={Math.round(size * 0.5)} />}
    </span>
  );
}

export function ProfileMenu({
  user,
  environment,
  signal,
  onSettings,
  onSignIn,
  onSignOut,
}: {
  user: User | null;
  environment: string;
  signal: Signal;
  onSettings: (panel: "account" | "backups" | "appearance") => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const name = user?.displayName || user?.email?.split("@")[0] || "Guest";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="icon-button profile-trigger" aria-label={user ? `Account: ${user.email || name}` : activeLocalWorkspace() ? "Account: device-only workspace" : "Account: not signed in"} title={user?.email || "Not signed in"}>
          <Avatar user={user} size={26} />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={document.querySelector(".app") || document.body}>
        <Popover.Content className="profile-menu" align="end" sideOffset={8} collisionPadding={12} aria-label="Account">
          <div className="profile-head">
            <Avatar user={user} size={48} />
            <div>
              <strong>{name}</strong>
              {user ? (
                <>
                  <span>{user.email}</span>
                  <small>Signed in with {provider(user)}</small>
                </>
              ) : (
                <span>Notes stay on this device only</span>
              )}
            </div>
          </div>
          <dl className="profile-facts">
            {user && (
              <div>
                <dt>Cloud sync</dt>
                <dd><CloudAccountStatus signal={signal} /></dd>
              </div>
            )}
            {!!environment && environment !== "production" && (
              <div>
                <dt>Environment</dt>
                <dd>{environment[0].toUpperCase() + environment.slice(1)}</dd>
              </div>
            )}
          </dl>
          {user && <CloudAccountStatus signal={signal} error />}
          <div className="profile-actions">
            {user ? (
              <>
                <button onClick={act(() => onSettings("account"))}><Icon name="people" size={16} />Account and security</button>
                <button onClick={act(() => onSettings("backups"))}><Icon name="download" size={16} />Backups</button>
                <button onClick={act(() => onSettings("appearance"))}><Icon name="settings" size={16} />Settings</button>
                <button className="profile-signout" onClick={act(onSignOut)}><Icon name="logout" size={16} />Sign out</button>
              </>
            ) : (
              <>
                {activeLocalWorkspace()
                  ? <p className="profile-note">This is a device-only workspace. Your account and sync are in “My notes” (switch at the top of the sidebar).</p>
                  : <button className="profile-signin" onClick={act(onSignIn)}>Sign in or create account</button>}
                <button onClick={act(() => onSettings("backups"))}><Icon name="download" size={16} />Backups</button>
                <button onClick={act(() => onSettings("appearance"))}><Icon name="settings" size={16} />Settings</button>
              </>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
