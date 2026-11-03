import { NextResponse } from 'next/server';
import { auth } from '@church/nextjs-auth';
import { db, searchHistory, applications, categories } from '@church/database';
import { eq, desc } from 'drizzle-orm';
import { getAccessibleApplications } from '@church/database/neon';

const MAX_HISTORY_ITEMS = 10;

/**
 * GET /api/search/history
 * Returns the user's recent search history, filtered against current permissions.
 * Enriches app/dashboard entries with category info from Neon.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.contactId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contactId = parseInt(session.contactId, 10);

    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    // Get user's search history
    const history = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.contactId, contactId))
      .orderBy(desc(searchHistory.clickedAt))
      .limit(MAX_HISTORY_ITEMS * 2);

    if (history.length === 0) {
      return NextResponse.json({ history: [] });
    }

    // Get user's accessible apps to filter history
    // Deny by default: no "everything is accessible" fallback when role data is missing.
    const accessibleApps = await getAccessibleApplications(
      session.roles || [],
      session.email || null,
      session.isAdmin === true
    );
    const accessibleRoutes = new Set(accessibleApps.map((app) => app.route));

    // Get all apps with their category info for enrichment
    const appsWithCategories = await db
      .select({
        appRoute: applications.route,
        appIcon: applications.icon,
        appName: applications.name,
        categoryName: categories.name,
        categoryIcon: categories.icon,
      })
      .from(applications)
      .leftJoin(categories, eq(applications.categoryId, categories.id))
      .where(eq(applications.isActive, true));

    const appLookup = new Map(appsWithCategories.map((a) => [a.appRoute, a]));
    const knownAppRoutes = new Set(appsWithCategories.map((a) => a.appRoute));

    // Filter history
    const filteredHistory = history
      .filter((entry) => {
        if (entry.resultType === 'app' || entry.resultType === 'dashboard') {
          if (knownAppRoutes.has(entry.resultRoute)) {
            return accessibleRoutes.has(entry.resultRoute);
          }
          return true;
        }
        return true;
      })
      .slice(0, MAX_HISTORY_ITEMS);

    return NextResponse.json({
      history: filteredHistory.map((entry) => {
        const appInfo = appLookup.get(entry.resultRoute);
        return {
          id: entry.id,
          type: entry.resultType,
          resultId: entry.resultId,
          title: entry.resultTitle,
          subtitle: entry.resultSubtitle,
          route: entry.resultRoute,
          icon: entry.resultIcon,
          imageUrl: entry.resultImageUrl,
          clickedAt: entry.clickedAt,
          // Category info from Neon (only for registered apps)
          categoryName: appInfo?.categoryName || null,
          categoryIcon: appInfo?.categoryIcon || null,
        };
      }),
    });
  } catch (error) {
    console.error('Search history error:', error);
    return NextResponse.json({ error: 'Failed to fetch search history' }, { status: 500 });
  }
}
