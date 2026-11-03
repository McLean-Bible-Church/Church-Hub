// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkAppPermission: vi.fn(),
  people: {
    searchContacts: vi.fn(),
    getContactById: vi.fn(),
    getHouseholdWithMembers: vi.fn(),
  },
  counter: {
    getEvents: vi.fn(),
    getEventsWithRooms: vi.fn(),
    getMetrics: vi.fn(),
    getEventMetrics: vi.fn(),
    createEventMetric: vi.fn(),
    updateEventMetric: vi.fn(),
    deleteEventMetric: vi.fn(),
  },
  room: {
    getRoomManagerData: vi.fn(),
    closeAllGroupsInRoom: vi.fn(),
    updateEventRoom: vi.fn(),
    updateEventParticipant: vi.fn(),
    closeEventRooms: vi.fn(),
    openEventRooms: vi.fn(),
  },
  getTableRecords: vi.fn(),
}));

vi.mock('@church/nextjs-auth', () => ({ auth: mocks.auth }));
vi.mock('@church/database/neon', () => ({ checkAppPermission: mocks.checkAppPermission }));
vi.mock('@/services/peopleSearchService', () => mocks.people);
vi.mock('@/services/counterService', () => mocks.counter);
vi.mock('@/services/roomManagerService', () => mocks.room);
vi.mock('@church/ministry-platform', async () => {
  const filter = await vi.importActual<Record<string, unknown>>(
    '@church/ministry-platform/utils/filter'
  );
  class MinistryPlatformClient {}
  class TableService {
    getTableRecords = mocks.getTableRecords;
  }
  return { ...filter, MinistryPlatformClient, TableService };
});

import * as peopleSearch from './people-search/search/route';
import * as peopleGlobal from './people-search/global-search/route';
import * as peopleContact from './people-search/[contactId]/route';
import * as peopleHousehold from './people-search/[contactId]/household/route';
import * as counterEvents from './counter/events/route';
import * as counterMetrics from './counter/metrics/route';
import * as eventMetrics from './counter/event-metrics/route';
import * as eventMetricById from './counter/event-metrics/[eventId]/route';
import * as roomManager from './room-manager/route';
import * as roomHousehold from './room-manager/household/route';
import * as roomUpdate from './room-manager/update/route';

type Perm = { hasAccess: boolean; canView: boolean; canEdit: boolean; canDelete: boolean };
const NONE: Perm = { hasAccess: false, canView: false, canEdit: false, canDelete: false };
const VIEW: Perm = { hasAccess: true, canView: true, canEdit: false, canDelete: false };
const EDIT: Perm = { hasAccess: true, canView: true, canEdit: true, canDelete: false };
const FULL: Perm = { hasAccess: true, canView: true, canEdit: true, canDelete: true };

/** Grant `perm` on the listed apps, nothing elsewhere. */
function grant(perms: Record<string, Perm>) {
  mocks.checkAppPermission.mockImplementation(async (key: string) => ({
    ...(perms[key] ?? NONE),
    reason: perms[key] ? 'role' : 'denied',
  }));
}

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: init?.method ?? 'GET',
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
  });
}

const params = <T>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    userId: '10',
    contactId: '20',
    email: 'member@example.org',
    roles: [],
    isAdmin: false,
  });
  grant({});
  mocks.people.searchContacts.mockResolvedValue([]);
  mocks.counter.getEvents.mockResolvedValue([]);
  mocks.counter.getEventsWithRooms.mockResolvedValue([]);
  mocks.counter.getEventMetrics.mockResolvedValue([{ Event_Metric_ID: 7, Event_ID: 1 }]);
});

