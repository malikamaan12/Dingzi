import { Link, useLocation } from 'wouter';
import { BellRing, CalendarDays, Car, Smartphone, UtensilsCrossed } from 'lucide-react';

const mobileTabs = [
  { label: 'KDS', url: '/admin/kds', icon: BellRing },
  { label: 'Tables', url: '/admin/tables', icon: CalendarDays },
  { label: 'Curbside', url: '/admin/drive-thru', icon: Car },
  { label: 'Menu', url: '/admin/menu', icon: UtensilsCrossed },
  { label: 'App & Push', url: '/admin/mobile-app', icon: Smartphone },
];

export function MobileStaffBottomNav() {
  const [location] = useLocation();

  return (
    <nav
      aria-label="Mobile staff navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="grid grid-cols-5 h-16">
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
