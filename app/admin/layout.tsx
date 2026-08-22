import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SectionLabel } from '@/components/ui/card';
import { getActor } from '@/lib/auth/session';

/**
 * The admin area.
 *
 * The gate is here as well as in the data-access layer, and the duplication is the point:
 * this one decides what a person SEES, and `requireAdmin` inside every query decides what
 * they can DO. A hidden nav link has never stopped anybody, so the queries refuse
 * independently of whether this layout let the request through.
 *
 * `notFound`-style behaviour rather than a "you are not an administrator" page: a
 * non-admin has no reason to learn that /admin exists.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();

  if (actor.kind !== 'user') redirect('/sign-in?next=/admin');
  if (!actor.isAdmin) redirect('/');

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <SectionLabel>Arena admin</SectionLabel>
        <nav className="flex flex-wrap gap-2">
          <AdminLink href="/admin/set-pieces">Briefs</AdminLink>
          <AdminLink href="/admin/tracks">Track licences</AdminLink>
          <AdminLink href="/drop">Back to the app</AdminLink>
        </nav>
      </header>
      {children}
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="border-line hover:bg-surface-sunken inline-flex min-h-[var(--arena-touch-target)] items-center rounded-md border px-3 text-sm"
    >
      {children}
    </Link>
  );
}
