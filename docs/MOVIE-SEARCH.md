# MovieSearch

Add `#MovieSearch` to an ordinary bullet, then zoom into it. The MovieSearch
button appears under its heading, including when it also uses `#views`.

Choose TMDB or OMDb and enter your own API key (TMDB v3 API key, not a v4 bearer
token). Keys stay in account/workspace-scoped session memory and are not persisted, synced, backed up
or sent to RemoNook's backend. Re-enter after reload; keys are reused across tagged notes within the session. Clear key removes the selected provider key.
Requests go directly to the selected provider on explicit lookup. Provider
terms, browser CORS availability, credits and rate limits still apply. BYOK is
not a commercial licensing exemption. No real-provider credential was available
for acceptance testing; automated browser checks use mocked provider responses.

For one movie, edit title/year, Search, choose a result and review Apply. It
updates this note's Poster Trait with an HTTPS URL. It does not download the
poster as an attachment. Existing image previews fetch that URL as usual.

For a shelf, choose Find posters for child movies. Up to 50 ordinary direct
children are processed sequentially, resolving mirrors to their source identity.
The query uses the child's title and Year Trait (or trailing parenthesized year).
Only an exact case-insensitive title, matching year when supplied, and exactly
one candidate with a poster prepares a proposal. Other candidates are left
unchanged; tag and open an individual note to search manually. Review each
replacement and uncheck unwanted changes before Apply.

Apply uses one existing outline mutation, so normal persistence, synchronization
and undo apply. Deleted targets and changed titles or Poster values invalidate
the batch rather than overwrite newer edits. Other Traits, ratings and prose
are preserved. Cancel, source switches, account/workspace switches and unmount
invalidate lookup responses. No API response, key or result history is stored.
The imported Poster URL becomes an ordinary synced Trait.

Current scope: existing movie notes and poster URLs. Creating a new movie note,
selecting additional metadata fields, saved credentials, pagination beyond the
first ten provider results, localized fuzzy matching and a backend API proxy are
not part of this version.
