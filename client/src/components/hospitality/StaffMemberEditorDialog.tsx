import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, RefreshCw, ShieldCheck, Snowflake } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  CAPABILITY_LABELS,
  resolveStaffCapabilities,
  STAFF_CAPABILITY_KEYS,
  STAFF_ROLE_META,
  type StaffCapabilityKey,
  type StaffCapabilityOverrides,
} from '@shared/rbac';
import type { StaffRole } from '@shared/schema';

export interface TeamMemberRecord {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  accountStatus: string;
  isPrimaryTenantOwner: boolean;
  highestRole: StaffRole;
  hasPin: boolean;
  assignments: {
    id: string;
    restaurantId: string | null;
    branchName: string | null;
    tenantId: string | null;
    staffRole: StaffRole;
    capabilities: StaffCapabilityOverrides;
    hasPin: boolean;
  }[];
}

interface Props {
  member: TeamMemberRecord | null;
  onClose: () => void;
  canManageManagers: boolean;
  tenantBranches: { id: string; name: string }[];
  currentUserId?: string;
}

function generateSixDigitPin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

export function StaffMemberEditorDialog({
  member,
  onClose,
  canManageManagers,
  tenantBranches,
  currentUserId,
}: Props) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('host_cashier');
  const [applyTenantWide, setApplyTenantWide] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<StaffCapabilityOverrides>({});
  const [newPassword, setNewPassword] = useState('');
  const [stationPin, setStationPin] = useState('');
  const [clearPin, setClearPin] = useState(false);

  useEffect(() => {
    if (!member) return;
    setFirstName(member.firstName || '');
    setLastName(member.lastName || '');
    setStaffRole(member.highestRole);
    const tenantWide = member.assignments.some(a => a.tenantId && !a.restaurantId);
    setApplyTenantWide(tenantWide);
    const branchIds = member.assignments
      .map(a => a.restaurantId)
      .filter((x): x is string => Boolean(x));
    setSelectedBranches(branchIds.length ? branchIds : tenantBranches[0] ? [tenantBranches[0].id] : []);
    setCapabilities(member.assignments[0]?.capabilities || {});
    setNewPassword('');
    setStationPin('');
    setClearPin(false);
  }, [member, tenantBranches]);

  const effectiveCaps = resolveStaffCapabilities(staffRole, capabilities);

  const updateMutation = useMutation({
    mutationFn: async (extraPatch?: Record<string, any>) => {
      if (!member) return;
      const payload: Record<string, any> = extraPatch || {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        staffRole,
        applyTenantWide: staffRole === 'tenant_owner' ? true : applyTenantWide,
        ...(staffRole !== 'tenant_owner' && !applyTenantWide && selectedBranches.length
          ? { restaurantIds: selectedBranches }
          : {}),
        capabilities: staffRole === 'tenant_owner' ? {} : capabilities,
        ...(newPassword.trim() ? { newPassword: newPassword.trim() } : {}),
        ...(clearPin ? { stationPin: null } : stationPin.trim() ? { stationPin: stationPin.trim() } : {}),
      };
      const res = await apiRequest('PATCH', `/api/hospitality/team/${member.userId}`, payload);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/team'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/audit-log'] });
      toast({
        title: vars?.accountStatus
          ? vars.accountStatus === 'frozen'
            ? 'Staff account frozen & signed out'
            : 'Staff account reactivated'
          : 'Staff access & permissions updated',
        description: 'Active device sessions were refreshed immediately.',
      });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: 'Could not update staff member', description: e.message, variant: 'destructive' }),
  });

  if (!member) return null;

  const availableRoles: StaffRole[] = canManageManagers
    ? ['prep_barista', 'host_cashier', 'branch_manager', 'tenant_owner']
    : ['prep_barista', 'host_cashier'];

  const isSelfOrPrimary = member.isPrimaryTenantOwner || member.userId === currentUserId;

  function toggleCapability(key: StaffCapabilityKey, checked: boolean) {
    setCapabilities(prev => ({ ...prev, [key]: checked }));
  }

  function toggleBranch(branchId: string) {
    setSelectedBranches(prev =>
      prev.includes(branchId)
        ? prev.length > 1
          ? prev.filter(id => id !== branchId)
          : prev
        : [...prev, branchId],
    );
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={open => !open && !updateMutation.isPending && onClose()}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#6236FF]" />
            <span>Manage Staff Access</span>
          </DialogTitle>
          <DialogDescription>
            {member.email} · Saving role, branch, password, or PIN changes immediately signs out active sessions.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={e => {
            e.preventDefault();
            updateMutation.mutate(undefined);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">First Name</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} required className="min-h-11" />
            </div>
            <div>
              <Label className="text-xs">Last Name</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} required className="min-h-11" />
            </div>
          </div>

          {!member.isPrimaryTenantOwner && (
            <div className="space-y-2">
              <Label className="text-xs">Assigned Role</Label>
              <div className="grid grid-cols-2 gap-2">
                {availableRoles.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setStaffRole(r);
                      setCapabilities({});
                    }}
                    className={`p-3 rounded-xl border text-left text-xs transition-colors cursor-pointer ${
                      staffRole === r ? 'border-[#6236FF] bg-[#EFEAFF] text-[#17132E]' : 'border-border bg-card'
                    }`}
                  >
                    <strong className="block font-bold">{STAFF_ROLE_META[r].label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {staffRole !== 'tenant_owner' && (
            <div className="rounded-2xl border p-3.5 space-y-2.5 bg-muted/20">
              <span className="text-xs font-bold block">Granular Capability Overrides</span>
              {STAFF_CAPABILITY_KEYS.filter(
                k => staffRole === 'branch_manager' ? k === 'canManagePaymentVault' : k !== 'canManagePaymentVault',
              ).map(key => (
                <label key={key} className="flex items-center justify-between gap-3 text-xs cursor-pointer py-1">
                  <div>
                    <strong className="block">{CAPABILITY_LABELS[key].label}</strong>
                    <span className="text-muted-foreground">{CAPABILITY_LABELS[key].description}</span>
                  </div>
                  <Switch
                    checked={effectiveCaps[key]}
                    onCheckedChange={checked => toggleCapability(key, checked)}
                  />
                </label>
              ))}
            </div>
          )}

          {staffRole !== 'tenant_owner' && tenantBranches.length > 1 && (
            <div className="rounded-2xl border p-3.5 space-y-2.5">
              {canManageManagers && (
                <label className="flex items-center justify-between gap-2 text-xs font-semibold cursor-pointer">
                  <span>Access all branches in this tenant ({tenantBranches.length})</span>
                  <Switch checked={applyTenantWide} onCheckedChange={setApplyTenantWide} />
                </label>
              )}
              {!applyTenantWide && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {tenantBranches.map(b => {
                    const active = selectedBranches.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBranch(b.id)}
                        className={`min-h-11 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                          active ? 'bg-[#6236FF] text-white border-[#6236FF]' : 'bg-card border-border'
                        }`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div>
              <Label className="text-xs">Reset Password (optional)</Label>
              <Input
                type="password"
                minLength={10}
                maxLength={72}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className="min-h-11"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">6-Digit Station PIN</Label>
                {member.hasPin && !clearPin && (
                  <Badge variant="outline" className="text-[11px] font-mono">
                    PIN Active
                  </Badge>
                )}
              </div>
              <div className="flex gap-1.5 mt-1">
                <Input
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  disabled={clearPin}
                  value={stationPin}
                  onChange={e => setStationPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={member.hasPin ? 'Enter new 6-digit PIN' : 'e.g. 482910'}
                  data-testid="input-edit-station-pin"
                  className="min-h-11 font-mono tracking-widest"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setClearPin(false);
                    setStationPin(generateSixDigitPin());
                  }}
                  title="Generate random 6-digit PIN"
                  className="min-h-11 px-3 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              {member.hasPin && (
                <button
                  type="button"
                  onClick={() => {
                    setClearPin(v => !v);
                    setStationPin('');
                  }}
                  className="text-xs text-destructive underline mt-1 cursor-pointer"
                >
                  {clearPin ? 'Keep existing Station PIN' : 'Remove Station PIN'}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t">
            {!isSelfOrPrimary ? (
              <Button
                type="button"
                variant="outline"
                disabled={updateMutation.isPending}
                data-testid="button-toggle-freeze-staff"
                onClick={() =>
                  updateMutation.mutate({
                    accountStatus: member.accountStatus === 'frozen' ? 'active' : 'frozen',
                  })
                }
                className="min-h-11 rounded-xl cursor-pointer gap-1.5"
              >
                <Snowflake className="w-4 h-4" />
                <span>{member.accountStatus === 'frozen' ? 'Unfreeze Account' : 'Freeze Shift Access'}</span>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" /> Primary owner protected from self-freeze
              </span>
            )}

            <div className="flex gap-2 ms-auto">
              <Button type="button" variant="outline" onClick={onClose} className="min-h-11 rounded-xl cursor-pointer">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-staff-member"
                className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Access'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
