import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Monitor,
  Sparkles,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { OpenCafeAccount } from '@/components/open-cafe-account';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { usePlatformConfig } from '@/lib/usePlatformConfig';
import { MANAGEMENT_ORIGIN, publicExperienceOrigin } from '@shared/menuIdentity';
import type { OrderingMode } from '@shared/schema';

interface TenantOption {
  id: string;
  name: string;
  maxBranches: number;
  ownerEmail: string | null;
  branches: { id: string; name: string }[];
}

interface CompletedHandoff {
  cafeId: string;
  cafeName: string;
  slug: string;
  tenantName: string;
  orderingMode: OrderingMode;
  ownerEmail: string;
  ownerPasswordPlain?: string;
  ownerPin?: string;
  deskStaff?: { email: string; pin: string };
  prepStaff?: { email: string; pin: string };
  tablesCreated: number;
  baysCreated: number;
  smartTagsCreated: number;
  menuItemsImported: number;
}

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function Register() {
  const { toast } = useToast();
  const platformCfg = usePlatformConfig();

  const tenantsQuery = useQuery<{ tenants: TenantOption[] }>({
    queryKey: ['/api/super-admin/tenants'],
  });
  const libraryQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/menu-library'],
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Venue & Brand Identity
  const [tenantMode, setTenantMode] = useState<'new_tenant' | 'existing_tenant'>('new_tenant');
  const [tenantId, setTenantId] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantNameAr, setRestaurantNameAr] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [maxBranches, setMaxBranches] = useState(platformCfg.defaultNewTenantMaxBranches);
  const [touchedQuota, setTouchedQuota] = useState(false);
  const [cuisineType, setCuisineType] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Step 2: Service Mode & Day-1 Starter Kit
  const [orderingMode, setOrderingMode] = useState<OrderingMode>('cart_pay_at_venue');
  const [reservationsEnabled, setReservationsEnabled] = useState(true);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [driveThruEnabled, setDriveThruEnabled] = useState(false);
  const [seedStarterFloor, setSeedStarterFloor] = useState(true);
  const [seedStarterSmartTags, setSeedStarterSmartTags] = useState(true);
  const [importCount, setImportCount] = useState<number>(6);

  // Step 3: Owner & Station PINs
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ownerPin, setOwnerPin] = useState('100100');
  const [createStationPins, setCreateStationPins] = useState(true);
  const [deskPin, setDeskPin] = useState('111222');
  const [prepPin, setPrepPin] = useState('444555');

  // Execution state
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [completed, setCompleted] = useState<CompletedHandoff | null>(null);
  const [copiedKit, setCopiedKit] = useState(false);

  useEffect(() => {
    if (!touchedQuota) {
      setMaxBranches(platformCfg.defaultNewTenantMaxBranches);
    }
  }, [platformCfg.defaultNewTenantMaxBranches, touchedQuota]);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugifyName(restaurantName));
    }
  }, [restaurantName, slugTouched]);

  const tenants = tenantsQuery.data?.tenants || [];
  const libraryItems = libraryQuery.data || [];

  async function runTurnkeyOnboarding(e: React.FormEvent) {
    e.preventDefault();
    if (tenantMode === 'new_tenant') {
      if (password.length < 10) {
        toast({ title: 'Password must be at least 10 characters', variant: 'destructive' });
        return;
      }
      if (password !== confirmPassword) {
        toast({ title: 'Passwords do not match', variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    setProgressLabel('Creating isolated tenant, venue & starter floor…');

    try {
      const cleanOwnerPin = /^\d{6}$/.test(ownerPin.trim()) ? ownerPin.trim() : null;
      const provisionRes = await apiRequest('POST', '/api/super-admin/onboarding/provision', {
        tenantMode,
        tenantId: tenantMode === 'existing_tenant' ? tenantId || tenants[0]?.id : null,
        tenantName: tenantMode === 'new_tenant' ? tenantName.trim() || null : null,
        maxBranches: Math.max(1, Math.min(200, Number(maxBranches) || 1)),
        restaurantName: restaurantName.trim(),
        restaurantNameAr: restaurantNameAr.trim() || null,
        slug: slug.trim() || null,
        cuisineType: cuisineType.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        orderingMode,
        reservationsEnabled,
        waitlistEnabled,
        driveThruEnabled,
        seedStarterFloor,
        seedStarterSmartTags,
        ...(tenantMode === 'new_tenant'
          ? {
              ownerFirstName: firstName.trim(),
              ownerLastName: lastName.trim(),
              ownerEmail: email.trim(),
              ownerPassword: password,
              ownerPin: cleanOwnerPin,
            }
          : {}),
      });
      const provisioned = await provisionRes.json();
      const newCafe = provisioned.cafe;

      // Open temporary workspace context for 1-by-1 library imports & optional station PIN accounts
      await apiRequest('POST', '/api/super-admin/cafe-access', { restaurantId: newCafe.id });

      let importedItems = 0;
      const desiredImports = Math.min(importCount, libraryItems.length);
      if (desiredImports > 0) {
        for (let idx = 0; idx < desiredImports; idx++) {
          setProgressLabel(`Importing starter menu dishes (${idx + 1}/${desiredImports})…`);
          try {
            await fetch('/api/menu-library/import', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'X-Cafe-Context': newCafe.id,
              },
              body: JSON.stringify({
                restaurantId: newCafe.id,
                itemIds: [libraryItems[idx].id],
                isAvailable: true,
                acceptCurrencyDifference: true,
              }),
            });
            importedItems++;
          } catch {}
        }
      }

      let deskCreated: { email: string; pin: string } | undefined;
      let prepCreated: { email: string; pin: string } | undefined;
      if (createStationPins) {
        const sharedStationPassword = password.length >= 10 ? password : `Dingzi#${Math.random().toString(36).slice(2, 10)}99`;
        if (/^\d{6}$/.test(deskPin.trim())) {
          setProgressLabel('Provisioning Front Desk Station PIN…');
          const deskEmail = `desk.${newCafe.slug}@dingzi.staff`;
          const r = await fetch('/api/hospitality/team', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Cafe-Context': newCafe.id },
            body: JSON.stringify({
              email: deskEmail,
              password: sharedStationPassword,
              firstName: 'Front',
              lastName: 'Desk',
              staffRole: 'host_cashier',
              applyTenantWide: false,
              restaurantIds: [newCafe.id],
              stationPin: deskPin.trim(),
            }),
          });
          if (r.ok) deskCreated = { email: deskEmail, pin: deskPin.trim() };
        }
        if (/^\d{6}$/.test(prepPin.trim())) {
          setProgressLabel('Provisioning Kitchen Prep Station PIN…');
          const prepEmail = `prep.${newCafe.slug}@dingzi.staff`;
          const r = await fetch('/api/hospitality/team', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Cafe-Context': newCafe.id },
            body: JSON.stringify({
              email: prepEmail,
              password: sharedStationPassword,
              firstName: 'Kitchen',
              lastName: 'Station',
              staffRole: 'prep_barista',
              applyTenantWide: false,
              restaurantIds: [newCafe.id],
              stationPin: prepPin.trim(),
            }),
          });
          if (r.ok) prepCreated = { email: prepEmail, pin: prepPin.trim() };
        }
      }

      // Return cleanly to Super-Admin platform scope
      await apiRequest('DELETE', '/api/super-admin/cafe-access');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/super-admin/tenants'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] }),
      ]);

      setCompleted({
        cafeId: newCafe.id,
        cafeName: newCafe.name,
        slug: newCafe.slug,
        tenantName: provisioned.tenant.name,
        orderingMode: newCafe.orderingMode,
        ownerEmail: provisioned.ownerEmail,
        ownerPasswordPlain: tenantMode === 'new_tenant' ? password : undefined,
        ownerPin: tenantMode === 'new_tenant' && cleanOwnerPin ? cleanOwnerPin : undefined,
        deskStaff: deskCreated,
        prepStaff: prepCreated,
        tablesCreated: provisioned.seededSummary.tablesCreated,
        baysCreated: provisioned.seededSummary.baysCreated,
        smartTagsCreated: provisioned.seededSummary.smartTagsCreated,
        menuItemsImported: importedItems,
      });
      toast({ title: `${newCafe.name} onboarded and live!` });
    } catch (err: any) {
      toast({
        title: 'Could not complete onboarding',
        description: err?.message || 'Check inputs and try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
      setProgressLabel('');
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicBase = publicExperienceOrigin(origin);
  const staffOrigin =
    MANAGEMENT_ORIGIN && !MANAGEMENT_ORIGIN.includes('.example.workers.dev') ? MANAGEMENT_ORIGIN : origin;

  if (completed) {
    const guestMenuUrl = `${publicBase}/v/${completed.slug}`;
    const clearScreenUrl = `${publicBase}/screen/${completed.slug}`;
    const staffLoginUrl = `${staffOrigin}/login`;

    const handoffText = [
      `Welcome to dingzi — ${completed.cafeName} (${completed.tenantName})`,
      `Guest Digital Menu: ${guestMenuUrl}`,
      `Counter Clear QR Screen: ${clearScreenUrl}`,
      `Staff & Admin Sign-In: ${staffLoginUrl}`,
      `Venue Code (for Station PIN tab): ${completed.slug}`,
      completed.ownerPasswordPlain
        ? `Tenant Admin Login: ${completed.ownerEmail} / ${completed.ownerPasswordPlain}${
            completed.ownerPin ? ` (PIN: ${completed.ownerPin})` : ''
          }`
        : `Tenant Owner Account: ${completed.ownerEmail}`,
      completed.deskStaff ? `Front Desk Tablet PIN: ${completed.deskStaff.pin} (${completed.deskStaff.email})` : '',
      completed.prepStaff ? `Kitchen Prep Tablet PIN: ${completed.prepStaff.pin} (${completed.prepStaff.email})` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return (
      <div className="max-w-3xl mx-auto space-y-6 py-2" data-testid="onboarding-handoff-kit">
        <div className="rounded-3xl bg-[#17132E] text-white border-2 border-[#C8FF42] p-6 sm:p-8 space-y-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#C8FF42] text-[#17132E] text-xs font-extrabold">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Venue Onboarded &amp; Live</span>
            </span>
            <span className="font-mono text-xs text-white/75">/v/{completed.slug}</span>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold">{completed.cafeName} Ready for Service</h1>
            <p className="text-sm text-white/80 mt-1">
              Provisioned under <strong>{completed.tenantName}</strong> with {completed.tablesCreated} tables,{' '}
              {completed.smartTagsCreated} QR/NFC smart tags, and {completed.menuItemsImported} starter menu items.
            </p>
          </div>

          <div className="grid sm:grid-cols-12 gap-5 items-center bg-[#241E42] rounded-2xl p-5 border border-white/10">
            <div className="sm:col-span-5 flex flex-col items-center gap-2">
              <LocalQrBox url={guestMenuUrl} size={172} />
              <span className="text-[11px] font-mono text-white/75">Permanent Menu QR</span>
            </div>
            <div className="sm:col-span-7 space-y-2.5 text-xs font-mono">
              <div className="rounded-xl bg-[#17132E] p-3 border border-white/10 space-y-1">
                <span className="text-white/60 block font-sans">Venue Code &amp; Logins</span>
                <strong className="text-[#C8FF42] block text-sm">Venue Code: {completed.slug}</strong>
                <span className="block text-white/90 break-all">Owner: {completed.ownerEmail}</span>
                {completed.ownerPin && <span className="block text-white/85">Owner PIN: {completed.ownerPin}</span>}
                {completed.deskStaff && (
                  <span className="block text-white/85">Front Desk PIN: {completed.deskStaff.pin}</span>
                )}
                {completed.prepStaff && (
                  <span className="block text-white/85">Kitchen Prep PIN: {completed.prepStaff.pin}</span>
                )}
              </div>

              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(handoffText);
                    setCopiedKit(true);
                    toast({ title: 'Client Welcome Kit copied to clipboard' });
                    window.setTimeout(() => setCopiedKit(false), 2500);
                  } catch {}
                }}
                data-testid="button-copy-welcome-kit"
                className="w-full min-h-11 rounded-xl bg-[#C8FF42] text-[#17132E] hover:bg-[#b8f230] font-sans font-extrabold cursor-pointer gap-2"
              >
                {copiedKit ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedKit ? 'Copied Welcome Kit!' : 'Copy Welcome Handoff Kit'}</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <OpenCafeAccount id={completed.cafeId} name={completed.cafeName} />
            <Button
              asChild
              variant="outline"
              className="min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5"
            >
              <a href={guestMenuUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4" />
                <span>Open Live Menu</span>
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5"
            >
              <a href={clearScreenUrl} target="_blank" rel="noreferrer">
                <Monitor className="w-4 h-4" />
                <span>Open Counter QR Screen</span>
              </a>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="min-h-11 rounded-xl text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <Link href="/super-admin">Back to All Venues</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" className="rounded-xl" data-testid="button-back">
            <Link href="/super-admin" aria-label="Back to venues">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Onboard Café or Restaurant</h1>
            <p className="text-sm text-muted-foreground">
              Launch a complete workspace with tables, QR/NFC tags, starter menu, and tablet PINs in 3 quick steps.
            </p>
          </div>
        </div>
      </div>

      {/* Clean 3-Step Progress Switcher */}
      <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-muted/60 border" role="tablist">
        {(
          [
            [1, '1. Venue & Brand'],
            [2, '2. Mode & Starter Kit'],
            [3, '3. Logins & PINs'],
          ] as const
        ).map(([num, title]) => (
          <button
            key={num}
            type="button"
            role="tab"
            aria-selected={step === num}
            onClick={() => {
              if (num === 1 || restaurantName.trim()) setStep(num);
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              step === num ? 'bg-[#6236FF] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {title}
          </button>
        ))}
      </div>

      <form onSubmit={runTurnkeyOnboarding} className="rounded-3xl border bg-card p-5 sm:p-7 space-y-6">
        {/* STEP 1: VENUE & BRAND GROUP */}
        {step === 1 && (
          <div className="space-y-5">
            {tenants.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTenantMode('new_tenant')}
                  className={`p-4 rounded-2xl border-2 text-start transition-colors cursor-pointer ${
                    tenantMode === 'new_tenant'
                      ? 'border-[#6236FF] bg-[#EFEAFF]/50'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <strong className="block text-sm font-bold">New Client / Brand Group</strong>
                  <span className="text-xs text-muted-foreground">
                    Creates a new isolated Tenant Organization &amp; Owner account.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTenantMode('existing_tenant');
                    if (!tenantId && tenants[0]) setTenantId(tenants[0].id);
                  }}
                  className={`p-4 rounded-2xl border-2 text-start transition-colors cursor-pointer ${
                    tenantMode === 'existing_tenant'
                      ? 'border-[#6236FF] bg-[#EFEAFF]/50'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <strong className="block text-sm font-bold">Add Branch to Existing Brand</strong>
                  <span className="text-xs text-muted-foreground">
                    Attaches this branch to an existing multi-branch Tenant Owner.
                  </span>
                </button>
              </div>
            )}

            {tenantMode === 'existing_tenant' ? (
              <div className="space-y-2">
                <Label>Select Existing Brand / Tenant Group *</Label>
                <select
                  className="manager-select w-full min-h-11 text-sm"
                  value={tenantId || tenants[0]?.id || ''}
                  onChange={e => setTenantId(e.target.value)}
                >
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.branches.length}/{t.maxBranches} branches · {t.ownerEmail || 'No owner'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="tenantName">Brand / Organization Name (optional)</Label>
                  <Input
                    id="tenantName"
                    placeholder="Defaults to Venue Name"
                    value={tenantName}
                    onChange={e => setTenantName(e.target.value)}
                    data-testid="input-tenant-name"
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maxBranches">Max Branches Quota</Label>
                  <Input
                    id="maxBranches"
                    type="number"
                    min={1}
                    max={200}
                    value={maxBranches}
                    onChange={e => {
                      setTouchedQuota(true);
                      setMaxBranches(Number(e.target.value) || 1);
                    }}
                    data-testid="input-max-branches"
                    className="min-h-11 font-mono"
                  />
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="restaurantName">Venue / Branch Name (English) *</Label>
                <Input
                  id="restaurantName"
                  placeholder="e.g. Pearl Roastery · Lusail"
                  value={restaurantName}
                  onChange={e => setRestaurantName(e.target.value)}
                  required
                  data-testid="input-restaurant-name"
                  className="min-h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="restaurantNameAr">Arabic Venue Name (optional)</Label>
                <Input
                  id="restaurantNameAr"
                  dir="rtl"
                  placeholder="مثال: محمصة اللؤلؤة"
                  value={restaurantNameAr}
                  onChange={e => setRestaurantNameAr(e.target.value)}
                  className="min-h-11"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="slug">Short Guest Link (/v/…)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={e => {
                    setSlugTouched(true);
                    setSlug(slugifyName(e.target.value));
                  }}
                  placeholder="pearl-roastery"
                  className="min-h-11 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cuisineType">Cuisine / Concept</Label>
                <Input
                  id="cuisineType"
                  value={cuisineType}
                  onChange={e => setCuisineType(e.target.value)}
                  placeholder="Specialty Coffee & Bakery"
                  className="min-h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+974 4400 0000"
                  className="min-h-11"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">District / Address</Label>
              <Input
                id="address"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Lusail Marina Promenade, Doha"
                className="min-h-11"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                disabled={!restaurantName.trim()}
                onClick={() => setStep(2)}
                className="min-h-11 px-6 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
              >
                <span>Next: Mode &amp; Starter Kit</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: SERVICE MODE & DAY-1 STARTER KIT */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Choose Guest Ordering Mode</Label>
              <div className="grid sm:grid-cols-3 gap-3">
                {(
                  [
                    [
                      'browse_and_pager',
                      'Counter Pager',
                      'Guests browse menu & order at counter; phone rings when ready.',
                    ],
                    [
                      'cart_pay_at_venue',
                      'Order & Pay at Venue',
                      'Guests order from table or counter QR and settle cash/card at desk.',
                    ],
                    [
                      'full_online_checkout',
                      'Online Payment',
                      'Guests pay online via SkipCash / Sadad before order hits kitchen.',
                    ],
                  ] as const
                ).map(([modeId, title, desc]) => (
                  <button
                    key={modeId}
                    type="button"
                    onClick={() => setOrderingMode(modeId)}
                    className={`p-4 rounded-2xl border-2 text-start space-y-1 transition-colors cursor-pointer ${
                      orderingMode === modeId
                        ? 'border-[#6236FF] bg-[#EFEAFF]/50'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <strong className="block text-sm font-bold">{title}</strong>
                    <span className="text-xs text-muted-foreground block leading-relaxed">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#6236FF]" aria-hidden="true" />
                <strong className="text-sm">Day-1 Ready Starter Kit (Pre-Configured Automatically)</strong>
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5 text-sm">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border bg-background cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seedStarterFloor}
                    onChange={e => {
                      setSeedStarterFloor(e.target.checked);
                      setReservationsEnabled(e.target.checked);
                    }}
                    className="accent-[#6236FF] w-4 h-4"
                  />
                  <span>Create 2 zones &amp; 4 floor tables (T-01 to T-04)</span>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border bg-background cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waitlistEnabled}
                    onChange={e => setWaitlistEnabled(e.target.checked)}
                    className="accent-[#6236FF] w-4 h-4"
                  />
                  <span>Enable Walk-In Table Waitlist</span>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border bg-background cursor-pointer">
                  <input
                    type="checkbox"
                    checked={driveThruEnabled}
                    onChange={e => setDriveThruEnabled(e.target.checked)}
                    className="accent-[#6236FF] w-4 h-4"
                  />
                  <span>Enable Curbside Cars &amp; seed 2 bays (BAY-01 &amp; BAY-02)</span>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border bg-background cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seedStarterSmartTags}
                    onChange={e => setSeedStarterSmartTags(e.target.checked)}
                    className="accent-[#6236FF] w-4 h-4"
                  />
                  <span>Create QR/NFC Stands + 3 Pager Coasters</span>
                </label>
              </div>

              {libraryItems.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-[#6236FF]" />
                    <span>Pre-import starter dishes &amp; photos from Global Menu Library:</span>
                  </span>
                  <div className="flex gap-1.5">
                    {[0, 6, 12].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setImportCount(n)}
                        className={`min-h-10 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                          importCount === n ? 'bg-[#6236FF] text-white border-[#6236FF]' : 'bg-background'
                        }`}
                      >
                        {n === 0 ? 'Empty Menu' : `${Math.min(n, libraryItems.length)} Starter Dishes`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="min-h-11 rounded-xl cursor-pointer">
                Back
              </Button>
              <Button
                type="button"
                onClick={() => setStep(3)}
                className="min-h-11 px-6 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
              >
                <span>Next: Logins &amp; PINs</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: OWNER ACCOUNT & STATION PINS */}
        {step === 3 && (
          <div className="space-y-5">
            {tenantMode === 'new_tenant' ? (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">Owner First Name *</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      required
                      data-testid="input-firstname"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Owner Last Name *</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      required
                      data-testid="input-lastname"
                      className="min-h-11"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="email">Owner Sign-In Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="owner@venue.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      data-testid="input-email"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerPin">Owner 6-Digit PIN</Label>
                    <Input
                      id="ownerPin"
                      inputMode="numeric"
                      maxLength={6}
                      value={ownerPin}
                      onChange={e => setOwnerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="100100"
                      className="min-h-11 font-mono"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Initial Password (10+ chars) *</Label>
                    <Input
                      id="password"
                      type="password"
                      minLength={10}
                      maxLength={72}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      data-testid="input-password"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword">Confirm Password *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      minLength={10}
                      maxLength={72}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      data-testid="input-confirm-password"
                      className="min-h-11"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-muted/40 p-4 text-sm">
                This branch will automatically inherit full access for the existing Tenant Owner of{' '}
                <strong>{tenants.find(t => t.id === tenantId)?.name || 'the selected brand group'}</strong>.
              </div>
            )}

            {/* Instant Front Desk & Kitchen Tablet PINs */}
            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <strong className="text-sm block">Pre-Create Front Desk &amp; Kitchen Tablet PINs</strong>
                  <span className="text-xs text-muted-foreground">
                    Lets counter and kitchen iPads sign in immediately with Venue Code + 6-digit PIN.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={createStationPins}
                  onChange={e => setCreateStationPins(e.target.checked)}
                  className="accent-[#6236FF] w-4 h-4"
                />
              </label>

              {createStationPins && (
                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-xs text-muted-foreground">Front Desk / Cashier PIN</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={deskPin}
                      onChange={e => setDeskPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="min-h-11 font-mono mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Kitchen / Barista Prep PIN</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={prepPin}
                      onChange={e => setPrepPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="min-h-11 font-mono mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {progressLabel && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-2xl bg-[#EFEAFF] text-[#4B1FE0] px-4 py-3 text-xs font-bold flex items-center gap-2"
              >
                <Store className="w-4 h-4 animate-pulse shrink-0" />
                <span>{progressLabel}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setStep(2)}
                className="min-h-11 rounded-xl cursor-pointer"
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="button-register"
                className="min-h-11 px-6 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-2"
              >
                <Building2 className="w-4 h-4" />
                <span>{submitting ? 'Launching Venue…' : 'Launch Venue & Generate Welcome Kit'}</span>
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
