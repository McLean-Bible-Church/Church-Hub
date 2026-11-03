import { NextResponse } from 'next/server';
import { auth } from '@church/nextjs-auth';
import { getNavigationData } from '@church/database/neon';

/**
 * GET /api/nav
 * Returns categories with their accessible applications for building the nav.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Deny by default: no "show everything" fallback when role data is missing.
    const navData = await getNavigationData(
      session.roles || [],
      session.email || null,
      session.isAdmin === true
    );

    return NextResponse.json({
      categories: navData.map((cat) => ({
        id: cat.id,
        name: cat.name,
        key: cat.key,
        icon: cat.icon,
        route: cat.route,
        addActionUrl: cat.addActionUrl,
        addActionLabel: cat.addActionLabel,
        apps: cat.apps.map((app) => ({
          id: app.id,
          name: app.name,
          key: app.key,
          route: app.route,
          icon: app.icon,
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching nav data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
