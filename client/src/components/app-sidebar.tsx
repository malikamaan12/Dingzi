import {
  LayoutDashboard,
  UtensilsCrossed,
  FolderOpen,
  Store,
  QrCode,
  LogOut,
  Building2,
  LibraryBig,
  Users,
  History,
  BellRing,
  CalendarDays,
  Car,
  Truck,
  BarChart3,
  Smartphone,
  Receipt,
  UserCog,
  Flame,
  Monitor,
  Network,
  SlidersHorizontal,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import type { AuthUser, EffectiveStaffRole } from "@shared/schema";
import { formatEffectiveRoleTitle } from "@shared/rbac";
import { logout } from '@/lib/logout';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { StaffBrand } from '@/components/staff-brand';

type NavItem = {
  title: string;
  url: string;
  icon: any;
  group: 'Live Service' | 'Menu & Floor' | 'Venue Setup';
  roles: EffectiveStaffRole[];
  testId?: string;
};

const MANAGER_ROLES: EffectiveStaffRole[] = ['super_admin', 'tenant_owner', 'branch_manager'];

const adminMenuItems: NavItem[] = [
  // Group 1: Live Service
  {
    title: "Portfolio Overview",
    url: "/admin/portfolio",
    icon: Network,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner'],
    testId: "link-portfolio-dashboard",
  },
  {
    title: "Branch Overview",
    url: "/admin",
    icon: LayoutDashboard,
    group: 'Live Service',
    roles: MANAGER_ROLES,
    testId: "link-dashboard",
  },
  {
    title: "Front Desk",
    url: "/admin/front-desk",
    icon: Store,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'host_cashier'],
    testId: "link-front-desk",
  },
  {
    title: "Counter Orders",
    url: "/admin/orders",
    icon: Receipt,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'host_cashier', 'prep_barista'],
  },
  {
    title: "Tables & Seating",
    url: "/admin/tables",
    icon: CalendarDays,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'host_cashier'],
  },
  {
    title: "Curbside Cars",
    url: "/admin/drive-thru",
    icon: Car,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'host_cashier', 'prep_barista'],
  },
  {
    title: "Kitchen Prep",
    url: "/admin/station",
    icon: Flame,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'prep_barista'],
    testId: "link-prep-station",
  },
  {
    title: "Pager Queue",
    url: "/admin/pagers",
    icon: BellRing,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'prep_barista'],
  },
  {
    title: "Customer QR Screen",
    url: "/admin/counter-display",
    icon: Monitor,
    group: 'Live Service',
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'host_cashier'],
    testId: "link-counter-qr-screen",
  },

  // Group 2: Menu & Floor
  {
    title: "Menu Items",
    url: "/admin/menu",
    icon: UtensilsCrossed,
    group: 'Menu & Floor',
    roles: MANAGER_ROLES,
  },
  {
    title: "Categories",
    url: "/admin/categories",
    icon: FolderOpen,
    group: 'Menu & Floor',
    roles: MANAGER_ROLES,
  },
  {
    title: "Global Menu Library",
    url: "/admin/library",
    icon: LibraryBig,
    group: 'Menu & Floor',
    roles: MANAGER_ROLES,
  },
  {
    title: "QR & NFC Tags",
    url: "/admin/qr-code",
    icon: QrCode,
    group: 'Menu & Floor',
    roles: MANAGER_ROLES,
    testId: "link-qr-code",
  },

  // Group 3: Venue Setup
  {
    title: "Venue Profile & Rules",
    url: "/admin/restaurant",
    icon: Store,
    group: 'Venue Setup',
    roles: MANAGER_ROLES,
  },
  {
    title: "Team & PINs",
    url: "/admin/team",
    icon: UserCog,
    group: 'Venue Setup',
    roles: MANAGER_ROLES,
  },
  {
    title: "Online & Delivery",
    url: "/admin/delivery",
    icon: Truck,
    group: 'Venue Setup',
    roles: MANAGER_ROLES,
  },
  {
    title: "Reports & Analytics",
    url: "/admin/analytics",
    icon: BarChart3,
    group: 'Venue Setup',
    roles: MANAGER_ROLES,
  },
  {
    title: "Push & Mobile Alerts",
    url: "/admin/mobile-app",
    icon: Smartphone,
    group: 'Venue Setup',
    roles: MANAGER_ROLES,
  },
  {
    title: "Account & Backup",
    url: "/admin/settings",
    icon: Store,
    group: 'Venue Setup',
    roles: MANAGER_ROLES,
  },
];

