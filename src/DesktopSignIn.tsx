// The browser half of desktop Google sign-in. The desktop app opens
// `<site>/?port=…&state=…#desktop-signin` in the system browser. This page signs in with Google as
// the website does, then sends the Google ID token to the desktop app's one-time listener on
// 127.0.0.1 (never to any other host) together with the app's random state.
import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './auth-service';
import { RemoLogo } from './RemoLogo';
import { desktopSignInRequest, desktopCallback } from './desktop';

export function DesktopSignIn() {
  const request = desktopSignInRequest(window.location.search);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  const go = async () => {
    if (!request || !auth) return;
    setBusy(true); setError('');
    try {
      const wasSignedIn = !!auth.currentUser, provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider), idToken = GoogleAuthProvider.credentialFromResult(result)?.idToken;
      if (!idToken) throw Error('Google did not return a sign-in token. Try again.');
      // This tab only relays the sign-in; leave the website as it was.
      if (!wasSignedIn) await signOut(auth).catch(() => {});
      setDone(true);
      window.location.replace(desktopCallback(request.port, request.state, idToken));
    } catch (e: any) {
      setError(e?.code === 'auth/popup-closed-by-user' ? 'The Google window was closed. Try again.' : e?.message || String(e));
      setBusy(false);
    }
  };
  return <main className="desktop-signin">
    <div className="desktop-signin-card">
      <div className="desktop-signin-brand"><RemoLogo />RemoNook</div>
      {!request ? <><h1>Open this from the RemoNook app</h1><p>This page finishes Google sign-in for the RemoNook desktop app. Start from <strong>Continue with Google</strong> in the app.</p></>
        : done ? <><h1>Returning to the app…</h1><p>You can close this tab once the app shows your notes.</p></>
        : <><h1>Sign in to the RemoNook app</h1><p>Continue with Google here. Your sign-in is then handed to the RemoNook desktop app on this computer.</p>
          <button className="access-google" disabled={busy} onClick={() => void go()}>{busy ? 'Waiting for Google…' : 'Continue with Google'}</button>
          {error && <p role="alert" className="access-error">{error}</p>}</>}
    </div>
  </main>;
}
