# Remo Web — local source and ready-built app

This package contains the latest W1 source and private-site stability update from commit dceac27c17c943d47ff755f90bdc4df7eaf7fb50. Android reference source is separate. No notes, credentials, Git metadata, hosted-project configuration or node_modules are included.

## Run the ready-built app

Install Node.js 22.12 or later, extract the ZIP, and open a terminal in the remo-web folder.

    node scripts/serve.mjs

Open http://127.0.0.1:4173 and keep the terminal open. On Windows you can double-click Start-Remo-Windows.bat instead. The ready build does not require npm installation. Do not open dist/index.html directly.

## Edit locally

    npm ci
    npm run dev

Open the address printed by Vite. Edit src/main.tsx, src/OutlineView.tsx, src/editor.tsx and src/styles.css. Core outline rules are in src/domain.mjs; persistence and backups in src/data.ts. Shared contract, parity checklist and Android handoff are in docs/.

After editing, verify and build:

    npm run build
    npm test

Production-bundle tests use dist/, so rebuild before running tests after source edits. Restart the local static server to try the built app; close old tabs to let cached app versions update.

## Bring your notes across

The hosted site and localhost use separate browser databases. Export a full backup from the hosted site's Settings & backups (or recovery screen), then restore it using local Settings & backups. Use the same local browser, address and port afterwards. This source package contains no personal notes. Keep a separate backup before transfers; do not clear site data to switch versions.

## Scope

This is the functional W1 implementation, not full Android parity. Calendar and complete study screens remain future milestones. See README.md and docs/PARITY.md. Twenty automated checks passed for this source/build; real device acceptance remains outstanding and the reported white-screen root cause is unconfirmed. The stability update adds editor/resize safeguards, browser API fallbacks and an error recovery screen with draft backup.
