import {resolveEnvironment} from './environment.mjs';
const config=resolveEnvironment(import.meta.env || {});
export const APP_ENV=config.name;
export const CLOUD_ENABLED=config.cloudEnabled;
export const CLOUD_API=config.cloudApi;
// Firebase web configuration is public client configuration, not an admin credential.
export const firebaseConfig=config.firebase;
