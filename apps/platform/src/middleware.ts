import { NextResponse, NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTenantBySlug, getTenantByDomain } from '@church/database/central/services/tenant';

const PLATFORM_DOMAIN = 'churchhub.dev';

/**
 * Parse tenant slug from hostname.
 * Returns the slug for *.churchhub.dev subdomains, or null for single-tenant mode.
 */
function parseTenantSlug(hostname: string): { slug: string | null; isCustomDomain: boolean } {
  // Strip port for comparison
  const host = hostname.split(':')[0];

  // localhost / 127.0.0.1 / *.vercel.app → single-tenant mode
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) {
    return { slug: null, isCustomDomain: false };
  }

  // *.churchhub.dev → extract subdomain as slug
  if (host.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const slug = host.replace(`.${PLATFORM_DOMAIN}`, '');
    // Ignore bare domain or multi-level subdomains
    if (slug && !slug.includes('.')) {
      return { slug, isCustomDomain: false };
    }
    return { slug: null, isCustomDomain: false };
  }

  // Any other domain → treat as custom domain
  return { slug: null, isCustomDomain: true };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes are not redirected to /signin; instead every /api route except the
  // NextAuth endpoints requires a session token here (401 JSON otherwise). This is
  // defense in depth only — each route handler still performs its own app-level
  // authorization via requireApiAppAccess / session checks.
  const isApiPath = pathname === '/api' || pathname.startsWith('/api/');
  const isPublicApiPath =
    pathname === '/api/auth' || pathname.startsWith('/api/auth/') || pathname === '/api/manifest'; // PWA manifest is fetched without credentials

  // Allow public paths (NextAuth endpoints, signin, home, error pages)
  const isPublicPath =
    isPublicApiPath ||
    pathname.startsWith('/_next') ||
    pathname === '/signin' ||
    pathname === '/' ||
    pathname === '/403' ||
    pathname === '/404' ||
    pathname === '/500' ||
    pathname === '/error';

  // --- Tenant Resolution ---
  const hostname = request.headers.get('host') ?? 'localhost';
  const { slug, isCustomDomain } = parseTenantSlug(hostname);

  let tenantHeaders: Record<string, string> | null = null;

  if (slug) {
    // Subdomain mode: look up by slug
    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return new NextResponse('Church not found', { status: 404 });
    }
    tenantHeaders = {
      'x-tenant-id': tenant.id,
      'x-tenant-slug': tenant.slug,
      'x-tenant-name': tenant.name,
      'x-tenant-mp-domain': tenant.mpDomain ?? '',
      'x-tenant-mp-client-id': tenant.mpClientId ?? '',
      'x-tenant-logo-url': tenant.logoUrl ?? '',
      'x-tenant-primary-color': tenant.primaryColor ?? '',
    };
  } else if (isCustomDomain) {
    // Custom domain mode: look up by domain
    const host = hostname.split(':')[0];
    const tenant = await getTenantByDomain(host);
    if (!tenant) {
      return new NextResponse('Church not found', { status: 404 });
    }
    tenantHeaders = {
      'x-tenant-id': tenant.id,
      'x-tenant-slug': tenant.slug,
      'x-tenant-name': tenant.name,
      'x-tenant-mp-domain': tenant.mpDomain ?? '',
      'x-tenant-mp-client-id': tenant.mpClientId ?? '',
      'x-tenant-logo-url': tenant.logoUrl ?? '',
      'x-tenant-primary-color': tenant.primaryColor ?? '',
    };
  }
  // else: single-tenant mode — no tenant headers, app uses env vars as before

  // --- Public paths: forward with tenant headers if present ---
  if (isPublicPath) {
    if (tenantHeaders) {
      const requestHeaders = new Headers(request.headers);
      for (const [key, value] of Object.entries(tenantHeaders)) {
        requestHeaders.set(key, value);
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  }

  // --- Auth Check ---
  try {
    let token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: '__Secure-next-auth.session-token',
    });

    // Fallback to non-secure cookie for development
    if (!token) {
      token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
        cookieName: 'next-auth.session-token',
      });
    }

    if (!token && isApiPath) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Redirect unauthenticated users to sign in
    if (!token) {
      console.log(`Middleware: No token, redirecting to signin from ${pathname}`);
      const signInUrl = new URL('/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    // User is authenticated — forward with tenant headers if present
    if (tenantHeaders) {
      const requestHeaders = new Headers(request.headers);
      for (const [key, value] of Object.entries(tenantHeaders)) {
        requestHeaders.set(key, value);
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware: Error checking auth:', error);
    if (isApiPath) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const signInUrl = new URL('/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|manifest.json|favicon.ico|icon.svg|assets/).*)'],
};
