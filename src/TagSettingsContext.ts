import {createContext} from 'react';
/** The workspace's sanitized tag settings (web.tags). */
export const TagSettingsContext=createContext<Record<string,any>>({});
