import { requireAppAccess } from '@/lib/permissions';

/**
 * Server-side gate for the counter app. The page itself is a client component,
 * so authorization is enforced here: users without access are redirected to /403.
 * (The API routes it calls enforce the same permission independently.)
 */
export const dynamic = 'force-dynamic';

export default async function CounterLayout({ children }: { children: React.ReactNode }) {
  await requireAppAccess('counter');
  return children;
}
