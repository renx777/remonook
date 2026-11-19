//! Explicit local bookmark capture. No account, cookies or RemoNook server is involved.
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::time::Duration;
fn public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {let [a,b,_,_]=v.octets(); !(v.is_private() || v.is_loopback() || v.is_link_local() || v.is_unspecified() || a==0 || a>=224 || a==100 && (64..=127).contains(&b) || a==192 && b==0 || a==198 && (b==18 || b==19))},
        // Use a public IPv4 route; never dial local or mapped IPv6 addresses.
        IpAddr::V6(_) => false,
    }
}
fn address(value: &str) -> Result<url::Url,String> {
    let u=url::Url::parse(value).map_err(|_| "Enter a public website address.")?;
    let host=u.host_str().unwrap_or("");
    if !matches!(u.scheme(),"http"|"https") || !u.username().is_empty() || u.password().is_some() || !host.contains('.') || host.ends_with(".local") || host.ends_with(".internal") || host.ends_with(".localhost") || u.port().is_some_and(|p|p!=80 && p!=443) {return Err("Only public website addresses are supported.".into());}
    Ok(u)
}
#[derive(serde::Serialize)]
pub struct Page {url:String,html:String}
#[tauri::command]
pub async fn local_article_fetch(url: String) -> Result<Page,String> {
    let mut target=address(&url)?;
    for _ in 0..5 {
        let host=target.host_str().ok_or("Invalid website address.")?.to_string();
        let port=target.port_or_known_default().ok_or("Invalid website port.")?;
        let lookup=host.clone();
        let addresses=tauri::async_runtime::spawn_blocking(move || (lookup.as_str(),port).to_socket_addrs().map(|a|a.collect::<Vec<SocketAddr>>())).await.map_err(|_|"Website lookup failed.")?.map_err(|_|"Website lookup failed.")?;
        let public_addresses:Vec<_>=addresses.into_iter().filter(|a|public(a.ip())).collect();
        if public_addresses.is_empty(){return Err("Only public websites can be saved.".into());}
        // Pin validated addresses, including on redirects, to avoid DNS rebinding.
        let client=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(25)).redirect(reqwest::redirect::Policy::none()).resolve_to_addrs(&host,&public_addresses).build().map_err(|_|"Reader could not start.")?;
        let mut response=client.get(target.as_str()).header("Accept","text/html").send().await.map_err(|_|"This website could not be reached. Your link is saved.")?;
        if response.status().is_redirection(){let next=response.headers().get("location").and_then(|h|h.to_str().ok()).ok_or("Invalid website redirect.")?;target=address(target.join(next).map_err(|_|"Invalid redirect.")?.as_str())?;continue;}
        if !response.status().is_success() || !response.headers().get("content-type").and_then(|h|h.to_str().ok()).unwrap_or("").contains("text/html"){return Err("Reader unavailable for this page. Your link is saved.".into());}
        let mut bytes=Vec::new();
        while let Some(chunk)=response.chunk().await.map_err(|_|"The page download failed.")? {if bytes.len()+chunk.len()>5*1024*1024{return Err("This page is too large for reader mode.".into());}bytes.extend_from_slice(&chunk);}
        return Ok(Page{url:target.to_string(),html:String::from_utf8_lossy(&bytes).into_owned()});
    }
    Err("This page redirected too many times.".into())
}
/// Link previews in the apps. The website asks its own Worker (same-origin only); the
/// apps have no such origin, so they read the public page here with the same public-address
/// checks, then extract title, image and price in the page without running its scripts.
/// Shops such as Amazon refuse anonymous clients, so this presents as a normal browser.
/// No cookies or account details are sent. Reads stop at 1 MiB, enough for product markup.
#[tauri::command]
pub async fn link_preview_fetch(url: String) -> Result<Page,String> {
    const LIMIT:usize=1024*1024;
    let mut target=address(&url)?;
    for _ in 0..5 {
        let host=target.host_str().ok_or("Invalid website address.")?.to_string();
        let port=target.port_or_known_default().ok_or("Invalid website port.")?;
        let lookup=host.clone();
        let addresses=tauri::async_runtime::spawn_blocking(move || (lookup.as_str(),port).to_socket_addrs().map(|a|a.collect::<Vec<SocketAddr>>())).await.map_err(|_|"Website lookup failed.")?.map_err(|_|"Website lookup failed.")?;
        let public_addresses:Vec<_>=addresses.into_iter().filter(|a|public(a.ip())).collect();
        if public_addresses.is_empty(){return Err("Only public websites can be previewed.".into());}
        let client=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(12)).redirect(reqwest::redirect::Policy::none()).resolve_to_addrs(&host,&public_addresses).build().map_err(|_|"Preview could not start.")?;
        let mut response=client.get(target.as_str())
            .header("User-Agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")
            .header("Accept","text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language","en-IN,en;q=0.9")
            .send().await.map_err(|_|"This website could not be reached.")?;
        if response.status().is_redirection(){let next=response.headers().get("location").and_then(|h|h.to_str().ok()).ok_or("Invalid website redirect.")?;target=address(target.join(next).map_err(|_|"Invalid redirect.")?.as_str())?;continue;}
        let html_type=response.headers().get("content-type").and_then(|h|h.to_str().ok()).map(|t|t.contains("text/html")||t.contains("application/xhtml+xml")).unwrap_or(false);
        if !response.status().is_success() || !html_type {return Err("This website has not made a public preview available.".into());}
        let mut bytes=Vec::new();
        while let Some(chunk)=response.chunk().await.map_err(|_|"The preview download failed.")? {let room=LIMIT-bytes.len();bytes.extend_from_slice(&chunk[..chunk.len().min(room)]);if bytes.len()>=LIMIT{break;}}
        return Ok(Page{url:target.to_string(),html:String::from_utf8_lossy(&bytes).into_owned()});
    }
    Err("This page redirected too many times.".into())
}
#[cfg(test)]mod tests{use super::*;#[test]fn private_addresses_are_rejected(){for ip in ["127.0.0.1","10.0.0.1","192.168.1.1","169.254.169.254","100.64.0.1","::1","::ffff:127.0.0.1"]{assert!(!public(ip.parse().unwrap()));}assert!(public("8.8.8.8".parse().unwrap()));assert!(address("file:///etc/passwd").is_err());assert!(address("https://user:secret@example.com").is_err());}}