describe('signed-in user with no app grants is denied everywhere (97b1)', () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ['people-search/search', () => peopleSearch.GET(req('/api/people-search/search?q=smith'))],
    [
      'people-search/global-search',
      () => peopleGlobal.GET(req('/api/people-search/global-search?q=smith')),
    ],
    [
      'people-search/[contactId]',
      () => peopleContact.GET(req('/api/people-search/1'), params({ contactId: '1' })),
    ],
    [
      'people-search/[contactId]/household',
      () => peopleHousehold.GET(req('/api/people-search/1/household'), params({ contactId: '1' })),
    ],
    ['counter/events', () => counterEvents.GET(req('/api/counter/events?date=2026-11-03'))],
    ['counter/metrics', () => counterMetrics.GET()],
    [
      'counter/event-metrics POST',
      () =>
        eventMetrics.POST(
          req('/api/counter/event-metrics', {
            method: 'POST',
            body: { Event_ID: 1, Metric_ID: 2, Numerical_Value: 3 },
          })
        ),
    ],
    [
      'counter/event-metrics/[eventId] GET',
      () => eventMetricById.GET(req('/api/counter/event-metrics/1'), params({ eventId: '1' })),
    ],
    [
      'counter/event-metrics/[eventId] PUT',
      () =>
        eventMetricById.PUT(
          req('/api/counter/event-metrics/1', {
            method: 'PUT',
            body: { eventMetricId: 7, data: { Numerical_Value: 1 } },
          }),
          params({ eventId: '1' })
        ),
    ],
    [
      'counter/event-metrics/[eventId] DELETE',
      () =>
        eventMetricById.DELETE(
          req('/api/counter/event-metrics/1', { method: 'DELETE', body: { eventMetricId: 7 } }),
          params({ eventId: '1' })
        ),
    ],
    ['room-manager', () => roomManager.GET(req('/api/room-manager?eventId=1'))],
    [
      'room-manager/household',
      () => roomHousehold.GET(req('/api/room-manager/household?participantId=1')),
    ],
    [
      'room-manager/update',
      () =>
        roomUpdate.POST(
          req('/api/room-manager/update', {
            method: 'POST',
            body: { type: 'checkOut', eventParticipantId: 5 },
          })
        ),
    ],
  ];

  it.each(cases)('%s → 403 and no MP call', async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(403);
    for (const group of [mocks.people, mocks.counter, mocks.room]) {
      for (const fn of Object.values(group)) expect(fn).not.toHaveBeenCalled();
    }
    expect(mocks.getTableRecords).not.toHaveBeenCalled();
  });

  it.each(cases)('%s → 401 without a session', async (_name, call) => {
    mocks.auth.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
  });
});

describe('people-search', () => {
  it('allows a user with people-search view', async () => {
    grant({ 'people-search': VIEW });
    const res = await peopleSearch.GET(req('/api/people-search/search?q=smith&skip=50'));
    expect(res.status).toBe(200);
    expect(mocks.people.searchContacts).toHaveBeenCalledWith('smith', 50);
  });

  it('a counter-only user cannot search people', async () => {
    grant({ counter: FULL });
    const res = await peopleSearch.GET(req('/api/people-search/search?q=smith'));
    expect(res.status).toBe(403);
  });

  it('rejects a non-numeric contactId', async () => {
    grant({ 'people-search': VIEW });
    const res = await peopleContact.GET(
      req('/api/people-search/x'),
      params({ contactId: '1 OR 1=1' })
    );
    expect(res.status).toBe(400);
    expect(mocks.people.getContactById).not.toHaveBeenCalled();
  });
});

