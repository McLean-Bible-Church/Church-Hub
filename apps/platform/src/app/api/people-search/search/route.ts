import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { searchContacts } from '@/services/peopleSearchService';

export async function GET(request: NextRequest) {
  try {
    const access = await requireApiAppAccess('people-search', 'view');
    if (!access.ok) return access.response;

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const skipParam = searchParams.get('skip');

    if (!query) {
      return NextResponse.json([]);
    }

    const skip = skipParam && /^\d{1,5}$/.test(skipParam) ? parseInt(skipParam, 10) : 0;
    const contacts = await searchContacts(query, skip);

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error searching contacts:', error);
    return NextResponse.json({ error: 'Failed to search contacts' }, { status: 500 });
  }
}
