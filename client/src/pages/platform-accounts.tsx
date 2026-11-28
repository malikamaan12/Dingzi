import { useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Network, Plus, RotateCcw, Search, ShieldCheck, Snowflake, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OpenCafeAccount } from '@/components/open-cafe-account';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { notifySessionChanged } from '@/lib/sessionSync';
import { usePlatformConfig } from '@/lib/usePlatformConfig';
import type { EffectiveStaffRole, Restaurant, User } from '@shared/schema';

type Account = Omit<User, 'password'> & {
  primaryStaffRole?: EffectiveStaffRole;
  tenantName?: string | null;
  assignedBranchCount?: number;
};

type TenantRecord = {
  id: string;
  name: string;
  slug: string | null;
  status: 'active' | 'suspended';
  maxBranches: number;
  ownerEmail: string | null;
  ownerName: string | null;
  staffCount: number;
  branches: { id: string; name: string; slug: string | null; status: string }[];
};

type Action = 'freeze' | 'unfreeze' | 'delete' | 'restore';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  tenant_owner: 'Tenant Admin',
  branch_manager: 'Branch Manager',
  host_cashier: 'Reception & Cashier',
  prep_barista: 'Order Prep / Barista',
};

const emptyForm = {
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  role: 'admin',
  restaurantName: '',
  maxBranches: 1,
};

const actionLabels = {
  freeze: 'Freeze account',
  unfreeze: 'Unfreeze account',
  delete: 'Delete account',
  restore: 'Restore account',
};