const superAdminMenuItems = [
  { title: "Global Menu Library", url: "/admin/library", icon: LibraryBig },
  { title: "Restaurants", url: "/super-admin", icon: Building2 },
  { title: 'Accounts & Roles', url: '/super-admin/accounts', icon: Users },
  { title: 'Platform CMS & Defaults', url: '/super-admin/settings', icon: SlidersHorizontal },
  { title: 'Access History', url: '/super-admin/access-history', icon: History },
  { title: 'My Account', url: '/super-admin/account', icon: Store },
];

const STAFF_ROLE_LABELS: Record<EffectiveStaffRole, string> = {
  super_admin: 'Super Admin',
  tenant_owner: 'Tenant Owner',
  branch_manager: 'Branch Manager',
  host_cashier: 'Host / Cashier',
  prep_barista: 'Barista / Prep',
};

interface AppSidebarProps {
  user?: AuthUser | null;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const { toast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [location, isMobile, setOpenMobile]);

  const isSuperAdmin = user?.role === "super_admin";
  const effectiveRole: EffectiveStaffRole =
    user?.staffRole || (isSuperAdmin ? 'super_admin' : 'branch_manager');
  const hasMultiBranchAccess = (user?.accessibleBranches?.length || 0) > 1;

  const filteredAdminItems = adminMenuItems.filter(item => {
    if (item.url === '/admin/portfolio') {
      return effectiveRole === 'tenant_owner' || effectiveRole === 'super_admin' || hasMultiBranchAccess;
    }
    if (effectiveRole === 'host_cashier') {
      if (item.url === '/admin/tables' && user?.capabilities?.canManageTables === false) return false;
      if (item.url === '/admin/orders' && user?.capabilities?.canSettlePos === false) return false;
    }
    return item.roles.includes(effectiveRole);
  });

  const sidebarTitle = formatEffectiveRoleTitle(effectiveRole, user?.capabilities) || STAFF_ROLE_LABELS[effectiveRole];
  const groupsOrder: NavItem['group'][] = ['Live Service', 'Menu & Floor', 'Venue Setup'];

  return (
    <Sidebar className="staff-sidebar">
      <SidebarContent>
        <div className="staff-sidebar-brand"><StaffBrand compact/></div>

        {isSuperAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel className="staff-nav-label">
              {sidebarTitle}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {superAdminMenuItems.map(item => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : effectiveRole === 'host_cashier' || effectiveRole === 'prep_barista' ? (
          /* Clean Single-Group Desk Menu for Reception, Cashiers & Prep */
          <SidebarGroup>
            <SidebarGroupLabel className="staff-nav-label">
              {sidebarTitle}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredAdminItems.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={item.testId || `link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          /* Scannable 3-Group Menu for Managers & Tenant Owners */
          groupsOrder.map(groupName => {
            const groupItems = filteredAdminItems.filter(i => i.group === groupName);
            if (!groupItems.length) return null;
            return (
              <SidebarGroup key={groupName}>
                <SidebarGroupLabel className="staff-nav-label">
                  {groupName}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {groupItems.map(item => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.url}
                          data-testid={item.testId || `link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Link href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })
        )}

        {isSuperAdmin && user?.cafeContext && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-primary font-bold truncate">
              Café workspace · {user.cafeContext.name}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.filter(i => i.url !== '/admin/library').map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="staff-sidebar-account">
          <span>{(user?.firstName?.[0] || user?.email?.[0] || 'M').toUpperCase()}</span>
          <div>
            <strong>{user?.firstName || 'Your account'}</strong>
            <small>{sidebarTitle}</small>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          disabled={loggingOut}
          onClick={async () => {
            setLoggingOut(true);
            try {
              await logout();
            } catch (e) {
              setLoggingOut(false);
              toast({ title: 'Could not sign out', description: (e as Error).message, variant: 'destructive' });
            }
          }}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
