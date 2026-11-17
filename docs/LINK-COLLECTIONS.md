# Link previews and child-note views

## Using a collection

Open a bullet's page and choose **Outline**, **Grid**, **Compact list** or **Table**
above its children. The bullet menu's Organize branch section also offers **View child
notes**. Choosing a view there opens that bullet's page. A small view shortcut
appears beside the parent in the ordinary outline.

Grid is useful for shopping shortlists, reading lists and visual references.
Compact list suits scanning on a phone. Table compares the item, website, supplied
price and availability; it scrolls horizontally on narrow screens. Ordinary text
notes also work in each view. Open a card/row to edit its original note and nested
content. **Add note or link** temporarily opens the regular editor; finish editing
to return to the collection. Outline is always available.

Views show immediate child bullets, in their saved order. A child containing more
than one link uses its first link in the collection; opening the note retains
access to every link and its individual previews. No content is duplicated,
reparented or converted to a different study type. Existing music/media galleries
and editable note tables remain separate features. Search uses the source notes,
not an index of remote page metadata.

## Preview coverage

Generic previews use public Open Graph/Twitter metadata and Schema.org
Product/ProductGroup JSON-LD. This is standards support across public domains,
not a retailer allowlist or a claim that every shop permits automated previews.
The fetcher follows bounded public redirects, including shortened links, and
normalizes Myntra's `/mailers/` sharing route. It retains the original URL in the
note, does not add affiliate tags, and does not execute page scripts, sign in,
bypass retailer challenges, use headless browsers or call paid APIs.

Only supplied facts appear. Currency codes are retained without conversion.
Aggregate low prices are labelled “From”; ambiguous localized price strings,
missing ratings and missing stock are left blank. Catalogue ItemLists are not
mined for an unrelated first product. Bot-check and country-selector pages are
unavailable previews. Prices are page snapshots and may differ by country,
variant, session or time; they are not live price tracking.

Before staging, live Node checks returned product details for Allbirds and the
owner's Myntra shoes, and generic metadata for Apple/Flipkart. IKEA redirected to
a category, so a product-price claim is not made. Best Buy returned a country
selector. Both owner-supplied Amazon short links resolved to ASIN `B0CYZHC69C`,
but Amazon returned HTTP 503 to the anonymous product request. This is reported
as unavailable, with the original link kept. These are local network observations;
Worker-IP acceptance must be recorded separately after staging.

## Editable fallback

The pencil button opens **Edit preview details** for a link: optional title,
description, public image URL, price and three-letter currency code. Entered
fields override website metadata, with **Your details** / **Your price** labels.
They do not alter the note text or link. Empty fields use the website's details;
**Use website details** clears the overrides through the normal save/Undo path.
A failed save keeps the form open. The dialog pins its source bullet, URL and
workspace, blocks repeated submits and refuses a changed or deleted link. Only
edited fields are submitted, preserving newer untouched fields from another
device. Price and currency are submitted together.

`web.bulletViews[sourceId]` stores the view; `web.linkPreviewDetails[sourceId]`
stores edited fields per URL fingerprint. Mirrors use existing source identities.
Both are ordinary keyed shared metadata, using the existing durable save, Undo,
backup and sync paths. No sync routing/schema/outbox changes or snapshot
replacement are introduced. Switching views preserves original children and
study configuration. Automatic website previews are not synchronized archives.

## Performance and fetching

Cards mount at most 24 children initially, with **Show more** for large branches.
Metadata loads near the viewport after a short typing debounce, shares in-flight
requests/cache entries by URL, and allows at most three active browser requests.
Cached previews are reused immediately on view switches. Stale requests cannot
replace a newer URL's preview. Offline/network failures keep links readable and
retry when connectivity returns. Images load lazily with no referrer; absent or
failed card images do not leave a large empty cover.

Web staging adds `/api/link-preview` to the existing frontend Worker, separately
from the sync backend. Outbound requests include only fixed public preview
headers, not user cookies or authorization. URLs and every redirect are checked;
DoH checks reject private/reserved addresses, including public hostnames resolving
to them. Explicit credentials and known signed/private query parameters are
rejected. DNS and HTML responses are bounded; one overall deadline and a maximum
of five page requests apply. HTMLRewriter extracts metadata without executing
scripts. Vite uses the existing DOM parser as a bounded Node fallback.

Worker logs and traces redact request query strings.
The edge cache uses a URL digest, retains public results for one hour and failures
for 30 seconds. The frontend Worker uses `LINK_PREVIEW_LIMITER`, a Workers Rate
Limiting binding in namespace `32701`, at 60 requests/minute per client IP per
Cloudflare location. No R2, D1, AI, browser-rendering service or paid preview
subscription is added. Normal Workers request quotas still apply. The sync
Worker, live secrets and production infrastructure are not changed.

Tests cover structured data, Unicode/currencies, irrelevant catalogue entries,
missing/unsafe fields, redirects, private DNS, bounded reads, caching, concurrency,
stale dialogs, failed saves, double submits, mirrored sources, concurrent metadata
edits, view changes, nested content, Undo and persistence. Browser acceptance
checks desktop/mobile, light/dark, overflow, title/row overlap, detail editing,
image failures and reload. Final deployed source/checks belong in ENVIRONMENTS.md.
