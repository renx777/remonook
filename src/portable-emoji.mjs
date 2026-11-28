import { validateAnimation } from "./emoji.mjs";
import { catalogAssetPaths } from "./emoji-asset-paths.mjs";
export const emojiFiles = (items) =>
  items.flatMap((e) =>
    typeof e.fileName === "string" && e.fileName ? catalogAssetPaths(e) : [],
  );
export const noteEmojis = (doc, node) =>
  (doc?.tables.emojis || []).filter(
    (e) => node && typeof e.token === "string" && node.text.includes(e.token),
  );
export function mergePortableEmojis(existing, incoming) {
  const by = new Map(existing.map((e) => [e.token, e]));
  for (const e of incoming) {
    if (
      !e ||
      typeof e.token !== "string" ||
      !/^:[a-zA-Z0-9_+-]+:$/.test(e.token) ||
      (e.fileName !== undefined &&
        e.fileName !== "" &&
        !/^[A-Za-z0-9._-]+$/.test(e.fileName))
    )
      throw Error("Invalid emoji metadata.");
    if (e.label !== undefined && typeof e.label !== "string")
      throw Error("Invalid emoji label.");
    if (e.data) validateAnimation(e.data);
    const prior = by.get(e.token);
    if (prior && JSON.stringify(prior) !== JSON.stringify(e))
      throw Error(
        "An emoji token already has different artwork or metadata. Import into a separate workspace to preserve both libraries.",
      );
    by.set(e.token, prior || e);
  }
  return [...by.values()];
}
export const portableMime = (path) =>
  ({
    svg: "image/svg+xml",
    png: "image/png",
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    json: "application/json",
    txt: "text/plain",
    tgs: "application/gzip",
  })[path.split(".").pop()?.toLowerCase()] || "application/octet-stream";
