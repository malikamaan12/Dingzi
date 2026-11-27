import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Building2,
  History,
  KeyRound,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  StaffMemberEditorDialog,
  type TeamMemberRecord,
} from '@/components/hospitality/StaffMemberEditorDialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  CAPABILITY_LABELS,
  formatEffectiveRoleTitle,
  resolveStaffCapabilities,
  STAFF_CAPABILITY_KEYS,
  STAFF_ROLE_META,
  type StaffCapabilityKey,
  type StaffCapabilityOverrides,
} from '@shared/rbac';
import type { AccessAudit, StaffRole } from '@shared/schema';

function generateSixDigitPin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

export default function AdminTeamPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // New Staff Provisioning State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('host_cashier');
  const [applyTenantWide, setApplyTenantWide] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<StaffCapabilityOverrides>({});
  const [stationPin, setStationPin] = useState('');

  // Modals & Audit Toggle
  const [editingMember, setEditingMember] = useState<TeamMemberRecord | null>(null);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchSlug, setNewBranchSlug] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const teamQuery = useQuery<{
    tenant: {
      id: string;
      name: string;
      slug: string | null;
      status: string;
      maxBranches: number;
      currentBranchesCount: number;
    };
    tenantBranches: { id: string; name: string; slug: string | null; status: string }[];
    primaryManager: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
    members: TeamMemberRecord[];
    assignments: {
      id: string;
      userId: string;
      restaurantId: string | null;
      tenantId: string | null;
      staffRole: StaffRole;
      email: string;
      firstName: string | null;
      lastName: string | null;
      createdAt: string;
    }[];
    callerRole: string;
    accessibleBranches: { id: string; name: string; slug: string | null; tenantId: string | null }[];
  }>({
    queryKey: ['/api/hospitality/team'],
  });

  const auditQuery = useQuery<{ logs: AccessAudit[] }>({
    queryKey: ['/api/hospitality/audit-log'],
    enabled: showAudit,
  });

  const canManageManagers = user?.role === 'super_admin' || user?.staffRole === 'tenant_owner';
  const tenantInfo = teamQuery.data?.tenant;
  const tenantBranches = teamQuery.data?.tenantBranches || [];
  const effectiveCaps = resolveStaffCapabilities(staffRole, capabilities);
  const canCreateBranch =
    canManageManagers &&
    Boolean(tenantInfo && (user?.role === 'super_admin' || tenantInfo.currentBranchesCount < tenantInfo.maxBranches));

  const addStaffMutation = useMutation({
    mutationFn: async () => {
      const targetBranchIds =
        staffRole === 'tenant_owner' || applyTenantWide
          ? undefined
          : selectedBranches.length
            ? selectedBranches
            : user?.cafeContext?.id
              ? [user.cafeContext.id]
              : undefined;
      const res = await apiRequest('POST', '/api/hospitality/team', {
        email: email.trim().toLowerCase(),
        ...(password.trim() ? { password } : {}),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        staffRole,
        applyTenantWide: staffRole === 'tenant_owner' ? true : applyTenantWide,
        ...(targetBranchIds ? { restaurantIds: targetBranchIds } : {}),
        ...(staffRole !== 'tenant_owner' && Object.keys(capabilities).length ? { capabilities } : {}),
        ...(stationPin.trim() ? { stationPin: stationPin.trim() } : {}),
      });
      return res.json();
    },
    onSuccess: data => {
      const pinNote = stationPin.trim() ? ` · Station PIN ${stationPin.trim()} active.` : '';
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setStationPin('');
      setCapabilities({});
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/team'] });
      toast({
        title: `Assigned ${formatEffectiveRoleTitle(staffRole, effectiveCaps)}`,
        description: `${data.user.email} can now sign into this tenant workspace${pinNote}`,
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not add team member', description: e.message, variant: 'destructive' }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await apiRequest('DELETE', `/api/hospitality/team/${assignmentId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/team'] });
      toast({ title: 'Staff assignment revoked & active sessions signed out' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not revoke access', description: e.message, variant: 'destructive' }),
  });

  const createBranchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/branches', {
        name: newBranchName.trim(),
        slug: newBranchSlug.trim() || null,
        address: newBranchAddress.trim() || null,
        switchImmediately: true,
      });
      return res.json();
    },
    onSuccess: data => {
      setNewBranchOpen(false);
      setNewBranchName('');
      setNewBranchSlug('');
      setNewBranchAddress('');
      if (data.user) queryClient.setQueryData(['/api/auth/user'], data.user);
      void queryClient.invalidateQueries();
      toast({
        title: `Created branch "${data.branch.name}"`,
        description: 'Switched active workspace to your new branch with its own permanent QR.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not create branch', description: e.message, variant: 'destructive' }),
  });

  const switchBranchMutation = useMutation({
    mutationFn: async (restaurantId: string) => {
      const res = await apiRequest('POST', '/api/hospitality/switch-branch', { restaurantId });
      return res.json();
    },
    onSuccess: updatedUser => {
      queryClient.setQueryData(['/api/auth/user'], updatedUser);
      void queryClient.invalidateQueries();
      toast({ title: `Switched workspace to ${updatedUser.cafeContext?.name || 'branch'}` });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not switch branch', description: e.message, variant: 'destructive' }),
  });

  const availableRoles: StaffRole[] = canManageManagers
    ? ['prep_barista', 'host_cashier', 'branch_manager', 'tenant_owner']
    : ['prep_barista', 'host_cashier'];

  function applyReceptionPreset(preset: 'both' | 'reception_only' | 'cashier_only') {
    setStaffRole('host_cashier');
    if (preset === 'both') {
      setCapabilities({ canManageTables: true, canSettlePos: true, canIssuePagers: true });
    } else if (preset === 'reception_only') {
      setCapabilities({ canManageTables: true, canSettlePos: false, canIssuePagers: true });
    } else {
      setCapabilities({ canManageTables: false, canSettlePos: true, canIssuePagers: true });
    }
  }

  function toggleBranchSelection(branchId: string) {
    setSelectedBranches(prev => {
      const base = prev.length ? prev : user?.cafeContext?.id ? [user.cafeContext.id] : [];
      return base.includes(branchId)
        ? base.length > 1
          ? base.filter(id => id !== branchId)
          : base
        : [...base, branchId];
    });
  }

  const activeBranchSelection = selectedBranches.length
    ? selectedBranches
    : user?.cafeContext?.id
      ? [user.cafeContext.id]
      : [];

  return (
    <div className="space-y-6 max-w-[1350px]" data-testid="page-tenant-team">
      {/* Tenant Organization & Branch Quota Banner */}
      <section className="rounded-3xl bg-[#17132E] text-white border border-[#241E42] p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#C8FF42] text-[#17132E] text-xs font-extrabold">
                Multi-Tenant RBAC Studio
              </span>
              {tenantInfo && (
                <span className="px-3 py-1 rounded-full bg-[#241E42] text-white/90 text-xs font-mono">
                  {tenantInfo.currentBranchesCount} / {tenantInfo.maxBranches} Branches Active
                </span>
              )}
              {user?.cafeContext?.name && (
                <span className="px-3 py-1 rounded-full bg-[#312959] text-white text-xs font-semibold">
                  Active Venue: {user.cafeContext.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight">
              {tenantInfo?.name || 'Tenant'} · Admin, Reception &amp; Staff Access
            </h1>
            <p className="text-sm text-white/75 max-w-2xl">
              Manage isolated Tenant Admins, Branch Managers, Front-Desk Receptionists, Cashiers, and Order Prep terminals — with per-staff capability switches and 6-digit Station PINs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canManageManagers && tenantInfo && (
              <Button
                type="button"
                disabled={!canCreateBranch}
                onClick={() => setNewBranchOpen(true)}
                data-testid="button-open-new-branch"
                title={
                  canCreateBranch
                    ? 'Create another branch in your tenant'
                    : `Quota full (${tenantInfo.currentBranchesCount}/${tenantInfo.maxBranches}) — ask Platform Super-Admin to increase maxBranches`
                }
                className="min-h-11 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-1.5"
              >
                <Building2 className="w-4 h-4" />
                <span>
                  {canCreateBranch
                    ? 'Add Branch'
                    : `Quota ${tenantInfo.currentBranchesCount}/${tenantInfo.maxBranches} Branches`}
                </span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAudit(v => !v)}
              data-testid="button-toggle-tenant-audit"
              className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5"
            >
              <History className="w-4 h-4" />
              <span>{showAudit ? 'Hide Audit Log' : 'Security Audit Log'}</span>
            </Button>
          </div>
        </div>

        {tenantBranches.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 pt-4 mt-4 border-t border-white/10">
            <span className="text-xs text-white/70 font-semibold me-1">Tenant Branches:</span>
            {tenantBranches.map(b => {
              const isCurrent = user?.cafeContext?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={isCurrent || switchBranchMutation.isPending}
                  onClick={() => switchBranchMutation.mutate(b.id)}
                  className={`min-h-11 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-[#C8FF42] text-[#17132E] font-extrabold'
                      : 'bg-[#241E42] text-white hover:bg-[#312959]'
                  }`}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>{b.name}</span>
                  {b.slug && <span className="font-mono opacity-75">({b.slug})</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Scoped Tenant Security Audit Trail */}
      {showAudit && (
        <section className="manager-panel p-5 sm:p-6 space-y-3" data-testid="panel-tenant-audit">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-[#6236FF]" />
              <span>Scoped Tenant Security &amp; Access Audit</span>
            </h2>
            <Badge variant="outline" className="font-mono text-xs">
              {(auditQuery.data?.logs || []).length} events
            </Badge>
          </div>
          {auditQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading tenant audit events…</p>
          ) : (auditQuery.data?.logs || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No recorded mutations for this scope yet.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y text-xs">
              {(auditQuery.data?.logs || []).slice(0, 30).map(entry => (
                <div key={entry.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#4B1FE0]">{entry.action}</span>
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {entry.actorRole}
                    </Badge>
                    <span className="text-muted-foreground">{entry.actorEmail}</span>
                    {entry.cafeName && <span className="font-semibold">· {entry.cafeName}</span>}
                  </div>
                  <span className="font-mono text-muted-foreground">
                    HTTP {entry.status} · {new Date(entry.createdAt).toLocaleString('en-GB')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Provision Tenant Admin, Manager, Reception, Cashier, or Prep Account */}
      <form
        onSubmit={e => {
          e.preventDefault();
          addStaffMutation.mutate();
        }}
        className="manager-panel p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-[#6236FF]" />
            <span>Add Tenant Admin, Reception, Cashier, or Prep Account</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyReceptionPreset('reception_only')}
              data-testid="button-preset-reception-only"
              className="min-h-11 px-3 rounded-xl border text-xs font-semibold hover:bg-[#EFEAFF] hover:text-[#4B1FE0] transition-colors cursor-pointer"
            >
              Preset: Reception / Host Only
            </button>
            <button
              type="button"
              onClick={() => applyReceptionPreset('cashier_only')}
              data-testid="button-preset-cashier-only"
              className="min-h-11 px-3 rounded-xl border text-xs font-semibold hover:bg-[#EFEAFF] hover:text-[#4B1FE0] transition-colors cursor-pointer"
            >
              Preset: Counter Cashier Only
            </button>
            <button
              type="button"
              onClick={() => applyReceptionPreset('both')}
              className="min-h-11 px-3 rounded-xl border text-xs font-semibold hover:bg-[#EFEAFF] hover:text-[#4B1FE0] transition-colors cursor-pointer"
            >
              Preset: Reception + Cashier
            </button>
          </div>
        </div>

        {/* Role Selector Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {availableRoles.map(roleKey => {
            const info = STAFF_ROLE_META[roleKey];
            const selected = staffRole === roleKey;
            return (
              <button
                key={roleKey}
                type="button"
                data-testid={`button-role-${roleKey}`}
                onClick={() => {
                  setStaffRole(roleKey);
                  setCapabilities({});
                }}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                  selected ? 'border-[#6236FF] bg-[#EFEAFF]/70' : 'border-border bg-card'
                }`}
              >
                <strong className="block text-sm">{info.label}</strong>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{info.summary}</p>
              </button>
            );
          })}
        </div>

        {/* Capability Fine-Tuning Switches */}
        {staffRole !== 'tenant_owner' && (
          <div className="rounded-2xl border bg-[#F6F5FC] dark:bg-muted/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#17132E] dark:text-foreground">
                Role Capabilities ({formatEffectiveRoleTitle(staffRole, effectiveCaps)})
              </span>
              <span className="text-xs text-muted-foreground">
                Toggle individual Reception, Cashier, Pager, or 86 permissions for this login
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {STAFF_CAPABILITY_KEYS.filter((k: StaffCapabilityKey) =>
                staffRole === 'branch_manager' ? k === 'canManagePaymentVault' : k !== 'canManagePaymentVault',
              ).map(key => (
                <label
                  key={key}
                  className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3 text-xs cursor-pointer"
                >
                  <div>
                    <strong className="block font-semibold">{CAPABILITY_LABELS[key].label}</strong>
                    <span className="text-muted-foreground">{CAPABILITY_LABELS[key].description}</span>
                  </div>
                  <Switch
                    checked={effectiveCaps[key]}
                    onCheckedChange={checked => setCapabilities(prev => ({ ...prev, [key]: checked }))}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Identity, Password & Optional 6-Digit Station PIN */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">First Name *</Label>
            <Input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Noor"
              required
              className="min-h-11"
            />
          </div>
          <div>
            <Label className="text-xs">Last Name *</Label>
            <Input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Al-Thani"
              required
              className="min-h-11"
            />
          </div>
          <div>
            <Label className="text-xs">Staff Login Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="reception@venue.qa"
              required
              className="min-h-11"
            />
          </div>
          <div>
            <Label className="text-xs">Initial Password (10+ chars)</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="min-h-11"
            />
          </div>
          <div>
            <Label className="text-xs">6-Digit Station PIN (optional)</Label>
            <div className="flex gap-1.5">
              <Input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={stationPin}
                onChange={e => setStationPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="482910"
                data-testid="input-staff-station-pin"
                className="min-h-11 font-mono tracking-widest"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setStationPin(generateSixDigitPin())}
                title="Generate random 6-digit PIN"
                data-testid="button-generate-station-pin"
                className="min-h-11 px-3 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Branch Scope Picker + Submit */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
          {staffRole !== 'tenant_owner' && tenantBranches.length > 1 ? (
            <div className="flex flex-wrap items-center gap-3">
              {canManageManagers && (
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <Switch checked={applyTenantWide} onCheckedChange={setApplyTenantWide} />
                  <span>All {tenantBranches.length} tenant branches</span>
                </label>
              )}
              {!applyTenantWide && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {tenantBranches.map(b => {
                    const checked = activeBranchSelection.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBranchSelection(b.id)}
                        className={`min-h-11 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                          checked ? 'bg-[#6236FF] text-white border-[#6236FF]' : 'bg-card border-border'
                        }`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#6236FF]" />
              Staff accounts are strictly isolated to {tenantInfo?.name || 'your tenant organization'}.
            </span>
          )}

          <Button
            type="submit"
            disabled={!email.trim() || !firstName.trim() || !lastName.trim() || addStaffMutation.isPending}
            data-testid="button-create-staff"
            className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{addStaffMutation.isPending ? 'Provisioning…' : 'Create / Assign Access'}</span>
          </Button>
        </div>
      </form>

      {/* Active & Frozen Tenant Roster */}
      <section className="manager-panel p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#6236FF]" />
            <span>Tenant &amp; Branch Access Roster</span>
          </h2>
          <Badge variant="outline" className="font-mono text-xs">
            {(teamQuery.data?.members || []).length} members
          </Badge>
        </div>

        {(teamQuery.data?.members || []).length === 0 ? (
          <p className="text-xs text-muted-foreground pt-2">
            No staff assignments found for this workspace yet.
          </p>
        ) : (
          <div className="space-y-2.5">
            {(teamQuery.data?.members || []).map(member => {
              const firstAssign = member.assignments[0];
              const resolvedCaps = resolveStaffCapabilities(member.highestRole, firstAssign?.capabilities);
              const roleBadge = formatEffectiveRoleTitle(member.highestRole, resolvedCaps);
              const isTenantWide = member.assignments.some(a => a.tenantId && !a.restaurantId);
              const canEditRow =
                canManageManagers ||
                (member.highestRole !== 'tenant_owner' && member.highestRole !== 'branch_manager');

              return (
                <article
                  key={member.userId}
                  data-testid={`row-staff-${member.email}`}
                  className="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">
                        {member.firstName} {member.lastName}
                      </strong>
                      <Badge className="bg-[#EFEAFF] text-[#4B1FE0] border border-[#E5E2F2]">
                        {roleBadge}
                      </Badge>
                      {member.isPrimaryTenantOwner && <Badge>Primary Tenant Admin</Badge>}
                      {member.hasPin && (
                        <Badge variant="outline" className="font-mono text-[11px]">
                          6-Digit PIN Ready
                        </Badge>
                      )}
                      {member.accountStatus === 'frozen' && (
                        <Badge variant="destructive">Frozen</Badge>
                      )}
                      {isTenantWide ? (
                        <Badge variant="outline" className="text-[11px]">
                          All Tenant Branches
                        </Badge>
                      ) : (
                        member.assignments.map(a =>
                          a.branchName ? (
                            <Badge key={a.id} variant="outline" className="text-[11px]">
                              {a.branchName}
                            </Badge>
                          ) : null,
                        )
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{member.email}</p>
                  </div>

                  {canEditRow && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid={`button-manage-staff-${member.email}`}
                        onClick={() => setEditingMember(member)}
                        className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                      >
                        <Settings2 className="w-4 h-4" />
                        <span>Manage Access</span>
                      </Button>
                      {!member.isPrimaryTenantOwner && firstAssign && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeMutation.mutate(firstAssign.id)}
                          disabled={revokeMutation.isPending}
                          className="min-h-11 text-destructive hover:text-destructive cursor-pointer gap-1"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Revoke</span>
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <StaffMemberEditorDialog
        member={editingMember}
        onClose={() => setEditingMember(null)}
        canManageManagers={canManageManagers}
        tenantBranches={tenantBranches}
        currentUserId={user?.id}
      />

      {/* Self-Service New Branch Creation Modal */}
      <Dialog open={newBranchOpen} onOpenChange={open => !createBranchMutation.isPending && setNewBranchOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch Additional Tenant Branch</DialogTitle>
            <DialogDescription>
              Creates a new branch inside {tenantInfo?.name} ({tenantInfo?.currentBranchesCount}/{tenantInfo?.maxBranches}{' '}
              used) with its own permanent QR code and isolated live queue.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              createBranchMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <Label className="text-xs">Branch Name *</Label>
              <Input
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                placeholder="e.g. Lusail Marina Branch"
                required
                data-testid="input-new-branch-name"
                className="min-h-11"
              />
            </div>
            <div>
              <Label className="text-xs">Short Venue Slug (used for /v/:slug &amp; Station PIN sign-in)</Label>
              <Input
                value={newBranchSlug}
                onChange={e =>
                  setNewBranchSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, '-')
                      .replace(/-+/g, '-'),
                  )
                }
                placeholder="lusail-marina"
                data-testid="input-new-branch-slug"
                className="min-h-11 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Branch Address (optional)</Label>
              <Input
                value={newBranchAddress}
                onChange={e => setNewBranchAddress(e.target.value)}
                placeholder="Lusail Promenade, Doha"
                className="min-h-11"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewBranchOpen(false)}
                className="min-h-11 rounded-xl cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newBranchName.trim() || createBranchMutation.isPending}
                data-testid="button-confirm-new-branch"
                className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
              >
                {createBranchMutation.isPending ? 'Creating…' : 'Create Branch'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
