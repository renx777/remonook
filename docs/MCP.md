# Connected AI apps (MCP)

RemoNook exposes an MCP server so AI apps (Claude Code, Claude Desktop, Codex, any Streamable HTTP MCP client)
can read and write the signed-in user's cloud notes.

## How it works

- Endpoint: `POST <sync API>/mcp` (Streamable HTTP, JSON responses; GET/DELETE return 405).
  Staging: `https://remo-sync-staging.remo-978fb.workers.dev/mcp`.
- Auth: personal access tokens created in **Settings → AI apps**, sent as `Authorization: Bearer rnk_<id>_<secret>`.
  Only a SHA-256 of the secret is stored (`mcp_tokens`). Each token has scopes: `read`, `read+write`, or
  `read+write+delete`. Up to 10 tokens per user, 60 calls a minute per token. Disconnecting revokes at once.
- Writes use `commitServerChange` in `cloud/sync-v2.mjs`: the same `sharedSnapshot` validation, payload and size
  checks, compare-and-swap commit and `sync_journal` entry as a device batch. Devices receive AI edits through
  normal sync. Nothing is force-overwritten; a change that would not validate is refused and nothing is saved.
- Every edit quotes the bullet version it read (`<!-- id=… v=… -->` in read output). A changed bullet refuses the
  edit; the app must read again. `idempotency_key` makes retries safe (the operation id is derived from it).
- Deletes move whole branches to Trash (restorable), at most 200 bullets per call.
- `mcp_activity` records tool, summary and bullet ids for Settings → AI apps. It never stores note text.

## Tools

`search`, `list_pages`, `read_page`, `write_notes`, `update_note`, `move_notes`, `delete_notes`,
`create_flashcards`, `create_mcqs`, `add_bookmark`, `recent_changes`. Tools beyond a token's scope are not listed.

Markdown (`src/ai-markdown.mjs`): nested lists, `[ ]`/`[x]` tasks, numbered lists, `#` headings (content nests under
them), `---` dividers, fenced code (language kept), ```` ```mermaid ```` diagrams, GFM tables (become `remo-table`),
`**bold**`, `*italic*`, `` `code` ``, `==highlight==`, `<u>underline</u>`, and `<mark data-style="STYLE">` for every
other stored style (colours, masks, rough annotations), so read → edit → write keeps all formatting.
Friendly forms are accepted too: `<mark color="green">` for highlights, `data-style="COLOR_red"` for text colour,
`ROUGH_CIRCLE_blue` (and `BOX`, `UNDERLINE`, `HIGHLIGHT`; colour name or `AUTO`), and `MASK`. Colour names come from
the app's palettes; hex also works, and stored hex is kept exactly. Emoji shortcodes such as `:rocket:`, `:party_popper:` or `:tada:`
become animated Google Noto emoji and are added to the workspace emoji library. Each device downloads the animation
through the app's catalog repair. Shortcodes inside code are left alone. Strikethrough is
refused with an explanation (RemoNook cannot store it).

## Connecting by signing in (OAuth 2.1)

claude.ai (web, desktop, mobile) and ChatGPT connect with just the URL `<sync API>/mcp`:
- **Discovery:** `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
  An unauthenticated `/mcp` answers 401 with `resource_metadata`.
- **Registration:** dynamic client registration at `POST /oauth/register`, for public clients only, with https redirect URIs (http only for localhost).
- **Authorize:** `GET /oauth/authorize` requires PKCE S256 and checks the redirect URI exactly. It sends the owner to the
  app at `<app origin>/?connect=<request>#app`, where they sign in with Firebase and choose read, read and write, or read, write and delete.
  The app then calls `GET/POST /oauth/requests/:id(/approve|/deny)` with the Firebase session.
- **Token:** `POST /oauth/token` exchanges a single-use, 5-minute code. Access tokens last 1 hour; refresh tokens last 30 days, rotate on each use, and a reused refresh token is rejected.
- **Storage:** each approval is a grant in `mcp_grants`, listed in Settings → AI apps and revocable there. Codes, refresh tokens and access tokens are stored only as SHA-256 hashes.
- **Cross-origin:** discovery, registration and token endpoints accept any origin (no cookies or session).
- **Migration:** `cloud/mcp-oauth.sql`, applied after `cloud/mcp.sql`.

Not yet: Excalidraw drawings (they need a browser to render) and attachments.

## Deploying (staging)

The frontend deploy does not deploy the sync Worker. To enable MCP on staging:

1. Apply the additive migration to the staging D1 database `remo-sync-staging`:
   `npx wrangler d1 execute remo-sync-staging --remote --file cloud/mcp.sql` (it only creates `mcp_tokens` and
   `mcp_activity` with `IF NOT EXISTS`).
2. Deploy the sync Worker `remo-sync-staging` from this branch with the staging config, exactly as for earlier
   sync releases (see ENVIRONMENTS.md). `/health` then reports `mcp: 1`.
3. In the staging app, Settings → AI apps → Connect an app, then follow the shown setup for the AI app.

Tests: `tests/mcp.test.mjs` (end to end through `route`, including sync to devices) and the converter tests in
`tests/table.test.mjs`.
