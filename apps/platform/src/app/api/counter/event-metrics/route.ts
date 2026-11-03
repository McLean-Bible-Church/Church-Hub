import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { parseCreateEventMetric } from '@/lib/validation/counter';
import { createEventMetric } from '@/services/counterService';

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiAppAccess('counter', 'edit');
    if (!access.ok) return access.response;

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      // fall through to validation error
    }

    const input = parseCreateEventMetric(body);
    if (!input) {
      return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
    }

    const eventMetric = await createEventMetric(input, access.userId!);

    return NextResponse.json(eventMetric, { status: 201 });
  } catch (error) {
    console.error('Error creating event metric:', error);
    return NextResponse.json({ error: 'Failed to create event metric' }, { status: 500 });
  }
}
