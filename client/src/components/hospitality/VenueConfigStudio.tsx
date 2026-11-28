import { useState } from 'react';
import {
  BellRing,
  Car,
  Languages,
  Plus,
  Receipt,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CURRENCY_ARABIC_SYMBOLS,
  DEFAULT_VENUE_CONFIG,
  resolveVenueConfig,
  type VenueConfig,
} from '@shared/venueConfig';

interface VenueConfigStudioProps {
  value: VenueConfig;
  currency: string;
  onChange: (next: VenueConfig) => void;
}

function parseCommaList(raw: string, maxItems: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const clean = part.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean.slice(0, 40));
    if (out.length >= maxItems) break;
  }
  return out;
}

export function VenueConfigStudio({ value, currency, onChange }: VenueConfigStudioProps) {
  const resolved = resolveVenueConfig(value);
  const [newPhraseEn, setNewPhraseEn] = useState('');
  const [newPhraseAr, setNewPhraseAr] = useState('');

  const patch = (partial: Partial<VenueConfig>) => {
    const next: Record<string, unknown> = { ...value, ...partial };
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) delete next[k];
    }
    onChange(next as VenueConfig);
  };

  const customPairs = Object.entries(resolved.customTranslations);

  const addTranslationPair = () => {
    const en = newPhraseEn.trim();
    const ar = newPhraseAr.trim();
    if (!en || !ar) return;
    patch({
      customTranslations: {
        ...resolved.customTranslations,
        [en]: ar,
      },
    });
    setNewPhraseEn('');
    setNewPhraseAr('');
  };

  const removeTranslationPair = (enKey: string) => {
    const copy = { ...resolved.customTranslations };
    delete copy[enKey];
    patch({ customTranslations: copy });
  };

  return (
    <div className="space-y-6">
      {/* 1. Queue, Ticket Prefixes & Operational Timers */}
      <section className="manager-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BellRing className="w-5 h-5 text-primary" />
              <span>Queue Prefixes, Timers &amp; Floor Rules</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Every ticket prefix, SLA countdown, hold timer, party-size cap, and Google review star gate is controlled here.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              patch({
                pagerTicketPrefix: undefined,
                waitlistTicketPrefix: undefined,
                posOrderPrefix: undefined,
                defaultPrepMins: undefined,
                rebuzzCooldownSecs: undefined,
                waitlistHoldMins: undefined,
                depositHoldMins: undefined,
                maxPartySize: undefined,
                reviewPromptMinStars: undefined,
              })
            }
            className="min-h-11 rounded-xl cursor-pointer gap-1.5 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Operational Defaults</span>
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="vc-pager-prefix">Pager Ticket Prefix</Label>
            <Input
              id="vc-pager-prefix"
              value={value.pagerTicketPrefix ?? DEFAULT_VENUE_CONFIG.pagerTicketPrefix}
              onChange={e => patch({ pagerTicketPrefix: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'A' })}
              placeholder="A"
              className="h-11 font-mono uppercase"
            />
            <span className="text-[11px] text-muted-foreground">Issues `{resolved.pagerTicketPrefix}-001`</span>
          </div>
          <div>
            <Label htmlFor="vc-waitlist-prefix">Waitlist Ticket Prefix</Label>
            <Input
              id="vc-waitlist-prefix"
              value={value.waitlistTicketPrefix ?? DEFAULT_VENUE_CONFIG.waitlistTicketPrefix}
              onChange={e => patch({ waitlistTicketPrefix: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'W' })}
              placeholder="W"
              className="h-11 font-mono uppercase"
            />
            <span className="text-[11px] text-muted-foreground">Issues `{resolved.waitlistTicketPrefix}-001`</span>
          </div>
          <div>
            <Label htmlFor="vc-pos-prefix">POS Order Prefix</Label>
            <Input
              id="vc-pos-prefix"
              value={value.posOrderPrefix ?? DEFAULT_VENUE_CONFIG.posOrderPrefix}
              onChange={e => patch({ posOrderPrefix: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'POS' })}
              placeholder="POS"
              className="h-11 font-mono uppercase"
            />
            <span className="text-[11px] text-muted-foreground">Issues `{resolved.posOrderPrefix}-...`</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="vc-prep-mins">Default Prep Time (mins)</Label>
            <Input
              id="vc-prep-mins"
              type="number"
              min={1}
              max={180}
              value={resolved.defaultPrepMins}
              onChange={e => patch({ defaultPrepMins: Math.max(1, Math.min(180, Number(e.target.value) || 10)) })}
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="vc-rebuzz-secs">Re-Buzz Cooldown (secs)</Label>
            <Input
              id="vc-rebuzz-secs"
              type="number"
              min={5}
              max={300}
              value={resolved.rebuzzCooldownSecs}
              onChange={e => patch({ rebuzzCooldownSecs: Math.max(5, Math.min(300, Number(e.target.value) || 20)) })}
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="vc-hold-mins">Waitlist Table Hold (mins)</Label>
            <Input
              id="vc-hold-mins"
              type="number"
              min={2}
              max={120}
              value={resolved.waitlistHoldMins}
              onChange={e => patch({ waitlistHoldMins: Math.max(2, Math.min(120, Number(e.target.value) || 10)) })}
              className="h-11 font-mono"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="vc-deposit-hold">Deposit Slot Hold (mins)</Label>
            <Input
              id="vc-deposit-hold"
              type="number"
              min={5}
              max={120}
              value={resolved.depositHoldMins}
              onChange={e => patch({ depositHoldMins: Math.max(5, Math.min(120, Number(e.target.value) || 15)) })}
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="vc-max-party">Max Online Party Size</Label>
            <Input
              id="vc-max-party"
              type="number"
              min={1}
              max={60}
              value={resolved.maxPartySize}
              onChange={e => patch({ maxPartySize: Math.max(1, Math.min(60, Number(e.target.value) || 12)) })}
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="vc-review-stars">Google Review Min Stars (1–5)</Label>
            <Input
              id="vc-review-stars"
              type="number"
              min={1}
              max={5}
              value={resolved.reviewPromptMinStars}
              onChange={e => patch({ reviewPromptMinStars: Math.max(1, Math.min(5, Number(e.target.value) || 4)) })}
              className="h-11 font-mono"
            />
          </div>
        </div>
      </section>

      {/* 2. Tax, VAT, Service Charge & Arabic Currency Symbol */}
      <section className="manager-panel p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <span>Tax / VAT, Service Charge &amp; Currency Display</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Applied automatically to online cart orders and Reception POS orders. Set 0% when menu prices are tax-inclusive.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="vc-tax-pct">Tax / VAT (%)</Label>
            <Input
              id="vc-tax-pct"
              type="number"
              min={0}
              max={50}
              step="0.1"
              value={resolved.taxPercent}
              onChange={e => patch({ taxPercent: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="vc-tax-label">Tax Label (English)</Label>
            <Input
              id="vc-tax-label"
              value={value.taxLabel ?? DEFAULT_VENUE_CONFIG.taxLabel}
              onChange={e => patch({ taxLabel: e.target.value })}
              placeholder="VAT"
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="vc-tax-label-ar">Tax Label (Arabic)</Label>
            <Input
              id="vc-tax-label-ar"
              dir="rtl"
              value={value.taxLabelAr ?? DEFAULT_VENUE_CONFIG.taxLabelAr}
              onChange={e => patch({ taxLabelAr: e.target.value })}
              placeholder="ضريبة القيمة المضافة"
              className="h-11"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vc-service-pct">Service Charge (%)</Label>
            <Input
              id="vc-service-pct"
              type="number"
              min={0}
              max={30}
              step="0.1"
              value={resolved.serviceChargePercent}
              onChange={e => patch({ serviceChargePercent: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="vc-currency-ar">Custom Arabic Currency Symbol (optional)</Label>
            <Input
              id="vc-currency-ar"
              dir="rtl"
              value={value.currencySymbolAr ?? ''}
              onChange={e => patch({ currencySymbolAr: e.target.value })}
              placeholder={CURRENCY_ARABIC_SYMBOLS[currency] || currency}
              className="h-11"
            />
          </div>
        </div>
      </section>

      {/* 3. Catalog Tags, Allergens & Curbside Vehicle Presets */}
      <section className="manager-panel p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Car className="w-5 h-5 text-primary" />
            <span>Catalog Presets &amp; Curbside Vehicle Options</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Customize the dietary tags, allergen chips, default item unit, and curbside car colors/body types shown in editors and check-in forms (comma-separated).
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="vc-default-unit">Default Menu Item Unit</Label>
            <Input
              id="vc-default-unit"
              value={value.defaultItemUnit ?? DEFAULT_VENUE_CONFIG.defaultItemUnit}
              onChange={e => patch({ defaultItemUnit: e.target.value })}
              placeholder="serving"
              className="h-11"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="vc-dietary-tags">Dietary &amp; Feature Tag Options</Label>
            <Input
              id="vc-dietary-tags"
              defaultValue={resolved.dietaryTagOptions.join(', ')}
              key={`dietary-${resolved.dietaryTagOptions.join('|') === DEFAULT_VENUE_CONFIG.dietaryTagOptions.join('|') ? 'def' : 'custom'}`}
              onBlur={e => {
                const parsed = parseCommaList(e.target.value, 24);
                patch({ dietaryTagOptions: parsed.length ? parsed : [...DEFAULT_VENUE_CONFIG.dietaryTagOptions] });
              }}
              className="h-11"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="vc-allergens">Allergen Warning Options</Label>
          <Input
            id="vc-allergens"
            defaultValue={resolved.allergenOptions.join(', ')}
            key={`allergen-${resolved.allergenOptions.join('|') === DEFAULT_VENUE_CONFIG.allergenOptions.join('|') ? 'def' : 'custom'}`}
            onBlur={e => {
              const parsed = parseCommaList(e.target.value, 24);
              patch({ allergenOptions: parsed.length ? parsed : [...DEFAULT_VENUE_CONFIG.allergenOptions] });
            }}
            className="h-11"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vc-car-colors">Curbside Vehicle Colors</Label>
            <Input
              id="vc-car-colors"
              defaultValue={resolved.vehicleColors.join(', ')}
              key={`colors-${resolved.vehicleColors.join('|') === DEFAULT_VENUE_CONFIG.vehicleColors.join('|') ? 'def' : 'custom'}`}
              onBlur={e => {
                const parsed = parseCommaList(e.target.value, 20);
                patch({ vehicleColors: parsed.length ? parsed : [...DEFAULT_VENUE_CONFIG.vehicleColors] });
              }}
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="vc-car-types">Curbside Vehicle Body Types</Label>
            <Input
              id="vc-car-types"
              defaultValue={resolved.vehicleTypes.join(', ')}
              key={`types-${resolved.vehicleTypes.join('|') === DEFAULT_VENUE_CONFIG.vehicleTypes.join('|') ? 'def' : 'custom'}`}
              onBlur={e => {
                const parsed = parseCommaList(e.target.value, 15);
                patch({ vehicleTypes: parsed.length ? parsed : [...DEFAULT_VENUE_CONFIG.vehicleTypes] });
              }}
              className="h-11"
            />
          </div>
        </div>
      </section>

      {/* 4. Storefront Copy, Discovery Wheel & Custom EN -> AR Dictionary */}
      <section className="manager-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span>Storefront Copy, Discovery Wheel &amp; Translations</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Edit every guest-facing banner, allergen disclaimer, ready-pass alert, and custom English → Arabic dictionary term.
            </p>
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
            <Switch
              checked={resolved.wheelEnabled}
              onCheckedChange={wheelEnabled => patch({ wheelEnabled })}
            />
            <span>Spin-the-Menu Wheel</span>
          </label>
        </div>

        {resolved.wheelEnabled && (
          <div className="max-w-xs">
            <Label htmlFor="vc-wheel-max">Max Items on Spin Wheel (3–12)</Label>
            <Input
              id="vc-wheel-max"
              type="number"
              min={3}
              max={12}
              value={resolved.wheelMaxItems}
              onChange={e => patch({ wheelMaxItems: Math.max(3, Math.min(12, Number(e.target.value) || 8)) })}
              className="h-11 font-mono"
            />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vc-eyebrow-en">Menu Header Eyebrow (EN)</Label>
            <Input
              id="vc-eyebrow-en"
              value={value.menuEyebrow ?? DEFAULT_VENUE_CONFIG.menuEyebrow}
              onChange={e => patch({ menuEyebrow: e.target.value })}
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="vc-eyebrow-ar">Menu Header Eyebrow (AR)</Label>
            <Input
              id="vc-eyebrow-ar"
              dir="rtl"
              value={value.menuEyebrowAr ?? DEFAULT_VENUE_CONFIG.menuEyebrowAr}
              onChange={e => patch({ menuEyebrowAr: e.target.value })}
              className="h-11"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vc-footer-en">Footer Tagline (EN)</Label>
            <Input
              id="vc-footer-en"
              value={value.footerTagline ?? DEFAULT_VENUE_CONFIG.footerTagline}
              onChange={e => patch({ footerTagline: e.target.value })}
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="vc-footer-ar">Footer Tagline (AR)</Label>
            <Input
              id="vc-footer-ar"
              dir="rtl"
              value={value.footerTaglineAr ?? DEFAULT_VENUE_CONFIG.footerTaglineAr}
              onChange={e => patch({ footerTaglineAr: e.target.value })}
              className="h-11"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vc-allergen-en">Allergen Footer Notice (EN)</Label>
            <Input
              id="vc-allergen-en"
              value={value.allergenNotice ?? DEFAULT_VENUE_CONFIG.allergenNotice}
              onChange={e => patch({ allergenNotice: e.target.value })}
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="vc-allergen-ar">Allergen Footer Notice (AR)</Label>
            <Input
              id="vc-allergen-ar"
              dir="rtl"
              value={value.allergenNoticeAr ?? DEFAULT_VENUE_CONFIG.allergenNoticeAr}
              onChange={e => patch({ allergenNoticeAr: e.target.value })}
              className="h-11"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vc-pager-ready-en">Order Ready Alert Message (EN)</Label>
            <Input
              id="vc-pager-ready-en"
              value={value.pagerReadySubtitle ?? DEFAULT_VENUE_CONFIG.pagerReadySubtitle}
              onChange={e => patch({ pagerReadySubtitle: e.target.value })}
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="vc-pager-ready-ar">Order Ready Alert Message (AR)</Label>
            <Input
              id="vc-pager-ready-ar"
              dir="rtl"
              value={value.pagerReadySubtitleAr ?? DEFAULT_VENUE_CONFIG.pagerReadySubtitleAr}
              onChange={e => patch({ pagerReadySubtitleAr: e.target.value })}
              className="h-11"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vc-waitlist-ready-en">Table Ready Message (EN · supports `{'{mins}'}`)</Label>
            <Input
              id="vc-waitlist-ready-en"
              value={value.waitlistReadySubtitle ?? DEFAULT_VENUE_CONFIG.waitlistReadySubtitle}
              onChange={e => patch({ waitlistReadySubtitle: e.target.value })}
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="vc-waitlist-ready-ar">Table Ready Message (AR · supports `{'{mins}'}`)</Label>
            <Input
              id="vc-waitlist-ready-ar"
              dir="rtl"
              value={value.waitlistReadySubtitleAr ?? DEFAULT_VENUE_CONFIG.waitlistReadySubtitleAr}
              onChange={e => patch({ waitlistReadySubtitleAr: e.target.value })}
              className="h-11"
            />
          </div>
        </div>

        {/* Custom EN -> AR Dictionary */}
        <div className="pt-3 border-t space-y-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Languages className="w-4 h-4 text-primary" />
              <span>Custom English → Arabic Term Overrides</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Add custom translations for tags, units, or labels specific to your venue.
            </p>
          </div>

          {customPairs.length > 0 && (
            <div className="space-y-1.5">
              {customPairs.map(([enText, arText]) => (
                <div key={enText} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-xs">
                  <span className="font-medium truncate">{enText}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span dir="rtl" className="font-semibold text-primary">{arText}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove translation for ${enText}`}
                      onClick={() => removeTranslationPair(enText)}
                      className="h-8 w-8 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-5 gap-2 items-end">
            <div className="sm:col-span-2">
              <Label htmlFor="vc-dict-en" className="text-xs">English Term</Label>
              <Input
                id="vc-dict-en"
                value={newPhraseEn}
                onChange={e => setNewPhraseEn(e.target.value)}
                placeholder="e.g. Wood-Fired"
                className="h-11"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="vc-dict-ar" className="text-xs">Arabic Translation</Label>
              <Input
                id="vc-dict-ar"
                dir="rtl"
                value={newPhraseAr}
                onChange={e => setNewPhraseAr(e.target.value)}
                placeholder="مخبوز على الحطب"
                className="h-11"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!newPhraseEn.trim() || !newPhraseAr.trim()}
              onClick={addTranslationPair}
              className="min-h-11 rounded-xl cursor-pointer gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
