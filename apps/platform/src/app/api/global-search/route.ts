import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@church/nextjs-auth';
import { getAccessibleApplications } from '@church/database/neon';
import type {
  GlobalSearchResponse,
  GlobalSearchResult,
  AppNameMatch,
  AppContentResults,
  SearchableApp,
} from '@/types/globalSearch';

/**
 * Build the searchable apps list from Neon database.
 * Apps with a known search endpoint get `searchable: true`.
 */
const SEARCH_ENDPOINTS: Record<string, string> = {
  'people-search': '/api/people-search/global-search',
};

function toSearchableApp(app: {
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  route: string;
  type: 'app' | 'dashboard';
}): SearchableApp {
  const endpoint = SEARCH_ENDPOINTS[app.key] || null;
  return {
    key: app.key,
    name: app.name,
    description: app.description || '',
    icon: app.icon || 'circle',
    route: app.route,
    type: app.type,
    searchable: !!endpoint,
    search_endpoint: endpoint,
  };
}

/**
 * Find apps/dashboards that match the query by name (case-insensitive contains)
 */
function findMatchingApps(
  apps: SearchableApp[],
  query: string
): { apps: AppNameMatch[]; dashboards: AppNameMatch[] } {
  const lowerQuery = query.toLowerCase();
  const matches = apps
    .filter((app) => app.name.toLowerCase().includes(lowerQuery))
    .map((app) => ({
      key: app.key,
      name: app.name,
      description: app.description,
      icon: app.icon,
      route: app.route,
      type: app.type,
    }));

  return {
    apps: matches.filter((m) => m.type === 'app'),
    dashboards: matches.filter((m) => m.type === 'dashboard'),
  };
}

/**
 * Search an individual app's content endpoint
 */
async function searchAppContent(
  app: SearchableApp,
  query: string,
  baseUrl: string,
  cookies: string
): Promise<AppContentResults | null> {
  if (!app.searchable || !app.search_endpoint) {
    return null;
  }

  try {
    const url = `${baseUrl}${app.search_endpoint}?q=${encodeURIComponent(query)}&limit=4`;

    const response = await fetch(url, {
      headers: {
        Cookie: cookies,
      },
    });

    if (!response.ok) {
      console.error(`Global search: ${app.key} endpoint returned ${response.status}`);
      return null;
    }

    const results: GlobalSearchResult[] = await response.json();

    // Request 4, display 3, set has_more if 4 returned
    const hasMore = results.length === 4;
    const displayResults = hasMore ? results.slice(0, 3) : results;

    return {
      app_key: app.key,
      app_name: app.name,
      app_icon: app.icon,
      results: displayResults,
      has_more: hasMore,
    };
  } catch (error) {
    console.error(`Global search: Failed to search ${app.key}:`, error);
    return null;
  }
}

/**
 * Global Search Orchestrator
 *
 * Searches across all registered apps from Neon:
 * 1. Finds apps matching by name
 * 2. Calls each searchable app's endpoint in parallel
 * 3. Aggregates results
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
    }

    // Get accessible apps from Neon (respects permissions + is_active). Deny by
    // default: no "all apps" fallback when role data is missing. Each app's search
    // endpoint also enforces its own permission check.
    const dbApps = await getAccessibleApplications(
      session.roles || [],
      session.email || null,
      session.isAdmin === true
    );

    const apps = dbApps.map(toSearchableApp);

    // Get base URL for internal API calls
    const baseUrl = request.nextUrl.origin;
    const cookies = request.headers.get('cookie') || '';

    // Find apps and dashboards matching by name
    const { apps: matchingApps, dashboards: matchingDashboards } = findMatchingApps(apps, query);

    // Get searchable apps and call their endpoints in parallel
    const searchableApps = apps.filter((app) => app.searchable && app.search_endpoint);

    const contentResultsRaw = await Promise.all(
      searchableApps.map((app) => searchAppContent(app, query, baseUrl, cookies))
    );

    const contentResults = contentResultsRaw.filter(
      (result): result is AppContentResults => result !== null
    );

    const response: GlobalSearchResponse = {
      apps: matchingApps,
      dashboards: matchingDashboards,
      content_results: contentResults,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Global search error:', error);
    return NextResponse.json({ error: 'Failed to perform global search' }, { status: 500 });
  }
}
