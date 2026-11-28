import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Circle,
  Download,
  EyeOff,
  PauseCircle,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import { OpenCafeAccount } from '@/components/open-cafe-account';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Restaurant } from '@shared/schema';

interface LifecyclePayload {
  onboarding: {
    completedCount: number;
    totalCount: number;
    completionPct: number;
    checklist: { id: string; label: string; done: boolean }[];
  };
  impact: {
    tenantName: string | null;
    otherTenantBranchesCount: number;
    categoriesCount: number;
    menuItemsCount: number;
    ordersCount: number;
    settledRevenue: string;
    currency: string;
    activeTicketsCount: number;
    reservationsCount: number;
    tablesCount: number;
    baysCount: number;
    smartTagsCount: number;
    staffMembersCount: number;
  };
}

export function SuperAdminLifecycleTab({ restaurant }: { restaurant: Restaurant }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [pauseReason, setPauseReason] = useState(
    restaurant.suspensionReason || 'Seasonal pause / offboarding requested by venue owner',
  );
  const [freezeExclusiveStaff, setFreezeExclusiveStaff] = useState(true);
  const [confirmDecommissionName, setConfirmDecommissionName] = useState('');
  const [archiveDownloaded, setArchiveDownloaded] = useState(false);

  const lifecycleQuery = useQuery<LifecyclePayload>({
    queryKey: [`/api/super-admin/restaurants/${restaurant.id}/lifecycle`],
  });

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurant.id}`] }),
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurant.id}/lifecycle`] }),
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/tenants'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] }),
    ]);

  const offboardMutation = useMutation({
    mutationFn: async (payload: {
      stage: 'hide_public' | 'pause_venue' | 'decommission';
      reason?: string;
      freezeExclusiveStaff?: boolean;
      confirmName?: string;
    }) => {
      const res = await apiRequest('POST', `/api/super-admin/restaurants/${restaurant.id}/offboard`, payload);
      return res.json();
    },
    onSuccess: async (_data, vars) => {
      await refreshAll();
      if (vars.stage === 'decommission') {
        toast({
          title: `${restaurant.name} permanently decommissioned`,
          description: 'Venue records and exclusive branch logins were cleanly removed.',
        });
        navigate('/super-admin');
        return;
      }
      toast({
        title:
          vars.stage === 'hide_public'
            ? 'Public menu hidden (Maintenance Mode)'
            : `${restaurant.name} paused & active sessions closed`,
        description: 'All menus, historical orders, and permanent QR codes remain safely stored.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Offboarding action failed', description: e.message, variant: 'destructive' }),
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/super-admin/restaurants/${restaurant.id}/reactivate`, {});
      return res.json();
    },
    onSuccess: async () => {
      await refreshAll();
      toast({
        title: `${restaurant.name} is live again`,
        description: 'Public menu, QR/NFC tags, and staff accounts are restored.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not reactivate venue', description: e.message, variant: 'destructive' }),
  });

  const data = lifecycleQuery.data;
  const onboarding = data?.onboarding;
  const impact = data?.impact;
  const isSuspended = restaurant.status === 'suspended';

  return (
    <div className="space-y-6" data-testid="panel-venue-lifecycle">
      {/* PART A: ONBOARDING LAUNCH READINESS */}
      <section className="rounded-2xl border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Onboarding Go-Live Checklist</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Verify every setup item is complete before handing tablets and QR stands to the venue team.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              className={
                onboarding?.completionPct === 100
                  ? 'bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] border-0 font-mono font-extrabold text-sm px-3 py-1'
                  : 'bg-[#EFEAFF] text-[#4B1FE0] border-0 font-mono font-bold text-sm px-3 py-1'
              }
              data-testid="badge-onboarding-readiness-pct"
            >
              {onboarding ? `${onboarding.completionPct}% Ready` : 'Checking…'}
            </Badge>
            <OpenCafeAccount id={restaurant.id} name={restaurant.name} />
          </div>
        </div>

        {onboarding && (
          <>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-[#6236FF] transition-all duration-300"
                style={{ width: `${onboarding.completionPct}%` }}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              {onboarding.checklist.map(item => (
                <div
                  key={item.id}
                  className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 text-sm ${
                    item.done ? 'bg-muted/20' : 'border-amber-500/40 bg-amber-500/5'
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-[#6236FF] shrink-0" aria-hidden="true" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  )}
                  <span className={item.done ? 'font-medium' : 'font-semibold'}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* PART B: DATA FOOTPRINT & PORTABLE ARCHIVE EXPORT */}
      <section className="rounded-2xl border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Archive className="w-5 h-5 text-[#6236FF]" />
              <span>Step 1 Before Offboarding · Export Full Venue Archive</span>
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Download a portable JSON snapshot of menus, historical orders, floor layout, smart tags, and staff roster for the client’s records.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setArchiveDownloaded(true);
              window.open(`/api/super-admin/restaurants/${restaurant.id}/offboarding-archive`, '_blank');
            }}
            data-testid="button-download-offboarding-archive"
            className="min-h-11 rounded-xl cursor-pointer gap-2"
          >
            <Download className="w-4 h-4 text-[#6236FF]" />
            <span>Download Full Archive (.json)</span>
          </Button>
        </div>

        {impact && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
            <div className="rounded-xl bg-muted/40 p-3">
              <span className="text-muted-foreground block">Catalog</span>
              <strong className="font-mono text-sm">
                {impact.categoriesCount} cats · {impact.menuItemsCount} items
              </strong>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <span className="text-muted-foreground block">Orders &amp; Revenue</span>
              <strong className="font-mono text-sm">
                {impact.ordersCount} ({impact.settledRevenue} {impact.currency})
              </strong>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <span className="text-muted-foreground block">Floor &amp; Tags</span>
              <strong className="font-mono text-sm">
                {impact.tablesCount} tables · {impact.smartTagsCount} tags
              </strong>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <span className="text-muted-foreground block">Team &amp; Brand Group</span>
              <strong className="font-mono text-sm">
                {impact.staffMembersCount} staff
                {impact.otherTenantBranchesCount > 0 ? ` · +${impact.otherTenantBranchesCount} sibling branches` : ''}
              </strong>
            </div>
          </div>
        )}
      </section>

      {/* PART C: 3-STAGE SAFE OFFBOARDING LADDER */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold">Offboarding Controls (Reversible Pause vs Permanent Removal)</h2>

        {/* Stage 1 & Stage 2: Reversible Controls */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Stage 1: Maintenance / Hide Public Menu */}
          <div className="rounded-2xl border bg-card p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm font-bold flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-[#6236FF]" />
                  <span>Option A · Hide Public Menu Only</span>
                </strong>
                <Badge variant="outline">Reversible</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Removes {restaurant.name} from the public directory and pauses guest QR ordering while keeping staff logins active for menu edits or renovations.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={offboardMutation.isPending || restaurant.hidden}
              onClick={() => offboardMutation.mutate({ stage: 'hide_public' })}
              className="min-h-11 rounded-xl cursor-pointer w-fit"
            >
              {restaurant.hidden ? 'Currently Hidden from Public' : 'Hide Public Menu'}
            </Button>
          </div>

          {/* Stage 2: Pause / Suspend Venue */}
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm font-bold flex items-center gap-2">
                {isSuspended ? (
                  <PlayCircle className="w-4 h-4 text-[#6236FF]" />
                ) : (
                  <PauseCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>{isSuspended ? 'Venue Currently Paused' : 'Option B · Pause Venue & Close Active Queue'}</span>
              </strong>
              <Badge variant={isSuspended ? 'destructive' : 'outline'}>
                {isSuspended ? 'Paused' : 'Recommended Offboard'}
              </Badge>
            </div>

            {isSuspended ? (
              <div className="space-y-3">
                {restaurant.suspensionReason && (
                  <p className="text-xs rounded-xl bg-muted p-3">
                    <strong>Reason:</strong> {restaurant.suspensionReason}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  All menus, QR codes, and historical orders are preserved. Reactivating immediately restores guest menus and unfreezes branch staff.
                </p>
                <Button
                  type="button"
                  disabled={reactivateMutation.isPending}
                  onClick={() => reactivateMutation.mutate()}
                  data-testid="button-reactivate-venue"
                  className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>Reactivate Venue Now</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={pauseReason}
                  onChange={e => setPauseReason(e.target.value)}
                  rows={2}
                  placeholder="Reason for pausing / offboarding…"
                  data-testid="input-offboard-pause-reason"
                  className="text-xs"
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={freezeExclusiveStaff}
                    onChange={e => setFreezeExclusiveStaff(e.target.checked)}
                    className="accent-[#6236FF]"
                  />
                  <span>Also freeze staff logins assigned exclusively to this branch</span>
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={offboardMutation.isPending || pauseReason.trim().length < 5}
                  onClick={() =>
                    offboardMutation.mutate({
                      stage: 'pause_venue',
                      reason: pauseReason.trim(),
                      freezeExclusiveStaff,
                    })
                  }
                  data-testid="button-pause-venue"
                  className="min-h-11 rounded-xl font-semibold cursor-pointer gap-2"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>Pause Venue (Keep Data &amp; QRs Safe)</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Stage 3: Permanent Decommission Danger Zone */}
        <div className="rounded-2xl border-2 border-destructive/35 bg-destructive/5 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <strong className="text-sm font-bold text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Option C · Permanent Decommission (Delete Venue &amp; Exclusive Logins)</span>
              </strong>
              <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                Permanently deletes <strong>{restaurant.name}</strong>, its menu items, orders, reservations, smart tags, and any staff logins that do not belong to another branch.
                {impact && impact.otherTenantBranchesCount > 0
                  ? ` Sibling branches (${impact.otherTenantBranchesCount}) and the multi-branch Tenant Owner account will NOT be affected.`
                  : ' Because this is the only branch in its tenant group, the empty tenant organization will also be removed.'}
              </p>
            </div>
            {archiveDownloaded && (
              <Badge className="bg-[#C8FF42] text-[#17132E] border-0">Archive Downloaded</Badge>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="confirm-decommission" className="text-xs">
                Type <strong>{restaurant.name}</strong> to unlock permanent deletion
              </Label>
              <Input
                id="confirm-decommission"
                value={confirmDecommissionName}
                onChange={e => setConfirmDecommissionName(e.target.value)}
                placeholder={restaurant.name}
                data-testid="input-confirm-decommission-name"
                className="min-h-11 bg-background"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={
                offboardMutation.isPending || confirmDecommissionName.trim() !== restaurant.name.trim()
              }
              onClick={() =>
                offboardMutation.mutate({
                  stage: 'decommission',
                  confirmName: confirmDecommissionName.trim(),
                })
              }
              data-testid="button-decommission-venue"
              className="min-h-11 px-5 rounded-xl font-semibold cursor-pointer gap-2 shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              <span>Permanently Decommission Venue</span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
