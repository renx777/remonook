import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("tests/.build", { recursive: true });
await build({
  entryPoints: ["src/ActionMenu.tsx", "src/BulletMenuBody.tsx", "src/QuotesWidget.tsx", "src/ResearchResults.tsx", "src/MobileEditToolbar.tsx", "src/StudyCardEditor.tsx", "src/clipboard.ts", "src/data.ts", "src/editor.tsx", "src/RecoveryBoundary.tsx", "src/SelectionFormatting.tsx", "src/deck-designs.ts", "src/OutlineChrome.tsx", "src/AnimatedEmoji.tsx", "src/OutlineView.tsx", "src/outline-selection.ts"],
  bundle: true,
  packages: "external",
  outdir: "tests/.build",
  format: "esm",
  platform: "node",
  outExtension: { ".js": ".mjs" },
  jsx: "automatic",
  loader: { ".css": "empty" },
});

await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  packages: "external",
  outfile: "tests/.build/app.mjs",
  format: "esm",
  platform: "node",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "import.meta.env.PROD": "false" },
});
