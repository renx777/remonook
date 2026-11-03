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
export function holidayDate(value, year, format = "") {
  const text = String(value)
    .trim()
    .replace(/^["']|["']$/g, "");
  let m,
    date,
    ambiguous = false;
  if ((m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)))
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
  let currentYear = String(year);
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
        m = line.match(
          /(?:^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{4})?|\d{1,2}[ -]+(?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)(?:[ ,\-]+\d{4})?|(?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+\d{1,2}(?:,?\s+\d{4})?)(?=\s|[,;|]|$)/i,
        );
      if (m) {
        candidate = m[1];
        name = line
          .replace(m[0], " ")
          .replace(/^[,;|\s]+|[,;|\s]+$/g, "")
          .replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\s+/i, "");
      } else candidate = "";
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
  return { rows, errors: result.errors.map((e) => e.message) };
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
