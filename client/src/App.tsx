import { lazy, Suspense, useState } from 'react';
import AppErrorBoundary from '@/components/app-error-boundary';
import { logout } from '@/lib/logout';
import { useManagerMenu } from '@/lib/managerMenu';
import './staff-theme.css';
import { StaffThemeProvider, StaffThemeToggle } from '@/components/staff-theme';
import './manager.css';
import { PUBLIC_MENU_ORIGIN, MANAGEMENT_ORIGIN } from '@shared/menuIdentity';
const CafeSettings = lazy(() => import('@/pages/cafe-settings'));
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useSessionSync } from '@/lib/sessionSync';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, ShieldCheck } from "lucide-react";
const Home = lazy(() => import('@/pages/home'));
const Login = lazy(() => import('@/pages/login'));
const Register = lazy(() => import('@/pages/register'));
const AdminDashboard = lazy(() => import('@/pages/admin-dashboard'));
const AdminRestaurant = lazy(() => import('@/pages/admin-restaurant'));
const AdminCategories = lazy(() => import('@/pages/admin-categories'));
const AdminMenu = lazy(() => import('@/pages/admin-menu'));
const MenuLibrary = lazy(() => import('@/pages/menu-library'));
const PlatformAccounts = lazy(() => import('@/pages/platform-accounts'));
const AccessHistory = lazy(() => import('@/pages/access-history'));
import { returnToPlatform } from '@/lib/cafeAccess';
import { useToast } from '@/hooks/use-toast';
const AdminQRCode = lazy(() => import('@/pages/admin-qrcode'));
const AdminPagers = lazy(() => import('@/pages/admin-pagers'));
const AdminTables = lazy(() => import('@/pages/admin-tables'));
const AdminDriveThru = lazy(() => import('@/pages/admin-drive-thru'));
const AdminDelivery = lazy(() => import('@/pages/admin-delivery'));
const AdminAnalytics = lazy(() => import('@/pages/admin-analytics'));
const AdminMobileApp = lazy(() => import('@/pages/admin-mobile-app'));
const AdminOrders = lazy(() => import('@/pages/admin-orders'));
const AdminTeam = lazy(() => import('@/pages/admin-team'));
import { apiRequest } from '@/lib/queryClient';
import { MobileStaffBottomNav } from '@/components/mobile/MobileStaffBottomNav';
const VirtualPagerPage = lazy(() => import('@/pages/virtual-pager'));
const GuestWaitlistPage = lazy(() => import('@/pages/guest-waitlist'));
const GuestBookingPage = lazy(() => import('@/pages/guest-booking'));
import { VenueBySlugEntry, BayQrEntry, TableQrEntry, SmartTagEntry } from '@/pages/venue-slug-entry';
const SuperAdminDashboard = lazy(() => import('@/pages/super-admin-dashboard'));
const SuperAdminRestaurantDetail = lazy(() => import('@/pages/super-admin-restaurant-detail'));
const CustomerMenu = lazy(() => import('@/pages/customer-menu'));
const NotFound = lazy(() => import('@/pages/not-found'));

