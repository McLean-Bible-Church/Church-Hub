import { NextResponse } from 'next/server';
import { auth } from '@church/nextjs-auth';
import { getAccessibleApplications } from '@church/database/neon';

/**
 * GET /api/permissions/apps
 *
 * Returns all applications the current user has access to.
 * Query params:
 *   - type: 'app' | 'dashboard' (optional filter)
 */
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'app' | 'dashboard' | null;

    // Deny by default: no "all apps" fallback when role data is missing.
    const apps = await getAccessibleApplications(
      session.roles || [],
      session.email || null,
      session.isAdmin === true,
      type === 'app' || type === 'dashboard' ? type : undefined
    );

    return NextResponse.json({
      apps: apps.map((app) => ({
        id: app.id,
        name: app.name,
        key: app.key,
        type: app.type,
        description: app.description,
        route: app.route,
        icon: app.icon,
        illustration: app.illustration,
        permission: {
          canView: app.permission.canView,
          canEdit: app.permission.canEdit,
          canDelete: app.permission.canDelete,
        },
      })),
    });
  } catch (error) {
    console.error('Error fetching accessible apps:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
