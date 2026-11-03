import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { parseFilterDate, parseFilterId } from '@church/ministry-platform';
import { getEvents, getEventsWithRooms } from '@/services/counterService';

export async function GET(request: NextRequest) {
  try {
    // Used by both Counter and Room Manager (requireRooms=true) to pick an event
    const access = await requireApiAppAccess(['counter', 'room-manager'], 'view');
    if (!access.ok) return access.response;

    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    const congregationIdParam = searchParams.get('congregationId');

    if (!dateParam) {
      return NextResponse.json({ error: 'Missing required parameter: date' }, { status: 400 });
    }

    const date = parseFilterDate(dateParam);
    if (date === null) {
      return NextResponse.json({ error: 'Invalid date (expected YYYY-MM-DD)' }, { status: 400 });
    }

    let congregationId: number | null = null;
    if (congregationIdParam) {
      congregationId = parseFilterId(congregationIdParam);
      if (congregationId === null) {
        return NextResponse.json({ error: 'Invalid congregationId' }, { status: 400 });
      }
    }
    const requireRooms = searchParams.get('requireRooms') === 'true';
    const events = requireRooms
      ? await getEventsWithRooms(date, congregationId)
      : await getEvents(date, congregationId);

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
