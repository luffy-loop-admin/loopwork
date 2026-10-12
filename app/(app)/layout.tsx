import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireProfile } from '@/lib/auth';
import { logout } from '@/app/actions/auth';
import NavLinks from '@/components/NavLinks';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile();
  const items =
    profile.role === 'admin'
      ? [
          { href: '/', label: 'Dashboard' },
          { href: '/search', label: 'Search' },
          { href: '/search/bulk', label: 'Bulk search' },
          { href: '/admin/orders', label: 'Orders & indexing' },
          { href: '/admin/vendors', label: 'Vendors' },
          { href: '/admin/sheets', label: 'Sheets' },
          { href: '/listings', label: 'All listings' },
        ]
      : [
          { href: '/', label: 'Dashboard' },
          { href: '/search', label: 'Search' },
          { href: '/search/bulk', label: 'Bulk search' },
          { href: '/listings', label: 'My listings' },
        ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="font-semibold text-ink no-underline">Guest Post Portal</Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted sm:inline">
              {profile.role === 'admin' ? 'Admin' : profile.vendor_name} · {profile.email}
            </span>
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm">Sign out</button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl"><NavLinks items={items} /></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
