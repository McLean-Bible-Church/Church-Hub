import { describe, it, expect } from 'vitest';
import { parseCreateEventMetric, parseDeleteEventMetric, parseUpdateEventMetric } from './counter';
import { parseRoomManagerAction } from './roomManager';

describe('counter body validation', () => {
  it('accepts a valid create body and drops unknown fields', () => {
    expect(
      parseCreateEventMetric({ Event_ID: 1, Metric_ID: 2, Numerical_Value: 30, Domain_ID: 99 })
    ).toEqual({ Event_ID: 1, Metric_ID: 2, Numerical_Value: 30 });
  });

  it('rejects invalid create bodies', () => {
    expect(parseCreateEventMetric(null)).toBeNull();
    expect(
      parseCreateEventMetric({ Event_ID: '1 OR 1=1', Metric_ID: 2, Numerical_Value: 3 })
    ).toBeNull();
    expect(parseCreateEventMetric({ Event_ID: 1, Metric_ID: 2, Numerical_Value: -1 })).toBeNull();
    expect(parseCreateEventMetric({ Event_ID: 1, Metric_ID: 2, Numerical_Value: 1.5 })).toBeNull();
    expect(parseCreateEventMetric({ Event_ID: 1, Metric_ID: 2 })).toBeNull();
  });

  it('only allows Metric_ID and Numerical_Value in updates (no mass assignment)', () => {
    expect(
      parseUpdateEventMetric({ eventMetricId: 5, data: { Metric_ID: 2, Numerical_Value: 10 } })
    ).toEqual({ eventMetricId: 5, data: { Metric_ID: 2, Numerical_Value: 10 } });
    expect(parseUpdateEventMetric({ eventMetricId: 5, data: { Event_ID: 999 } })).toBeNull();
    expect(
      parseUpdateEventMetric({ eventMetricId: 5, data: { Numerical_Value: 1, Domain_ID: 2 } })
    ).toBeNull();
    expect(parseUpdateEventMetric({ eventMetricId: 5, data: {} })).toBeNull();
    expect(parseUpdateEventMetric({ eventMetricId: 'x', data: { Numerical_Value: 1 } })).toBeNull();
    expect(parseUpdateEventMetric({ eventMetricId: 5 })).toBeNull();
  });

  it('validates delete bodies', () => {
    expect(parseDeleteEventMetric({ eventMetricId: 7 })).toEqual({ eventMetricId: 7 });
    expect(parseDeleteEventMetric({ eventMetricId: '7; DROP' })).toBeNull();
    expect(parseDeleteEventMetric(undefined)).toBeNull();
  });
});

describe('room manager action validation', () => {
  it('accepts each valid action shape', () => {
    expect(parseRoomManagerAction({ type: 'closeAll', roomId: 1, eventRoomIds: [1, 2] })).toEqual({
      type: 'closeAll',
      roomId: 1,
      eventRoomIds: [1, 2],
    });
    expect(parseRoomManagerAction({ type: 'toggleClosed', eventRoomId: 3, closed: true })).toEqual({
      type: 'toggleClosed',
      eventRoomId: 3,
      closed: true,
    });
    expect(
      parseRoomManagerAction({ type: 'setCheckInCapacity', eventRoomId: 3, capacity: null })
    ).toEqual({ type: 'setCheckInCapacity', eventRoomId: 3, capacity: null });
    expect(parseRoomManagerAction({ type: 'checkOut', eventParticipantId: 9 })).toEqual({
      type: 'checkOut',
      eventParticipantId: 9,
    });
    expect(
      parseRoomManagerAction({ type: 'changeRoom', eventParticipantId: 9, newRoomId: null })
    ).toEqual({ type: 'changeRoom', eventParticipantId: 9, newRoomId: null });
    expect(parseRoomManagerAction({ type: 'moveGroup', eventRoomId: 1, newRoomId: 2 })).toEqual({
      type: 'moveGroup',
      eventRoomId: 1,
      newRoomId: 2,
    });
  });

  it('strips extra fields so they never reach MP', () => {
    const parsed = parseRoomManagerAction({
      type: 'toggleClosed',
      eventRoomId: 3,
      closed: false,
      Event_ID: 1,
      Room_ID: 5,
    });
    expect(parsed).toEqual({ type: 'toggleClosed', eventRoomId: 3, closed: false });
  });

  it('rejects malformed actions', () => {
    expect(parseRoomManagerAction(null)).toBeNull();
    expect(parseRoomManagerAction({ type: 'dropTable' })).toBeNull();
    expect(
      parseRoomManagerAction({ type: 'toggleClosed', eventRoomId: 3, closed: 'yes' })
    ).toBeNull();
    expect(parseRoomManagerAction({ type: 'closeRoom', eventRoomIds: [1, 'x'] })).toBeNull();
    expect(parseRoomManagerAction({ type: 'closeRoom', eventRoomIds: 'all' })).toBeNull();
    expect(
      parseRoomManagerAction({
        type: 'closeRoom',
        eventRoomIds: Array.from({ length: 201 }, (_, i) => i + 1),
      })
    ).toBeNull();
    expect(
      parseRoomManagerAction({ type: 'setCheckInCapacity', eventRoomId: 3, capacity: -5 })
    ).toBeNull();
    expect(parseRoomManagerAction({ type: 'checkIn', eventParticipantId: 0 })).toBeNull();
    expect(parseRoomManagerAction({ type: 'moveGroup', eventRoomId: 1 })).toBeNull();
  });
});
