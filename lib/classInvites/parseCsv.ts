/**
 * A small RFC-4180 subset, parsed in the browser.
 *
 * No dependency for this. papaparse is ~45 kB to answer "split a small text
 * file into rows", this repo has no CSV dependency at all, and the export side
 * (admin payouts) is hand-rolled for the same reason. What a teacher uploads
 * here is a list of addresses exported from a school system or typed into
 * Excel — quoted fields, the odd comma in a name, a BOM from Excel, and CRLF.
 *
 * Client-safe: no node imports, nothing from lib/supabase.
 */

export type CsvRow = { line: number; email: string; name: string | null };

export type ParsedCsv = {
  rows: CsvRow[];
  /** Lines that held no usable address, so the teacher can see what was ignored. */
  skipped: Array<{ line: number; text: string }>;
  hadHeader: boolean;
};

/** Split one delimited document into cells, honouring quotes. */
export function parseDelimited(input: string): string[][] {
  // Excel writes a UTF-8 BOM, which otherwise becomes part of the first header
  // cell and stops it matching /email/i.
  const text = input.replace(/^﻿/, '');

  // Auto-detect the separator from the first line. Semicolons are the default
  // in several European locales and tabs come from pasting out of a spreadsheet.
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts: Array<[string, number]> = [
    [',', (firstLine.match(/,/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  const sep = counts[0][1] > 0 ? counts[0][0] : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      // handled by the \n that follows
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

const LOOKS_LIKE_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * Pull addresses and names out of a parsed sheet.
 *
 * Header detection is by content, not position: if the first row contains a
 * cell matching /e-?mail/i it is treated as a header. A headerless file whose
 * first row already holds an address is data, and losing somebody's first
 * student to an assumption would be a poor trade.
 */
export function extractRecipients(text: string): ParsedCsv {
  const grid = parseDelimited(text);
  if (grid.length === 0) return { rows: [], skipped: [], hadHeader: false };

  const header = grid[0].map((c) => c.trim().toLowerCase());
  const hadHeader =
    header.some((c) => /e-?mail/.test(c)) && !header.some((c) => LOOKS_LIKE_EMAIL.test(c));

  let emailIdx = 0;
  let nameIdx = -1;
  if (hadHeader) {
    emailIdx = header.findIndex((c) => /e-?mail/.test(c));
    nameIdx = header.findIndex((c) => /name|student|child|pupil/.test(c));
  }

  const rows: CsvRow[] = [];
  const skipped: Array<{ line: number; text: string }> = [];

  grid.forEach((cells, index) => {
    if (hadHeader && index === 0) return;
    const line = index + 1;

    // Prefer the mapped column, but fall back to any cell that looks like an
    // address — a mis-mapped column should not throw the file away.
    let raw = (cells[emailIdx] ?? '').trim();
    if (!LOOKS_LIKE_EMAIL.test(raw)) {
      const found = cells.find((c) => LOOKS_LIKE_EMAIL.test(c.trim()));
      raw = found ? found.trim() : raw;
    }

    const match = raw.match(LOOKS_LIKE_EMAIL);
    if (!match) {
      skipped.push({ line, text: cells.join(' ').trim().slice(0, 80) });
      return;
    }

    const name =
      nameIdx >= 0 && cells[nameIdx]?.trim()
        ? cells[nameIdx].trim()
        : cells.find((c) => c.trim() && !LOOKS_LIKE_EMAIL.test(c.trim()))?.trim() ?? null;

    rows.push({ line, email: match[0].toLowerCase(), name: name || null });
  });

  return { rows, skipped, hadHeader };
}

/** The template offered beside the upload control. */
export const CSV_TEMPLATE = 'email,name\nstudent@example.com,Aliyah Mohammed\n';
