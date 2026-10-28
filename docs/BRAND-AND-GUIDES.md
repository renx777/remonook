# Public identity and feature guides

The canonical product is **RemoNook**, at `https://remonook.com/`, represented by
the elephant artwork in `public/brand/`. RemoNook is independent and is not
affiliated with RemNote. Official profiles are X `@RemoNookhq`, YouTube
`@RemoNook`, and Instagram `@RemoNook.hq`, as supplied by the product owner.

`src/public-brand.mjs` holds shared product facts, profile links, and the schema
graph. `src/public-site.mjs` holds editorial guide content and its HTML renderer;
that content is built separately from the app JavaScript. Keep the homepage metadata in `index.html`
consistent with those facts; SEO tests compare its JSON-LD to the shared graph.
Avoid invented reviews, ratings, pricing, ownership claims, or social accounts.

## Rendering and routes

The Vite public-pages plugin renders the actual public `Landing` component to
HTML during the build, then the browser mounts the interactive app as before.
It never loads a workspace or account. The homepage introduction, FAQ, and guide
links are therefore readable without executing JavaScript.

About, the guide index, and six feature guides are standalone HTML assets with
no app JavaScript dependency. They have individual titles, descriptions,
canonical URLs, Open Graph metadata, and structured data. Guide pages also have
article and breadcrumb information. The public stylesheet is `public/learn.css`.

Public routes are `/about`, `/guides`, and `/guides/{getting-started,study,mcqs,
bulk-editing,dashboard,backups}`. Cloudflare's default HTML handling resolves
these extensionless paths to the emitted `.html` assets. The development plugin
and local static server support the same routes. Guide and About navigation
returns to `/#app`, so those pages do not become alternate application URLs.

The sitemap lists only public canonical pages. The offline shell caches each
public HTML file and its stylesheet, and serves the matching guide on an offline
navigation. Cache versions include file contents so editorial-only updates also
invalidate old offline pages.

Staging includes `noindex, nofollow` in **every** public HTML page in addition to
the existing staging headers, disallowed robots file, and removed sitemap.
Production remains indexable. Do not remove staging's exclusion to test SEO.

## Editorial maintenance

Tutorials use current UI labels and explain supported behavior: four direct MCQ
options, exactly one `@Answer` marker for bulk conversion, separate flashcard and
MCQ libraries, row selection versus character selection, and Cram versus spaced
review. Keep screenshots optional; text instructions must remain useful without
them. Recheck labels against the implementation when updating a feature.

## After a production release

1. Check the production homepage, About page, guides, robots file, and sitemap.
2. Inspect `/` and `/about` in Google Search Console and request indexing; submit
   `https://remonook.com/sitemap.xml` if it is not already submitted.
3. Use the same product description and official links in social introductions.
4. Report a factually incorrect AI Overview through Google's feedback control.

Search Console, social posts, and AI Overview feedback are external account
actions, not repository changes. Accurate, indexable information can help brand
recognition over time; these changes do not guarantee an AI Overview correction
or a search ranking. Staging is intentionally excluded and cannot provide that
production indexing signal.
