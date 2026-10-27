# Interface iconography

The first pass uses Lucide for editor formatting, Sketch annotations, bullet action categories, equation/diagram/table insertion and connection actions. Icons use the existing `Icon` wrapper with an 18 px default size, 1.65 stroke width and currentColor; dense controls keep their existing explicit sizes. Buttons retain their accessible names, tooltips and pressed states. Inline link, backlink and mirror symbols have distinct artwork. Existing icons outside this pass remain unchanged.

Phosphor duotone artwork is reserved for larger Study Desk empty states: a books illustration for the first-flashcard prompt and a search illustration when a folder filter has no results. Existing personalized folder artwork remains in the empty-folder state.

Both libraries are bundled locally. Lucide uses a fixed map of named imports; Phosphor imports the individual Books and MagnifyingGlass modules. There is no icon font, remote asset fetch or change to note/backup/sync formats. The original RemoNook brand artwork and animated emoji collections remain separate.

Future passes may extend the interface mapping or add curated notebook/folder icon choices. Those user-owned choices would require stable IDs and normal backup/sync handling; they are not part of this visual refresh.

Sources and licenses: https://lucide.dev/ and https://github.com/phosphor-icons/react. Full notices are retained under `LICENSES/` and summarized in `THIRD-PARTY-NOTICES.md`.
