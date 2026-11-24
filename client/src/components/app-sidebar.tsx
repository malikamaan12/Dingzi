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
import { logout } from '@/lib/logout';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { StaffBrand } from '@/components/staff-brand';

const ALL_ROLE_ACCESS: EffectiveStaffRole[] = [
  'super_admin',
  'tenant_owner',
  'branch_manager',
  'host_cashier',
  'kds_barista',
];
const MANAGER_ROLES: EffectiveStaffRole[] = ['super_admin', 'tenant_owner', 'branch_manager'];

const adminMenuItems: {
  title: string;
  url: string;
  icon: any;
  roles: EffectiveStaffRole[];
}[] = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
    roles: MANAGER_ROLES,
  },
  {
    title: "Virtual Pager & KDS",
    url: "/admin/kds",
    icon: BellRing,
    roles: ALL_ROLE_ACCESS,
  },
  {
    title: "Orders & Receipts",
    url: "/admin/orders",
    icon: Receipt,
    roles: ALL_ROLE_ACCESS,
  },
  {
    title: "Tables & Waitlist",
    url: "/admin/tables",
    icon: CalendarDays,
    roles: ['super_admin', 'tenant_owner', 'branch_manager', 'host_cashier'],
  },
  {
    title: "Drive-Thru & Bays",
    url: "/admin/drive-thru",
    icon: Car,
    roles: ALL_ROLE_ACCESS,
  },
  {
    title: "Ordering & Delivery",
    url: "/admin/delivery",
    icon: Truck,
    roles: MANAGER_ROLES,
  },
  {
    title: "SLA Analytics",
    url: "/admin/analytics",
    icon: BarChart3,
    roles: MANAGER_ROLES,
  },
  {
    title: "Team & Branches",
    url: "/admin/team",
    icon: UserCog,
    roles: MANAGER_ROLES,
  },
  {
    title: "Mobile App & Push",
    url: "/admin/mobile-app",
    icon: Smartphone,
    roles: ALL_ROLE_ACCESS,
  },
  {
    title: "Café Profile & Theme",
    url: "/admin/restaurant",
    icon: Store,
    roles: MANAGER_ROLES,
  },
  {
    title: "Categories",
    url: "/admin/categories",
    icon: FolderOpen,
    roles: MANAGER_ROLES,
  },
  {
    title: "Menu Items",
    url: "/admin/menu",
    icon: UtensilsCrossed,
    roles: MANAGER_ROLES,
  },
  {
    title: "Account & Backup",
    url: "/admin/settings",
    icon: Store,
    roles: MANAGER_ROLES,
  },
  {
    title: "Global Menu Library",
    url: "/admin/library",
    icon: LibraryBig,
    roles: MANAGER_ROLES,
  },
  {
    title: "QR Code",
    url: "/admin/qr-code",
    icon: QrCode,
    roles: MANAGER_ROLES,
  },
];

const superAdminMenuItems = [
  { title: "Global Menu Library", url: "/admin/library", icon: LibraryBig },
  {
    title: "Restaurants",
    url: "/super-admin",
    icon: Building2,
  },
  { title: 'Accounts & Roles', url: '/super-admin/accounts', icon: Users },
  { title: 'Access History', url: '/super-admin/access-history', icon: History },
  { title: 'My Account', url: '/super-admin/account', icon: Store },
];

const STAFF_ROLE_LABELS: Record<EffectiveStaffRole, string> = {
  super_admin: 'Super Admin',
  tenant_owner: 'Tenant Owner',
  branch_manager: 'Branch Manager',
  host_cashier: 'Host / Cashier',
  kds_barista: 'KDS / Barista',
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
  const filteredAdminItems = adminMenuItems.filter(item => item.roles.includes(effectiveRole));
  const menuItems = isSuperAdmin ? superAdminMenuItems : filteredAdminItems;
  const sidebarTitle = STAFF_ROLE_LABELS[effectiveRole] || "Café Manager";

  return (
    <Sidebar className="staff-sidebar">
      <SidebarContent>
        <div className="staff-sidebar-brand"><StaffBrand compact/></div>
        <SidebarGroup>
          <SidebarGroupLabel className="staff-nav-label">
            {sidebarTitle}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
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
