import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { searchContacts } from '@/services/peopleSearchService';
import type { GlobalSearchResult } from '@/types/globalSearch';

export async function GET(request: NextRequest) {
  try {
    const access = await requireApiAppAccess('people-search', 'view');
    if (!access.ok) return access.response;

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 5;
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 20) : 5;

    if (!query) {
      return NextResponse.json([]);
    }

    const contacts = await searchContacts(query);

    // Slice to requested limit since searchContacts doesn't support limit parameter
    const limitedContacts = contacts.slice(0, limit);

    // Transform contacts to GlobalSearchResult format
    const results: GlobalSearchResult[] = limitedContacts.map((contact) => ({
      result_id: contact.Contact_ID,
      title:
        contact.Nickname || contact.First_Name
          ? `${contact.Nickname || contact.First_Name} ${contact.Last_Name}`
          : contact.Display_Name,
      subtitle: contact.Email_Address || undefined,
      metadata: contact.__Age ? `Age: ${contact.__Age}` : undefined,
      image_url: contact.Image_GUID
        ? `${process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL}/${contact.Image_GUID}?$thumbnail=true`
        : undefined,
      route: `/people/search?q=${encodeURIComponent(query)}&contactId=${contact.Contact_ID}`,
      app_key: 'people-search',
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error in people-search global search:', error);
    return NextResponse.json({ error: 'Failed to search contacts' }, { status: 500 });
  }
}
