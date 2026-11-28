# MovieSearch

Fill movie notes from TMDB or OMDb, and add new movies by searching.

## Connect once

Open **Settings → Connections → Movies** and paste a key:

- **TMDB:** either the short "API Key" or the long "API Read Access Token". Both work; the token is sent as a bearer header and never in the URL.
- **OMDb:** the key OMDb emailed you.

**Connect** checks the key with one request.

**Keep the key on** (chosen per provider; it can be changed later without re-entering the key):
- **This device** (default): stored in this browser for this account. Never synced or backed up.
- **All my devices:** stored in the account's synced settings (`web.providerKeys`), so every signed-in device can use it. It is left out of backup files, but anyone who can open the account's notes can read it.
- **Until reload:** forgotten when the app reloads.

Moving the key removes it from the old place. **Forget** removes it everywhere. Wherever it is kept, the key is only sent to the provider, never to RemoNook.

## Where it appears

**Movie collections** show **Add movie** and **Update from TMDB** in the collection toolbar (or under the title when the collection has no `#views`). A collection counts as a movie collection when either:
- it is tagged `#MovieSearch`, or
- its Configure → recipe is Movie shelf.

**A single movie** (a note tagged `#MovieSearch` inside such a collection, or any child of one) shows **Match on TMDB**.

## Add movie

1. Search as you type and pick a result.
2. RemoNook fetches the full details and creates a child note titled after the movie, with the chosen Traits:
   - Cover
   - Year
   - Director
   - Genre
   - Runtime
   - TMDB rating (IMDb rating with OMDb)
   - TMDB or IMDb link

**Traits to fill** remembers your choice. Your own `Rating` Trait is never touched. Movies already in the list are marked "In list".

## Update from TMDB

Checks every direct child, up to 200, three at a time.

**Matching:**
1. A movie that already has a TMDB/IMDb link Trait is looked up by that id, so later updates always find the same film.
2. Otherwise titles are compared ignoring case, accents, punctuation and a leading "The/A/An", with the Year Trait (or a trailing "(1982)") allowed to differ by one year.
3. When several films share a title, the one matching the year wins; failing that, a clearly more popular one wins.
4. Otherwise you pick from the top three in the review list.

**Review:**
- Each movie lists old → new values with a checkbox.
- Only empty Traits are filled unless **Replace values that are already filled** is on.
- An existing `Poster` Trait is updated as the cover instead of adding `Cover`, so there are no duplicate images.

**Apply** writes all chosen changes as one undoable step. A note renamed during review is refused rather than overwritten. A rejected key or a rate limit stops the run.

## Match on TMDB

Search by title and year, choose the film, see exactly what changes (replacing existing values by default), then **Apply**.

## Notes

- Requests go straight from the device to `api.themoviedb.org` or `www.omdbapi.com`, with credentials omitted, redirects refused and no referrer. Provider terms, credits and rate limits apply.
- Poster images stay as HTTPS links; they are not downloaded as attachments.
- TMDB attribution appears in Settings and in the Add movie sheet.
- On the native apps the key is stored the same way as on the web, in the app's storage for that account.
