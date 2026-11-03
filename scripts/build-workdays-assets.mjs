import { cp, mkdir, readdir } from "node:fs/promises";
const root = "public/ocr/workdays-v1";
await mkdir(root + "/lang", { recursive: true });
await cp(
  "node_modules/tesseract.js/dist/worker.min.js",
  root + "/worker.min.js",
);
for (const file of await readdir("node_modules/tesseract.js-core"))
  if (/\.wasm(?:\.js)?$/.test(file))
    await cp("node_modules/tesseract.js-core/" + file, root + "/" + file);
await cp(
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  root + "/lang/eng.traineddata.gz",
);
await cp("node_modules/tesseract.js/LICENSE.md", root + "/tesseract-LICENSE");
await cp("node_modules/tesseract.js-core/LICENSE", root + "/core-LICENSE");
