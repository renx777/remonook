import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {googleSignIn,emailSignIn,emailSignUp,resetPassword,verifyEmail,checkVerification,addPassword} from './auth-service';
import './account-access.css';

export function authError(error:unknown){
 const code=(error as {code?:string})?.code;
 const messages:Record<string,string>={
  'auth/invalid-credential':'Email or password is incorrect. Try again or reset your password.',
  'auth/wrong-password':'Email or password is incorrect. Try again or reset your password.',
  'auth/user-not-found':'Email or password is incorrect. Try again or reset your password.',
  'auth/email-already-in-use':'Unable to create this account. Try signing in, resetting your password, or continuing with Google. Existing Google users can add a password in Account settings.',
  'auth/invalid-email':'Enter a valid email address.',
  'auth/weak-password':'Choose a stronger password with at least 8 characters.',
  'auth/password-does-not-meet-requirements':'This password does not meet the account password policy. Choose a longer password with upper and lowercase letters, numbers, and a symbol.',
  'auth/too-many-requests':'Too many attempts. Please wait before trying again.',
  'auth/network-request-failed':'Could not connect. Check your connection and try again.',
  'auth/operation-not-allowed':'Email sign-in is not enabled for this environment yet.',
  'auth/popup-blocked':'Allow popups for this site, or sign in with email.',
  'auth/popup-closed-by-user':'Google sign-in was closed. You can try again.',
  'auth/account-exists-with-different-credential':'Sign in with your existing method first to keep the same workspace.',
  'auth/requires-recent-login':'Sign out and sign back in before changing your password.',
  'auth/user-disabled':'This account is disabled. Contact support for help.'
 };
 return messages[code||'']||(code?'Could not complete this request. Please try again.':error instanceof Error?error.message:'Could not complete this request.');
}
export const accessActions={google:googleSignIn,login:emailSignIn,signup:emailSignUp,reset:resetPassword};
export function AccountAccess({onClose,actions=accessActions}:{onClose:()=>void;actions?:typeof accessActions}){
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),previousFocus=useRef(document.activeElement as HTMLElement|null);
 const [mode,setMode]=useState<'login'|'signup'|'reset'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{const app=document.querySelector('.app');if(app&&dialog.current){const style=getComputedStyle(app);for(const key of ['--bg','--panel','--text','--accent','--line'])dialog.current.style.setProperty(key,style.getPropertyValue(key));}dialog.current?.showModal();dialog.current?.querySelector('input')?.focus();return()=>{if(previousFocus.current?.isConnected)previousFocus.current.focus();};},[]);
 const run=async(action:()=>Promise<unknown>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(authError(e));}finally{lock.current=false;setBusy(false);}};
 const change=(next:typeof mode)=>{setMode(next);setPassword('');setConfirm('');setError('');setNotice('');};
 const title=mode==='signup'?'Create your account':mode==='reset'?'Reset your password':'Welcome back';
 return <dialog ref={dialog} className="account-access" aria-labelledby="access-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
  <button className="access-close" aria-label="Close sign-in" disabled={busy} onClick={onClose}>×</button>
  <p className="access-eyebrow">REMONOOK</p><h2 id="access-title">{title}</h2><p className="access-muted">{mode==='reset'?'We’ll send a link to help you sign in again.':'Your notes, connected across devices.'}</p>
  {mode!=='reset'&&<><button className="access-google" disabled={busy} onClick={()=>void run(actions.google)}>Continue with Google</button><div className="access-divider">or use email</div></>}
  <form onSubmit={e=>{e.preventDefault();if(mode==='signup'&&password!==confirm){setError('Passwords do not match.');return;}void run(async()=>{if(mode==='reset'){try{await actions.reset(email);}catch(e){if((e as {code?:string}).code!=='auth/user-not-found')throw e;}setNotice('If an account uses this email, a password reset link is on its way. Check your inbox and spam folder.');}else await actions[mode](email,password);});}}>
   <fieldset disabled={busy}><label>Email<input autoFocus type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
   {mode!=='reset'&&<label>Password<input aria-describedby={mode==='signup'?'access-password-help':undefined} type="password" autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={mode==='signup'?8:undefined} maxLength={4096} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
   {mode==='signup'&&<small id="access-password-help">At least 8 characters.</small>}
   {mode==='signup'&&<label>Confirm password<input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
   {error&&<p role="alert" className="access-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
   <button className="access-submit" type="submit">{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button></fieldset>
  </form>
  <div className="access-links">{mode==='login'?<><button disabled={busy} onClick={()=>change('reset')}>Forgot password?</button><button disabled={busy} onClick={()=>change('signup')}>Create an account</button></>:<button disabled={busy} onClick={()=>change('login')}>Back to sign in</button>}</div>
 </dialog>;
}
export function AccountSecurity({user}:{user:User}){
 const [verified,setVerified]=useState(user.emailVerified),[hasPassword,setHasPassword]=useState(()=>user.providerData.some(p=>p.providerId==='password')),[adding,setAdding]=useState(false),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const lock=useRef(false);
 const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(authError(e));}finally{lock.current=false;setBusy(false);}};
 return <div className="account-security">
  {!verified&&<><p>Verify your email to confirm this address belongs to you.</p><button className="action" disabled={busy} onClick={()=>void run(async()=>{await verifyEmail();setNotice('Verification email sent. Check your inbox and spam folder.');})}>Send verification email</button> <button className="action" disabled={busy} onClick={()=>void run(async()=>{const value=await checkVerification();setVerified(value);setNotice(value?'Email verified.':'Not verified yet. Open the link in your email, then check again.');})}>I’ve verified my email</button></>}
  {hasPassword?<button className="action" disabled={busy} onClick={()=>void run(async()=>{await resetPassword(user.email!);setNotice('Password reset email sent.');})}>Reset password</button>:verified&&!adding?<button className="action" onClick={()=>setAdding(true)}>Add email sign-in</button>:null}
  {adding&&<form onSubmit={e=>{e.preventDefault();if(password!==confirm){setError('Passwords do not match.');return;}void run(async()=>{await addPassword(password);setHasPassword(true);setAdding(false);setPassword('');setConfirm('');setNotice('You can now sign in with Google or your email and password. Both open this workspace.');});}}><fieldset disabled={busy}><label>New password<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm password<input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="action" type="submit">Save password</button> <button className="action" type="button" onClick={()=>{setAdding(false);setPassword('');setConfirm('');setError('');}}>Cancel</button></fieldset></form>}
  {error&&<p className="access-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </div>;
}
