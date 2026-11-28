import type { Dispatch, SetStateAction } from 'react';
import { Check, CreditCard, ExternalLink, Minus, Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { QrNfcScannerModal } from '@/components/qr-nfc/QrNfcScannerModal';
import { localizedEntityText, type MenuLanguage } from '@/lib/menuLanguage';
import {
  computeOrderTotalsWithVenueFees,
  formatCurrencyForLocale,
  resolveVenueConfig,
} from '@shared/venueConfig';
import type { PublicCafe, PublicHospitalityConfig } from '@shared/schema';
import type { GuestCartItem } from './GuestHospitalityBar';

export interface PendingGatewaySession {
  orderId: string;
  orderNumber: string;
  total: string;
  provider: string;
  paymentReference: string;
}

export function GuestCheckoutAndDeliveryModals({
  restaurant,
  language,
  dir,
  t,
  label,
  aggregators,
  deliveryOpen,
  setDeliveryOpen,
  onAggregatorClick,
  cartOpen,
  setCartOpen,
  cart,
  setCart,
  bays,
  channel,
  setChannel,
  custName,
  setCustName,
  custPhone,
  setCustPhone,
  tableCode,
  setTableCode,
  bayId,
  setBayId,
  vehColor,
  setVehColor,
  vehType,
  setVehType,
  plate,
  setPlate,
  orderNotes,
  setOrderNotes,
  totalCartAmount,
  orderError,
  orderPending,
  onSubmitOrder,
  pendingGateway,
  confirmGatewayPending,
  onConfirmGateway,
  scannerOpen,
  setScannerOpen,
}: {
  restaurant: PublicCafe;
  language: string;
  dir: 'ltr' | 'rtl';
  t: (key: string, values?: Record<string, string | number>) => string;
  label: (text: string) => string;
  aggregators: PublicHospitalityConfig['aggregators'];
  deliveryOpen: boolean;
  setDeliveryOpen: (open: boolean) => void;
  onAggregatorClick: (agg: PublicHospitalityConfig['aggregators'][number]) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  cart: GuestCartItem[];
  setCart: Dispatch<SetStateAction<GuestCartItem[]>>;
  bays: PublicHospitalityConfig['bays'];
  channel: 'counter_pickup' | 'dine_in' | 'curbside' | 'drive_thru';
  setChannel: (channel: 'counter_pickup' | 'dine_in' | 'curbside' | 'drive_thru') => void;
  custName: string;
  setCustName: (value: string) => void;
  custPhone: string;
  setCustPhone: (value: string) => void;
  tableCode: string;
  setTableCode: (value: string) => void;
  bayId: string;
  setBayId: (value: string) => void;
  vehColor: string;
  setVehColor: (value: string) => void;
  vehType: string;
  setVehType: (value: string) => void;
  plate: string;
  setPlate: (value: string) => void;
  orderNotes: string;
  setOrderNotes: (value: string) => void;
  totalCartAmount: string;
  orderError: string;
  orderPending: boolean;
  onSubmitOrder: () => void;
  pendingGateway: PendingGatewaySession | null;
  confirmGatewayPending: boolean;
  onConfirmGateway: () => void;
  scannerOpen: boolean;
  setScannerOpen: (open: boolean) => void;
}) {
  const lang = (language === 'ar' ? 'ar' : 'en') as MenuLanguage;
  const venueCfg = resolveVenueConfig(restaurant.venueConfig);
  const currencyDisplay = formatCurrencyForLocale(restaurant.currency, lang, venueCfg.currencySymbolAr);
  const cafeDisplayName = localizedEntityText(lang, restaurant.name, restaurant.nameAr, label);
  const subtotalCents = cart.reduce((sum, i) => sum + Math.round(Number(i.unitTotal) * 100) * i.quantity, 0);
  const feeBreakdown = computeOrderTotalsWithVenueFees(subtotalCents, venueCfg);

  return (
    <>
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            {t('Order Delivery via Partner')}
          </DialogTitle>
          <DialogDescription>
            Choose your preferred delivery partner for {cafeDisplayName}.
          </DialogDescription>
          <div className="space-y-2.5 mt-2">
            {aggregators.map(agg => {
              const badge = language === 'ar' ? agg.badgeAr || agg.badgeEn : agg.badgeEn || agg.badgeAr;
              const brandColors: Record<string, string> = {
                talabat: 'bg-[#FF5A00] text-white',
                snoonu: 'bg-[#D90429] text-white',
                keeta: 'bg-[#FFB703] text-slate-950',
                custom: 'bg-primary text-primary-foreground',
              };
              return (
                <button
                  key={agg.id}
                  type="button"
                  data-testid={`button-aggregator-${agg.platform}`}
                  onClick={() => onAggregatorClick(agg)}
                  className="w-full min-h-14 p-3.5 rounded-2xl border bg-card hover:bg-muted/60 flex items-center justify-between gap-3 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${brandColors[agg.platform] || brandColors.custom}`}>
                      {agg.platform}
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-sm truncate">{agg.displayName}</strong>
                      {badge && <span className="text-xs text-primary font-medium">{badge}</span>}
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side={dir === 'rtl' ? 'left' : 'right'}
          dir={dir}
          lang={language}
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t('Your Order')}</SheetTitle>
            <SheetDescription>
              {restaurant.orderingMode === 'full_online_checkout'
                ? `Secure online payment via ${(restaurant.paymentGateway || 'skipcash').toUpperCase()}`
                : 'Sent straight to the barista prep queue — pay when you pick up or at your table.'}
            </SheetDescription>
          </SheetHeader>

          {pendingGateway ? (
            <div className="mt-6 rounded-2xl border-2 border-primary/30 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-lg bg-primary/10 text-primary">
                  {pendingGateway.provider.toUpperCase()} Gateway
                </span>
                <span className="font-mono text-xs text-muted-foreground">{pendingGateway.paymentReference}</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Order {pendingGateway.orderNumber}</p>
                <p className="text-2xl font-black mt-1">
                  {pendingGateway.total} {restaurant.currency}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Apple Pay · Google Pay · NAPS Qatar Debit · Visa / Mastercard (Signed HMAC Verification)
              </p>
              {orderError && <p className="text-xs text-destructive">{orderError}</p>}
              <Button
                type="button"
                data-testid="button-confirm-online-payment"
                className="w-full min-h-12 cursor-pointer gap-2"
                disabled={confirmGatewayPending}
                onClick={onConfirmGateway}
              >
                <CreditCard className="w-4 h-4" />
                {confirmGatewayPending
                  ? 'Verifying Payment…'
                  : `Authorize ${pendingGateway.total} ${restaurant.currency}`}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={e => {
                e.preventDefault();
                onSubmitOrder();
              }}
              className="mt-5 space-y-4"
            >
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.key} className="rounded-2xl border p-3 flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <strong className="block truncate">{label(item.name)}</strong>
                      {item.variantLabel && <span className="text-xs text-muted-foreground block">{item.variantLabel}</span>}
                      {item.modifierSummary.length > 0 && (
                        <span className="text-xs text-muted-foreground block">{item.modifierSummary.join(', ')}</span>
                      )}
                      {item.notes && (
                        <span className="text-xs italic text-[#57507A] block">“{item.notes}”</span>
                      )}
                      <span className="text-xs font-semibold text-primary mt-1 block">
                        {(Number(item.unitTotal) * item.quantity).toFixed(2)} {restaurant.currency}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          setCart(prev =>
                            item.quantity <= 1
                              ? prev.filter(i => i.key !== item.key)
                              : prev.map(i => (i.key === item.key ? { ...i, quantity: i.quantity - 1 } : i)),
                          )
                        }
                        className="w-11 h-11 rounded-xl border grid place-items-center cursor-pointer"
                      >
                        {item.quantity <= 1 ? <Trash2 className="w-4 h-4 text-destructive" /> : <Minus className="w-4 h-4" />}
                      </button>
                      <span className="w-6 text-center font-semibold font-mono text-xs">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() =>
                          setCart(prev => prev.map(i => (i.key === item.key ? { ...i, quantity: i.quantity + 1 } : i)))
                        }
                        className="w-11 h-11 rounded-xl border grid place-items-center cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-xs">{t('Order Channel')}</Label>
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 mt-1">
                  {[
                    { id: 'counter_pickup', label: t('Counter Pickup') },
                    { id: 'dine_in', label: t('Dine-In Table') },
                    ...(restaurant.driveThruEnabled
                      ? [
                          { id: 'curbside', label: t('Curbside Bay') },
                          { id: 'drive_thru', label: t('Drive-Thru') },
                        ]
                      : []),
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChannel(opt.id as any)}
                      className={`min-h-11 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer ${
                        channel === opt.id ? 'border-primary bg-primary/10 text-primary' : 'bg-card'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {channel === opt.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5">
                <div>
                  <Label className="text-xs">{t('Your Name')} *</Label>
                  <Input value={custName} onChange={e => setCustName(e.target.value)} required className="h-11" data-testid="input-order-customer-name" />
                </div>
                <div>
                  <Label className="text-xs">{t('Phone (Optional)')}</Label>
                  <Input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)} className="h-11" />
                </div>
              </div>

              {channel === 'dine_in' && (
                <div>
                  <Label className="text-xs">{t('Table Code')}</Label>
                  <Input value={tableCode} onChange={e => setTableCode(e.target.value)} placeholder="e.g. T-04" className="h-11" />
                </div>
              )}

              {(channel === 'curbside' || channel === 'drive_thru') && (
                <div className="space-y-2 rounded-2xl border p-3 bg-muted/30">
                  {bays.length > 0 && (
                    <div>
                      <Label className="text-xs">{t('Select Parking Bay')}</Label>
                      <select className="manager-select w-full h-11" value={bayId} onChange={e => setBayId(e.target.value)}>
                        <option value="">Will select upon arrival</option>
                        {bays.map(b => (
                          <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <select className="manager-select h-11 text-xs" value={vehColor} onChange={e => setVehColor(e.target.value)}>
                      {venueCfg.vehicleColors.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="manager-select h-11 text-xs" value={vehType} onChange={e => setVehType(e.target.value)}>
                      {venueCfg.vehicleTypes.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <Input value={plate} onChange={e => setPlate(e.target.value)} placeholder="Plate #" className="h-11 text-xs col-span-2 sm:col-span-1" />
                  </div>
                </div>
              )}

              <Input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder={t('Order Notes')} className="h-11" />

              <div className="space-y-1.5 pt-2 border-t text-sm">
                {(venueCfg.taxPercent > 0 || venueCfg.serviceChargePercent > 0) && (
                  <>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-mono">{feeBreakdown.subtotal} {currencyDisplay}</span>
                    </div>
                    {venueCfg.serviceChargePercent > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Service ({venueCfg.serviceChargePercent}%)</span>
                        <span className="font-mono">{feeBreakdown.serviceChargeAmount} {currencyDisplay}</span>
                      </div>
                    )}
                    {venueCfg.taxPercent > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{lang === 'ar' ? venueCfg.taxLabelAr : venueCfg.taxLabel} ({venueCfg.taxPercent}%)</span>
                        <span className="font-mono">{feeBreakdown.taxAmount} {currencyDisplay}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center justify-between font-bold text-base">
                  <span>{t('Estimated total')}</span>
                  <span className="font-mono">
                    {totalCartAmount} {currencyDisplay}
                  </span>
                </div>
              </div>

              {orderError && <p className="text-xs text-destructive font-medium">{orderError}</p>}

              <Button
                type="submit"
                data-testid="button-submit-guest-order"
                className="w-full min-h-12 rounded-2xl cursor-pointer font-semibold"
                disabled={!cart.length || !custName.trim() || orderPending}
              >
                {orderPending
                  ? 'Submitting…'
                  : restaurant.orderingMode === 'full_online_checkout'
                    ? t('Pay Online & Place Order')
                    : t('Place Order (Pay at Venue)')}
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
      <QrNfcScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        restaurantId={restaurant.id}
        restaurantName={cafeDisplayName}
        dir={dir}
        lang={language}
        t={t}
      />
    </>
  );
}
