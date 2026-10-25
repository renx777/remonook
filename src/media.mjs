/** @typedef {{kind: string, title: string, href: string, embed: string|null}} MediaLink */
export const imageMimeTypes = {
  jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", png: "image/png", apng: "image/apng", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif", jxl: "image/jxl", psd: "image/vnd.adobe.photoshop", raw: "image/x-raw",
};
export function imageType(name, type = "") {
  return type.startsWith("image/") ? type : imageMimeTypes[name.split(".").pop()?.toLowerCase()] || "";
}
export function safeLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
/** @returns {MediaLink|null} */
export function mediaLink(value) {
  const href = safeLink(value);
  if (!href) return null;
  const url = new URL(href), host = url.hostname.toLowerCase().replace(/^www\./, ""),
    parts = url.pathname.split("/").filter(Boolean);
  if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
    const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v") : ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null;
    if(!id&&/^[a-zA-Z0-9_-]+$/.test(url.searchParams.get('list')||''))return {kind:'youtube',title:'YouTube playlist',href,embed:'https://www.youtube-nocookie.com/embed/videoseries?list='+url.searchParams.get('list')};
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
      const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`),
        time = url.searchParams.get("t") || url.searchParams.get("start") || "0",
        units = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/),
        seconds = /^\d+$/.test(time) ? Number(time) : units ? Number(units[1] || 0) * 3600 + Number(units[2] || 0) * 60 + Number(units[3] || 0) : 0;
      if (seconds > 0 && seconds < 86400) embed.searchParams.set("start", String(seconds));
      return { kind: "youtube", title: "YouTube video", href: `https://www.youtube.com/watch?v=${id}`, embed: embed.href };
    }
  }
  if (host==='open.spotify.com') {const at=parts.findIndex(p=>['track','album','playlist','episode','show'].includes(p));if(at>=0&&/^[a-zA-Z0-9]+$/.test(parts[at+1]||''))return {kind:'spotify',title:'Spotify '+parts[at],href,embed:`https://open.spotify.com/embed/${parts[at]}/${parts[at+1]}`};}
  if (/\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i.test(url.pathname))return {kind:'audio',title:'Linked audio',href,embed:null};
  if (["instagram.com", "m.instagram.com"].includes(host) && ["p", "reel", "tv"].includes(parts[0]) && /^[\w-]+$/.test(parts[1] || "")) {
    const href = `https://www.instagram.com/${parts[0]}/${parts[1]}/`;
    return { kind: "instagram", title: parts[0] === "reel" ? "Instagram reel" : "Instagram post", href, embed: href + "embed/" };
  }
  if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const id = parts.find(part => /^\d+$/.test(part));
    if (id) return { kind: "vimeo", title: "Vimeo video", href: `https://vimeo.com/${id}`, embed: `https://player.vimeo.com/video/${id}` };
  }
  if (/\.(?:mp4|webm|ogv)$/i.test(url.pathname)) return {kind:"video",title:"Linked video",href,embed:null};
  if (/\.(?:jpe?g|jfif|png|apng|gif|webp|avif|svg|bmp|ico|tiff?|heic|heif|jxl)$/i.test(url.pathname))
    return { kind: "image", title: "Linked image", href, embed: null };
  return { kind: "link", title: url.hostname, href, embed: null };
}
/** @returns {MediaLink[]} */
export function mediaLinks(text) {
  const explicit = [...text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s]+)\)/g)].map(m=>{const item=mediaLink(m[1]);return item?.kind==='link'?{...item,kind:'image',title:'Linked image'}:item;});
  const urls = text.replace(/!\[[^\]]*\]\((https?:\/\/[^\s]+)\)/g,'').match(/https?:\/\/[^\s<>"']+/g) || [], seen = new Set();
  return [...explicit,...urls.map(value => mediaLink(value.replace(/[),.;!?]+$/, "")))].filter(item => {
    if (!item || seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  }).slice(0, 12);
}
