# Search discovery and SEO — RemoNook

## Public site and release safety

- The only indexable public URL in this first sitemap is `https://remonook.com/`. Do **not** publish account-scoped workspace, private notes, login parameters or staging URLs in a sitemap.
- `index.html` contains the production canonical, descriptive title/description, Open Graph and Twitter metadata, and JSON-LD for the public website and web app.
- `public/robots.txt` advertises `public/sitemap.xml` for production. This file **does not itself submit** the sitemap to Google.
- The staging build replaces robots.txt with a disallow rule, removes the production sitemap and adds `noindex, nofollow` to built HTML, in addition to the existing `X-Robots-Tag` staging headers.
- Local development is not a public crawler target. Keep staging and production Firebase / D1 / R2 isolated as before.

## Publish and verify

1. Merge after tests and verify the staging deployment remains unindexable. Production is **not** automatically deployed by this pull request; release the same reviewed commit through the documented Sites workflow.
2. After production release, verify in an ordinary browser and HTTP client:
   - `https://remonook.com/` responds with 200 and displays the public landing page to a logged-out user.
   - `https://remonook.com/robots.txt` returns text/plain crawler rules for production.
   - `https://remonook.com/sitemap.xml` returns the one-URL XML sitemap.
   - View Source contains the canonical, title, description and valid JSON-LD. Production has **no** `noindex` response header or meta tag.
   - `https://staging.remonook.com/` remains `noindex`. Staging has no public sitemap.
   - Check `www.remonook.com` redirects with HTTP 301/308 to `https://remonook.com/` if that hostname is configured; avoid duplicate-home URLs.
3. Open [Google Search Console](https://search.google.com/search-console/), add a **Domain** property for `remonook.com`, and verify DNS ownership with the TXT record Google provides (through Cloudflare DNS). This needs site-owner authorization.
4. In Search Console > Sitemaps, submit `https://remonook.com/sitemap.xml`.
5. In Search Console > URL inspection, inspect `https://remonook.com/`, run **Test Live URL**, inspect its rendered screenshot/content and request indexing if eligible. Check the Page indexing report for discovered/crawled/indexed states.
6. Monitor Search Console Performance > Search results for impressions, queries, clicks and CTR. Indexing and ranking are not guaranteed or immediate.

## Follow-up content SEO

Google renders many JS websites, but RemoNook's homepage uses React client-side rendering and Firebase session detection. If URL Inspection does not show the public landing content, prioritize a **pre-rendered public homepage** (or SSR) while preserving signed-in app behavior. Do not pre-render personal workspaces.

Once verified, consider adding distinct, useful, directly linked public pages (with unique metadata) for **nested outline notes**, **flashcards and spaced repetition**, and **calendar/daily notes**. Add these to the sitemap only when publicly accessible, useful and deployed. Do not create thin keyword-stuffed pages.

Official references:
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
