import { NextRequest, NextResponse } from 'next/server';
import { parseFilterId } from '@church/ministry-platform';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { parseDeleteEventMetric, parseUpdateEventMetric } from '@/lib/validation/counter';
import { getEventMetrics, updateEventMetric, deleteEventMetric } from '@/services/counterService';

type Params = { params: Promise<{ eventId: string }> };

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Confirm the Event_Metric record belongs to the event in the URL. */
async function metricBelongsToEvent(eventMetricId: number, eventId: number): Promise<boolean> {
  const metrics = await getEventMetrics(eventId);
  return metrics.some((m) => m.Event_Metric_ID === eventMetricId);
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiAppAccess('counter', 'view');
    if (!access.ok) return access.response;

    const eventId = parseFilterId((await params).eventId);
    if (eventId === null) {
      return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 });
    }

    const eventMetrics = await getEventMetrics(eventId);

    return NextResponse.json(eventMetrics);
  } catch (error) {
    console.error('Error fetching event metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch event metrics' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiAppAccess('counter', 'edit');
    if (!access.ok) return access.response;

    const eventId = parseFilterId((await params).eventId);
    if (eventId === null) {
      return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 });
    }

    const input = parseUpdateEventMetric(await readJson(request));
    if (!input) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!(await metricBelongsToEvent(input.eventMetricId, eventId))) {
      return NextResponse.json({ error: 'Event metric not found' }, { status: 404 });
    }

    await updateEventMetric(input.eventMetricId, input.data, access.userId!);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating event metric:', error);
    return NextResponse.json({ error: 'Failed to update event metric' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiAppAccess('counter', 'delete');
    if (!access.ok) return access.response;

    const eventId = parseFilterId((await params).eventId);
    if (eventId === null) {
      return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 });
    }

    const input = parseDeleteEventMetric(await readJson(request));
    if (!input) {
      return NextResponse.json({ error: 'Missing or invalid eventMetricId' }, { status: 400 });
    }

    if (!(await metricBelongsToEvent(input.eventMetricId, eventId))) {
      return NextResponse.json({ error: 'Event metric not found' }, { status: 404 });
    }

    await deleteEventMetric(input.eventMetricId, access.userId!);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting event metric:', error);
    return NextResponse.json({ error: 'Failed to delete event metric' }, { status: 500 });
  }
}
