import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Camera,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import PermanentMenuQR from '@/components/permanent-menu-qr';
import { NfcEncodeDialog, type NfcEncodeTarget } from '@/components/qr-nfc/NfcEncodeDialog';
import { QrNfcScannerModal } from '@/components/qr-nfc/QrNfcScannerModal';
import { downloadDualQrNfcPlaqueSvg, exportNdefBatchCsv } from '@/lib/qrNfcEngine';
import { publicExperienceOrigin, smartTagUrl } from '@shared/menuIdentity';
import type {
  DiningTable,
  PagerTicket,
  Restaurant,
  ServiceBay,
  SmartTag,
  SmartTagHardwareKind,
  SmartTagTargetType,
} from '@shared/schema';

const TARGET_LABELS: Record<SmartTagTargetType, string> = {
  venue_menu: 'Venue Digital Menu',
  reusable_pager: 'Reusable Counter Pager Coaster',
  dining_table: 'Dine-In Table Menu & Cart',
  curbside_bay: 'Curbside / Drive-Thru Bay',
  waitlist_join: 'Host Stand Walk-In Waitlist',
  reservations: 'Advance Table Reservations',
};

const HARDWARE_LABELS: Record<SmartTagHardwareKind, string> = {
  dual_qr_nfc: 'Dual QR + NFC Plaque',
  coaster_puck: 'NFC/QR Counter Coaster Puck',
  nfc_tag: 'NFC Sticker (NTAG213/215)',
  qr_only: 'Printed QR Only',
};

