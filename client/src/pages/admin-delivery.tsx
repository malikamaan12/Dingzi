import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CreditCard, ExternalLink, KeyRound, Plus, Save, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useManagerMenu, updateManagerMenu } from '@/lib/managerMenu';
import { useToast } from '@/hooks/use-toast';
import type { OrderingMode, PaymentGateway } from '@shared/schema';

export default function AdminDeliveryAndCommercePage() {
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;

  const [slug, setSlug] = useState('');
  const [orderingMode, setOrderingMode] = useState<OrderingMode>('browse_and_pager');
  const [paymentGateway, setPaymentGateway] = useState<PaymentGateway>('none');
  const [brandAccentHex, setBrandAccentHex] = useState('');
  const [googleMapsReviewUrl, setGoogleMapsReviewUrl] = useState('');
  const [reservationsEnabled, setReservationsEnabled] = useState(true);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [driveThruEnabled, setDriveThruEnabled] = useState(false);
  const [pagerMiniGameEnabled, setPagerMiniGameEnabled] = useState(true);
  const [slotIntervalMins, setSlotIntervalMins] = useState(30);
  const [defaultTurnDurationMins, setDefaultTurnDurationMins] = useState(90);
  const [reservationDepositAmount, setReservationDepositAmount] = useState('0');
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('23:00');

  // Isolated Payment Gateway Vault inputs (never pre-populated with raw secrets)
  const [skipcashKeyId, setSkipcashKeyId] = useState('');
  const [skipcashSecret, setSkipcashSecret] = useState('');
  const [skipcashCheckoutUrl, setSkipcashCheckoutUrl] = useState('');
  const [sadadMerchantId, setSadadMerchantId] = useState('');
  const [sadadSecret, setSadadSecret] = useState('');
  const [sadadCheckoutUrl, setSadadCheckoutUrl] = useState('');

  const [platform, setPlatform] = useState<'talabat' | 'snoonu' | 'keeta' | 'custom'>('talabat');
  const [displayName, setDisplayName] = useState('Talabat Qatar');
  const [url, setUrl] = useState('');
  const [badgeEn, setBadgeEn] = useState('');
  const [badgeAr, setBadgeAr] = useState('');

  useEffect(() => {
    if (!cafe) return;
    setSlug(cafe.slug || '');
    setOrderingMode((cafe.orderingMode as OrderingMode) || 'browse_and_pager');
    setPaymentGateway((cafe.paymentGateway as PaymentGateway) || 'none');
    setBrandAccentHex(cafe.brandAccentHex || '');
    setGoogleMapsReviewUrl(cafe.googleMapsReviewUrl || '');
    setReservationsEnabled(cafe.reservationsEnabled ?? true);
    setWaitlistEnabled(cafe.waitlistEnabled ?? true);
    setDriveThruEnabled(cafe.driveThruEnabled ?? false);
    setPagerMiniGameEnabled(cafe.pagerMiniGameEnabled ?? true);
    setSlotIntervalMins(cafe.slotIntervalMins || 30);
    setDefaultTurnDurationMins(cafe.defaultTurnDurationMins || 90);
    setReservationDepositAmount(String(cafe.reservationDepositAmount || '0'));
    setOpenTime(cafe.openTime || '08:00');
    setCloseTime(cafe.closeTime || '23:00');
  }, [cafe]);

  const paymentConfigQuery = useQuery<{
    skipcashKeyMasked: string | null;
    hasSkipcashSecret: boolean;
    skipcashCheckoutUrl: string;
    sadadMerchantMasked: string | null;
    hasSadadSecret: boolean;
    sadadCheckoutUrl: string;
    updatedAt: string | null;
  }>({
    queryKey: ['/api/hospitality/payment-config'],
  });

  useEffect(() => {
    if (!paymentConfigQuery.data) return;
    setSkipcashCheckoutUrl(paymentConfigQuery.data.skipcashCheckoutUrl || '');
    setSadadCheckoutUrl(paymentConfigQuery.data.sadadCheckoutUrl || '');
  }, [paymentConfigQuery.data]);

  const saveGatewayVault = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | undefined> = {
        skipcashCheckoutUrl: skipcashCheckoutUrl.trim(),
        sadadCheckoutUrl: sadadCheckoutUrl.trim(),
      };
      if (skipcashKeyId.trim()) payload.skipcashKeyId = skipcashKeyId.trim();
      if (skipcashSecret.trim()) payload.skipcashSecret = skipcashSecret.trim();
      if (sadadMerchantId.trim()) payload.sadadMerchantId = sadadMerchantId.trim();
      if (sadadSecret.trim()) payload.sadadSecret = sadadSecret.trim();
      const res = await apiRequest('PUT', '/api/hospitality/payment-config', payload);
      return res.json();
    },
    onSuccess: () => {
      setSkipcashKeyId('');
      setSkipcashSecret('');
      setSadadMerchantId('');
      setSadadSecret('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/payment-config'] });
      toast({ title: 'Encrypted merchant payment vault updated' });
    },
    onError: (e: Error) => toast({ title: 'Could not update payment vault', description: e.message, variant: 'destructive' }),
  });

  const aggQuery = useQuery<{ aggregators: any[] }>({
    queryKey: ['/api/hospitality/aggregators'],
  });

  const saveCommerce = useMutation({
    mutationFn: async () => {
      if (!cafe) throw new Error('Café not loaded');
      const res = await apiRequest('POST', '/api/restaurant', {
        name: cafe.name,
        slug: slug.trim().toLowerCase() || null,
        orderingMode,
        paymentGateway,
        brandAccentHex: brandAccentHex.trim() || null,
        googleMapsReviewUrl: googleMapsReviewUrl.trim() || null,
        reservationsEnabled,
        waitlistEnabled,
        driveThruEnabled,
        pagerMiniGameEnabled,
        openTime,
        closeTime,
        slotIntervalMins: Number(slotIntervalMins) || 30,
        defaultTurnDurationMins: Number(defaultTurnDurationMins) || 90,
        reservationDepositAmount: String(Number(reservationDepositAmount || 0).toFixed(2)),
      });
      return res.json();
    },
    onSuccess: updated => {
      updateManagerMenu(d => ({ ...d, restaurant: updated }));
      void queryClient.invalidateQueries({ queryKey: ['/api/manager-menu'] });
      toast({ title: 'Commerce, booking & hospitality settings saved' });
    },
    onError: (e: Error) => toast({ title: 'Could not save settings', description: e.message, variant: 'destructive' }),
  });

  const addAggregator = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/aggregators', {
        platform,
        displayName: displayName.trim(),
        url: url.trim(),
        badgeEn: badgeEn.trim() || null,
        badgeAr: badgeAr.trim() || null,
        order: aggQuery.data?.aggregators.length || 0,
      });
      return res.json();
    },
    onSuccess: () => {
      setUrl('');
      setBadgeEn('');
      setBadgeAr('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/aggregators'] });
      toast({ title: 'Aggregator storefront added' });
    },
    onError: (e: Error) => toast({ title: 'Could not add aggregator', description: e.message, variant: 'destructive' }),
  });

  const updateAggregator = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/hospitality/aggregators/${id}`, patch);
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/aggregators'] }),
  });

  const deleteAggregator = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/hospitality/aggregators/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/aggregators'] }),
  });

  const aggregators = aggQuery.data?.aggregators || [];

  async function moveAggregator(index: number, delta: -1 | 1) {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= aggregators.length) return;
    const a = aggregators[index];
    const b = aggregators[targetIdx];
    await Promise.all([
      apiRequest('PUT', `/api/hospitality/aggregators/${a.id}`, { order: targetIdx }),
      apiRequest('PUT', `/api/hospitality/aggregators/${b.id}`, { order: index }),
    ]);
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/aggregators'] });
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <p className="manager-eyebrow">COMMERCE MODES &amp; DELIVERY HANDOFF</p>
        <h1 className="text-3xl font-bold">Ordering Modes, Payments &amp; Aggregators</h1>
        <p className="text-sm text-muted-foreground">
          Switch between Browse &amp; Pager Only, Pay at Venue, or SkipCash/Sadad Online Checkout, configure reservation slot intervals &amp; deposits, and manage Talabat, Snoonu &amp; Keeta storefronts.
        </p>
      </div>

      {/* Commerce & Hospitality Pillars Configuration */}
      <form
        onSubmit={e => {
          e.preventDefault();
          saveCommerce.mutate();
        }}
        className="manager-panel p-6 space-y-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Branch Commerce, Booking Rules &amp; Feature Toggles
          </h2>
          <Button type="submit" className="cursor-pointer gap-2" disabled={saveCommerce.isPending}>
            <Save className="w-4 h-4" />
            {saveCommerce.isPending ? 'Saving…' : 'Save Mode'}
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          {[
            {
              id: 'browse_and_pager',
              title: 'Mode A · Browse & Pager Only',
              desc: 'Reference customizer with zero cart/checkout, plus Virtual Pager, Reservations, Waitlist & Delivery.',
            },
            {
              id: 'cart_pay_at_venue',
              title: 'Mode B · Order Now & Pay at Venue',
              desc: 'Guests submit dine-in, counter, or curbside orders straight to KDS and pay cash/POS on pickup.',
            },
            {
              id: 'full_online_checkout',
              title: 'Mode C · Full Online Checkout',
              desc: 'Pre-paid checkout via SkipCash or Sadad (Apple Pay, Google Pay, NAPS, Visa/Mastercard) prior to KDS.',
            },
          ].map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setOrderingMode(m.id as OrderingMode)}
              data-testid={`button-mode-${m.id}`}
              className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                orderingMode === m.id ? 'border-primary bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <strong className="block text-sm">{m.title}</strong>
              <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">Branded URL Slug (`/v/:slug`)</Label>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="urban-lusail" className="h-10 font-mono" />
          </div>
          <div>
            <Label className="text-xs">Qatar Payment Adapter</Label>
            <select
              className="manager-select w-full h-10 text-sm"
              value={paymentGateway}
              onChange={e => setPaymentGateway(e.target.value as PaymentGateway)}
            >
              <option value="none">Pay at Venue Only</option>
              <option value="skipcash">SkipCash (Qatar Central Bank)</option>
              <option value="sadad">Sadad Payment Gateway</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Custom Brand Hex (optional)</Label>
            <Input value={brandAccentHex} onChange={e => setBrandAccentHex(e.target.value)} placeholder="#6236FF" className="h-10 font-mono" />
          </div>
          <div>
            <Label className="text-xs">Google Maps Review Link</Label>
            <Input value={googleMapsReviewUrl} onChange={e => setGoogleMapsReviewUrl(e.target.value)} placeholder="https://g.page/r/..." className="h-10" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2 border-t">
          <div>
            <Label className="text-xs">Opens At (24h)</Label>
            <Input
              type="time"
              value={openTime}
              onChange={e => setOpenTime(e.target.value || '08:00')}
              className="h-10 font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Closes At (supports past 00:00)</Label>
            <Input
              type="time"
              value={closeTime}
              onChange={e => setCloseTime(e.target.value || '23:00')}
              className="h-10 font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Booking Slot Interval (mins)</Label>
            <Input
              type="number"
              min={10}
              max={180}
              value={slotIntervalMins}
              onChange={e => setSlotIntervalMins(Number(e.target.value) || 30)}
              className="h-10"
            />
          </div>
          <div>
            <Label className="text-xs">Default Table Turn Duration (mins)</Label>
            <Input
              type="number"
              min={15}
              max={360}
              value={defaultTurnDurationMins}
              onChange={e => setDefaultTurnDurationMins(Number(e.target.value) || 90)}
              className="h-10"
            />
          </div>
          <div>
            <Label className="text-xs">Reservation Deposit ({cafe?.currency || 'QAR'}, Mode C)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={reservationDepositAmount}
              onChange={e => setReservationDepositAmount(e.target.value)}
              className="h-10"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t text-sm">
          <label className="flex items-center justify-between gap-2 rounded-xl border p-3 cursor-pointer">
            <span>Table Reservations</span>
            <Switch checked={reservationsEnabled} onCheckedChange={setReservationsEnabled} />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-xl border p-3 cursor-pointer">
            <span>Walk-In Waitlist</span>
            <Switch checked={waitlistEnabled} onCheckedChange={setWaitlistEnabled} />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-xl border p-3 cursor-pointer">
            <span>Drive-Thru &amp; Curbside</span>
            <Switch checked={driveThruEnabled} onCheckedChange={setDriveThruEnabled} />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-xl border p-3 cursor-pointer">
            <span>Pager Wait Mini-Game</span>
            <Switch checked={pagerMiniGameEnabled} onCheckedChange={setPagerMiniGameEnabled} />
          </label>
        </div>
      </form>

      {/* Isolated Merchant Payment Gateway Vault */}
      <form
        onSubmit={e => {
          e.preventDefault();
          saveGatewayVault.mutate();
        }}
        className="manager-panel p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Merchant Payment Gateway Vault (SkipCash &amp; Sadad)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Encrypted at rest with AES-256-GCM and excluded from JSON/SQL backups. Leave secret fields blank to keep existing keys.
            </p>
          </div>
          <Button type="submit" variant="outline" className="cursor-pointer gap-2 min-h-10" disabled={saveGatewayVault.isPending}>
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>{saveGatewayVault.isPending ? 'Encrypting…' : 'Save Gateway Vault'}</span>
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <strong className="text-sm">SkipCash (Qatar Central Bank)</strong>
              <Badge variant={paymentConfigQuery.data?.hasSkipcashSecret ? 'default' : 'outline'}>
                {paymentConfigQuery.data?.hasSkipcashSecret
                  ? `Vault Active (${paymentConfigQuery.data.skipcashKeyMasked || 'Secret Stored'})`
                  : 'Sandbox HMAC Mode'}
              </Badge>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div>
                <Label className="text-xs">Key ID</Label>
                <Input
                  value={skipcashKeyId}
                  onChange={e => setSkipcashKeyId(e.target.value)}
                  placeholder={paymentConfigQuery.data?.skipcashKeyMasked || 'sk_live_...'}
                  className="h-10 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Webhook / Signing Secret</Label>
                <Input
                  type="password"
                  value={skipcashSecret}
                  onChange={e => setSkipcashSecret(e.target.value)}
                  placeholder={paymentConfigQuery.data?.hasSkipcashSecret ? '••••••••••••' : 'Enter secret…'}
                  className="h-10 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Hosted Checkout Endpoint (optional)</Label>
              <Input
                value={skipcashCheckoutUrl}
                onChange={e => setSkipcashCheckoutUrl(e.target.value)}
                placeholder="https://api.skipcash.app/v1/payments"
                className="h-10 font-mono text-xs"
              />
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <strong className="text-sm">Sadad Qatar</strong>
              <Badge variant={paymentConfigQuery.data?.hasSadadSecret ? 'default' : 'outline'}>
                {paymentConfigQuery.data?.hasSadadSecret
                  ? `Vault Active (${paymentConfigQuery.data.sadadMerchantMasked || 'Secret Stored'})`
                  : 'Sandbox HMAC Mode'}
              </Badge>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div>
                <Label className="text-xs">Merchant ID</Label>
                <Input
                  value={sadadMerchantId}
                  onChange={e => setSadadMerchantId(e.target.value)}
                  placeholder={paymentConfigQuery.data?.sadadMerchantMasked || 'SADAD-QA-...'}
                  className="h-10 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Secret Key</Label>
                <Input
                  type="password"
                  value={sadadSecret}
                  onChange={e => setSadadSecret(e.target.value)}
                  placeholder={paymentConfigQuery.data?.hasSadadSecret ? '••••••••••••' : 'Enter secret…'}
                  className="h-10 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Hosted Checkout Endpoint (optional)</Label>
              <Input
                value={sadadCheckoutUrl}
                onChange={e => setSadadCheckoutUrl(e.target.value)}
                placeholder="https://api.sadadqa.com/checkout"
                className="h-10 font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </form>

      {/* Aggregator Storefront Hub */}
      <section className="manager-panel p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          Aggregator Delivery Storefront Hub (Talabat · Snoonu · Keeta)
        </h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            addAggregator.mutate();
          }}
          className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <div>
            <Label className="text-xs">Platform</Label>
            <select
              className="manager-select w-full h-10 text-sm"
              value={platform}
              onChange={e => {
                const p = e.target.value as any;
                setPlatform(p);
                const defaults: Record<string, string> = {
                  talabat: 'Talabat Qatar',
                  snoonu: 'Snoonu',
                  keeta: 'Keeta Qatar',
                  custom: 'Delivery Partner',
                };
                setDisplayName(defaults[p]);
              }}
            >
              <option value="talabat">Talabat Qatar</option>
              <option value="snoonu">Snoonu</option>
              <option value="keeta">Keeta Qatar</option>
              <option value="custom">Custom App</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Display Name *</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} required className="h-10" />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-xs">Storefront URL *</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.talabat.com/qatar/..." required className="h-10" />
          </div>
          <Button type="submit" className="h-10 cursor-pointer gap-1" disabled={!url.trim() || addAggregator.isPending}>
            <Plus className="w-4 h-4" />
            Add Partner
          </Button>
          <div className="lg:col-span-2">
            <Label className="text-xs">Promo Badge (EN)</Label>
            <Input value={badgeEn} onChange={e => setBadgeEn(e.target.value)} placeholder="Fastest in Lusail" className="h-10" />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-xs">Promo Badge (AR)</Label>
            <Input value={badgeAr} onChange={e => setBadgeAr(e.target.value)} placeholder="الأسرع في لوسيل" className="h-10" />
          </div>
        </form>

        <div className="space-y-2 pt-3">
          {aggregators.length === 0 ? (
            <p className="text-xs text-muted-foreground">No delivery partner links configured yet.</p>
          ) : (
            aggregators.map((agg, idx) => (
              <div
                key={agg.id}
                className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3 text-sm ${
                  agg.isActive === false ? 'opacity-60 border-dashed' : ''
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Badge className="uppercase">{agg.platform}</Badge>
                  <strong>{agg.displayName}</strong>
                  {agg.badgeEn && <span className="text-xs text-primary">· {agg.badgeEn}</span>}
                  <a
                    href={agg.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer mr-1">
                    <Switch
                      checked={agg.isActive !== false}
                      onCheckedChange={isActive => updateAggregator.mutate({ id: agg.id, patch: { isActive } })}
                    />
                    <span>{agg.isActive !== false ? 'Active' : 'Paused'}</span>
                  </label>
                  <button
                    type="button"
                    disabled={idx === 0}
                    aria-label={`Move ${agg.displayName} up`}
                    onClick={() => void moveAggregator(idx, -1)}
                    className="p-1.5 rounded-lg border disabled:opacity-35 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === aggregators.length - 1}
                    aria-label={`Move ${agg.displayName} down`}
                    onClick={() => void moveAggregator(idx, 1)}
                    className="p-1.5 rounded-lg border disabled:opacity-35 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAggregator.mutate(agg.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                    aria-label={`Delete ${agg.displayName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
