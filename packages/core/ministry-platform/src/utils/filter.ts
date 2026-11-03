/**
 * Safe builders for values interpolated into MinistryPlatform `$filter` strings.
 *
 * MinistryPlatform translates `$filter` into a SQL WHERE clause and our server
 * calls run under a full-access client-credentials token. NEVER concatenate raw
 * user input into a filter. Every value must go through one of these helpers:
 *
 * - IDs         → `filterId(value)`                  (positive safe integer)
 * - Dates       → `filterDate(value)` / `quoteFilterDate(value)`  (strict YYYY-MM-DD)
 * - Strings     → `quoteFilterString(value)`         (single quotes doubled)
 * - LIKE search → `sanitizeSearchTerm(raw)` then `likeContains(term)`
 *
 * The throwing helpers raise `FilterValueError`; the `parse*` variants return
 * `null` so route handlers can answer 400 instead of 500.
 */

export class FilterValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterValueError';
  }
}

// C0 control characters and DEL — never legitimate inside a filter literal.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Max integer accepted as an MP primary/foreign key (SQL Server INT). */
const MAX_MP_ID = 2_147_483_647;

/**
 * Parse a positive integer ID from a number or a string of digits only.
 * Rejects things `parseInt` would silently accept, e.g. "12 OR 1=1", "1e3", "0x1F", "-5".
 */
export function parseFilterId(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && /^\d{1,10}$/.test(value.trim())) {
    n = Number(value.trim());
  } else {
    return null;
  }
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_MP_ID) return null;
  return n;
}

/** Same as `parseFilterId` but throws `FilterValueError` on invalid input. */
export function filterId(value: unknown): number {
  const id = parseFilterId(value);
  if (id === null) throw new FilterValueError('Invalid ID');
  return id;
}

/**
 * Parse a strict ISO calendar date (YYYY-MM-DD). Rejects anything else,
 * including impossible dates such as 2026-02-30.
 */
export function parseFilterDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 1753 || month < 1 || month > 12 || day < 1) return null; // 1753 = SQL Server DATETIME floor
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

/** Same as `parseFilterDate` but throws `FilterValueError` on invalid input. */
export function filterDate(value: unknown): string {
  const date = parseFilterDate(value);
  if (date === null) throw new FilterValueError('Invalid date (expected YYYY-MM-DD)');
  return date;
}

/** Validated date wrapped in single quotes, ready to place in a filter. */
export function quoteFilterDate(value: unknown): string {
  return `'${filterDate(value)}'`;
}

/** Escape a string for use inside a single-quoted filter literal (doubles `'`). */
export function escapeFilterString(value: unknown): string {
  if (typeof value !== 'string') throw new FilterValueError('Expected a string');
  if (CONTROL_CHARS.test(value)) throw new FilterValueError('Control characters not allowed');
  return value.replace(/'/g, "''");
}

/** Escaped string wrapped in single quotes, ready to place in a filter. */
export function quoteFilterString(value: unknown): string {
  return `'${escapeFilterString(value)}'`;
}

/** Default maximum length of a free-text search term. */
export const MAX_SEARCH_TERM_LENGTH = 100;

/**
 * Characters NOT allowed in a free-text search term. Allowed: letters (any
 * script) and combining marks, digits, space, and `@ . ' + - _` (names like
 * O'Brien / Smith-Jones, emails, phone numbers). Everything else — including
 * the LIKE wildcards `%` and `[ ]`, parentheses, `=`, `;`, `&`, `/`, `\` — is
 * replaced with a space.
 */
const SEARCH_DISALLOWED = /[^\p{L}\p{M}\p{N} @.'+\-_]/gu;

/**
 * Normalize a raw free-text search term to a safe character set and length.
 * Returns '' when nothing searchable remains. The result still needs
 * `likeContains()` (which escapes quotes) before going into a filter.
 */
export function sanitizeSearchTerm(raw: unknown, maxLength = MAX_SEARCH_TERM_LENGTH): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFKC')
    .replace(SEARCH_DISALLOWED, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

/**
 * Build a `'%term%'` literal for `LIKE`. Quotes are doubled and the LIKE
 * metacharacters `%`, `[`, `]` are removed so callers can only do a plain
 * "contains" match. (`_` is left as-is: it is a single-char wildcard, which can
 * only broaden a match, and is common in email addresses.)
 */
export function likeContains(term: unknown): string {
  if (typeof term !== 'string') throw new FilterValueError('Expected a string');
  const stripped = term.replace(/[%[\]]/g, '');
  if (stripped.length === 0) throw new FilterValueError('Empty search term');
  return `'%${escapeFilterString(stripped)}%'`;
}