describe('counter', () => {
  it('rejects a malformed date with 400 (027b)', async () => {
    grant({ counter: VIEW });
    const res = await counterEvents.GET(
      req(`/api/counter/events?date=${encodeURIComponent("2026-11-03' OR '1'='1")}`)
    );
    expect(res.status).toBe(400);
    expect(mocks.counter.getEvents).not.toHaveBeenCalled();
  });

  it('rejects a malformed congregationId', async () => {
    grant({ counter: VIEW });
    const res = await counterEvents.GET(
      req('/api/counter/events?date=2026-11-03&congregationId=1%20OR%201=1')
    );
    expect(res.status).toBe(400);
  });

  it('room-manager users can list events (shared endpoint)', async () => {
    grant({ 'room-manager': VIEW });
    const res = await counterEvents.GET(
      req('/api/counter/events?date=2026-11-03&requireRooms=true&congregationId=3')
    );
    expect(res.status).toBe(200);
    expect(mocks.counter.getEventsWithRooms).toHaveBeenCalledWith('2026-11-03', 3);
  });

  it('view-only users cannot create/update/delete metrics', async () => {
    grant({ counter: VIEW });
    const post = await eventMetrics.POST(
      req('/api/counter/event-metrics', {
        method: 'POST',
        body: { Event_ID: 1, Metric_ID: 2, Numerical_Value: 3 },
      })
    );
    const put = await eventMetricById.PUT(
      req('/api/counter/event-metrics/1', {
        method: 'PUT',
        body: { eventMetricId: 7, data: { Numerical_Value: 1 } },
      }),
      params({ eventId: '1' })
    );
    expect(post.status).toBe(403);
    expect(put.status).toBe(403);
    expect(mocks.counter.createEventMetric).not.toHaveBeenCalled();
    expect(mocks.counter.updateEventMetric).not.toHaveBeenCalled();
  });

  it('edit users can update only whitelisted fields of a metric on that event', async () => {
    grant({ counter: EDIT });
    const ok = await eventMetricById.PUT(
      req('/api/counter/event-metrics/1', {
        method: 'PUT',
        body: { eventMetricId: 7, data: { Metric_ID: 2, Numerical_Value: 9 } },
      }),
      params({ eventId: '1' })
    );
    expect(ok.status).toBe(200);
    expect(mocks.counter.updateEventMetric).toHaveBeenCalledWith(
      7,
      { Metric_ID: 2, Numerical_Value: 9 },
      10
    );

    const massAssign = await eventMetricById.PUT(
      req('/api/counter/event-metrics/1', {
        method: 'PUT',
        body: { eventMetricId: 7, data: { Event_ID: 999, Numerical_Value: 1 } },
      }),
      params({ eventId: '1' })
    );
    expect(massAssign.status).toBe(400);

    const otherEvent = await eventMetricById.PUT(
      req('/api/counter/event-metrics/1', {
        method: 'PUT',
        body: { eventMetricId: 8, data: { Numerical_Value: 1 } },
      }),
      params({ eventId: '1' })
    );
    expect(otherEvent.status).toBe(404);
    expect(mocks.counter.updateEventMetric).toHaveBeenCalledTimes(1);
  });

  it('delete requires canDelete', async () => {
    grant({ counter: EDIT });
    const denied = await eventMetricById.DELETE(
      req('/api/counter/event-metrics/1', { method: 'DELETE', body: { eventMetricId: 7 } }),
      params({ eventId: '1' })
    );
    expect(denied.status).toBe(403);

    grant({ counter: FULL });
    const allowed = await eventMetricById.DELETE(
      req('/api/counter/event-metrics/1', { method: 'DELETE', body: { eventMetricId: 7 } }),
      params({ eventId: '1' })
    );
    expect(allowed.status).toBe(200);
    expect(mocks.counter.deleteEventMetric).toHaveBeenCalledWith(7, 10);
  });
});

describe('room-manager', () => {
  it('view-only users cannot change check-ins or rooms', async () => {
    grant({ 'room-manager': VIEW });
    const res = await roomUpdate.POST(
      req('/api/room-manager/update', {
        method: 'POST',
        body: { type: 'checkOut', eventParticipantId: 5 },
      })
    );
    expect(res.status).toBe(403);
    expect(mocks.room.updateEventParticipant).not.toHaveBeenCalled();
  });

  it('edit users can run validated actions', async () => {
    grant({ 'room-manager': EDIT });
    const res = await roomUpdate.POST(
      req('/api/room-manager/update', {
        method: 'POST',
        body: { type: 'toggleClosed', eventRoomId: 3, closed: true, Room_ID: 99 },
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.room.updateEventRoom).toHaveBeenCalledWith(3, { Closed: true }, 10);
  });

  it('rejects malformed actions with 400', async () => {
    grant({ 'room-manager': EDIT });
    const res = await roomUpdate.POST(
      req('/api/room-manager/update', {
        method: 'POST',
        body: { type: 'closeRoom', eventRoomIds: ['1 OR 1=1'] },
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.room.closeEventRooms).not.toHaveBeenCalled();
  });

  it('household lookup validates participantId', async () => {
    grant({ 'room-manager': VIEW });
    const res = await roomHousehold.GET(
      req('/api/room-manager/household?participantId=1%20OR%201=1')
    );
    expect(res.status).toBe(400);
    expect(mocks.getTableRecords).not.toHaveBeenCalled();
  });

  it('household lookup returns 404 for unknown participant', async () => {
    grant({ 'room-manager': VIEW });
    mocks.getTableRecords.mockResolvedValue([]);
    const res = await roomHousehold.GET(req('/api/room-manager/household?participantId=12'));
    expect(res.status).toBe(404);
    expect(mocks.getTableRecords.mock.calls[0][1].$filter).toBe('Participant_Record = 12');
  });
});
