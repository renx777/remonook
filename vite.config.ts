import { defineConfig, loadEnv } from "vite";
import {resolveEnvironment} from "./src/environment.mjs";
export default defineConfig(({mode})=>{
 resolveEnvironment({...loadEnv(mode,process.cwd(),"VITE_"),...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith("VITE_")))});
 return {
  server: { allowedHosts: ["terminal.local"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ["@tiptap/core", "@tiptap/starter-kit", "@tiptap/pm/model"],
          react: ["react", "react-dom"],
          backup: ["jszip"],
        },
      },
    },
  },
};});
