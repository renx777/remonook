/** Recognise public post permalinks only. Never send arbitrary URLs to an embed host. */
export function socialPost(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || value.length > 4096) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, ''), path = url.pathname;
  let match;
  if (['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(host)
      && (match = path.match(/^\/(?:[\w]{1,30}\/status|i\/web\/status)\/(\d{1,25})(?:\/(?:photo|video)\/\d+)?\/?$/))) {
    const id = match[1];
    return {kind:'twitter', provider:'X', title:'Post on X', id, href:`https://x.com/i/web/status/${id}`,
      embed:`https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true&conversation=none`};
  }
  if (['reddit.com', 'old.reddit.com', 'new.reddit.com', 'm.reddit.com'].includes(host)
      && (match = path.match(/^\/(r|user)\/([\w-]{1,100})\/comments\/([a-z0-9]{1,20})(?:\/([\w%-]{0,200})(?:\/comment\/([a-z0-9]{1,20})|\/([a-z0-9]{1,20}))?)?\/?$/i))) {
    const slug = match[4] || '_', comment = match[5] || match[6], clean = `/${match[1]}/${match[2]}/comments/${match[3]}/${slug}/${comment ? comment+'/' : ''}`;
    return {kind:'reddit', provider:'Reddit', title:comment?'Reddit comment':'Reddit post', id:comment||match[3],
      href:`https://www.reddit.com${clean}`, embed:`https://embed.reddit.com${clean}?ref_source=embed&ref=share&embed=true`};
  }
  if (['instagram.com', 'm.instagram.com'].includes(host)
      && (match = path.match(/^\/(p|reel|tv)\/([\w-]{1,100})\/?$/))) {
    const href = `https://www.instagram.com/${match[1]}/${match[2]}/`;
    return {kind:'instagram', provider:'Instagram', title:match[1]==='reel'?'Instagram reel':'Instagram post', id:match[2], href, embed:href+'embed/'};
  }
  return null;
}

/** Shared text often contains a caption and a single URL. Retain all text separately. */
export function sharedWebLink(text) {
  if (typeof text !== 'string') return null;
  const matches = [...new Set((text.match(/https?:\/\/[^\s<>"']+/gi) || []).map(value => value.replace(/[),.;!?]+$/, '')))];
  if (matches.length !== 1) return null;
  try { const url = new URL(matches[0]); return !url.username && !url.password && url.href.length<=4096 ? url.href : null; } catch { return null; }
}

/** Embedded pages cannot mutate notes. Only bounded presentation sizes are accepted. */
export function socialPostHeight(data, kind) {
  try { if (typeof data === 'string') { if(data.length>8192)return null; data=JSON.parse(data); } } catch { return null; }
  const height = kind==='reddit' && data?.type==='resize.embed' ? data.data
    : kind==='twitter' && data?.['twttr.embed']?.method==='twttr.private.resize' ? data['twttr.embed'].params?.[0]?.height : null;
  return typeof height==='number' && Number.isFinite(height) && height>0 ? Math.max(180,Math.min(1000,Math.ceil(height))) : null;
}
