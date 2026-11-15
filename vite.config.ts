import { defineConfig, loadEnv } from "vite";
import {resolveEnvironment} from "./src/environment.mjs";
import {publicPages} from './scripts/public-pages.mjs';
import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Shown in Settings → About: the web release and the commit this bundle was built from.
const buildCommit=(()=>{if(process.env.GITHUB_SHA)return process.env.GITHUB_SHA.slice(0,7);try{return execSync('git rev-parse --short HEAD',{stdio:['ignore','pipe','ignore']}).toString().trim();}catch{return '';}})();
const webRelease=(()=>{try{return JSON.parse(readFileSync('public/release.json','utf8')).release||'';}catch{return '';}})();
export default defineConfig(({mode})=>{
 resolveEnvironment({...loadEnv(mode,process.cwd(),"VITE_"),...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith("VITE_")))});
 return {
  plugins: [publicPages()],
  define: { __BUILD_COMMIT__: JSON.stringify(buildCommit), __WEB_RELEASE__: JSON.stringify(webRelease), __BUILT_AT__: JSON.stringify(new Date().toISOString().slice(0,10)) },
  server: { allowedHosts: ["terminal.local", "192.168.68.104"] },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: chunk => chunk.moduleIds.some(id=>id.includes('/node_modules/@excalidraw/')||id.endsWith('/src/DrawingEditor.tsx'))?'assets/drawing-[name]-[hash].js':chunk.moduleIds.some(id=>id.includes('/node_modules/driver.js/'))?'assets/guide-[name]-[hash].js':'assets/[name]-[hash].js',
        assetFileNames: asset => asset.names?.includes('driver.css')?'assets/guide-[name]-[hash][extname]':'assets/[name]-[hash][extname]',
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
