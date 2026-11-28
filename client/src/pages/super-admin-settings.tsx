import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Globe, KeyRound, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  DEFAULT_PLATFORM_CONFIG,
  SUPPORTED_CURRENCIES,
  resolvePlatformConfig,
  type PlatformConfig,
  type ResolvedPlatformConfig,
} from '@shared/venueConfig';

export default function SuperAdminSettingsPage() {
  const { toast } = useToast();
  const settingsQuery = useQuery<{ config: Partial<PlatformConfig> }>({
    queryKey: ['/api/super-admin/platform-settings'],
  });

  const [draft, setDraft] = useState<ResolvedPlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !hydrated) {
      setDraft(resolvePlatformConfig(settingsQuery.data.config));
      setHydrated(true);
    }
  }, [settingsQuery.data, hydrated]);

  const update = (patch: Partial<ResolvedPlatformConfig>) =>
    setDraft(prev => ({ ...prev, ...patch }));

  const saveMutation = useMutation({
    mutationFn: async (payload: ResolvedPlatformConfig) => {
      const res = await apiRequest('PUT', '/api/super-admin/platform-settings', payload);
      return res.json() as Promise<{ config: ResolvedPlatformConfig }>;
    },
    onSuccess: data => {
      setDraft(data.config);
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/platform-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/public/platform-config'] });
      toast({
        title: 'Platform settings saved',
        description: 'Public directory copy, login branding, and tenant onboarding defaults are live.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not save platform settings', description: e.message, variant: 'destructive' }),
  });

  if (settingsQuery.isLoading) {
    return (
      <div className="manager-panel p-8" role="status">
        Loading platform configuration…
      </div>
    );
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        saveMutation.mutate(draft);
      }}
      className="space-y-6 max-w-5xl"
      data-testid="page-super-admin-settings"
    >
      <div className="manager-section-heading">
        <div>
          <p className="manager-eyebrow">SUPER ADMIN · PLATFORM CMS &amp; DEFAULTS</p>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2.5">
            <SlidersHorizontal className="w-7 h-7 text-primary" />
            <span>Platform CMS &amp; Provisioning Defaults</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control all bilingual public directory headlines, pager lookup copy, staff login messaging, and new-tenant provisioning defaults from the backend.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saveMutation.isPending}
            onClick={() => setDraft({ ...DEFAULT_PLATFORM_CONFIG })}
            className="min-h-11 rounded-xl cursor-pointer gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset to Defaults</span>
          </Button>
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            data-testid="button-save-platform-settings"
            className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saveMutation.isPending ? 'Saving…' : 'Publish Platform Settings'}</span>
          </Button>
        </div>
      </div>

      {/* 1. Public Directory Hero & Pager Card Copy */}
      <section className="manager-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <span>Public Directory (`/`) Bilingual Copy</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Shown on the public venue discovery homepage in English and Arabic (`dir="rtl"`).
            </p>
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
            <Switch
              checked={draft.showStaffSignInLinkOnDirectory}
              onCheckedChange={showStaffSignInLinkOnDirectory => update({ showStaffSignInLinkOnDirectory })}
            />
            <span>Show Staff Console Link on `/`</span>
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ps-badge-en">Hero Pill Badge (EN)</Label>
            <Input
              id="ps-badge-en"
              value={draft.directoryBadgeEn}
              onChange={e => update({ directoryBadgeEn: e.target.value })}
              className="h-11"
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-badge-ar">Hero Pill Badge (AR)</Label>
            <Input
              id="ps-badge-ar"
              dir="rtl"
              value={draft.directoryBadgeAr}
              onChange={e => update({ directoryBadgeAr: e.target.value })}
              className="h-11"
              required
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ps-h1-en">Hero Headline Line 1 (EN)</Label>
            <Input
              id="ps-h1-en"
              value={draft.heroTitleLine1En}
              onChange={e => update({ heroTitleLine1En: e.target.value })}
              className="h-11"
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-h1-ar">Hero Headline Line 1 (AR)</Label>
            <Input
              id="ps-h1-ar"
              dir="rtl"
              value={draft.heroTitleLine1Ar}
              onChange={e => update({ heroTitleLine1Ar: e.target.value })}
              className="h-11"
              required
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ps-h2-en">Hero Accent Line 2 (EN)</Label>
            <Input
              id="ps-h2-en"
              value={draft.heroTitleLine2En}
              onChange={e => update({ heroTitleLine2En: e.target.value })}
              className="h-11"
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-h2-ar">Hero Accent Line 2 (AR)</Label>
            <Input
              id="ps-h2-ar"
              dir="rtl"
              value={draft.heroTitleLine2Ar}
              onChange={e => update({ heroTitleLine2Ar: e.target.value })}
              className="h-11"
              required
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ps-sub-en">Hero Subtitle (EN)</Label>
            <Textarea
              id="ps-sub-en"
              value={draft.heroSubtitleEn}
              onChange={e => update({ heroSubtitleEn: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-sub-ar">Hero Subtitle (AR)</Label>
            <Textarea
              id="ps-sub-ar"
              dir="rtl"
              value={draft.heroSubtitleAr}
              onChange={e => update({ heroSubtitleAr: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <Label htmlFor="ps-pager-title-en">Pager Lookup Card Title (EN)</Label>
            <Input
              id="ps-pager-title-en"
              value={draft.pagerCardTitleEn}
              onChange={e => update({ pagerCardTitleEn: e.target.value })}
              className="h-11"
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-pager-title-ar">Pager Lookup Card Title (AR)</Label>
            <Input
              id="ps-pager-title-ar"
              dir="rtl"
              value={draft.pagerCardTitleAr}
              onChange={e => update({ pagerCardTitleAr: e.target.value })}
              className="h-11"
              required
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ps-pager-sub-en">Pager Lookup Card Subtitle (EN)</Label>
            <Input
              id="ps-pager-sub-en"
              value={draft.pagerCardSubtitleEn}
              onChange={e => update({ pagerCardSubtitleEn: e.target.value })}
              className="h-11"
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-pager-sub-ar">Pager Lookup Card Subtitle (AR)</Label>
            <Input
              id="ps-pager-sub-ar"
              dir="rtl"
              value={draft.pagerCardSubtitleAr}
              onChange={e => update({ pagerCardSubtitleAr: e.target.value })}
              className="h-11"
              required
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ps-footer-en">Directory Footer Tagline (EN)</Label>
            <Input
              id="ps-footer-en"
              value={draft.footerTextEn}
              onChange={e => update({ footerTextEn: e.target.value })}
              className="h-11"
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-footer-ar">Directory Footer Tagline (AR)</Label>
            <Input
              id="ps-footer-ar"
              dir="rtl"
              value={draft.footerTextAr}
              onChange={e => update({ footerTextAr: e.target.value })}
              className="h-11"
              required
            />
          </div>
        </div>
      </section>

      {/* 2. Staff & Tenant Login Portal Copy */}
      <section className="manager-panel p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            <span>Staff &amp; Reception Sign-In Portal (`/login`)</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Customize the welcome headline, subtitle, and support instructions shown to Tenant Admins and Reception/Prep staff.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ps-login-head">Login Headline</Label>
            <Input
              id="ps-login-head"
              value={draft.loginHeadline}
              onChange={e => update({ loginHeadline: e.target.value })}
              className="h-11"
              required
            />
          </div>
          <div>
            <Label htmlFor="ps-login-help">Footer Help Note</Label>
            <Input
              id="ps-login-help"
              value={draft.loginHelpText}
              onChange={e => update({ loginHelpText: e.target.value })}
              className="h-11"
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="ps-login-sub">Login Subtitle</Label>
          <Input
            id="ps-login-sub"
            value={draft.loginSubtitle}
            onChange={e => update({ loginSubtitle: e.target.value })}
            className="h-11"
            required
          />
        </div>
      </section>

      {/* 3. New Tenant Provisioning Defaults */}
      <section className="manager-panel p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <span>New Tenant &amp; Venue Provisioning Defaults</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Applied automatically whenever a new Tenant Organization or initial venue is onboarded.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="ps-def-branches">Default Max Branches Quota</Label>
            <Input
              id="ps-def-branches"
              type="number"
              min={1}
              max={200}
              value={draft.defaultNewTenantMaxBranches}
              onChange={e =>
                update({ defaultNewTenantMaxBranches: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })
              }
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="ps-def-currency">Default Venue Currency</Label>
            <select
              id="ps-def-currency"
              className="manager-select w-full h-11"
              value={draft.defaultCurrency}
              onChange={e => update({ defaultCurrency: e.target.value as ResolvedPlatformConfig['defaultCurrency'] })}
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ps-def-tz">Default Timezone</Label>
            <Input
              id="ps-def-tz"
              value={draft.defaultTimezone}
              onChange={e => update({ defaultTimezone: e.target.value })}
              placeholder="Asia/Qatar"
              className="h-11"
              required
            />
          </div>
        </div>
      </section>
    </form>
  );
}
