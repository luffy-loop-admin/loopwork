'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto px-4 sm:px-6">
      {items.map((i) => {
        const active = i.href === '/' ? pathname === '/' : pathname === i.href || pathname.startsWith(i.href + '/');
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm no-underline ${
              active ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
