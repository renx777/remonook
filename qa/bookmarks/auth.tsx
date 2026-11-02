const user={uid:'bookmark-fixture-account',email:'fixture@example.test',emailVerified:true,providerData:[],getIdToken:async()=> 'local-test-token'};
export const authenticatedUid=()=>user.uid;
export const AuthGate=({children}:any)=>children(user);
export const openAccountSignIn=async()=>{};export const googleSignOut=async()=>{};
export const setAccountTransitionHandler=()=>()=>{};export const AccountSecurity=()=>null;
