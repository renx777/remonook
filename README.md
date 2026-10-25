# Remonook

Remo means **remember more**. An outline-first notes and study application: nested notes, linked flashcards, MCQs, image occlusion, calendar reminders, rich media and local-first editing.

Production: https://remonook.com

This source snapshot comes from the deployed Sites version 43, commit `bc3c0bf160699f140ca08cb8ae337cf853391fa8`. The GitHub import includes environment isolation and CI changes that have **not** been deployed to production. Generated builds and historical build artifacts are deliberately excluded. This is a clean source import, not a copy of the original Git history.

## Start locally

Install Node.js 24 (see `.nvmrc`), then:

```sh
npm ci
npm run dev
```

Open the localhost address printed by Vite and choose **Try as a guest**. Local mode is the default: Google sign-in and cloud sync are disabled, and no production services are contacted. Device-only notes persist in your browser. Keep the same host and port to access them again.

```sh
npm run build
npm test
npm start
```

Build before running the full test suite: the production smoke test exercises `dist/`. Builds are generated locally and are not committed. The older Windows launcher requires a build first; no ready-built distribution is shipped in this repository.

## Environments and releases

See [the development and deployment guide](docs/ENVIRONMENTS.md).

- `local`: default, device-only. Safe for feature development.
- `staging`: separate Firebase project, sync Worker, D1 database and R2 bucket. Not provisioned by this import.
- `production`: existing services, explicitly selected configuration. Still hosted through the existing Sites workflow.

Feature branch → pull request → CI → merge to `main` → staging → explicit production release. Do not create an independent long-lived `develop` branch at this stage.

The current public application is unchanged by pushing this repository. GitHub CI is enabled; cloud deployment requires the setup described in the guide.

## Tests and architecture

React + TypeScript + Vite; Tiptap for editing; IndexedDB for local data; Firebase Google authentication; Cloudflare Worker + D1 + R2 for private cloud sync.

Tests cover outline hierarchy, paste/import, formatting, scheduling, study sessions, recoveries, uploads, account isolation, sync conflicts, responsive editing and environment isolation.

Existing feature and Android compatibility documentation lives in `docs/`. Some historical W1 documents describe earlier milestones and should not be read as the current deployment contract.

User notes, exports, credentials and service-account keys do not belong in this repository. Firebase **web** configuration is public client configuration, unlike admin credentials. This repository has no open-source license grant; third-party attribution is retained under `LICENSES/` and `THIRD-PARTY-NOTICES.md` where supplied.
