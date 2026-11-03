import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { parseFilterId } from '@church/ministry-platform';
import { getRoomManagerData } from '@/services/roomManagerService';

export async function GET(request: NextRequest) {
  try {
    const access = await requireApiAppAccess('room-manager', 'view');
    if (!access.ok) return access.response;

    const eventIdParam = request.nextUrl.searchParams.get('eventId');
    if (!eventIdParam) {
      return NextResponse.json({ error: 'Missing required parameter: eventId' }, { status: 400 });
    }
    const eventId = parseFilterId(eventIdParam);
    if (eventId === null) {
      return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 });
    }

    const data = await getRoomManagerData(eventId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching room manager data:', error);
    return NextResponse.json({ error: 'Failed to fetch room manager data' }, { status: 500 });
  }
}
