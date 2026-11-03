import { parseFilterId } from '@church/ministry-platform';
import type { RoomManagerAction } from '@/types/roomManager';

const MAX_IDS_PER_ACTION = 200;
const MAX_CAPACITY = 10_000;
const MAX_PRIORITY = 1_000;

function idList(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_IDS_PER_ACTION) return null;
  const ids: number[] = [];
  for (const v of value) {
    const id = parseFilterId(v);
    if (id === null) return null;
    ids.push(id);
  }
  return ids;
}

function nullableInt(value: unknown, max: number): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    return undefined; // invalid
  }
  return value;
}

/**
 * Validate a POST /api/room-manager/update body against the RoomManagerAction union.
 * Returns a freshly built action containing only known, type-checked fields, or
 * null if anything is missing or malformed.
 */
export function parseRoomManagerAction(body: unknown): RoomManagerAction | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  switch (b.type) {
    case 'closeAll':
    case 'closeRoom':
    case 'openRoom': {
      const eventRoomIds = idList(b.eventRoomIds);
      if (!eventRoomIds) return null;
      // roomId is only used client-side for grouping and is never sent to MP.
      const roomId = parseFilterId(b.roomId) ?? 0;
      return { type: b.type, roomId, eventRoomIds };
    }
    case 'toggleClosed': {
      const eventRoomId = parseFilterId(b.eventRoomId);
      if (eventRoomId === null || typeof b.closed !== 'boolean') return null;
      return { type: 'toggleClosed', eventRoomId, closed: b.closed };
    }
    case 'toggleAutoClose': {
      const eventRoomId = parseFilterId(b.eventRoomId);
      if (eventRoomId === null || typeof b.autoClose !== 'boolean') return null;
      return { type: 'toggleAutoClose', eventRoomId, autoClose: b.autoClose };
    }
    case 'setCheckInCapacity': {
      const eventRoomId = parseFilterId(b.eventRoomId);
      const capacity = nullableInt(b.capacity, MAX_CAPACITY);
      if (eventRoomId === null || capacity === undefined) return null;
      return { type: 'setCheckInCapacity', eventRoomId, capacity };
    }
    case 'setBalancePriority': {
      const eventRoomId = parseFilterId(b.eventRoomId);
      const priority = nullableInt(b.priority, MAX_PRIORITY);
      if (eventRoomId === null || priority === undefined) return null;
      return { type: 'setBalancePriority', eventRoomId, priority };
    }
    case 'checkOut':
    case 'checkIn': {
      const eventParticipantId = parseFilterId(b.eventParticipantId);
      if (eventParticipantId === null) return null;
      return { type: b.type, eventParticipantId };
    }
    case 'changeRoom': {
      const eventParticipantId = parseFilterId(b.eventParticipantId);
      const newRoomId = b.newRoomId === null ? null : parseFilterId(b.newRoomId);
      if (eventParticipantId === null) return null;
      if (b.newRoomId !== null && newRoomId === null) return null;
      return { type: 'changeRoom', eventParticipantId, newRoomId };
    }
    case 'moveGroup': {
      const eventRoomId = parseFilterId(b.eventRoomId);
      const newRoomId = parseFilterId(b.newRoomId);
      if (eventRoomId === null || newRoomId === null) return null;
      return { type: 'moveGroup', eventRoomId, newRoomId };
    }
    default:
      return null;
  }
}
