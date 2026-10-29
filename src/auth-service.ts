import {initializeApp} from 'firebase/app';
import {getAuth,initializeAuth,browserLocalPersistence,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signOut} from 'firebase/auth';
import {CLOUD_ENABLED,firebaseConfig} from './cloud-config';
const firebaseApp=CLOUD_ENABLED?initializeApp(firebaseConfig):null;
export const auth=firebaseApp ? (typeof browserPopupRedirectResolver==='function' ? initializeAuth(firebaseApp,{persistence:browserLocalPersistence,popupRedirectResolver:browserPopupRedirectResolver}) : getAuth(firebaseApp)) : null;
export const authenticatedUid=()=>auth?.currentUser?.uid;
export async function googleSignIn(){if(!auth)throw Error('Cloud sign-in is disabled in local development. Configure staging to test sync.');const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}
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
