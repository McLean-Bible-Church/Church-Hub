import { describe, it, expect } from 'vitest';
import {
  FilterValueError,
  escapeFilterString,
  filterDate,
  filterId,
  likeContains,
  parseFilterDate,
  parseFilterId,
  quoteFilterDate,
  quoteFilterString,
  sanitizeSearchTerm,
} from './filter';

describe('parseFilterId / filterId', () => {
  it('accepts positive integers and digit-only strings', () => {
    expect(parseFilterId(42)).toBe(42);
    expect(parseFilterId('42')).toBe(42);
    expect(parseFilterId(' 7 ')).toBe(7);
    expect(filterId('2147483647')).toBe(2147483647);
  });

  it.each([
    '12 OR 1=1',
    '12)',
    "1'",
    '1e3',
    '0x1F',
    '-5',
    '+5',
    '1.5',
    '',
    '0',
    '2147483648',
    '99999999999',
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    null,
    undefined,
    {},
    [],
    true,
  ])('rejects %j', (value) => {
    expect(parseFilterId(value)).toBeNull();
    expect(() => filterId(value)).toThrow(FilterValueError);
  });
});

describe('parseFilterDate / filterDate', () => {
  it('accepts strict YYYY-MM-DD calendar dates', () => {
    expect(parseFilterDate('2026-11-03')).toBe('2026-11-03');
    expect(parseFilterDate('2024-02-29')).toBe('2024-02-29');
    expect(quoteFilterDate('2026-01-01')).toBe("'2026-01-01'");
  });

  it.each([
    "2026-11-03' OR 1=1 --",
    "2026-11-03') OR (1=1",
    '2026-11-03T00:00:00Z',
    '2026-11-3',
    '26-11-03',
    '2026/11/03',
    '2026-13-01',
    '2026-00-10',
    '2026-02-30',
    '2025-02-29',
    '1700-01-01',
    ' 2026-11-03',
    '',
    20261103,
    null,
    undefined,
  ])('rejects %j', (value) => {
    expect(parseFilterDate(value)).toBeNull();
    expect(() => filterDate(value)).toThrow(FilterValueError);
  });
});

describe('escapeFilterString / quoteFilterString', () => {
  it('doubles single quotes', () => {
    expect(escapeFilterString("O'Brien")).toBe("O''Brien");
    expect(quoteFilterString("' OR 1=1 --")).toBe("''' OR 1=1 --'");
  });

  it('rejects control characters and non-strings', () => {
    expect(() => escapeFilterString('a\u0000b')).toThrow(FilterValueError);
    expect(() => escapeFilterString('a\nb')).toThrow(FilterValueError);
    expect(() => escapeFilterString(5)).toThrow(FilterValueError);
  });

  it('a quoted value can never terminate the literal early', () => {
    const payloads = ["'", "''", "x' OR 'a'='a", "\\'", "x'--", "x'); DROP TABLE Contacts;--"];
    for (const p of payloads) {
      const quoted = quoteFilterString(p);
      // Strip the outer quotes; inside, every quote must be part of a doubled pair.
      const inner = quoted.slice(1, -1);
      expect(inner.replace(/''/g, '')).not.toContain("'");
    }
  });
});

describe('sanitizeSearchTerm', () => {
  it('keeps names, emails and phone numbers', () => {
    expect(sanitizeSearchTerm('  John   Smith ')).toBe('John Smith');
    expect(sanitizeSearchTerm("O'Brien")).toBe("O'Brien");
    expect(sanitizeSearchTerm('Mary-Jane')).toBe('Mary-Jane');
    expect(sanitizeSearchTerm('first.last+tag@example.org')).toBe('first.last+tag@example.org');
    expect(sanitizeSearchTerm('703-555-0100')).toBe('703-555-0100');
    expect(sanitizeSearchTerm('José Müller')).toBe('José Müller');
    expect(sanitizeSearchTerm('user_name')).toBe('user_name');
  });

  it('removes filter/LIKE metacharacters', () => {
    expect(sanitizeSearchTerm("a%' OR Contact_ID>0 OR Last_Name LIKE '%")).toBe(
      "a ' OR Contact_ID 0 OR Last_Name LIKE '"
    );
    expect(sanitizeSearchTerm('x) OR (1=1')).toBe('x OR 1 1');
    expect(sanitizeSearchTerm('[a-z]%')).toBe('a-z');
    expect(sanitizeSearchTerm('a;b&c/d\\e=f<g>h')).toBe('a b c d e f g h');
    expect(sanitizeSearchTerm('\u0000\n\t')).toBe('');
  });

  it('normalizes look-alike characters (fullwidth apostrophe becomes a real quote)', () => {
    expect(sanitizeSearchTerm('O＇Brien')).toBe("O'Brien");
  });

  it('maps apostrophe look-alikes and modifier letters to an ASCII quote (then escaped)', () => {
    const lookalikes = ['\u2019', '\u2018', '\u02BC', '\u02B9', '\u02C8', '\u2032', '\u00B4', '`'];
    for (const ch of lookalikes) {
      const term = sanitizeSearchTerm(`O${ch}Brien`);
      expect(term).toBe("O'Brien");
      expect(likeContains(term)).toBe("'%O''Brien%'");
    }
  });

  it('removes other modifier letters (Lm category)', () => {
    expect(sanitizeSearchTerm('a\u02C6b')).toBe('a b');
    expect(sanitizeSearchTerm('a\u02D0b')).toBe('a b');
  });

  it('limits length and handles non-strings', () => {
    expect(sanitizeSearchTerm('a'.repeat(500))).toHaveLength(100);
    expect(sanitizeSearchTerm('abcdef', 3)).toBe('abc');
    expect(sanitizeSearchTerm(undefined)).toBe('');
    expect(sanitizeSearchTerm(123)).toBe('');
  });
});

describe('likeContains', () => {
  it('wraps in %...% and escapes quotes', () => {
    expect(likeContains('smith')).toBe("'%smith%'");
    expect(likeContains("O'Brien")).toBe("'%O''Brien%'");
  });

  it('refuses un-normalized apostrophe look-alikes', () => {
    expect(() => likeContains('O\u2019Brien')).toThrow(FilterValueError);
    expect(() => likeContains('O\u02BCBrien')).toThrow(FilterValueError);
  });

  it('strips LIKE metacharacters even if the caller skipped sanitizeSearchTerm', () => {
    expect(likeContains('50%[x]')).toBe("'%50x%'");
  });

  it('cannot be broken out of with a quote payload', () => {
    const sanitized = sanitizeSearchTerm("x' OR Contact_ID > 0 OR First_Name LIKE '");
    const literal = likeContains(sanitized);
    const inner = literal.slice(1, -1);
    expect(inner.replace(/''/g, '')).not.toContain("'");
  });

  it('rejects empty terms and non-strings', () => {
    expect(() => likeContains('')).toThrow(FilterValueError);
    expect(() => likeContains('%%')).toThrow(FilterValueError);
    expect(() => likeContains(null)).toThrow(FilterValueError);
  });
});
