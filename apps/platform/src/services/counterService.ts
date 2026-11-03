import {
  MinistryPlatformClient,
  TableService,
  ProcedureService,
  filterId,
  quoteFilterDate,
} from '@church/ministry-platform';

interface Event {
  Event_ID: number;
  Event_Title: string;
  Event_Start_Date: string;
  Event_End_Date: string;
  Congregation_ID: number;
  Event_Type_ID: number;
  Program_ID: number;
}

interface Metric {
  Metric_ID: number;
  Metric_Title: string;
}

interface EventMetric {
  Event_Metric_ID: number;
  Event_ID: number;
  Metric_ID: number;
  Numerical_Value: number;
  Group_ID?: number | null;
  [key: string]: unknown;
}

interface CreateEventMetric {
  Event_ID: number;
  Metric_ID: number;
  Numerical_Value: number;
  Domain_ID?: number;
  [key: string]: unknown;
}

interface Congregation {
  Congregation_ID: number;
  Congregation_Name: string;
}

// Create shared client and service instances
const mpClient = new MinistryPlatformClient();
const tableService = new TableService(mpClient);
const procedureService = new ProcedureService(mpClient);

/**
 * Get active congregations
 */
export async function getCongregations(): Promise<Congregation[]> {
  const today = quoteFilterDate(new Date().toISOString().split('T')[0]);

  return tableService.getTableRecords<Congregation>('Congregations', {
    $filter: `Start_Date <= ${today} AND (End_Date IS NULL OR End_Date >= ${today}) AND Available_Online = 1`,
    $select: 'Congregation_ID, Congregation_Name',
    $orderby: 'Congregation_Name',
  });
}

/**
 * Get events for a specific date and optionally a specific congregation
 * @param congregationId - Optional congregation ID. If null, returns events for all congregations
 */
export async function getEvents(
  eventDate: string,
  congregationId: number | null
): Promise<Event[]> {
  // Base filter - adjust Event_Type_ID and Ministry_ID as needed per church
  // quoteFilterDate/filterId throw FilterValueError on anything that is not a strict
  // YYYY-MM-DD date / positive integer, so user input can never alter the filter.
  let filter = `CAST(Events.Event_Start_Date AS DATE) = ${quoteFilterDate(eventDate)}`;

  // Add congregation filter if provided
  if (congregationId) {
    filter += ` AND Events.Congregation_ID = ${filterId(congregationId)}`;
  }

  return tableService.getTableRecords<Event>('Events', {
    $filter: filter,
    $select:
      'Events.Event_ID, Events.Event_Title, Events.Event_Start_Date, Events.Event_End_Date, Events.Congregation_ID, Events.Event_Type_ID, Events.Program_ID',
    $orderby: 'Event_Start_Date',
  });
}

/**
 * Get events that have at least one Event_Room, queried from Event_Rooms table.
 * Uses Event_ID_Table traversal to get event fields.
 */
export async function getEventsWithRooms(
  eventDate: string,
  congregationId: number | null
): Promise<Event[]> {
  let filter = `CAST(Event_ID_Table.Event_Start_Date AS DATE) = ${quoteFilterDate(eventDate)}`;

  if (congregationId) {
    filter += ` AND Event_ID_Table.Congregation_ID = ${filterId(congregationId)}`;
  }

  return tableService.getTableRecords<Event>('Event_Rooms', {
    $filter: filter,
    $select:
      'Event_ID_Table.Event_ID, Event_ID_Table.Event_Title, Event_ID_Table.Event_Start_Date, Event_ID_Table.Event_End_Date, Event_ID_Table.Congregation_ID, Event_ID_Table.Event_Type_ID, Event_ID_Table.Program_ID, Event_ID_Table_Event_Type_ID_Table.Event_Type',
    $orderby: 'Event_ID_Table.Event_Start_Date',
    $distinct: true,
  });
}

/**
 * Get all available metrics
 */
export async function getMetrics(): Promise<Metric[]> {
  return tableService.getTableRecords<Metric>('Metrics', {
    $select: 'Metric_ID, Metric_Title',
    $orderby: 'Metric_Title',
  });
}

/**
 * Get existing metrics for an event
 */
export async function getEventMetrics(eventId: number): Promise<EventMetric[]> {
  return tableService.getTableRecords<EventMetric>('Event_Metrics', {
    $filter: `Event_ID = ${filterId(eventId)}`,
    $select: 'Event_Metric_ID, Event_ID, Metric_ID, Numerical_Value, Group_ID',
    $orderby: 'Metric_ID',
  });
}

/**
 * Submit a new event metric
 */
export async function createEventMetric(
  data: CreateEventMetric,
  userId: number
): Promise<EventMetric> {
  const result = await tableService.createTableRecords<CreateEventMetric>(
    'Event_Metrics',
    [{ ...data, Domain_ID: 1 }],
    userId
  );
  return result[0] as unknown as EventMetric;
}

/**
 * Update an event metric
 */
export async function updateEventMetric(
  eventMetricId: number,
  data: Partial<CreateEventMetric>,
  userId: number
): Promise<void> {
  await tableService.updateTableRecords(
    'Event_Metrics',
    [{ Event_Metric_ID: eventMetricId, ...data }],
    userId
  );
}

/**
 * Delete an event metric
 */
export async function deleteEventMetric(eventMetricId: number, userId: number): Promise<void> {
  await tableService.deleteTableRecords('Event_Metrics', [eventMetricId], { $userId: userId });
}

/**
 * Get the congregation ID from a household record
 */
export async function getHouseholdCongregation(householdId: number): Promise<number | null> {
  const rows = await tableService.getTableRecords<{ Congregation_ID: number | null }>(
    'Households',
    {
      $filter: `Household_ID = ${filterId(householdId)}`,
      $select: 'Congregation_ID',
      $top: 1,
    }
  );
  return rows[0]?.Congregation_ID ?? null;
}