export default function AdminQRCode() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tagCode, setTagCode] = useState('');
  const [label, setLabel] = useState('');
  const [targetType, setTargetType] = useState<SmartTagTargetType>('reusable_pager');
  const [hardwareKind, setHardwareKind] = useState<SmartTagHardwareKind>('coaster_puck');
  const [tableId, setTableId] = useState('');
  const [bayId, setBayId] = useState('');
  const [encodeTarget, setEncodeTarget] = useState<NfcEncodeTarget | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const query = useQuery<Restaurant>({ queryKey: ['/api/restaurant'], enabled: isAuthenticated });

  const tagsQuery = useQuery<{
    tags: SmartTag[];
    tables: DiningTable[];
    bays: ServiceBay[];
    activeTickets: PagerTicket[];
    summary: {
      totalTags: number;
      reusableCoasters: number;
      activeCoasters: number;
      totalQrScans: number;
      totalNfcTaps: number;
    };
  }>({
    queryKey: ['/api/hospitality/smart-tags'],
    enabled: isAuthenticated && Boolean(query.data?.id),
    refetchInterval: 6000,
  });

  useRealtimeStream(query.data?.id ? '/api/hospitality/stream' : null, () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
  });

  const createTag = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/smart-tags', {
        tagCode: tagCode.trim(),
        label: label.trim(),
        hardwareKind,
        targetType,
        tableId: targetType === 'dining_table' ? tableId || tagsQuery.data?.tables[0]?.id || null : null,
        bayId: targetType === 'curbside_bay' ? bayId || tagsQuery.data?.bays[0]?.id || null : null,
      });
      return res.json();
    },
    onSuccess: data => {
      setTagCode('');
      setLabel('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({ title: `Created smart tag ${data.tag.tagCode}` });
    },
    onError: (e: Error) => toast({ title: 'Could not create smart tag', description: e.message, variant: 'destructive' }),
  });

  const bulkCoasters = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/smart-tags/bulk-coasters', {
        prefix: 'COASTER',
        count: 5,
      });
      return res.json();
    },
    onSuccess: data => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({
        title: `Provisioned ${data.tags.length} reusable NFC/QR coasters`,
        description: 'Encode once onto counter pucks — bind and release guest orders infinitely from the Pager Queue.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not provision coasters', description: e.message, variant: 'destructive' }),
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/hospitality/smart-tags/${id}`, patch);
      return res.json();
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({
        title: vars.patch.rotateToken ? 'Smart tag token rotated' : 'Smart tag updated',
      });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const assignTicket = useMutation({
    mutationFn: async ({ id, ticketId }: { id: string; ticketId: string | null }) => {
      const res = await apiRequest('POST', `/api/hospitality/smart-tags/${id}/assign-ticket`, { ticketId });
      return res.json();
    },
    onSuccess: data => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      toast({
        title: data.ticket
          ? `${data.tag.tagCode} bound to Ticket ${data.ticket.ticketCode}`
          : `${data.tag.tagCode} released to standby`,
      });
    },
    onError: (e: Error) => toast({ title: 'Could not bind coaster', description: e.message, variant: 'destructive' }),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/hospitality/smart-tags/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({ title: 'Smart tag deleted' });
    },
  });

  if (authLoading || query.isLoading) return <p role="status">Loading restaurant QR…</p>;
  if (!isAuthenticated) return null;
  if (query.isError) {
    return (
      <div className="manager-panel p-6">
        Could not load your restaurant QR. <Button onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const cafe = query.data;
  const tags = tagsQuery.data?.tags || [];
  const tables = tagsQuery.data?.tables || [];
  const bays = tagsQuery.data?.bays || [];
  const activeTickets = tagsQuery.data?.activeTickets || [];
  const summary = tagsQuery.data?.summary || {
    totalTags: 0,
    reusableCoasters: 0,
    activeCoasters: 0,
    totalQrScans: 0,
    totalNfcTaps: 0,
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicBase = publicExperienceOrigin(origin);

  return (
    <div className="space-y-8 max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="manager-eyebrow">YOUR RESTAURANT’S PERMANENT LINK &amp; CONTACTLESS FLEET</p>
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-qrcode-title">
            Menu QR &amp; NFC Smart Tag Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Print your permanent venue QR, encode NTAG213/215/216 table stickers, and operate reusable NFC/QR counter pager coasters with live tap telemetry.
          </p>
        </div>

        {cafe && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => setScannerOpen(true)}
              data-testid="button-open-studio-scanner"
              className="min-h-11 cursor-pointer gap-2 flex-1 sm:flex-none"
            >
              <Camera className="w-4 h-4" />
              <span>Test Scanner</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setEncodeTarget({
                  venueName: cafe.name,
                  title: 'Permanent Venue Menu',
                  code: cafe.slug ? cafe.slug.toUpperCase() : 'VENUE-MENU',
                  qrUrl: `${publicBase}/menu/${cafe.id}`,
                  nfcUrl: `${publicBase}/menu/${cafe.id}`,
                  accentHex: cafe.brandAccentHex,
                })
              }
              data-testid="button-encode-venue-nfc"
              className="min-h-11 cursor-pointer gap-2 flex-1 sm:flex-none"
            >
              <Smartphone className="w-4 h-4" />
              <span>Encode Menu NFC</span>
            </Button>
          </div>
        )}
      </div>

      {cafe ? (
        <>
          <PermanentMenuQR key={cafe.id} restaurant={cafe} />

          {/* Smart Tag & Reusable Coaster Fleet Studio */}
          <section className="space-y-5 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Dynamic Smart Tags &amp; Reusable Pager Coasters</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Pre-encode physical NFC coasters or plaques once (`/tag/:token`) — reassign destinations or bind active guest orders dynamically from the cloud.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={() => bulkCoasters.mutate()}
                  disabled={bulkCoasters.isPending}
                  data-testid="button-bulk-coasters"
                  className="min-h-11 cursor-pointer gap-2 flex-1 sm:flex-none"
                >
                  <Plus className="w-4 h-4" />
                  <span>Provision 5 Coasters</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={tags.length === 0}
                  data-testid="button-export-ndef-csv"
                  onClick={() =>
                    exportNdefBatchCsv(
                      cafe.name,
                      tags.map(t => ({
                        tagCode: t.tagCode,
                        label: t.label,
                        targetType: TARGET_LABELS[t.targetType as SmartTagTargetType] || t.targetType,
                        nfcUrl: smartTagUrl(t.token, 'nfc', origin),
                        qrUrl: smartTagUrl(t.token, 'qr', origin),
                      })),
                    )
                  }
                  className="min-h-11 cursor-pointer gap-2 flex-1 sm:flex-none"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export NDEF CSV</span>
                </Button>
              </div>
            </div>

            {/* Telemetry Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="manager-panel p-4">
                <span className="text-xs text-muted-foreground block">Smart Tag Fleet</span>
                <strong className="text-2xl font-black font-mono mt-1 block" data-testid="metric-smart-tags-total">
                  {summary.totalTags}
                </strong>
              </div>
              <div className="manager-panel p-4">
                <span className="text-xs text-muted-foreground block">Active Pager Coasters</span>
                <strong className="text-2xl font-black font-mono mt-1 block">
                  {summary.activeCoasters} / {summary.reusableCoasters}
                </strong>
              </div>
              <div className="manager-panel p-4">
                <span className="text-xs text-muted-foreground block">QR Camera Scans</span>
                <strong className="text-2xl font-black font-mono mt-1 block" data-testid="metric-qr-scans-total">
                  {summary.totalQrScans}
                </strong>
              </div>
              <div className="manager-panel p-4">
                <span className="text-xs text-muted-foreground block">NFC Phone Taps</span>
                <strong className="text-2xl font-black font-mono mt-1 block text-primary" data-testid="metric-nfc-taps-total">
                  {summary.totalNfcTaps}
                </strong>
              </div>
            </div>

            {/* Create Smart Tag Form */}
            <form
              onSubmit={e => {
                e.preventDefault();
                createTag.mutate();
              }}
              className="manager-panel p-5 space-y-4"
            >
              <h3 className="font-bold text-base">Register New QR / NFC Smart Tag</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <Label className="text-xs">Tag / Coaster Code *</Label>
                  <Input
                    value={tagCode}
                    onChange={e => setTagCode(e.target.value)}
                    placeholder="COASTER-01 or NFC-T01"
                    required
                    data-testid="input-smart-tag-code"
                    className="h-11 font-mono uppercase placeholder:font-sans placeholder:normal-case"
                  />
                </div>
                <div>
                  <Label className="text-xs">Station / Plaque Label *</Label>
                  <Input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="Counter Pager Puck #1"
                    required
                    data-testid="input-smart-tag-label"
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Target Experience</Label>
                  <select
                    value={targetType}
                    onChange={e => {
                      const next = e.target.value as SmartTagTargetType;
                      setTargetType(next);
                      if (next === 'reusable_pager') setHardwareKind('coaster_puck');
                    }}
                    data-testid="select-smart-tag-target"
                    className="manager-select w-full h-11 text-sm"
                  >
                    {(Object.keys(TARGET_LABELS) as SmartTagTargetType[]).map(k => (
                      <option key={k} value={k}>
                        {TARGET_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                {targetType === 'dining_table' ? (
                  <div>
                    <Label className="text-xs">Linked Floor Table *</Label>
                    <select
                      value={tableId || tables[0]?.id || ''}
                      onChange={e => setTableId(e.target.value)}
                      className="manager-select w-full h-11 text-sm"
                      required
                    >
                      {tables.length === 0 && <option value="">Add a table in Tables console first</option>}
                      {tables.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.tableCode} ({t.minCovers}–{t.maxCovers} seats)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : targetType === 'curbside_bay' ? (
                  <div>
                    <Label className="text-xs">Linked Service Bay *</Label>
                    <select
                      value={bayId || bays[0]?.id || ''}
                      onChange={e => setBayId(e.target.value)}
                      className="manager-select w-full h-11 text-sm"
                      required
                    >
                      {bays.length === 0 && <option value="">Add a bay in Drive-Thru console first</option>}
                      {bays.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.code} — {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Hardware Format</Label>
                    <select
                      value={hardwareKind}
                      onChange={e => setHardwareKind(e.target.value as SmartTagHardwareKind)}
                      className="manager-select w-full h-11 text-sm"
                    >
                      {(Object.keys(HARDWARE_LABELS) as SmartTagHardwareKind[]).map(k => (
                        <option key={k} value={k}>
                          {HARDWARE_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!tagCode.trim() || !label.trim() || createTag.isPending}
                  data-testid="button-create-smart-tag"
                  className="min-h-11 cursor-pointer gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Smart Tag</span>
                </Button>
              </div>
            </form>

            {/* Fleet Grid */}
            {tags.length === 0 ? (
              <div className="manager-panel p-10 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  No dynamic QR/NFC smart tags provisioned yet. Tap &ldquo;Provision 5 Coasters&rdquo; above to create reusable counter pager pucks (`COASTER-01`…`COASTER-05`).
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tags.map(tag => {
                  const qrLink = smartTagUrl(tag.token, 'qr', origin);
                  const nfcLink = smartTagUrl(tag.token, 'nfc', origin);
                  const boundTicket = tag.activeTicketId
                    ? activeTickets.find(t => t.id === tag.activeTicketId)
                    : null;

                  return (
                    <article
                      key={tag.id}
                      data-testid={`card-smart-tag-${tag.tagCode}`}
                      className={`rounded-2xl border-2 p-4 bg-card shadow-sm flex flex-col justify-between gap-4 ${
                        boundTicket ? 'border-[#C8FF42]' : 'border-border'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="font-mono text-lg font-black">{tag.tagCode}</strong>
                              {tag.targetType === 'reusable_pager' ? (
                                boundTicket ? (
                                  <Badge className="bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] border-0 font-extrabold font-mono">
                                    LIVE · {boundTicket.ticketCode}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Standby Coaster</Badge>
                                )
                              ) : (
                                <Badge variant="outline">
                                  {HARDWARE_LABELS[tag.hardwareKind as SmartTagHardwareKind] || tag.hardwareKind}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{tag.label}</p>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-mono shrink-0">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted">
                              <QrCode className="w-3 h-3" />
                              {tag.qrScans}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#EFEAFF] text-[#4B1FE0] font-bold">
                              <Wifi className="w-3 h-3 rotate-90" />
                              {tag.nfcTaps}
                            </span>
                          </div>
                        </div>

                        {tag.targetType === 'reusable_pager' ? (
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Bound Active Order Ticket</Label>
                            <select
                              aria-label={`Bind active pager ticket to ${tag.tagCode}`}
                              data-testid={`select-coaster-ticket-${tag.tagCode}`}
                              value={boundTicket?.id || ''}
                              onChange={e =>
                                assignTicket.mutate({
                                  id: tag.id,
                                  ticketId: e.target.value || null,
                                })
                              }
                              className="manager-select w-full h-11 text-xs font-semibold"
                            >
                              <option value="">Idle — Waiting for next order</option>
                              {activeTickets.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.ticketCode} · {t.status.toUpperCase()}
                                  {t.customerName ? ` (${t.customerName})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Assigned Cloud Destination</Label>
                            <select
                              aria-label={`Target destination for ${tag.tagCode}`}
                              value={tag.targetType}
                              onChange={e => {
                                const nextTarget = e.target.value as SmartTagTargetType;
                                updateTag.mutate({
                                  id: tag.id,
                                  patch: {
                                    targetType: nextTarget,
                                    ...(nextTarget === 'dining_table' && tables[0] ? { tableId: tables[0].id } : {}),
                                    ...(nextTarget === 'curbside_bay' && bays[0] ? { bayId: bays[0].id } : {}),
                                  },
                                });
                              }}
                              className="manager-select w-full h-11 text-xs font-medium"
                            >
                              {(Object.keys(TARGET_LABELS) as SmartTagTargetType[]).map(k => (
                                <option key={k} value={k}>
                                  {TARGET_LABELS[k]}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setEncodeTarget({
                                venueName: cafe.name,
                                title: tag.label,
                                code: tag.tagCode,
                                qrUrl: qrLink,
                                nfcUrl: nfcLink,
                                accentHex: cafe.brandAccentHex,
                              })
                            }
                            data-testid={`button-encode-tag-${tag.tagCode}`}
                            className="min-h-11 text-xs cursor-pointer gap-1.5"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>Write NFC / QR</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              void downloadDualQrNfcPlaqueSvg({
                                venueName: cafe.name,
                                title: tag.label,
                                code: tag.tagCode,
                                url: qrLink,
                                accentHex: cafe.brandAccentHex,
                              })
                            }
                            className="min-h-11 text-xs cursor-pointer gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Plaque SVG</span>
                          </Button>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs">
                          <a
                            href={`/tag/${tag.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="min-h-11 px-3 rounded-xl border hover:bg-muted inline-flex items-center gap-1.5 font-medium text-primary"
                          >
                            <span>Open Tag</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Rotate token for ${tag.tagCode}`}
                              title="Rotate secret URL token (invalidates old sticker)"
                              onClick={() => updateTag.mutate({ id: tag.id, patch: { rotateToken: true } })}
                              className="w-11 h-11 rounded-xl border hover:bg-muted grid place-items-center text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${tag.tagCode}`}
                              onClick={() => deleteTag.mutate(tag.id)}
                              className="w-11 h-11 rounded-xl border hover:bg-destructive/10 grid place-items-center text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <p>Set up your restaurant profile to get its permanent menu QR.</p>
      )}

      <NfcEncodeDialog target={encodeTarget} onClose={() => setEncodeTarget(null)} />
      {cafe && (
        <QrNfcScannerModal
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          restaurantId={cafe.id}
          restaurantName={cafe.name}
        />
      )}
    </div>
  );
}
