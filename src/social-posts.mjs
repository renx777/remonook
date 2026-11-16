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
  if (host==='redd.it'&&(match=path.match(/^\/([a-z0-9]{1,20})\/?$/i)))return {kind:'reddit',provider:'Reddit',title:'Reddit post',id:match[1],postId:match[1],href:`https://www.reddit.com/comments/${match[1]}/`,embed:`https://embed.reddit.com/comments/${match[1]}/?embed=true`};
  if (['reddit.com','old.reddit.com','new.reddit.com','m.reddit.com'].includes(host)&&(match=path.match(/^\/comments\/([a-z0-9]{1,20})\/?$/i)))return socialPost('https://redd.it/'+match[1]);
  if (['reddit.com','m.reddit.com'].includes(host)&&(match=path.match(/^\/r\/([\w-]{1,100})\/s\/([a-zA-Z0-9]{1,100})\/?$/)))return {kind:'reddit',provider:'Reddit',title:'Reddit post',id:match[2],short:true,href:`https://www.reddit.com/r/${match[1]}/s/${match[2]}/`,embed:`https://embed.reddit.com/r/${match[1]}/s/${match[2]}/?embed=true`};
  if (host==='bsky.app'&&(match=path.match(/^\/profile\/([a-zA-Z0-9.:%-]{1,253})\/post\/([a-zA-Z0-9]{1,128})\/?$/))){let actor;try{actor=decodeURIComponent(match[1]);}catch{return null;}if(!/^(?:did:plc:[a-z2-7]{24}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.test(actor))return null;return {kind:'bluesky',provider:'Bluesky',title:'Bluesky post',id:match[2],actor,href:`https://bsky.app/profile/${actor}/post/${match[2]}`,embed:actor.startsWith('did:')?`https://embed.bsky.app/embed/${actor}/app.bsky.feed.post/${match[2]}`:null};}
  if (['tiktok.com','m.tiktok.com'].includes(host)&&(match=path.match(/^\/@([\w.]{1,100})\/(?:video|photo)\/(\d{10,25})\/?$/)))return {kind:'tiktok',provider:'TikTok',title:'TikTok post',id:match[2],href:`https://www.tiktok.com/@${match[1]}/${path.includes('/photo/')?'photo':'video'}/${match[2]}`,embed:`https://www.tiktok.com/player/v1/${match[2]}?autoplay=0&description=1`};
  if (['reddit.com', 'old.reddit.com', 'new.reddit.com', 'm.reddit.com'].includes(host)
      && (match = path.match(/^\/(r|user)\/([\w-]{1,100})\/comments\/([a-z0-9]{1,20})(?:\/([\w%-]{0,200})(?:\/comment\/([a-z0-9]{1,20})|\/([a-z0-9]{1,20}))?)?\/?$/i))) {
    const slug = match[4] || '_', comment = match[5] || match[6], clean = `/${match[1]}/${match[2]}/comments/${match[3]}/${slug}/${comment ? comment+'/' : ''}`;
    return {kind:'reddit', provider:'Reddit', title:comment?'Reddit comment':'Reddit post', id:comment||match[3],postId:match[3],commentId:comment||null,
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
    : kind==='twitter' && data?.['twttr.embed']?.method==='twttr.private.resize' ? data['twttr.embed'].params?.[0]?.height : kind==='bluesky' ? data?.height : null;
  return typeof height==='number' && Number.isFinite(height) && height>0 ? Math.max(180,Math.min(1000,Math.ceil(height))) : null;
}

/** @param {{fetcher?:typeof fetch,signal?:AbortSignal}} options */
export async function resolveSocialEmbed(post, options={}) {
 const {fetcher=fetch,signal}=options;
 if(post.kind!=='bluesky'||post.embed)return post.embed;
 const response=await fetcher('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle='+encodeURIComponent(post.actor),{signal,credentials:'omit'});
 if(!response.ok)throw Error('Bluesky preview unavailable.');
 const {did}=await response.json();if(typeof did!=='string'||!/^did:plc:[a-z2-7]{24}$/.test(did))throw Error('Bluesky preview unavailable.');
 return `https://embed.bsky.app/embed/${did}/app.bsky.feed.post/${post.id}`;
}

export function redditImage(value) {
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.href.length<4096&&['i.redd.it','preview.redd.it','external-preview.redd.it','a.thumbs.redditmedia.com','b.thumbs.redditmedia.com'].includes(url.hostname)?url.href:null;}catch{return null;}
}
