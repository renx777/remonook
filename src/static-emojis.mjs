import catalogs from "./static-emoji-catalog.json" with { type: "json" };
import { resource, validateNotoPoster } from "./noto-emojis.mjs";

export const staticPacks = ["twemoji", "openmoji"];
export const staticEmojis = staticPacks.flatMap((pack) =>
  catalogs[pack].items.map((item) => ({
    ...item,
    pack,
    token: ":" + pack + "_" + item.codepoint + ":",
    fileName: pack + "_" + item.codepoint + ".svg",
    fallback: String.fromCodePoint(
      ...item.codepoint.split("_").map((x) => parseInt(x, 16)),
    ),
  })),
);
const byToken = new Map(staticEmojis.map((item) => [item.token, item]));
export const getStaticEmoji = (token) => byToken.get(token);
export const isStaticEmoji = (item) =>
  typeof item?.token === "string" &&
  /^:(?:twemoji|openmoji)_[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*:$/.test(
    item.token,
  ) &&
  item.fileName === item.token.slice(1, -1) + ".svg";
export function staticAssetUrl(item) {
  const known = getStaticEmoji(item.token);
  if (!known) throw Error("Unknown emoji artwork.");
  const source = catalogs[known.pack];
  return (
    "https://raw.githubusercontent.com/" +
    source.repo +
    "/" +
    source.commit +
    "/" +
    known.path
  );
}
export function staticCredit(item) {
  const known = getStaticEmoji(item.token);
  if (!known) throw Error("Unknown emoji artwork.");
  const source = catalogs[known.pack],
    open = known.pack === "openmoji",
    license =
      "https://creativecommons.org/licenses/" +
      (open ? "by-sa" : "by") +
      "/4.0/";
  return (
    (open
      ? "OpenMoji artwork by " + known.author + " and the OpenMoji project."
      : "Twemoji graphics by Twitter, Inc. and other contributors; maintained by the Twemoji community.") +
    "\nSource: https://github.com/" +
    source.repo +
    "/tree/" +
    source.commit +
    "\nLicense: " +
    source.license +
    " — " +
    license +
    "\nArtwork unchanged. RemoNook adds this attribution metadata to the SVG; the file remains under the artwork license.\n"
  );
}
const xml = (s) =>
  s.replace(
    /[<>&"']/g,
    (x) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[x],
  );
export function validateStaticSVG(bytes) {
  validateNotoPoster(bytes);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (
    /<(?:image|iframe|object|embed|audio|video)\b|@import|@font-face|url\s*\(\s*['"]?(?!#)/i.test(
      text,
    )
  )
    throw Error("Unsupported emoji SVG resources.");
  return text;
}
export async function downloadStaticEmoji(item, signal) {
  const known = getStaticEmoji(item.token);
  if (!known) throw Error("Unknown emoji artwork.");
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
    : AbortSignal.timeout(30000);
  const bytes = await resource(staticAssetUrl(known), combined, 1024 * 1024);
  if (bytes.length !== known.bytes)
    throw Error("Incomplete emoji artwork. Try again.");
  // Verify the pinned Git blob before adding attribution; never trust caller URLs or file names.
  const header = new TextEncoder().encode("blob " + bytes.length + "\0"),
    blob = new Uint8Array(header.length + bytes.length);
  blob.set(header);
  blob.set(bytes, header.length);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-1", blob))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== known.gitBlob)
    throw Error("Emoji artwork integrity check failed.");
  const text = validateStaticSVG(bytes),
    credited = text.replace(
      /<svg\b[^>]*>/i,
      (opening) =>
        opening + "<metadata>" + xml(staticCredit(known)) + "</metadata>",
    );
  // Credit travels in the primary asset, so old sync servers also preserve it.
  return new Map([
    [
      "emoji/" + known.fileName,
      new Blob([credited], { type: "image/svg+xml" }),
    ],
  ]);
}
