import { parseFilterId } from '@church/ministry-platform';

/** Upper bound for a single attendance/metric count. */
export const MAX_METRIC_VALUE = 1_000_000;

export function parseMetricValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  if (value < 0 || value > MAX_METRIC_VALUE) return null;
  return value;
}

export type CreateEventMetricInput = {
  Event_ID: number;
  Metric_ID: number;
  Numerical_Value: number;
};

/** Validate a POST /api/counter/event-metrics body. Only whitelisted fields are returned. */
export function parseCreateEventMetric(body: unknown): CreateEventMetricInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const Event_ID = parseFilterId(b.Event_ID);
  const Metric_ID = parseFilterId(b.Metric_ID);
  const Numerical_Value = parseMetricValue(b.Numerical_Value);
  if (Event_ID === null || Metric_ID === null || Numerical_Value === null) return null;
  return { Event_ID, Metric_ID, Numerical_Value };
}

export type UpdateEventMetricInput = {
  eventMetricId: number;
  data: { Metric_ID?: number; Numerical_Value?: number };
};

/**
 * Validate a PUT /api/counter/event-metrics/[eventId] body.
 * Only `Metric_ID` and `Numerical_Value` may be changed (no mass assignment of
 * Event_ID, Domain_ID, Group_ID, etc.). Unknown fields are rejected.
 */
export function parseUpdateEventMetric(body: unknown): UpdateEventMetricInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const eventMetricId = parseFilterId(b.eventMetricId);
  if (eventMetricId === null) return null;

  const raw = b.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rawData = raw as Record<string, unknown>;

  const allowed = new Set(['Metric_ID', 'Numerical_Value']);
  if (Object.keys(rawData).some((k) => !allowed.has(k))) return null;

  const data: UpdateEventMetricInput['data'] = {};
  if ('Metric_ID' in rawData) {
    const metricId = parseFilterId(rawData.Metric_ID);
    if (metricId === null) return null;
    data.Metric_ID = metricId;
  }
  if ('Numerical_Value' in rawData) {
    const v = parseMetricValue(rawData.Numerical_Value);
    if (v === null) return null;
    data.Numerical_Value = v;
  }
  if (Object.keys(data).length === 0) return null;

  return { eventMetricId, data };
}

/** Validate a DELETE /api/counter/event-metrics/[eventId] body. */
export function parseDeleteEventMetric(body: unknown): { eventMetricId: number } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const eventMetricId = parseFilterId((body as Record<string, unknown>).eventMetricId);
  return eventMetricId === null ? null : { eventMetricId };
}
