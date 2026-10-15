'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/legislation', label: 'Legislation' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/profile', label: 'Profile' },
  { href: '/ratification', label: 'Ratification' },
  { href: '/advocate/dashboard', label: 'Advocate' },
  { href: '/admin', label: 'Admin' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="navigation-shell">
      <button
        className="nav-toggle"
        type="button"
        aria-controls="primary-navigation"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Close menu' : 'Menu'}
      </button>
      <nav
        id="primary-navigation"
        className="site-navigation"
        aria-label="Main navigation"
        data-open={open}
      >
        {links.map((link) => {
          const active = pathname === link.href
            || (link.href === '/advocate/dashboard' && pathname.startsWith('/advocate/'));

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
