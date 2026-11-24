import { Link, useLocation } from 'wouter';
import { BellRing, CalendarDays, Car, Receipt, Smartphone, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { EffectiveStaffRole } from '@shared/schema';

export function MobileStaffBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const role: EffectiveStaffRole =
    user?.staffRole || (user?.role === 'super_admin' ? 'super_admin' : 'branch_manager');

  const mobileTabs =
    role === 'kds_barista'
      ? [
          { label: 'KDS', url: '/admin/kds', icon: BellRing },
          { label: 'Curbside', url: '/admin/drive-thru', icon: Car },
          { label: 'Orders', url: '/admin/orders', icon: Receipt },
          { label: 'App & Push', url: '/admin/mobile-app', icon: Smartphone },
        ]
      : role === 'host_cashier'
        ? [
            { label: 'KDS', url: '/admin/kds', icon: BellRing },
            { label: 'Tables', url: '/admin/tables', icon: CalendarDays },
            { label: 'Orders', url: '/admin/orders', icon: Receipt },
            { label: 'Curbside', url: '/admin/drive-thru', icon: Car },
            { label: 'App & Push', url: '/admin/mobile-app', icon: Smartphone },
          ]
        : [
            { label: 'KDS', url: '/admin/kds', icon: BellRing },
            { label: 'Orders', url: '/admin/orders', icon: Receipt },
            { label: 'Tables', url: '/admin/tables', icon: CalendarDays },
            { label: 'Menu', url: '/admin/menu', icon: UtensilsCrossed },
            { label: 'App & Push', url: '/admin/mobile-app', icon: Smartphone },
          ];

  return (
    <nav
      aria-label="Mobile staff navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div
        className="grid h-16"
        style={{ gridTemplateColumns: `repeat(${mobileTabs.length}, minmax(0, 1fr))` }}
      >
        {mobileTabs.map(tab => {
          const active = location === tab.url;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.url}
              href={tab.url}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 min-h-12 text-[11px] font-semibold transition-colors cursor-pointer ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
