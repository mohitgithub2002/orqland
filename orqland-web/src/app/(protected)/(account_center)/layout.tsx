// [HOST SHIM] Your account-centre layout already exists — do not copy. Point its "Orqland Run" menu item to /orqland-run.
// Reproduces the account centre from the reference guide (p.7): profile card + settings menu on the left,
// the selected section in a large panel on the right. On phones the menu collapses so Run gets the full screen.
'use client';

import { Bell, Bike, ChevronLeft, ChevronRight, Compass, Heart, Inbox, LifeBuoy, LogOut, MapPin, Package, Plus, Scale, Shield, ShieldCheck, UserCog } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DevSwitcher } from '@/layouts/DevSwitcher';
import { cn } from '@/lib/utils';

const MENU = [
  { label: 'User settings', icon: UserCog, href: '#' },
  { label: 'Manage Addresses', icon: MapPin, href: '#' },
  { label: 'Orqland Run', icon: Bike, href: '/orqland-run' },
  { label: 'My orders', icon: Package, href: '/my-orders' },
  { label: 'Verification', icon: ShieldCheck, href: '#' },
  { label: 'Security', icon: Shield, href: '#' },
  { label: 'Notifications', icon: Bell, href: '#' },
  { label: 'Legal', icon: Scale, href: '#' },
  { label: 'Support', icon: LifeBuoy, href: '#' },
];
const TOP = [
  { label: 'Explore', icon: Compass, href: '/checkout-demo' },
  { label: 'Inbox', icon: Inbox, href: '#' },
  { label: 'Wishlist', icon: Heart, href: '#' },
  { label: 'My Activity', icon: Package, href: '/my-orders' },
  { label: 'Orqland Run', icon: Bike, href: '/orqland-run' },
];

export default function AccountCenterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const runPage = pathname === '/orqland-run';
  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 md:px-6">
        <Link href="/orders" className="text-xl font-semibold tracking-tight text-gray-900">
          Orqland
        </Link>
        <nav className="hidden items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-1 text-[12px] lg:flex" aria-label="Main">
          {TOP.map((t) => (
            <Link key={t.label} href={t.href} className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1', pathname === t.href ? 'bg-white font-medium shadow-sm' : 'text-gray-600')}>
              <t.icon className="size-3.5" /> {t.label}
            </Link>
          ))}
        </nav>
        <DevSwitcher />
      </header>
      <div className="mx-auto flex max-w-[1240px] gap-5 p-0 md:p-5">
        <aside className={cn('w-[300px] shrink-0 space-y-3', runPage ? 'hidden md:block' : 'hidden md:block')}>
          <div className="rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between text-gray-900">
              <span className="inline-flex items-center gap-1 text-sm font-semibold">
                <ChevronLeft className="size-4" /> Account
              </span>
              <Bell className="size-4 text-gray-500" />
            </div>
            <div className="mt-3 flex flex-col items-center gap-1">
              <span className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 text-xl font-semibold text-gray-700">You</span>
              <p className="mt-1 text-sm font-semibold text-gray-900">Signed-in user</p>
              <p className="font-mono text-[10px] text-gray-500">Orq ID</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
            <span className="flex size-8 items-center justify-center rounded-full bg-gray-100">
              <Plus className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">Create a Workspace</span>
              <span className="block text-[11px] text-gray-500">An account to sell, host or offer services</span>
            </span>
          </div>
          <nav className="rounded-2xl bg-white p-2" aria-label="Account">
            {MENU.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                aria-current={pathname === m.href ? 'page' : undefined}
                className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-gray-800', pathname === m.href ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50')}
              >
                <m.icon className="size-4" />
                <span className="flex-1">{m.label}</span>
                <ChevronRight className="size-4 text-gray-400" />
              </Link>
            ))}
            <span className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-gray-800">
              <LogOut className="size-4" /> Log out
            </span>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 rounded-none bg-white/60 md:rounded-2xl md:bg-[#e9eaec] md:p-5">{children}</main>
      </div>
    </div>
  );
}
