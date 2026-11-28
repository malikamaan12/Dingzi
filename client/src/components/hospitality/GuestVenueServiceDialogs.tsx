import { Bell, CalendarDays, Car, CreditCard, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resolveVenueConfig } from '@shared/venueConfig';
import type { PublicCafe, PublicHospitalityConfig } from '@shared/schema';

export interface PendingDepositSession {
  reservationId: string;
  trackingToken: string;
  tableLabel: string;
  startAt: string;
  amount: string;
  provider: 'skipcash' | 'sadad';
  paymentReference: string;
  signatureToken: string;
}

export function GuestVenueServiceDialogs({
  restaurant,
  cafeDisplayName,
  language,
  dir,
  t,
  partyOptions,
  zones,
  bays,
  pagerOpen,
  setPagerOpen,
  lookupCode,
  setLookupCode,
  lookupError,
  lookupPending,
  onSubmitLookup,
  reserveOpen,
  setReserveOpen,
  todayIso,
  resDate,
  setResDate,
  resParty,
  setResParty,
  resZone,
  setResZone,
  resSlot,
  setResSlot,
  resName,
  setResName,
  resPhone,
  setResPhone,
  resNotes,
  setResNotes,
  resError,
  availabilityLoading,
  availabilitySlots,
  reservePending,
  onSubmitReserve,
  pendingDepositGateway,
  setPendingDepositGateway,
  confirmDepositPending,
  onConfirmDeposit,
  waitlistOpen,
  setWaitlistOpen,
  wlName,
  setWlName,
  wlPhone,
  setWlPhone,
  wlParty,
  setWlParty,
  wlZone,
  setWlZone,
  wlError,
  waitlistPending,
  onSubmitWaitlist,
  curbsideOpen,
  setCurbsideOpen,
  csBayId,
  setCsBayId,
  csName,
  setCsName,
  csColor,
  setCsColor,
  csType,
  setCsType,
  csPlate,
  setCsPlate,
  csError,
  curbsidePending,
  onSubmitCurbside,
}: {
  restaurant: PublicCafe;
  cafeDisplayName: string;
  language: string;
  dir: 'ltr' | 'rtl';
  t: (key: string, values?: Record<string, string | number>) => string;
  partyOptions: number[];
  zones: PublicHospitalityConfig['zones'];
  bays: PublicHospitalityConfig['bays'];
  pagerOpen: boolean;
  setPagerOpen: (open: boolean) => void;
  lookupCode: string;
  setLookupCode: (v: string) => void;
  lookupError: string;
  lookupPending: boolean;
  onSubmitLookup: () => void;
  reserveOpen: boolean;
  setReserveOpen: (open: boolean) => void;
  todayIso: string;
  resDate: string;
  setResDate: (v: string) => void;
  resParty: number;
  setResParty: (n: number) => void;
  resZone: string;
  setResZone: (v: string) => void;
  resSlot: string;
  setResSlot: (v: string) => void;
  resName: string;
  setResName: (v: string) => void;
  resPhone: string;
  setResPhone: (v: string) => void;
  resNotes: string;
  setResNotes: (v: string) => void;
  resError: string;
  availabilityLoading: boolean;
  availabilitySlots: { time: string; startIso: string; availableTables: number; requiresCombination?: boolean }[];
  reservePending: boolean;
  onSubmitReserve: () => void;
  pendingDepositGateway: PendingDepositSession | null;
  setPendingDepositGateway: (v: PendingDepositSession | null) => void;
  confirmDepositPending: boolean;
  onConfirmDeposit: () => void;
  waitlistOpen: boolean;
  setWaitlistOpen: (open: boolean) => void;
  wlName: string;
  setWlName: (v: string) => void;
  wlPhone: string;
  setWlPhone: (v: string) => void;
  wlParty: number;
  setWlParty: (n: number) => void;
  wlZone: string;
  setWlZone: (v: string) => void;
  wlError: string;
  waitlistPending: boolean;
  onSubmitWaitlist: () => void;
  curbsideOpen: boolean;
  setCurbsideOpen: (open: boolean) => void;
  csBayId: string;
  setCsBayId: (v: string) => void;
  csName: string;
  setCsName: (v: string) => void;
  csColor: string;
  setCsColor: (v: string) => void;
  csType: string;
  setCsType: (v: string) => void;
  csPlate: string;
  setCsPlate: (v: string) => void;
  csError: string;
  curbsidePending: boolean;
  onSubmitCurbside: () => void;
}) {
  const venueCfg = resolveVenueConfig(restaurant.venueConfig);

  return (
    <>
      {/* 1. Virtual Pager Lookup Dialog */}
      <Dialog open={pagerOpen} onOpenChange={setPagerOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <span>{t('Track Pager')}</span>
          </DialogTitle>
          <DialogDescription>
            Enter your receipt or counter pager code to get live status and lock-screen ringing on your phone.
          </DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (lookupCode.trim()) onSubmitLookup();
            }}
            className="space-y-3 mt-2"
          >
            <Input
              value={lookupCode}
              onChange={e => setLookupCode(e.target.value)}
              placeholder={`${venueCfg.pagerTicketPrefix}-001`}
              className="h-12 font-mono text-base uppercase placeholder:font-sans placeholder:normal-case rounded-xl"
              required
            />
            {lookupError && <p className="text-xs text-destructive font-medium">{lookupError}</p>}
            <Button type="submit" className="w-full min-h-12 rounded-xl font-semibold cursor-pointer" disabled={lookupPending}>
              {lookupPending ? 'Connecting…' : t('Track Pager')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Advance Table Reservation Dialog */}
      <Dialog
        open={reserveOpen}
        onOpenChange={open => {
          setReserveOpen(open);
          if (!open) setPendingDepositGateway(null);
        }}
      >
        <DialogContent dir={dir} lang={language} className="max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <span>{t('Reserve a Table')}</span>
          </DialogTitle>
          <DialogDescription>Instant table allocation for {cafeDisplayName}.</DialogDescription>

          {pendingDepositGateway ? (
            <div className="mt-3 rounded-2xl border-2 border-primary/30 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-lg bg-[#EFEAFF] text-[#4B1FE0]">
                  {pendingDepositGateway.provider.toUpperCase()} Deposit Hold
                </span>
                <span className="font-mono text-xs text-muted-foreground">{pendingDepositGateway.tableLabel}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deductible table deposit</p>
                <p className="text-2xl font-black mt-1 font-mono">
                  {pendingDepositGateway.amount} {restaurant.currency}
                </p>
              </div>
              {resError && <p className="text-xs text-destructive font-medium">{resError}</p>}
              <Button
                type="button"
                data-testid="button-confirm-reservation-deposit"
                onClick={onConfirmDeposit}
                disabled={confirmDepositPending}
                className="w-full min-h-12 rounded-xl cursor-pointer gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {confirmDepositPending
                    ? 'Verifying Deposit…'
                    : `Authorize ${pendingDepositGateway.amount} ${restaurant.currency} Deposit`}
                </span>
              </Button>
            </div>
          ) : (
            <form
              onSubmit={e => {
                e.preventDefault();
                onSubmitReserve();
              }}
              className="space-y-3.5 mt-2"
            >
              <div className="space-y-1.5">
                <Label className="text-xs">{t('Party Size')}</Label>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {partyOptions.slice(0, 8).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setResParty(n);
                        setResSlot('');
                      }}
                      className={`min-w-11 min-h-11 px-3 rounded-xl border text-xs font-bold font-mono transition-colors cursor-pointer shrink-0 ${
                        resParty === n
                          ? 'bg-[#6236FF] text-white border-[#6236FF]'
                          : 'bg-[#F6F5FC] text-[#17132E] border-[#E5E2F2] hover:bg-[#EFEAFF]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    min={todayIso}
                    value={resDate}
                    onChange={e => {
                      setResDate(e.target.value);
                      setResSlot('');
                    }}
                    className="h-11 rounded-xl"
                    required
                  />
                </div>
                {zones.length > 0 && (
                  <div>
                    <Label className="text-xs">{t('Dining Zone')}</Label>
                    <select
                      className="manager-select w-full h-11"
                      value={resZone}
                      onChange={e => {
                        setResZone(e.target.value);
                        setResSlot('');
                      }}
                    >
                      <option value="">{t('Any Zone')}</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>
                          {language === 'ar' && z.nameAr ? z.nameAr : z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">{t('Available Times')}</Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1 max-h-40 overflow-y-auto p-1">
                  {availabilityLoading ? (
                    <p className="col-span-full text-xs text-muted-foreground">Checking tables…</p>
                  ) : availabilitySlots.length === 0 ? (
                    <p className="col-span-full text-xs text-muted-foreground">No open tables for this filter.</p>
                  ) : (
                    availabilitySlots.map(slot => (
                      <button
                        key={slot.startIso}
                        type="button"
                        onClick={() => setResSlot(slot.startIso)}
                        className={`min-h-11 py-2 px-2 rounded-xl border text-xs font-semibold font-mono cursor-pointer transition-colors ${
                          resSlot === slot.startIso
                            ? 'bg-[#EFEAFF] text-[#4B1FE0] border-[#6236FF] ring-1 ring-[#6236FF]'
                            : 'bg-[#F6F5FC] border-[#E5E2F2] text-[#17132E] hover:bg-[#EFEAFF] hover:text-[#4B1FE0]'
                        }`}
                      >
                        <span className="block">{slot.time}</span>
                        {slot.requiresCombination && (
                          <span className="block text-[10px] font-sans uppercase tracking-tight text-[#4B1FE0]">
                            Joined
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('Your Name')} *</Label>
                  <Input
                    value={resName}
                    onChange={e => setResName(e.target.value)}
                    required
                    className="h-11 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs">Mobile Phone *</Label>
                  <Input
                    type="tel"
                    value={resPhone}
                    onChange={e => setResPhone(e.target.value)}
                    placeholder="+974 …"
                    required
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              <Input
                value={resNotes}
                onChange={e => setResNotes(e.target.value)}
                placeholder="Special requests (high chair, celebration…)"
                className="h-11 rounded-xl"
              />
              {restaurant.orderingMode === 'full_online_checkout' && Number(restaurant.reservationDepositAmount || 0) > 0 && (
                <p className="rounded-xl bg-[#EFEAFF] text-[#4B1FE0] px-3 py-2 text-xs font-semibold">
                  Table deposit applied at confirmation: {Number(restaurant.reservationDepositAmount).toFixed(2)}{' '}
                  {restaurant.currency}
                </p>
              )}
              {resError && <p className="text-xs text-destructive font-medium">{resError}</p>}

              <Button
                type="submit"
                className="w-full min-h-12 rounded-xl font-semibold cursor-pointer"
                disabled={!resSlot || !resName.trim() || !resPhone.trim() || reservePending}
              >
                {reservePending ? 'Booking…' : t('Confirm Reservation')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 3. Live Walk-In Virtual Waitlist Dialog */}
      <Dialog open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <span>{t('Join Live Waitlist')}</span>
          </DialogTitle>
          <DialogDescription>{t('Skip the crowd. Your table will ding you.')}</DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              onSubmitWaitlist();
            }}
            className="space-y-3.5 mt-2"
          >
            <div className="space-y-1.5">
              <Label className="text-xs">{t('Party Size')}</Label>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {partyOptions.slice(0, 8).map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWlParty(n)}
                    className={`min-w-11 min-h-11 px-3 rounded-xl border text-xs font-bold font-mono transition-colors cursor-pointer shrink-0 ${
                      wlParty === n
                        ? 'bg-[#6236FF] text-white border-[#6236FF]'
                        : 'bg-[#F6F5FC] text-[#17132E] border-[#E5E2F2] hover:bg-[#EFEAFF]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">{t('Your Name')} *</Label>
              <Input value={wlName} onChange={e => setWlName(e.target.value)} required className="h-11 rounded-xl" />
            </div>

            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5">
              <div>
                <Label className="text-xs">{t('Phone (Optional)')}</Label>
                <Input type="tel" value={wlPhone} onChange={e => setWlPhone(e.target.value)} className="h-11 rounded-xl" />
              </div>
              {zones.length > 0 && (
                <div>
                  <Label className="text-xs">{t('Dining Zone')}</Label>
                  <select className="manager-select w-full h-11" value={wlZone} onChange={e => setWlZone(e.target.value)}>
                    <option value="">{t('Any Zone')}</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>
                        {language === 'ar' && z.nameAr ? z.nameAr : z.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {wlError && <p className="text-xs text-destructive">{wlError}</p>}
            <Button
              type="submit"
              className="w-full min-h-12 rounded-xl font-semibold cursor-pointer"
              disabled={!wlName.trim() || waitlistPending}
            >
              {waitlistPending ? 'Joining…' : t('Join Waitlist')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 4. Curbside / Drive-Thru Car-Side Check-In Dialog */}
      <Dialog open={curbsideOpen} onOpenChange={setCurbsideOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-primary" />
            <span>{t('Curbside & Drive-Thru')}</span>
          </DialogTitle>
          <DialogDescription>{t("Park easy. Scan your bay and we'll bring it out.")}</DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              onSubmitCurbside();
            }}
            className="space-y-3 mt-2"
          >
            <div>
              <Label className="text-xs">{t('Select Parking Bay')} *</Label>
              <select
                className="manager-select w-full h-11"
                value={csBayId}
                onChange={e => setCsBayId(e.target.value)}
                required
              >
                <option value="">Choose bay or lane…</option>
                {bays.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('Vehicle Color')}</Label>
                <select className="manager-select w-full h-11" value={csColor} onChange={e => setCsColor(e.target.value)}>
                  {venueCfg.vehicleColors.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('Vehicle Type')}</Label>
                <select className="manager-select w-full h-11" value={csType} onChange={e => setCsType(e.target.value)}>
                  {venueCfg.vehicleTypes.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('License Plate')} *</Label>
                <Input
                  value={csPlate}
                  onChange={e => setCsPlate(e.target.value)}
                  placeholder="QAT 49120"
                  required
                  className="h-11 rounded-xl font-mono uppercase"
                />
              </div>
              <div>
                <Label className="text-xs">{t('Your Name')}</Label>
                <Input
                  value={csName}
                  onChange={e => setCsName(e.target.value)}
                  placeholder="Guest"
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            {csError && <p className="text-xs text-destructive">{csError}</p>}
            <Button
              type="submit"
              className="w-full min-h-12 rounded-xl font-semibold cursor-pointer"
              disabled={!csBayId || !csPlate.trim() || curbsidePending}
            >
              {curbsidePending ? 'Checking in…' : t("I'm Here — Check In")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
