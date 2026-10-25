import type { Workspace } from "./data";
export const coverPresets = [
  { id: "midnight", name: "Midnight", color: "#273653", accent: "#afc5e9" },
  { id: "sage", name: "Sage", color: "#536c59", accent: "#d0e3bd" },
  { id: "ocean", name: "Ocean", color: "#286b83", accent: "#b9e4ef" },
  { id: "lilac", name: "Lilac", color: "#766088", accent: "#e1d2f3" },
  { id: "terracotta", name: "Terracotta", color: "#a76249", accent: "#f4d6b8" },
  { id: "rose", name: "Rose", color: "#985d75", accent: "#f5d0df" },
  { id: "sand", name: "Sand", color: "#9a8059", accent: "#f6e8c8" },
  { id: "graphite", name: "Graphite", color: "#454b52", accent: "#d0d7dd" },
] as const;
export const coverIcons = ["✦", "◉", "⌘", "☘", "☀", "☾", "∞", "∑", "⚗", "✎", "♫", "⌁"];
export type DeckDesign = { preset: string; pattern: string; icon: string; image: string; position: number; backdrop: boolean };
export function deckDesign(doc: Workspace, id: string): DeckDesign {
  const raw = doc.web.deckDesigns?.[id] || {};
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return {
    preset: coverPresets.some(preset => preset.id === raw.preset) ? raw.preset : coverPresets[hash % coverPresets.length].id,
    pattern: ["plain", "ruled", "grid", "dots"].includes(raw.pattern) ? raw.pattern : "plain",
    icon: coverIcons.includes(raw.icon) ? raw.icon : "✦",
    image: typeof raw.image === "string" && /^media\/deck-cover-[a-zA-Z0-9._-]+$/.test(raw.image) ? raw.image : "",
    position: Number.isFinite(raw.position) ? Math.min(100, Math.max(0, raw.position)) : 50,
    backdrop: raw.backdrop === true,
  };
}

export async function prepareCoverImage(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw Error("Choose a JPG, PNG, WebP or AVIF image under 2 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 50_000_000) throw Error("Choose an image smaller than 50 megapixels.");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("This browser could not prepare your image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error("Could not prepare this image.")), "image/webp", .86));
  } finally { URL.revokeObjectURL(url); }
}
