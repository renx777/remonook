export function previewUrl(value){
 if(typeof value!=='string'||value.length>4096)throw Error('Invalid website address.');
 const u=new URL(value),host=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)||['metadata.google.internal','metadata.goog'].includes(host))throw Error('Only public website addresses are supported.');
 for(const key of u.searchParams.keys())if(/^(?:access_token|auth|authorization|token|password|session|sessionid|signature|x-amz-.+|x-goog-.+)$/i.test(key))throw Error('Private or signed links cannot be previewed.');
 u.hash='';return u;
}
export function publicAddress(ip){
 if(typeof ip!=='string')return false;
 if(ip.includes(':'))return /^[23][0-9a-f]{0,3}:/i.test(ip)&&!/^2001:(?:0{0,3}[0-9a-f]{1,2}|0?1[0-9a-f]{2}|db8):/i.test(ip)&&!/^2002:/i.test(ip);
 const n=ip.split('.').map(Number);if(n.length!==4||n.some(x=>!Number.isInteger(x)||x<0||x>255))return false;
 const [a,b]=n;return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===0||b===168||b===88&&n[2]===99))&&!(a===198&&(b===18||b===19))&&!(a===198&&b===51&&n[2]===100)&&!(a===203&&b===0&&n[2]===113);
}

/** Public share routes only; original user URLs are never rewritten in notes. */
export function previewFetchUrl(value){const url=previewUrl(value);if(url.hostname.toLowerCase()==='www.myntra.com'&&url.pathname.startsWith('/mailers/'))url.pathname=url.pathname.slice('/mailers'.length);return url;}
export function previewRedirect(location,base){
 // Some retailers emit two Location values: a bare scheme followed by the URL.
 const match=/^https?,\s*(https?:\/\/[^\s]+)$/i.exec(location);return previewFetchUrl(new URL(match?match[1]:location,base).href);
}