function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [exiting, setExiting] = useState(false);
  const { data: menu } = useManagerMenu();
  const cafe = menu?.restaurant;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      toast({ title: 'Could not sign out', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const getUserName = () => {
    if (!user) return "User";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    if (user.lastName) return user.lastName;
    return user.email || "User";
  };

  const getUserInitials = () => {
    if (!user) return "U";
    if (user.firstName && user.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    if (user.firstName) return user.firstName.substring(0, 2).toUpperCase();
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return "U";
  };

  return (
    <div className="manager-root flex h-dvh min-h-svh w-full overflow-hidden bg-background text-foreground">
      <AppSidebar user={user} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header
          style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))' }}
          className="manager-header flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3 pb-2.5 sm:p-4 border-b bg-background"
        >
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <div className="manager-cafe-title min-w-0">
            <strong>{cafe?.name || user?.cafeContext?.name || (user?.role === 'super_admin' ? 'Platform manager' : 'Café manager')}</strong>
            <small>{user?.email} · {user?.role === 'super_admin' ? 'Super admin' : (user?.staffRole || 'branch_manager').replace('_', ' ')}</small>
          </div>
          {(user?.accessibleBranches?.length || 0) > 1 && (
            <select
              aria-label="Switch active branch workspace"
              data-testid="select-branch-switcher"
              value={cafe?.id || user?.cafeContext?.id || ''}
              onChange={async e => {
                const nextId = e.target.value;
                if (!nextId) return;
                try {
                  const res = await apiRequest('POST', '/api/hospitality/switch-branch', { restaurantId: nextId });
                  const updated = await res.json();
                  queryClient.setQueryData(['/api/auth/user'], updated);
                  void queryClient.invalidateQueries();
                  toast({ title: `Switched to ${updated.cafeContext?.name || 'branch'}` });
                } catch (err) {
                  toast({ title: 'Could not switch branch', description: (err as Error).message, variant: 'destructive' });
                }
              }}
              className="manager-select order-last sm:order-none w-full sm:w-auto sm:max-w-[210px] font-semibold"
            >
              {(user?.accessibleBranches || []).map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <span className="staff-access-label hidden lg:inline-flex"><span/>{user?.role === 'super_admin' ? 'Platform access' : user?.tenantContext ? user.tenantContext.name : 'Café workspace'}</span>
          <StaffThemeToggle/>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full shrink-0"
                data-testid="button-user-menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={getUserName()} />
                  <AvatarFallback data-testid="text-user-initials">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none" data-testid="text-user-name">
                    {getUserName()}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground" data-testid="text-user-email">
                    {user?.email || ""}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} data-testid="button-logout" className="min-h-11 md:min-h-9 cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        {user?.role === 'super_admin' && user.cafeContext && <div className="cafe-access-banner" role="region" aria-label="Super admin café access"><ShieldCheck size={20}/><div><strong>Super admin · Managing {user.cafeContext.name}</strong><small>Café account: {user.cafeContext.owner?.email} · Signed in as {user.email}</small></div><Button variant="outline" size="sm" disabled={exiting} onClick={async () => { setExiting(true); try { await returnToPlatform(); } catch(e) { setExiting(false); toast({ title: 'Could not return to platform', description: (e as Error).message, variant: 'destructive' }); } }}>{exiting ? 'Returning…' : 'Return to platform'}</Button></div>}
        {['localhost', '127.0.0.1'].includes(window.location.hostname) && <div className="hidden sm:flex px-4 py-2 border-b bg-muted text-muted-foreground text-xs flex-wrap items-center gap-x-3 gap-y-1" role="note"><span>Isolated local workspace · Separate server &amp; database (Port {window.location.port || '5200'}).</span>{Boolean(import.meta.env.VITE_MANAGEMENT_ORIGIN) && <a className="text-primary underline font-medium" href={MANAGEMENT_ORIGIN + '/login'} target="_blank" rel="noreferrer">Open live staff dashboard ↗</a>}</div>}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3.5 pt-4 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] sm:p-6 sm:pb-24 md:p-8 md:pb-8">
          {children}
        </main>
        <MobileStaffBottomNav />
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const isGuestSurface =
    window.location.origin === PUBLIC_MENU_ORIGIN ||
    location.startsWith('/menu/') ||
    location.startsWith('/v/') ||
    location.startsWith('/pager/') ||
    location.startsWith('/waitlist/') ||
    location.startsWith('/booking/') ||
    location.startsWith('/bay/') ||
    location.startsWith('/table/') ||
    location.startsWith('/tag/');
  // The Worker separately enforces this boundary for direct URL requests.
  if (isGuestSurface) return (
    <Switch>
      <Route path="/menu/:id" component={CustomerMenu}/>
      <Route path="/v/:slug" component={VenueBySlugEntry}/>
      <Route path="/pager/:token" component={VirtualPagerPage}/>
      <Route path="/waitlist/:token" component={GuestWaitlistPage}/>
      <Route path="/booking/:token" component={GuestBookingPage}/>
      <Route path="/bay/:token" component={BayQrEntry}/>
      <Route path="/table/:token" component={TableQrEntry}/>
      <Route path="/tag/:token" component={SmartTagEntry}/>
      <Route path="/" component={Home}/>
      <Route component={NotFound}/>
    </Switch>
  );
  return <StaffThemeProvider><StaffRouter/></StaffThemeProvider>;
}
function StaffRouter() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (!isAuthenticated && !isLoading) {
    if (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/super-admin')) return <Redirect to="/login"/>;
    return (
      <div className="w-full">
        <Switch>
          <Route path="/menu/:id" component={CustomerMenu} />
          <Route path="/register"><Redirect to="/login"/></Route>
          <Route path="/login" component={Login} />
          <Route path="/" component={Home} />
          <Route component={Home} />
        </Switch>
      </div>
    );
  }

  if (isLoading) {
    if (location.startsWith('/admin') || location.startsWith('/super-admin')) return <div className="p-8" role="status">Checking account access…</div>;
    return (
      <div className="w-full">
        <Switch>
          <Route path="/menu/:id" component={CustomerMenu} />
          <Route path="/register"><Redirect to="/login"/></Route>
          <Route path="/login" component={Login} />
          <Route path="/" component={Home} />
          <Route component={Home} />
        </Switch>
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'super_admin';
  if (location.startsWith('/super-admin') && !isSuperAdmin) return <Redirect to="/admin"/>;
  if (isSuperAdmin && !user.cafeContext && location.startsWith('/admin') && location !== '/admin/library') return <Redirect to="/super-admin"/>;
  if (!['admin','super_admin'].includes(user?.role || '')) return <Redirect to="/login"/>;

  return (
    <div className="w-full">
      <Switch>
        <Route path="/menu/:id" component={CustomerMenu} />
        <Route path="/login"><Redirect to={isSuperAdmin ? '/super-admin' : '/admin'}/></Route>
        <Route path="/register"><Redirect to={isSuperAdmin ? '/super-admin/restaurants/new' : '/admin'}/></Route>
        <Route path="/super-admin/restaurants/new"><AdminLayout><Register/></AdminLayout></Route>
        
        <Route path="/">
          <Redirect to={isSuperAdmin ? '/super-admin' : '/admin'}/>
        </Route>
        <Route path="/admin">
          {user?.staffRole === 'prep_barista' || user?.staffRole === 'host_cashier' ? (
            <Redirect to="/admin/pagers" />
          ) : (
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          )}
        </Route>
        <Route path="/admin/restaurant">
          <AdminLayout>
            <AdminRestaurant />
          </AdminLayout>
        </Route>
        <Route path="/admin/categories">
          <AdminLayout>
            <AdminCategories />
          </AdminLayout>
        </Route>
        <Route path="/admin/menu">
          <AdminLayout>
            <AdminMenu />
          </AdminLayout>
        </Route>
        <Route path="/admin/settings"><AdminLayout><CafeSettings /></AdminLayout></Route>
        <Route path="/admin/library"><AdminLayout><MenuLibrary /></AdminLayout></Route>
        <Route path="/admin/pagers"><AdminLayout><AdminPagers /></AdminLayout></Route>
        <Route path="/admin/orders"><AdminLayout><AdminOrders /></AdminLayout></Route>
        <Route path="/admin/tables"><AdminLayout><AdminTables /></AdminLayout></Route>
        <Route path="/admin/drive-thru"><AdminLayout><AdminDriveThru /></AdminLayout></Route>
        <Route path="/admin/delivery"><AdminLayout><AdminDelivery /></AdminLayout></Route>
        <Route path="/admin/analytics"><AdminLayout><AdminAnalytics /></AdminLayout></Route>
        <Route path="/admin/team"><AdminLayout><AdminTeam /></AdminLayout></Route>
        <Route path="/admin/mobile-app"><AdminLayout><AdminMobileApp /></AdminLayout></Route>
        <Route path="/admin/qr-code">
          <AdminLayout>
            <AdminQRCode />
          </AdminLayout>
        </Route>
            <Route path="/super-admin/accounts"><AdminLayout><PlatformAccounts/></AdminLayout></Route>
            <Route path="/super-admin/access-history"><AdminLayout><AccessHistory/></AdminLayout></Route>
            <Route path="/super-admin/account"><AdminLayout><CafeSettings/></AdminLayout></Route>
            <Route path="/super-admin">
              <AdminLayout>
                <SuperAdminDashboard />
              </AdminLayout>
            </Route>
            <Route path="/super-admin/restaurant/:id">
              <AdminLayout>
                <SuperAdminRestaurantDetail />
              </AdminLayout>
            </Route>
            <Route path="/super-admin-dashboard">
              <AdminLayout>
                <SuperAdminDashboard />
              </AdminLayout>
            </Route>
        
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

export default function App() {
  useSessionSync();
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <AppErrorBoundary><Suspense fallback={<div className="p-8" role="status">Loading café application…</div>}><Router /></Suspense></AppErrorBoundary>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
