import { NextResponse } from 'next/server';
import { auth } from '@church/nextjs-auth';
import { getCongregations, getHouseholdCongregation } from '@/services/counterService';

/**
 * GET /api/counter/congregations
 *
 * Intentionally session-only (no app permission check): CampusContext calls this
 * on every app page to populate the campus picker. It returns only the list of
 * active congregations plus the signed-in user's own household congregation (the
 * household ID comes from the session, not the request), so no other person's data.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = session.householdId ? parseInt(session.householdId, 10) : null;

    const [congregations, householdCongregation] = await Promise.all([
      getCongregations(),
      householdId ? getHouseholdCongregation(householdId) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      congregations,
      userDefaultCongregation: householdCongregation,
    });
  } catch (error) {
    console.error('Error fetching congregations:', error);
    return NextResponse.json({ error: 'Failed to fetch congregations' }, { status: 500 });
  }
}