export default function PlatformAccounts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const platformCfg = usePlatformConfig();
  const accounts = useQuery<Account[]>({ queryKey: ['/api/super-admin/users'] });
  const cafes = useQuery<Restaurant[]>({ queryKey: ['/api/super-admin/restaurants'] });
  const tenantsQuery = useQuery<{ tenants: TenantRecord[] }>({ queryKey: ['/api/super-admin/tenants'] });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('current');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editor, setEditor] = useState<Account | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [action, setAction] = useState<{ account: Account; type: Action } | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, number>>({});

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/tenants'] }),
    ]);

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const res = await apiRequest('PATCH', `/api/super-admin/tenants/${id}`, patch);
      return res.json();
    },
    onSuccess: async () => {
      await refresh();
      toast({ title: 'Tenant organization updated' });
    },
    onError: (e: Error) => toast({ title: 'Could not update tenant', description: e.message, variant: 'destructive' }),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error('Choose an account');
      const body = {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      };
      if (editor === 'new') {
        await apiRequest('POST', '/api/super-admin/users', {
          ...body,
          password: form.password,
          ...(form.role === 'admin'
            ? { restaurantName: form.restaurantName, maxBranches: Number(form.maxBranches) || 1 }
            : {}),
        });
      } else {
        await apiRequest('PUT', `/api/super-admin/users/${editor.id}`, body);
      }
    },
    onSuccess: async () => {
      const ownSecurityChange =
        !!editor && editor !== 'new' && editor.id === user?.id && (form.password || form.role !== editor.role);
      setEditor(null);
      setForm(emptyForm);
      if (ownSecurityChange) {
        queryClient.clear();
        notifySessionChanged();
        window.location.href = '/login';
        return;
      }
      await refresh();
      toast({
        title: 'Account saved',
        description: 'Tenant Admins manage their own tenant branches and Reception/Prep teams.',
      });
    },
    onError: (e: Error) => setError(e.message),
  });

  const change = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error('Choose an account action');
      if (action.type === 'delete' && confirmation !== action.account.email) {
        throw new Error('Enter the account email to confirm deletion');
      }
      await apiRequest(
        action.type === 'delete' ? 'DELETE' : 'POST',
        `/api/super-admin/users/${action.account.id}${action.type === 'delete' ? '' : '/' + action.type}`,
        {},
      );
    },
    onSuccess: async () => {
      const type = action?.type;
      setAction(null);
      setConfirmation('');
      await refresh();
      toast({
        title:
          type === 'delete'
            ? 'Account deleted'
            : type === 'freeze'
              ? 'Account frozen'
              : type === 'restore'
                ? 'Account restored'
                : 'Account unfrozen',
        description: 'The café menu and permanent QR code are preserved.',
      });
    },
    onError: (e: Error) => setError(e.message),
  });

  const openAction = (account: Account, type: Action) => {
    setAction({ account, type });
    setError('');
    setConfirmation('');
  };
  const openEditor = (account: Account | 'new') => {
    setEditor(account);
    setError('');
    setForm(
      account === 'new'
        ? { ...emptyForm, maxBranches: platformCfg.defaultNewTenantMaxBranches }
        : {
            ...emptyForm,
            email: account.email,
            firstName: account.firstName || '',
            lastName: account.lastName || '',
            role: account.role,
          },
    );
  };

  if (accounts.isLoading || cafes.isLoading) {
    return (
      <div className="manager-panel p-8" role="status">
        Loading accounts…
      </div>
    );
  }
  if (accounts.isError || cafes.isError) {
    return (
      <div className="manager-panel p-8">
        Could not load accounts.{' '}
        <Button
          onClick={() => {
            void accounts.refetch();
            void cafes.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const all = accounts.data || [];
  const activeAdmins = all.filter(a => a.role === 'super_admin' && a.accountStatus === 'active').length;
  const filtered = all.filter(a => {
    const resolvedRole = a.role === 'super_admin' ? 'super_admin' : a.primaryStaffRole || 'tenant_owner';
    const matchesStatus = status === 'current' ? a.accountStatus !== 'deleted' : a.accountStatus === status;
    const matchesRole = roleFilter === 'all' || resolvedRole === roleFilter;
    const matchesQuery = `${a.email} ${a.firstName || ''} ${a.lastName || ''} ${a.tenantName || ''}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesStatus && matchesRole && matchesQuery;
  });

  const tenantList = tenantsQuery.data?.tenants || [];

  return (
    <div className="space-y-6">
      <div className="manager-section-heading">
        <div>
          <p className="manager-eyebrow">PLATFORM / TENANTS &amp; RBAC</p>
          <h1 className="text-3xl font-bold flex gap-3 items-center">
            <Users className="text-primary" />
            Tenants, Accounts &amp; Roles
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Provision Tenant Admins, set per-tenant branch quotas, and audit Reception, Cashier, and Order Prep accounts across the platform.
          </p>
        </div>
        <Button onClick={() => openEditor('new')} className="min-h-11 cursor-pointer">
          <Plus size={16} className="mr-2" />
          Add Tenant / Account
        </Button>
      </div>

      {/* Tenant Organizations & Branch Quota Controls */}
      {tenantList.length > 0 && (
        <section className="manager-panel p-5 space-y-4" data-testid="panel-super-tenants">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Network className="w-5 h-5 text-[#6236FF]" />
              <span>Tenant Organizations &amp; Branch Quotas ({tenantList.length})</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {tenantList.map(tenant => {
              const draftQuota = quotaDrafts[tenant.id] ?? tenant.maxBranches;
              return (
                <article key={tenant.id} className="rounded-2xl border p-4 space-y-3 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-[#6236FF]" />
                          <span>{tenant.name}</span>
                        </strong>
                        <Badge variant={tenant.status === 'active' ? 'outline' : 'destructive'}>
                          {tenant.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Owner: {tenant.ownerEmail || 'Unassigned'} · {tenant.branches.length}/{tenant.maxBranches}{' '}
                        branches · {tenant.staffCount} staff
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Max Branches:</Label>
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={draftQuota}
                        onChange={e =>
                          setQuotaDrafts(prev => ({
                            ...prev,
                            [tenant.id]: Math.max(1, Math.min(200, Number(e.target.value) || 1)),
                          }))
                        }
                        className="w-20 min-h-11 font-mono text-xs"
                      />
                      {draftQuota !== tenant.maxBranches && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={updateTenantMutation.isPending}
                          data-testid={`button-save-quota-${tenant.id}`}
                          onClick={() =>
                            updateTenantMutation.mutate({
                              id: tenant.id,
                              patch: { maxBranches: draftQuota },
                            })
                          }
                          className="min-h-11 rounded-xl bg-[#6236FF] text-white cursor-pointer"
                        >
                          Save Quota
                        </Button>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updateTenantMutation.isPending}
                      onClick={() =>
                        updateTenantMutation.mutate({
                          id: tenant.id,
                          patch: { status: tenant.status === 'active' ? 'suspended' : 'active' },
                        })
                      }
                      className="min-h-11 rounded-xl text-xs cursor-pointer"
                    >
                      {tenant.status === 'active' ? 'Suspend Org' : 'Activate Org'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="manager-panel p-5 flex gap-3">
        <ShieldCheck className="text-primary shrink-0" size={21} />
        <p className="text-sm text-muted-foreground">
          Each tenant has isolated Tenant Admin, Branch Manager, Reception &amp; Cashier, and Order Prep accounts. Freezing an account revokes active sessions immediately while keeping public guest menus online.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            aria-label="Search accounts"
            className="pl-9 min-h-11"
            placeholder="Find by email, name, or tenant…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Role filter"
          className="manager-select min-h-11"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="super_admin">Super Admins</option>
          <option value="tenant_owner">Tenant Admins</option>
          <option value="branch_manager">Branch Managers</option>
          <option value="host_cashier">Reception &amp; Cashier</option>
          <option value="prep_barista">Order Prep / Barista</option>
        </select>
        <select
          aria-label="Account status filter"
          className="manager-select min-h-11"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="current">Current accounts</option>
          <option value="active">Active accounts</option>
          <option value="frozen">Frozen accounts</option>
          <option value="deleted">Deleted accounts</option>
        </select>
      </div>

      {/* Accounts List */}
      <div className="space-y-3">
        {filtered.map(account => {
          const cafe = cafes.data?.find(c => c.userId === account.id);
          const resolvedRoleKey =
            account.role === 'super_admin' ? 'super_admin' : account.primaryStaffRole || 'tenant_owner';
          const protectedAccount =
            account.id === user?.id ||
            (account.role === 'super_admin' && account.accountStatus === 'active' && activeAdmins <= 1);
          return (
            <article key={account.id} className="manager-panel p-5 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-sm break-all">
                  {account.email}
                  {account.id === user?.id && <span className="manager-chip ml-2">You</span>}
                </h2>
                <p className="text-xs text-muted-foreground mt-2">
                  {[account.firstName, account.lastName].filter(Boolean).join(' ') || 'Account'} ·{' '}
                  {account.tenantName || cafe?.name || 'Platform Administration'}
                  {typeof account.assignedBranchCount === 'number' && account.role !== 'super_admin'
                    ? ` (${account.assignedBranchCount} ${account.assignedBranchCount === 1 ? 'branch' : 'branches'})`
                    : ''}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="manager-chip">{ROLE_LABELS[resolvedRoleKey] || 'Tenant Admin'}</span>
                  <span className={`manager-chip ${account.accountStatus !== 'active' ? 'text-destructive' : ''}`}>
                    {account.accountStatus === 'frozen'
                      ? 'Frozen'
                      : account.accountStatus === 'deleted'
                        ? 'Deleted'
                        : 'Active'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {cafe && <OpenCafeAccount id={cafe.id} name={cafe.name} />}
                {account.accountStatus === 'deleted' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Restore ${account.email}`}
                    onClick={() => openAction(account, 'restore')}
                  >
                    <RotateCcw size={14} className="mr-2" />
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Edit ${account.email}`}
                      onClick={() => openEditor(account)}
                    >
                      Edit account
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={protectedAccount}
                      title={
                        protectedAccount ? 'Your account and the last active super admin are protected' : undefined
                      }
                      aria-label={`${account.accountStatus === 'frozen' ? 'Unfreeze' : 'Freeze'} ${account.email}`}
                      onClick={() =>
                        openAction(account, account.accountStatus === 'frozen' ? 'unfreeze' : 'freeze')
                      }
                    >
                      <Snowflake size={14} className="mr-2" />
                      {account.accountStatus === 'frozen' ? 'Unfreeze' : 'Freeze'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={protectedAccount}
                      aria-label={`Delete ${account.email}`}
                      onClick={() => openAction(account, 'delete')}
                    >
                      <Trash2 size={14} className="mr-2" />
                      Delete
                    </Button>
                  </>
                )}
                {cafe && (
                  <Link href={`/super-admin/restaurant/${cafe.id}`}>
                    <Button variant="ghost" size="sm">
                      Café controls
                    </Button>
                  </Link>
                )}
              </div>
            </article>
          );
        })}
        {!filtered.length && <div className="manager-panel p-8 text-muted-foreground">No accounts match this view.</div>}
      </div>

      {/* Add / Edit Account Modal */}
      <Dialog
        open={!!editor}
        onOpenChange={open => {
          if (!open && !save.isPending) {
            setEditor(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor === 'new' ? 'Add Tenant Admin or Platform Account' : 'Edit account'}</DialogTitle>
            <DialogDescription>
              {editor === 'new'
                ? 'Provision a new Tenant Organization with its Tenant Admin and first branch, or add a Platform Super-Admin.'
                : 'Role and password changes sign this account out. At least one active super admin must remain.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <fieldset disabled={save.isPending} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="user-first">First name</Label>
                  <Input
                    id="user-first"
                    value={form.firstName}
                    required
                    maxLength={100}
                    onChange={e => setForm({ ...form, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="user-last">Last name</Label>
                  <Input
                    id="user-last"
                    value={form.lastName}
                    required
                    maxLength={100}
                    onChange={e => setForm({ ...form, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  required
                  maxLength={254}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="user-role">Role</Label>
                <select
                  id="user-role"
                  className="manager-select w-full"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  <option value="admin">Tenant Admin (New Organization)</option>
                  <option value="super_admin">Platform Super-Admin</option>
                </select>
              </div>
              {form.role === 'super_admin' && (
                <p className="text-sm text-muted-foreground">
                  This grants full access to every tenant, café, account, and platform control.
                </p>
              )}
              {editor === 'new' && form.role === 'admin' && (
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="user-restaurant">First Restaurant / Tenant Name</Label>
                    <Input
                      id="user-restaurant"
                      required
                      maxLength={150}
                      value={form.restaurantName}
                      onChange={e => setForm({ ...form, restaurantName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="user-max-branches">Branch Quota</Label>
                    <Input
                      id="user-max-branches"
                      type="number"
                      min={1}
                      max={200}
                      value={form.maxBranches}
                      onChange={e => setForm({ ...form, maxBranches: Number(e.target.value) || 1 })}
                    />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="user-password">{editor === 'new' ? 'Password' : 'New password (optional)'}</Label>
                <Input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={72}
                  required={editor === 'new'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {editor === 'new'
                    ? 'Use at least 10 characters. The Tenant Admin can then add their own Reception & Prep staff.'
                    : 'Leave blank to keep the current password.'}
                </p>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => {
                    setEditor(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : editor === 'new' ? 'Create account' : 'Save account'}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>

      {/* Freeze / Delete / Restore Confirmation Modal */}
      <Dialog
        open={!!action}
        onOpenChange={open => {
          if (!open && !change.isPending) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? actionLabels[action.type] : 'Account action'}</DialogTitle>
            <DialogDescription>{action?.account.email}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {action?.type === 'delete'
              ? 'This removes sign-in access and signs out all devices. The café, menu, photos and permanent QR remain. You can restore the user from Deleted accounts.'
              : action?.type === 'freeze'
                ? 'The user will be signed out on all devices and cannot sign in until you unfreeze the account. Their customer menu remains available.'
                : 'Sign-in access will be restored. The user must sign in again; previous sessions stay signed out.'}
          </p>
          {action?.type === 'delete' && (
            <div>
              <Label htmlFor="delete-email">Type the account email to confirm</Label>
              <Input
                id="delete-email"
                autoComplete="off"
                value={confirmation}
                onChange={e => setConfirmation(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={change.isPending} onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant={action?.type === 'delete' ? 'destructive' : 'default'}
              disabled={change.isPending || (action?.type === 'delete' && confirmation !== action.account.email)}
              onClick={() => change.mutate()}
            >
              {change.isPending ? 'Updating…' : action ? actionLabels[action.type] : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
