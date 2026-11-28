import { useState } from 'react';
import { Link } from 'wouter';
import {
  BellRing,
  Check,
  Copy,
  ExternalLink,
  Monitor,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
  Users,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { publicExperienceOrigin } from '@shared/menuIdentity';

interface QrMechanismExplainerProps {
  cafeId: string;
  cafeName: string;
  cafeSlug?: string | null;
  onQuickCreatePreset?: (preset: {
    tagCode: string;
    label: string;
    targetType: 'venue_menu' | 'dining_table' | 'waitlist_join';
  }) => void;
  onBulkCoasters?: () => void;
  canManageTags?: boolean;
}

export function QrMechanismExplainer({
  cafeId,
  cafeName,
  cafeSlug,
  onQuickCreatePreset,
  onBulkCoasters,
  canManageTags = true,
}: QrMechanismExplainerProps) {
  const { toast } = useToast();
  const [copiedScreen, setCopiedScreen] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicBase = publicExperienceOrigin(origin);
  const clearScreenUrl = `${publicBase}/screen/${cafeSlug || cafeId}`;

  async function copyScreenUrl() {
    try {
      await navigator.clipboard.writeText(clearScreenUrl);
      setCopiedScreen(true);
      toast({
        title: 'Clear QR Display URL copied',
        description: 'Open this URL on any counter tablet, iPad, or customer-facing screen.',
      });
      window.setTimeout(() => setCopiedScreen(false), 2200);
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-5" data-testid="section-qr-mechanism-explainer">
      {/* 1. Dedicated Clear Counter Display Screen Launcher */}
      <section className="rounded-3xl bg-[#17132E] text-white border border-[#241E42] p-5 sm:p-7 shadow-xl">
        <div className="grid lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C8FF42] text-[#17132E] text-xs font-extrabold">
              <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Customer-Facing Clear QR Screen</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight">
              Turn Any Counter Tablet or Screen into a Clear QR Stand
            </h2>
            <p className="text-sm text-white/80 leading-relaxed max-w-2xl">
              Show a distraction-free, high-contrast QR screen to guests at {cafeName}. In <strong>Live Register Mode</strong>, whenever your cashier issues an order pager, that guest’s private QR automatically pops up on the counter screen — and clears the instant they scan it so only their phone rings!
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Button
                asChild
                data-testid="button-launch-live-counter-display"
                className="min-h-11 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-2"
              >
                <Link href="/admin/counter-display">
                  <Monitor className="w-4 h-4" />
                  <span>Open Live Counter Screen</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                data-testid="button-open-public-clear-screen"
                className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-2"
              >
                <a href={clearScreenUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Standalone Clear QR Screen</span>
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={copyScreenUrl}
                data-testid="button-copy-clear-screen-url"
                className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-2"
              >
                {copiedScreen ? <Check className="w-4 h-4 text-[#C8FF42]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedScreen ? 'Copied Display Link' : 'Copy Display Link'}</span>
              </Button>
            </div>
          </div>

          {/* Mini Clear Screen Visual Diagram */}
          <div className="lg:col-span-5 rounded-2xl bg-[#241E42] border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white/90">Two Display Modes Included:</span>
              <span className="font-mono text-[#C8FF42] font-bold">100% Silent Display</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="rounded-xl bg-[#17132E] p-3 border border-white/10">
                <strong className="text-white block">1. Live Register Handoff (/admin/counter-display)</strong>
                <span className="text-white/70">
                  Auto-displays each customer’s private Order Pager QR when rung up at the desk, then auto-resets after scan.
                </span>
              </div>
              <div className="rounded-xl bg-[#17132E] p-3 border border-white/10">
                <strong className="text-white block">2. Kiosk / TV Clear Screen (/screen/{cafeSlug || 'venue'})</strong>
                <span className="text-white/70">
                  Zero-login URL for entrance stands, counter iPads, or TVs showing Menu QR, Waitlist QR &amp; Ready numbers.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Plain-Language 3-Step Flow: Why ONLY That Guest's Phone Rings */}
      <section className="rounded-3xl border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#6236FF]">
              HOW PRIVATE 1-TO-1 RINGING WORKS
            </p>
            <h2 className="text-lg sm:text-xl font-display font-bold mt-0.5">
              Simple 3-Step Flow — Only the Guest Whose Food Is Ready Rings
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFEAFF] text-[#4B1FE0] text-xs font-bold">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Isolated Secret Token Per Order</span>
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-3.5">
          <div className="rounded-2xl border bg-[#F6F5FC] text-[#17132E] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-[#6236FF] text-white grid place-items-center font-mono font-extrabold text-sm">
                1
              </span>
              <QrCode className="w-5 h-5 text-[#6236FF]" aria-hidden="true" />
            </div>
            <h3 className="font-display font-bold text-sm">Guest Scans QR or Taps NFC</h3>
            <p className="text-xs text-[#57507A] leading-relaxed">
              Guest orders from a Table/Menu QR, scans their personal ticket QR on the Counter Screen, or taps a Reusable NFC Coaster (`COASTER-01`). No app download.
            </p>
          </div>

          <div className="rounded-2xl border bg-[#F6F5FC] text-[#17132E] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-[#6236FF] text-white grid place-items-center font-mono font-extrabold text-sm">
                2
              </span>
              <Smartphone className="w-5 h-5 text-[#6236FF]" aria-hidden="true" />
            </div>
            <h3 className="font-display font-bold text-sm">1-to-1 Ticket Locks to Their Phone</h3>
            <p className="text-xs text-[#57507A] leading-relaxed">
              Each order gets a unique unguessable pass (`/pager/secret-id`). The Counter Screen immediately clears once scanned so the next customer never gets the same link.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-[#17132E] bg-[#C8FF42] text-[#17132E] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-[#17132E] text-[#C8FF42] grid place-items-center font-mono font-extrabold text-sm">
                3
              </span>
              <BellRing className="w-5 h-5 text-[#17132E]" aria-hidden="true" />
            </div>
            <h3 className="font-display font-extrabold text-sm">Only THAT Person’s Phone Dings!</h3>
            <p className="text-xs text-[#17132E]/85 leading-relaxed font-medium">
              When Barista taps <strong>Ready</strong>, only that guest’s phone chimes &amp; vibrates. Other guests, staff tablets, and counter displays remain 100% silent.
            </p>
          </div>
        </div>

        {/* Quick 1-Tap Station Presets for Cafés & Restaurants */}
        {canManageTags && onQuickCreatePreset && onBulkCoasters && (
          <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#6236FF]" aria-hidden="true" />
              <span>Quick 1-Tap Café &amp; Restaurant Presets:</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onQuickCreatePreset({
                    tagCode: 'COUNTER-MENU',
                    label: 'Counter Menu Stand (QR + NFC)',
                    targetType: 'venue_menu',
                  })
                }
                className="min-h-11 rounded-xl text-xs cursor-pointer gap-1.5"
              >
                <UtensilsCrossed className="w-3.5 h-3.5 text-[#6236FF]" />
                <span>+ Counter Menu QR/NFC</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onQuickCreatePreset({
                    tagCode: 'TABLE-DISC',
                    label: 'Table Ordering Disc (QR + NFC)',
                    targetType: 'dining_table',
                  })
                }
                className="min-h-11 rounded-xl text-xs cursor-pointer gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5 text-[#6236FF]" />
                <span>+ Table QR/NFC</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onQuickCreatePreset({
                    tagCode: 'WAITLIST-STAND',
                    label: 'Entrance Walk-In Waitlist Stand',
                    targetType: 'waitlist_join',
                  })
                }
                className="min-h-11 rounded-xl text-xs cursor-pointer gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-[#6236FF]" />
                <span>+ Waitlist QR/NFC</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onBulkCoasters}
                className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white text-xs font-semibold cursor-pointer gap-1.5"
              >
                <Wifi className="w-3.5 h-3.5 rotate-90" />
                <span>+ 5 NFC Pager Coasters</span>
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
