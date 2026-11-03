// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every getTableRecords call so we can inspect the generated $filter.
const { getTableRecords } = vi.hoisted(() => ({ getTableRecords: vi.fn() }));

vi.mock('@church/ministry-platform', async () => {
  const filter = await vi.importActual<Record<string, unknown>>(
    '@church/ministry-platform/utils/filter'
  );
  class MinistryPlatformClient {}
  class TableService {
    getTableRecords = getTableRecords;
    createTableRecords = vi.fn();
    updateTableRecords = vi.fn();
    deleteTableRecords = vi.fn();
  }
  class ProcedureService {}
  return { ...filter, MinistryPlatformClient, TableService, ProcedureService };
});

import { searchContacts, getContactById, getHouseholdWithMembers } from './peopleSearchService';
import { getEvents, getEventsWithRooms, getEventMetrics } from './counterService';

/** Replace every well-formed single-quoted literal ('' is an escaped quote) with LIT. */
function stripLiterals(filter: string): string {
  return filter.replace(/'(?:[^']|'')*'/g, ' LIT ');
}

function lastFilter(): string {
  const call = getTableRecords.mock.calls.at(-1);
  return call?.[1]?.$filter as string;
}

beforeEach(() => {
  getTableRecords.mockReset();
  getTableRecords.mockResolvedValue([]);
});

describe('searchContacts filter', () => {
  const payloads = [
    "x' OR Contact_ID > 0 OR First_Name LIKE '",
    "a%' OR 1=1 --",
    "') OR (Contact_ID IN (SELECT User_ID FROM dp_Users)) OR ('",
    "x' AND SUBSTRING(Email_Address,1,1)='a",
    "O'Brien Smith",
    "zz'; WAITFOR DELAY '0:0:5'--",
  ];

  it.each(payloads)('keeps %j inside string literals', async (payload) => {
    await searchContacts(payload);
    const filter = lastFilter();
    expect(filter).toBeTruthy();
    // Every quote in the filter belongs to a balanced literal.
    const outside = stripLiterals(filter);
    expect(outside).not.toContain("'");
    // Outside of literals there is only the fixed skeleton: column names, LIKE, OR/AND, parens.
    const skeleton = outside.replace(/\b[A-Za-z_]+\b/g, '').replace(/[\s()]/g, '');
    expect(skeleton).toBe('');
    // No user-controlled operators leaked out of a literal
    expect(outside).not.toMatch(/Contact_ID|SELECT|WAITFOR|SUBSTRING|=|>|--|;/);
  });

  it('escapes apostrophes in real names', async () => {
    await searchContacts("O'Brien");
    expect(lastFilter()).toContain("Last_Name LIKE '%O''Brien%'");
  });

  it('does not query MP for empty / symbol-only input', async () => {
    expect(await searchContacts('   ')).toEqual([]);
    expect(await searchContacts('%%%;;;')).toEqual([]);
    expect(getTableRecords).not.toHaveBeenCalled();
  });

  it('clamps skip', async () => {
    await searchContacts('smith', -5);
    expect(getTableRecords.mock.calls.at(-1)?.[1]?.$skip).toBe(0);
    await searchContacts('smith', Number.NaN);
    expect(getTableRecords.mock.calls.at(-1)?.[1]?.$skip).toBe(0);
  });
});

describe('ID filters', () => {
  it('rejects non-integer IDs before querying', async () => {
    await expect(getContactById(Number('1 OR 1=1'))).rejects.toThrow();
    await expect(getContactById('5 OR 1=1' as unknown as number)).rejects.toThrow();
    await expect(getEventMetrics(-1)).rejects.toThrow();
    await expect(getHouseholdWithMembers(0)).rejects.toThrow();
    expect(getTableRecords).not.toHaveBeenCalled();
  });

  it('builds numeric ID filters for valid IDs', async () => {
    await getContactById(42);
    expect(lastFilter()).toBe('Contact_ID = 42');
  });
});

describe('getEvents / getEventsWithRooms date filter', () => {
  it.each(["2026-11-03' OR '1'='1", '2026-11-03) OR (1=1', 'today', '2026-02-30', ''])(
    'rejects %j without querying',
    async (date) => {
      await expect(getEvents(date, null)).rejects.toThrow();
      await expect(getEventsWithRooms(date, null)).rejects.toThrow();
      expect(getTableRecords).not.toHaveBeenCalled();
    }
  );

  it('accepts strict ISO dates and integer congregation IDs', async () => {
    await getEvents('2026-11-03', 5);
    expect(lastFilter()).toBe(
      "CAST(Events.Event_Start_Date AS DATE) = '2026-11-03' AND Events.Congregation_ID = 5"
    );
    await getEventsWithRooms('2026-11-03', null);
    expect(lastFilter()).toBe("CAST(Event_ID_Table.Event_Start_Date AS DATE) = '2026-11-03'");
  });

  it('rejects a non-integer congregation ID', async () => {
    await expect(getEvents('2026-11-03', 1.5)).rejects.toThrow();
  });
});
