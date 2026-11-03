import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { parseFilterId } from '@church/ministry-platform';
import { getContactById, getHouseholdWithMembers } from '@/services/peopleSearchService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const access = await requireApiAppAccess('people-search', 'view');
    if (!access.ok) return access.response;

    const { contactId: contactIdParam } = await params;
    const contactId = parseFilterId(contactIdParam);
    if (contactId === null) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    // Get contact to find household ID
    const contact = await getContactById(contactId);

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    if (!contact.Household_ID) {
      return NextResponse.json({
        Household: null,
        Members: [],
      });
    }

    // Get household with all members using stored procedure
    const result = await getHouseholdWithMembers(contact.Household_ID, contactId);

    if (!result) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching household:', error);
    return NextResponse.json({ error: 'Failed to fetch household' }, { status: 500 });
  }
}
