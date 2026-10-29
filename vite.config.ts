import { defineConfig, loadEnv } from "vite";
import {resolveEnvironment} from "./src/environment.mjs";
import {researchApi} from './scripts/research-api.mjs';
import {publicPages} from './scripts/public-pages.mjs';
export default defineConfig(({mode})=>{
 resolveEnvironment({...loadEnv(mode,process.cwd(),"VITE_"),...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith("VITE_")))});
 return {
  plugins: [researchApi(),publicPages()],
  server: { allowedHosts: ["terminal.local"] },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ["@tiptap/core", "@tiptap/starter-kit", "@tiptap/pm/model"],
          react: ["react", "react-dom"],
          backup: ["jszip"],
          pdf: ["pdfjs-dist"],
        },
      },
    },
  },
};});
