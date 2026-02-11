'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import clsx from 'clsx';
import {
  LayoutDashboard, Receipt, FileText, Users, Factory,
  ScrollText, Settings, Anchor, LogOut, Shield,
  Bell, Search,
} from 'lucide-react';

const topNav = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Hiring', href: '/hiring' },
  { name: 'Expenses', href: '/expenses' },
  { name: 'Invoices', href: '/invoices' },
  { name: 'Payroll', href: '/payroll' },
  { name: 'Production', href: '/production' },
  { name: 'Activity', href: '/audit' },
  { name: 'Anchoring', href: '/anchoring' },
  { name: 'DXEXPLORER', href: '/dxexplorer' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, currentOrg, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-nav">
        <div className="mx-auto max-w-[1600px] px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 shadow-purple transition-all group-hover:shadow-purple-lg">
                <span className="text-sm font-extrabold text-white">DX</span>
              </div>
              <span className="text-xl font-serif tracking-wide text-gray-900">DXER</span>
            </Link>

            {/* Center Navigation — Crextio pill style */}
            <nav className="hidden lg:flex items-center bg-surface-100 rounded-full px-1.5 py-1.5">
              {topNav.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={clsx(
                      'px-4 py-1.5 text-sm rounded-full transition-all duration-200',
                      isActive
                        ? 'bg-purple-600 text-white font-semibold shadow-purple'
                        : 'text-gray-400 hover:text-gray-700 font-medium',
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Right Side */}
            <div className="flex items-center gap-3">
              <Link href="/settings" className="flex h-9 items-center gap-1.5 rounded-full bg-surface-100 px-3 text-gray-400 hover:text-purple-600 transition-colors">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium hidden sm:inline">Setting</span>
              </Link>
              <button className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface-100 text-gray-400 hover:text-purple-600 transition-colors">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-purple-500 ring-2 ring-white" />
              </button>

              <button
                onClick={signOut}
                className="flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 hover:bg-surface-100 transition-all group"
              >
                <div className="h-8 w-8 overflow-hidden rounded-full ring-2 ring-purple-100">
                  <Image
                    src="/profile-photo.png"
                    alt={user?.fullName || 'User'}
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="lg:hidden overflow-x-auto border-b border-gray-100 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center gap-1 px-4 py-2">
          {topNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all',
                  isActive
                    ? 'bg-purple-600 text-white shadow-purple'
                    : 'text-gray-400 hover:text-gray-700',
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
