import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@church/nextjs-auth';
import { parseFilterId } from '@church/ministry-platform';

/**
 * POST /api/admin/simulation/impersonate
 *
 * Start impersonating another user. Admin only.
 * Stores impersonation data in a cookie.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();

    // Check if user is an administrator
    if (!session?.email || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    // Must be a positive integer: it is later placed in an MP $filter
    const contactId = parseFilterId(body?.contactId);

    if (contactId === null) {
      return NextResponse.json({ error: 'Valid Contact ID is required' }, { status: 400 });
    }

    // Store impersonation in a cookie
    const cookieStore = await cookies();
    cookieStore.set(
      'admin-simulation',
      JSON.stringify({
        type: 'impersonate',
        contactId,
        adminUserId: session.userId,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 4, // 4 hours
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error starting impersonation:', error);
    return NextResponse.json({ error: 'Failed to start impersonation' }, { status: 500 });
  }
}
