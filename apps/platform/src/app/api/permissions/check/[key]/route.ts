import { NextResponse } from 'next/server';
import { auth } from '@church/nextjs-auth';
import { checkAppPermission } from '@church/database/neon';

/**
 * GET /api/permissions/check/[key]
 *
 * Check if the current user has access to a specific application.
 * Returns permission details.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { key } = await params;

    const permission = await checkAppPermission(
      key,
      session.roles || [],
      session.email || null,
      session.isAdmin === true
    );

    return NextResponse.json({
      key,
      ...permission,
    });
  } catch (error) {
    console.error('Error checking app permission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
