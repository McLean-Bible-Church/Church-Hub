import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { parseFilterId } from '@church/ministry-platform';
import { getContactById } from '@/services/peopleSearchService';

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

    const contact = await getContactById(contactId);

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
}
