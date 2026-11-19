// [HOST SHIM] Your dashboard layout already exists — do not copy. Only add the two sidebar links:
//   "My Orders / Bookings" → /orders   and   "Delivery" → /delivery
// Reproduces the Orqland dashboard chrome (header, collapsible sidebar, blue active item) for screenshots.
'use client';

import {
  BarChart3,
  Bell,
  Bike,
  Boxes,
  ChevronLeft,
  Copy,
  CreditCard,
  FileText,
  HelpCircle,
  Hammer,
  LayoutGrid,
  Mail,
  Receipt,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { DevSwitcher } from '@/layouts/DevSwitcher';

const NAV = [
  { label: 'My Orders / Bookings', icon: ShoppingBag, href: '/orders' },
  { label: 'My Listing', icon: FileText, href: '#' },
  { label: 'Inventory Management', icon: Boxes, href: '#' },
  { label: 'Delivery', icon: Bike, href: '/delivery' },
  { label: 'Payment Management', icon: CreditCard, href: '#' },
  { label: 'Workspace Management', icon: LayoutGrid, href: '#' },
  { label: 'Workspace Builder', icon: Hammer, href: '#' },
  { label: 'Analytics', icon: BarChart3, href: '#' },
  { label: 'Billing', icon: Receipt, href: '#' },
  { label: 'Access Control', icon: UserRound, href: '#' },
  { label: 'Notifications', icon: Bell, href: '#' },
  { label: 'Support', icon: HelpCircle, href: '#' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-[68px] items-center justify-between border-b border-border bg-[#f7f7f8] px-6">
        <Link href="/orders" className="relative text-2xl font-semibold tracking-tight text-gray-900">
          Orqland
          <span className="absolute -right-9 -top-1 rounded-full bg-sky-100 px-1.5 text-[9px] font-semibold uppercase text-sky-600">beta</span>
        </Link>
        <div className="flex items-center gap-5">
          <DevSwitcher />
          <button className="relative rounded-full border border-border bg-card p-2 text-gray-700" aria-label="Messages">
            <Mail className="size-4" />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
          </button>
          <div className="h-10 w-px bg-border" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-gray-900">Sj softwares</p>
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-gray-600">ORQS-ABCH-1234</span>
              <Copy className="size-3 text-gray-400" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 text-[10px] font-medium text-red-600">
              <span className="size-1.5 rounded-full bg-red-500" /> Closed
            </span>
          </div>
          <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-300 to-amber-300 text-sm font-semibold text-white">SJ</span>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-[196px] shrink-0 border-r border-border bg-card px-2 py-4 md:block">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-base font-bold text-gray-900">Dashboard</span>
            <ChevronLeft className="size-4 text-gray-500" />
          </div>
          <nav className="space-y-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[12.5px]',
                    active ? 'bg-primary font-medium text-primary-foreground shadow-sm' : 'text-gray-800 hover:bg-gray-100',
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
