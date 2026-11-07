import Papa from "papaparse";
import { validEventDate } from "./calendar-events.mjs";
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)",
  DATE_PATTERNS = [
    // Most specific first: anything carrying a year wins over a bare "3 January".
    "\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}",
    "\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4}",
    `\\d{1,2}(?:st|nd|rd|th)?[ \\-]+${MONTH}\\.?[ ,\\-]+\\d{4}`,
    `${MONTH}\\.?[ \\-]+\\d{1,2}(?:st|nd|rd|th)?,?[ \\-]+\\d{4}`,
    `\\d{1,2}(?:st|nd|rd|th)?[ \\-]+${MONTH}\\.?`,
    `${MONTH}\\.?[ \\-]+\\d{1,2}(?:st|nd|rd|th)?`,
    "\\d{1,2}[/.\\-]\\d{1,2}",
  ].map((p) => new RegExp(`(?:^|[\\s(|,;])(${p})(?=$|[\\s)|,;])`, "gi")),
  WEEKDAY = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tues?|Wed|Thu(?:rs?)?|Fri|Sat|Sun)\.?(?=[\s,]|$)[\s,]*/i,
  MONTH_ONLY = new RegExp(`^${MONTH}\\b\\s*`, "i");
function pickDate(line) {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const m = pattern.exec(line);
    if (!m) continue;
    const start = m.index + m[0].indexOf(m[1]);
    return {
      text: m[1].replace(/(\d)(?:st|nd|rd|th)/i, "$1").replace(/\.(?=\s|,|$)/, ""),
      start,
      end: start + m[1].length,
    };
  }
  return null;
}
function cleanName(text) {
  return text
    .replace(/^[\s,;|\-–:]+|[\s,;|\-–:]+$/g, "")
    .replace(WEEKDAY, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/^[\s,;|\-–:]+|[\s,;|\-–:]+$/g, "")
    .trim();
}
export function holidayDate(value, year, format = "") {
  const text = String(value)
    .trim()
    .replace(/^["']|["']$/g, "");
  let m,
    date,
    ambiguous = false;
  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)))
    date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  else if ((m = text.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}))?$/))) {
    ambiguous = +m[1] <= 12 && +m[2] <= 12 && m[1] !== m[2] && !format;
    const us = format === "MDY" || (!format && +m[2] > 12);
    date = `${m[3] || year}-${(us ? m[1] : m[2]).padStart(2, "0")}-${(us ? m[2] : m[1]).padStart(2, "0")}`;
  } else if ((m = text.match(/^(\d{1,2})[\s-]+([a-z]+)(?:[\s,-]+(\d{4}))?$/i)))
    date = `${m[3] || year}-${String(months.indexOf(m[2].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  else if ((m = text.match(/^([a-z]+)[\s-]+(\d{1,2})(?:[\s,-]+(\d{4}))?$/i)))
    date = `${m[3] || year}-${String(months.indexOf(m[1].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return { date: date && validEventDate(date) ? date : "", ambiguous };
}
export function parseHolidaySource(
  text,
  {
    year = "2026",
    format = "",
    dateColumn = 0,
    nameColumn = 1,
    csv = false,
    source = "Line",
  } = {},
) {
  if (typeof text !== "string" || text.length > 1024 * 1024)
    throw Error("Choose text under 1 MB.");
  const result = Papa.parse(text, {
      skipEmptyLines: "greedy",
      delimiter: csv ? undefined : "\t",
    }),
    rows = [];
  let currentYear = String(year),
    skipped = 0;
  for (const [i, cols] of result.data.entries()) {
    if (rows.length >= 1000) throw Error("Review a list under 1,000 rows.");
    const raw = cols.join(" ").trim();
    if (!raw) continue;
    if (/^20\d{2}$/.test(raw)) {
      currentYear = raw;
      continue;
    }
    let candidate = cols[dateColumn] || "",
      name = cols[nameColumn] || "";
    if (!csv) {
      const line = raw.replace(/\s+/g, " "),
        found = pickDate(line);
      if (!found) {
        // Titles, headers and addresses: remember a lone year, skip the rest.
        const year = line.match(/\b(20\d{2})\b/);
        if (year && !/\d{5,}/.test(line)) currentYear = year[1];
        skipped++;
        continue;
      }
      candidate = found.text;
      // Table rows usually read "# Month Date Day Occasion": the name follows
      // the date. Lists such as "Republic Day 26 Jan" put it first.
      const after = cleanName(line.slice(found.end)),
        before = cleanName(
          line
            .slice(0, found.start)
            .replace(/^\d{1,3}[.)]?\s+/, "")
            .replace(MONTH_ONLY, ""),
        );
      name = after || before;
    }
    if (
      i === 0 &&
      /date/i.test(candidate) &&
      /holiday|name|occasion/i.test(name)
    )
      continue;
    const parsed = holidayDate(candidate, currentYear, format);
    rows.push({
      id: crypto.randomUUID(),
      date: parsed.date,
      name: String(name).trim(),
      original: raw.slice(0, 240),
      source: `${source} ${i + 1}`,
      selected: !!parsed.date && !!name && !parsed.ambiguous,
      issue: parsed.ambiguous
        ? "Choose DMY or MDY"
        : !parsed.date
          ? "Check date"
          : !name
            ? "Check name"
            : "",
    });
  }
  return { rows, skipped, errors: result.errors.map((e) => e.message) };
}
// PDF.js/OCR words carry positions. Group by baseline and split separated columns
// before parsing, rather than flattening an entire page into one string.
export function positionedLines(items) {
  const lines = [];
  for (const item of items
    .filter((i) => i.text?.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    let line = lines.find(
      (l) => Math.abs(l.y - item.y) < Math.max(4, item.height * 0.45),
    );
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  return lines
    .map((l) =>
      l.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" "),
    )
    .join("\n");
}

export function parsePdfPages(text) {
  const pages = [];
  for (const part of text.split(",")) {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw Error("Use page numbers or ranges, for example 1-3, 5.");
    const start = Number(match[1]),
      end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end - start >= 10)
      throw Error("Select one to ten valid PDF pages.");
    for (let page = start; page <= end; page++)
      if (!pages.includes(page)) pages.push(page);
    if (pages.length > 10) throw Error("Select up to ten PDF pages.");
  }
  return pages;
}

/** A holiday saved by the old importer carries its real date in the name,
 * e.g. "15-Jan-2026 Thursday Makara Sankranti" saved on 2 January.
 * Returns the date and name it should have, or null. */
export function misimportedHoliday(date, name) {
  const found = pickDate(String(name));
  if (!found || found.start > 0) return null;
  const parsed = holidayDate(found.text, String(date).slice(0, 4));
  const clean = cleanName(String(name).slice(found.end));
  if (!parsed.date || parsed.ambiguous || !clean) return null;
  return { date: parsed.date, name: clean };
}
/** Move mis-imported holidays to the date in their name and tidy the name.
 * Correct entries always win; a mis-imported duplicate of one is dropped. */
export function repairHolidays(holidays) {
  const out = {},
    fixes = [];
  for (const [date, name] of Object.entries(holidays)) {
    const fix = misimportedHoliday(date, name);
    if (fix) fixes.push(fix);
    else out[date] = name;
  }
  for (const fix of fixes) if (!out[fix.date]) out[fix.date] = fix.name;
  return out;
}
