import {initializeApp} from 'firebase/app';
import {getAuth,initializeAuth,browserLocalPersistence,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signInWithCredential,signOut} from 'firebase/auth';
import {CLOUD_ENABLED,firebaseConfig,APP_ENV} from './cloud-config';
import {isApp,desktopGoogleToken} from './desktop';
const firebaseApp=CLOUD_ENABLED?initializeApp(firebaseConfig):null;
// The desktop app (Tauri) has no Google pop-up sign-in: the pop-up helper loads a page from the
// auth domain, which never completes inside the app window and would hold up start-up.
export const auth=firebaseApp ? (isApp() ? initializeAuth(firebaseApp,{persistence:browserLocalPersistence}) : typeof browserPopupRedirectResolver==='function' ? initializeAuth(firebaseApp,{persistence:browserLocalPersistence,popupRedirectResolver:browserPopupRedirectResolver}) : getAuth(firebaseApp)) : null;
export const authenticatedUid=()=>auth?.currentUser?.uid;
/** Desktop: Google sign-in happens in the system browser, which returns a Google ID token. */
export async function desktopGoogleSignIn(onLink?:(url:string)=>void){if(!auth)throw Error('Cloud sign-in is disabled in local development.');const idToken=await desktopGoogleToken(APP_ENV,onLink);try{await signInWithCredential(auth,GoogleAuthProvider.credential(idToken));}catch(e:any){throw Object.assign(Error('Google sign-in could not be completed. Try again.'),{cause:e});}}
export async function googleSignIn(){if(isApp())return desktopGoogleSignIn();if(!auth)throw Error('Cloud sign-in is disabled in local development. Configure staging to test sync.');const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}
export const googleSignOut=()=>auth?signOut(auth):Promise.resolve();

import {createUserWithEmailAndPassword,signInWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,EmailAuthProvider,linkWithCredential,reload} from 'firebase/auth';
const requireAuth=()=>{if(!auth)throw Error('Cloud sign-in is disabled in local development. Use staging to test accounts.');return auth;};
// Hold the account reload until signup has attempted its verification email.
let pending:Promise<unknown>|undefined;
export const settleAuthOperation=async()=>{try{await pending;}catch{/* Errors are shown by the form. */}};
export function emailSignIn(email:string,password:string){return signInWithEmailAndPassword(requireAuth(),email.trim(),password);}
export function emailSignUp(email:string,password:string){
 const operation=Promise.resolve().then(async()=>{const result=await createUserWithEmailAndPassword(requireAuth(),email.trim(),password);try{await sendEmailVerification(result.user);}catch{/* Account exists; Settings offers resend. */}return result;});
 pending=operation;void operation.finally(()=>{if(pending===operation)pending=undefined;}).catch(()=>{});return operation;
}
export const resetPassword=(email:string)=>sendPasswordResetEmail(requireAuth(),email.trim());
export const verifyEmail=()=>{const user=requireAuth().currentUser;if(!user)throw Error('Sign in first.');return sendEmailVerification(user);};
export const checkVerification=async()=>{const user=requireAuth().currentUser;if(!user)throw Error('Sign in first.');await reload(user);return user.emailVerified;};
export const addPassword=async(password:string)=>{const user=requireAuth().currentUser;if(!user?.email||!user.emailVerified)throw Error('Verify your email before adding a password.');await linkWithCredential(user,EmailAuthProvider.credential(user.email,password));};
