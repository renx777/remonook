// When the sync server rejects a batch as an invalid shared document, run the same
// validators it uses (cloud/sync-v2.mjs snapshot) on this device's copy and name the
// first failing area. Messages are fixed validator text, never note content.
import { validateBookmarks } from './bookmarks.mjs';
import { validateDashboard } from './dashboard.mjs';
import { validateReading } from './reading.mjs';
import { validateReadingBooks } from './book-storage.mjs';
import { validateWorkdays } from './workdays.mjs';
import { validateCalendarEvents } from './calendar-events.mjs';
import { validateStudyLibrary } from './study-library.mjs';
import { validateOcclusions } from './occlusion.mjs';

export function sharedDocumentProblem(doc: any): string {
  const web = doc?.web || {};
  const checks: [string, () => void][] = [
    ['Books', () => validateReadingBooks(web.readingBooks)],
    ['Reading', () => validateReading(web)],
    ['Bookmarks', () => validateBookmarks(web)],
    ['Dashboard', () => validateDashboard(web.dashboard)],
    ['Workdays', () => validateWorkdays(web.workdays)],
    ['Calendar', () => validateCalendarEvents(web.calendarEvents)],
    ['Study library', () => validateStudyLibrary(web)],
    ['Image occlusion', () => validateOcclusions(web.occlusions)],
  ];
  for (const [area, check] of checks) {
    try {
      check();
    } catch (e) {
      return `${area}: ${String((e as Error)?.message || e).slice(0, 160)}`;
    }
  }
  const ids = new Set((doc?.tables?.bullets || []).map((n: any) => n.id));
  for (const source of [...(doc?.tables?.media || []).map((x: any) => x.bulletId), ...(doc?.tables?.decks || []).map((x: any) => x.rootId)])
    if (!ids.has(source)) return 'Attachments: an image or deck points to a missing note';
  return '';
}
