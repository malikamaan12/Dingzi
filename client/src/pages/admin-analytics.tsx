import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  CalendarCheck,
  Clock,
  MousePointerClick,
  QrCode,
  ShoppingBag,
  Star,
  Wifi,
} from 'lucide-react';

const CHANNEL_LABELS: Record<string, string> = {
  counter_pickup: 'Counter Pickup',
  dine_in: 'Dine-In Table',
  curbside: 'Curbside Bay',
  drive_thru: 'Drive-Thru Lane',
};

export default function AdminAnalyticsPage() {
  const query = useQuery<{
    summary: {
      totalTickets: number;
      activeTickets: number;
      avgPrepMins: number;
      slaCompliancePct: number;
      avgRating: number | null;
      ratingsCount: number;
      totalOrders: number;
      paidRevenue: string;
      currency: string;
      reservationsCount: number;
      waitlistCount: number;
      aggregatorClicksTotal: number;
      totalQrScans?: number;
      totalNfcTaps?: number;
      smartTagsCount?: number;
    };
    ordersByChannel?: Record<string, { count: number; revenue: string }>;
    topSmartTags?: {
      id: string;
      tagCode: string;
      label: string;
      targetType: string;
      qrScans: number;
      nfcTaps: number;
    }[];
    clicksByPlatform: Record<string, number>;
    topClickedItems?: { itemId: string; name: string; clicks: number }[];
    hourlyBuckets: { hour: number; tickets: number; orders: number; avgPrepMins?: number }[];
  }>({
    queryKey: ['/api/hospitality/analytics'],
    refetchInterval: 15_000,
  });

  if (query.isLoading) return <p role="status">Loading branch analytics…</p>;
  const data = query.data;
  if (!data) return <p>Analytics unavailable.</p>;

  const {
    summary,
    ordersByChannel = {},
    topSmartTags = [],
    clicksByPlatform,
    topClickedItems = [],
    hourlyBuckets,
  } = data;
  const maxHourCount = Math.max(1, ...hourlyBuckets.map(b => b.tickets + b.orders));
  const maxHourPrep = Math.max(10, ...hourlyBuckets.map(b => b.avgPrepMins || 0));
  const totalScansAndTaps = (summary.totalQrScans || 0) + (summary.totalNfcTaps || 0);

  const cards = [
    { label: 'Avg Prep Time', value: `${summary.avgPrepMins} min`, sub: `${summary.slaCompliancePct}% within 10m SLA`, icon: Clock },
    { label: 'Virtual Pagers Issued', value: String(summary.totalTickets), sub: `${summary.activeTickets} currently active`, icon: Bell },
    { label: 'Orders & Volume', value: String(summary.totalOrders), sub: `${summary.paidRevenue} ${summary.currency} settled/venue`, icon: ShoppingBag },
    { label: 'QR Scans & NFC Taps', value: String(totalScansAndTaps), sub: `${summary.totalQrScans || 0} QR · ${summary.totalNfcTaps || 0} NFC (${summary.smartTagsCount || 0} tags)`, icon: Wifi },
    { label: 'Bookings & Waitlist', value: String(summary.reservationsCount + summary.waitlistCount), sub: `${summary.reservationsCount} booked · ${summary.waitlistCount} walk-in`, icon: CalendarCheck },
    { label: 'Guest Satisfaction', value: summary.avgRating ? `${summary.avgRating} / 5` : '—', sub: `${summary.ratingsCount} ratings · ${summary.aggregatorClicksTotal} delivery clicks`, icon: Star },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <p className="manager-eyebrow">DINGZI SLA &amp; CONTACTLESS TELEMETRY</p>
        <h1 className="text-2xl sm:text-3xl font-bold">Branch Operations &amp; SLA Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Real-time prep-time SLA compliance, hourly peak congestion, order channel mix, QR/NFC engagement, and delivery click attribution.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.label} className="manager-panel p-5 flex items-start justify-between gap-3">
            <div>
              <span className="text-xs uppercase font-semibold text-muted-foreground">{c.label}</span>
              <strong className="block text-3xl font-black mt-1">{c.value}</strong>
              <span className="text-xs text-muted-foreground mt-1 block">{c.sub}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <c.icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-8 manager-panel p-5 space-y-6 min-w-0">
          <div>
            <h2 className="font-bold text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Hourly Queue &amp; Order Congestion (24h)
            </h2>
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="grid grid-cols-24 min-w-[540px] gap-1.5 items-end h-40 pt-4">
                {hourlyBuckets.map(bucket => {
                  const total = bucket.tickets + bucket.orders;
                  const pct = Math.max(6, Math.round((total / maxHourCount) * 100));
                  return (
                    <div key={bucket.hour} className="flex flex-col items-center gap-1 h-full justify-end">
                      <div
                        title={`${String(bucket.hour).padStart(2, '0')}:00 — ${bucket.tickets} pagers, ${bucket.orders} orders`}
                        style={{ height: `${pct}%` }}
                        className={`w-full rounded-t-md transition-all ${total > 0 ? 'bg-primary' : 'bg-muted'}`}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">{String(bucket.hour).padStart(2, '0')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Hourly Average Prep-Time SLA (mins)
            </h3>
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="grid grid-cols-24 min-w-[540px] gap-1.5 items-end h-32 pt-3">
                {hourlyBuckets.map(bucket => {
                  const prep = bucket.avgPrepMins || 0;
                  const pct = Math.max(6, Math.round((prep / maxHourPrep) * 100));
                  const barTone = prep > 15 ? 'bg-destructive' : prep > 10 ? 'bg-amber-500' : prep > 0 ? 'bg-[#C8FF42]' : 'bg-muted';
                  return (
                    <div key={`prep-${bucket.hour}`} className="flex flex-col items-center gap-1 h-full justify-end">
                      <div
                        title={`${String(bucket.hour).padStart(2, '0')}:00 — Avg prep ${prep} min`}
                        style={{ height: `${pct}%` }}
                        className={`w-full rounded-t-md transition-all ${barTone}`}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">{String(bucket.hour).padStart(2, '0')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Order Channel Breakdown */}
          <div className="pt-4 border-t space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-primary" />
              Order Volume &amp; Revenue by Service Channel
            </h3>
            {Object.keys(ordersByChannel).length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Dine-in table, counter pickup, curbside bay, and drive-thru orders appear here automatically.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.entries(ordersByChannel).map(([channel, info]) => {
                  const pct = Math.min(100, Math.round((info.count / Math.max(1, summary.totalOrders)) * 100));
                  return (
                    <div key={channel} className="rounded-xl border p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between font-semibold">
                        <span>{CHANNEL_LABELS[channel] || channel.replace('_', ' ')}</span>
                        <span className="font-mono">
                          {info.count} · {info.revenue} {summary.currency}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-[#6236FF] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-4 space-y-5">
          {/* QR & NFC Smart Tag Leaderboard */}
          <div className="manager-panel p-5 space-y-3">
            <h2 className="font-bold text-base flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" />
              QR &amp; NFC Smart Tag Engagement
            </h2>
            {topSmartTags.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Provision smart tags or reusable coasters in the QR &amp; NFC Studio to track camera scans vs phone taps.
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {topSmartTags.map(tag => (
                  <li key={tag.id} className="rounded-xl border px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="font-mono block truncate">{tag.tagCode}</strong>
                      <span className="text-muted-foreground truncate block">{tag.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono shrink-0">
                      <span className="px-2 py-0.5 rounded bg-muted">QR {tag.qrScans}</span>
                      <span className="px-2 py-0.5 rounded bg-[#EFEAFF] text-[#4B1FE0] font-bold">
                        NFC {tag.nfcTaps}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="manager-panel p-5 space-y-4">
            <div className="space-y-3">
              <h2 className="font-bold text-base flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-primary" />
                Outbound Aggregator Demand
              </h2>
              {Object.keys(clicksByPlatform).length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">
                  Clicks on Talabat Qatar, Snoonu, and Keeta Qatar appear here automatically.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(clicksByPlatform).map(([platform, count]) => (
                    <div key={platform} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold uppercase">
                        <span>{platform}</span>
                        <span>{count} clicks</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round((count / Math.max(1, summary.aggregatorClicksTotal)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {topClickedItems.length > 0 && (
              <div className="pt-3 border-t space-y-2">
                <h3 className="font-bold text-sm">Top Delivery-Clicked Items</h3>
                <ul className="space-y-1.5 text-xs">
                  {topClickedItems.map(item => (
                    <li key={item.itemId} className="flex items-center justify-between rounded-xl border px-3 py-2">
                      <span className="font-medium truncate">{item.name}</span>
                      <span className="font-mono font-bold text-primary shrink-0">{item.clicks}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
