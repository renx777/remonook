# Social posts and Android capture

## Web staging scope

Paste a public X/Twitter status, Reddit post/comment permalink, or Instagram
post/reel URL into a bullet to show its live embed. Save the same link in
Bookmarks to open the embed beside personal notes. Captions pasted together with
one URL are kept as source-linked notes; the URL becomes the bookmark. Personal
notes use ordinary outline mutations, local persistence, Undo, sync and backups.
Unfinished personal-note drafts stay device-local and account/workspace scoped;
failed submissions retain their draft and stable insertion ID, and successful
submission clears it only after canonical local persistence completes.
X/Twitter aliases and tracking parameters on recognised post URLs share a
canonical identity, preventing new duplicate bookmarks for the same post.
Existing bookmark records and source citations are not rewritten or deleted.
Previously captured article snapshots remain accessible through **Saved article**.

This is a live preview, not an archival import or automatic transcription.
RemoNook does not download or store post bodies, photos or videos. Private,
deleted, login-gated, disabled embeds and browser restrictions may prevent a
preview. The original link remains available. Shortened `t.co`, `redd.it`, Reddit
`/s/` shares and Instagram share redirects do not expose a reliable public post
identity locally; they remain ordinary links. Profiles and stories are not posts.

The preview uses provider-hosted frames, without API keys or paid API calls.
Only recognised URL paths generate an embed address. No provider HTML/scripts
run in the note DOM, no note text/account identifier is sent to the provider,
and no remote message can write notes. A visible embed still contacts its
provider and follows that provider's availability/cookie rules. Hide unloads the
frame. Offline mode retains the link and personal notes and explains that the
live preview needs a connection. Frames mount near the viewport, use native lazy
loading and are memoized. X and Reddit resize messages must come from the actual
frame window and exact provider origin, follow the expected protocol, and are
bounded to 180–1000 px. Other messages are ignored.

No shared schema, sync protocol, outbox or backend changes are required.
No third-party embed dependency is necessary: a small reusable frame component
also serves existing Instagram note embeds. Public embed URLs are frontend
integrations that providers can change independently of RemoNook.

## Android improvements included in the shared frontend

Incoming caption-plus-link shares now default to Bookmark when there is one
unambiguous HTTP(S) URL, while keeping all shared text as a note. Trailing prose
punctuation is excluded from the extracted address. Ambiguous multiple links
remain notes. The capture preview identifies supported social posts and explains
where their preview will appear. There is no automatic clipboard access, URL
fetch during capture, or change to native durable queue/ownership/acknowledgement.
These shared frontend improvements can ship in the next native update after web
acceptance. This feature is released to web staging first; it does not publish
Android or desktop binaries.

## Further Android integration research

| Improvement | Value and implementation consideration | Recommendation |
| --- | --- | --- |
| PDF/EPUB incoming shares | Send a download directly to Bookshelf. Copy the granted content URI into app-private durable staging before the originating app revokes access; validate type/size, scope destination, and acknowledge only after canonical file+metadata persistence. | Next native milestone. |
| Image/screenshot shares | Save an image with a note, retaining original file/credit and supporting existing local media/OCR. Bound decoding and use content URI permissions, rather than accepting paths from other apps. | After file capture. |
| Capture destination picker | Save into a chosen existing page/folder without leaving the share preview. Pin account/workspace and retain failed drafts; do not silently reroute on account changes. | Small follow-up after capture feedback. |
| Launcher shortcuts | Long-press app actions for New note, Scan/capture and Study due cards. Reuse canonical navigation and durable capture instead of a second writer. | High value, no API cost. |
| Installed web-app share target | Let Android Chrome's installed RemoNook receive shares too. Requires a POST share target/service-worker intake with durable payload storage and explicit destination confirmation. Never place selected private text in GET query strings/browser history. | Separate PWA milestone, test offline/reload/account isolation. |
| Direct Share person targets | Android conversation shortcuts are intended for people/conversations; RemoNook pages are destinations rather than recipients. | Prefer a workspace/page picker over invented contacts. |
| Resolve social short links | Resolve only bounded redirects through existing SSRF-protected backend infrastructure, respecting authentication/rate limits; retain original URL on failure. | Follow-up if shared short URLs are common; no headless scraping. |

## Research references

Reviewed 16 November 2026:

- [X embedded posts](https://developer.x.com/en/docs/x-for-websites/embedded-tweets/overview): public oEmbed output was checked for a known public post. The provider's embedded-post frame is used with `dnt=true`, without adding the widgets script to the app DOM.
- [Reddit embed guidance](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication) and [Reddit publisher](https://publish.reddit.com/): checked its public widgets script's generated `embed.reddit.com` frame format and `resize.embed` messages. The oEmbed endpoint can reject automated requests, so app saving does not depend on it.
- [Instagram embedding help](https://help.instagram.com/620154495870484): only public, embeddable content. Reuse the existing public-post frame path; no Meta app token or server-side oEmbed integration.

## Acceptance

Model and component tests cover supported/spoofed URLs, canonical duplicates,
caption retention, unsafe and ambiguous links, provider message validation,
foreign-frame rejection, hide/reload, theme changes, offline fallback and
source-linked note mutations. Browser acceptance covers real app insertion,
canonical saves/Undo, desktop/mobile layout, all three provider paths and captions.
Deterministic browser tests mock provider content; live-provider checks are
reported separately, because successful local rendering cannot guarantee that
an external post will remain embeddable.

Local validation: TypeScript, staging build, full regression suite and
`scripts/e2e-social-posts.mjs` desktop/mobile acceptance. Run the browser script
against an isolated guest context using `SOCIAL_URL` (default local port 5210),
optionally `CHROMIUM_PATH`. Provider responses are fixtures in that script. A
separate live-provider check rendered X post 20 and observed a provider resize
to 225 px. Reddit returned a network-security block in this test environment;
the Instagram sample reported unavailable. Those are external availability
limits, not passed content-rendering checks for those providers.
