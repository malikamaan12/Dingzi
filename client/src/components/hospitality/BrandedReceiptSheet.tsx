import { useState } from 'react';
import { ChefHat, CheckCircle2, Clock, Download, Printer, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import { DingziMark } from '@/components/staff-brand';
import {
  buildStandaloneReceiptHtml,
  computeReceiptFeeBreakdown,
  downloadBrandedReceiptHtml,
  printHtmlSlip,
  resolveBrandReceiptPalette,
  type BrandReceiptOrderData,
  type BrandReceiptVenue,
} from '@/lib/printBrandedReceipt';
import { CURRENCY_ARABIC_SYMBOLS, resolveVenueConfig, type ReceiptStyleSetting } from '@shared/venueConfig';

export function BrandedReceiptSheet({
  venue,
  order,
  ticketCode,
  qrUrl,
  qrCaption,
  allowSplitCalculator = false,
  showStaffPrintControls = false,
  styleOverride,
}: {
  venue: BrandReceiptVenue;
  order: BrandReceiptOrderData;
  ticketCode?: string | null;
  qrUrl?: string | null;
  qrCaption?: string;
  allowSplitCalculator?: boolean;
  showStaffPrintControls?: boolean;
  styleOverride?: ReceiptStyleSetting;
}) {
  const cfg = resolveVenueConfig(venue.venueConfig);
  const activeStyle: ReceiptStyleSetting = styleOverride || cfg.receiptStyle || 'editorial_brand';
  const [previewMode, setPreviewMode] = useState<'receipt' | 'kitchen'>('receipt');
  const [splitWays, setSplitWays] = useState<number>(1);

  const palette = resolveBrandReceiptPalette(venue.theme, venue.brandAccentHex);
  const fees = computeReceiptFeeBreakdown(order, cfg);
  const arCur = cfg.currencySymbolAr || CURRENCY_ARABIC_SYMBOLS[order.currency] || order.currency;
  const isPaid = order.paymentStatus === 'paid';
  const isThermalStyle = activeStyle === 'classic_thermal';
  const isBilingualStyle = activeStyle === 'minimal_bilingual';

  const formattedDate = (() => {
    try {
      return new Date(order.createdAt).toLocaleString('en-GB', {
        timeZone: venue.timezone || 'Asia/Qatar',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return new Date(order.createdAt).toLocaleString();
    }
  })();

  const channelLabel =
    order.channel === 'dine_in'
      ? `Dine-In${order.tableCode ? ` · Table ${order.tableCode}` : ''}`
      : order.channel === 'curbside' || order.channel === 'drive_thru'
        ? `Curbside${order.licensePlate ? ` · ${order.licensePlate}` : ''}`
        : 'Counter Pickup';

  const perPersonShare = splitWays > 1 ? (Number(fees.total) / splitWays).toFixed(2) : null;

  const monogram = (venue.name || 'D')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-3" data-testid="branded-receipt-sheet">
      {showStaffPrintControls && (
        <div className="flex items-center justify-between gap-2 p-1 rounded-2xl bg-muted/60 border text-xs">
          <button
            type="button"
            onClick={() => setPreviewMode('receipt')}
            className={`flex-1 min-h-10 rounded-xl font-semibold transition-colors cursor-pointer ${
              previewMode === 'receipt' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Brand Guest Receipt ({cfg.receiptPaperWidth})
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('kitchen')}
            className={`flex-1 min-h-10 rounded-xl font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              previewMode === 'kitchen' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Kitchen Prep Chit</span>
          </button>
        </div>
      )}

      {previewMode === 'kitchen' ? (
        <div className="rounded-2xl border-2 border-[#17132E] bg-white text-[#17132E] p-5 font-mono space-y-3 shadow-sm">
          <div className="rounded-xl border-2 border-[#17132E] p-3 text-center">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#57507A]">
              PREP TICKET · {venue.name}
            </span>
            <strong className="block text-3xl font-black tracking-tight mt-0.5">
              {ticketCode || order.orderNumber}
            </strong>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md bg-[#17132E] text-white text-xs font-bold uppercase">
              {channelLabel}
            </span>
          </div>

          <div className="flex justify-between text-xs border-b border-dashed border-[#E5E2F2] pb-2">
            <span>{order.customerName || 'Walk-In Guest'}</span>
            <span>{formattedDate}</span>
          </div>

          <ul className="divide-y divide-dashed divide-[#E5E2F2] text-sm">
            {(order.lineItems || []).map((li, idx) => (
              <li key={idx} className="py-2.5 space-y-1">
                <div className="font-bold flex items-baseline gap-2">
                  <span className="text-base font-black">{li.quantity}×</span>
                  <span>
                    {li.name}
                    {li.variantLabel ? ` (${li.variantLabel})` : ''}
                  </span>
                </div>
                {li.modifiers?.length > 0 && (
                  <p className="text-xs font-semibold text-[#4B1FE0] ps-6">
                    + {li.modifiers.map(m => m.label).join(', ')}
                  </p>
                )}
                {li.notes && (
                  <p className="text-xs font-bold border border-[#17132E] rounded-lg px-2 py-1 ms-6">
                    NOTE: {li.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="text-xs font-bold border-2 border-[#17132E] rounded-xl p-2.5">
              ORDER NOTE: {order.notes}
            </p>
          )}
        </div>
      ) : (
        <article
          className={`rounded-3xl border border-[#E5E2F2] bg-white text-[#17132E] overflow-hidden shadow-sm ${
            isThermalStyle ? 'font-mono' : 'font-sans'
          }`}
        >
          {/* Per-Brand Signature Accent Ribbon */}
          <div
            className="h-2 w-full"
            style={{ backgroundColor: isThermalStyle ? '#17132E' : palette.accentHex }}
          />

          <div className="p-5 space-y-4">
            {/* Venue Brand Header */}
            {isBilingualStyle ? (
              <header className="flex items-start justify-between gap-3 pb-3.5 border-b border-dashed border-[#E5E2F2]">
                <div className="flex items-center gap-3 min-w-0">
                  {cfg.receiptShowLogo && venue.logoUrl ? (
                    <img
                      src={venue.logoUrl}
                      alt={venue.name}
                      className="w-12 h-12 rounded-2xl object-cover border border-[#E5E2F2] shrink-0"
                    />
                  ) : (
                    <div
                      style={{ backgroundColor: palette.tintHex, color: palette.accentHex }}
                      className="w-12 h-12 rounded-2xl font-display font-extrabold text-sm grid place-items-center shrink-0"
                    >
                      {monogram}
                    </div>
                  )}
                  <div className="min-w-0">
                    <strong className="block text-base font-display font-bold leading-tight truncate">
                      {venue.name}
                    </strong>
                    {venue.address && <span className="block text-[11px] text-[#57507A] truncate">{venue.address}</span>}
                    {cfg.receiptRegNumber && (
                      <span className="block text-[10px] font-mono text-[#57507A]">{cfg.receiptRegNumber}</span>
                    )}
                  </div>
                </div>
                <div dir="rtl" className="text-end shrink-0">
                  {venue.nameAr && <strong className="block text-sm font-bold">{venue.nameAr}</strong>}
                  {venue.addressAr && <span className="block text-[11px] text-[#57507A]">{venue.addressAr}</span>}
                  {venue.phone && <span className="block text-[11px] font-mono text-[#57507A]">{venue.phone}</span>}
                </div>
              </header>
            ) : (
              <header className="text-center space-y-1.5 pb-3.5 border-b border-dashed border-[#E5E2F2]">
                {cfg.receiptShowLogo && (
                  <div className="flex justify-center pb-1">
                    {venue.logoUrl ? (
                      <img
                        src={venue.logoUrl}
                        alt={venue.name}
                        className="w-14 h-14 rounded-2xl object-cover border border-[#E5E2F2] shadow-xs"
                      />
                    ) : (
                      <div
                        style={{ backgroundColor: palette.tintHex, color: palette.accentHex }}
                        className="w-13 h-13 rounded-2xl font-display font-extrabold text-base grid place-items-center"
                      >
                        {monogram}
                      </div>
                    )}
                  </div>
                )}
                <h3 className="text-lg font-display font-extrabold tracking-tight text-[#17132E]">
                  {venue.name}
                </h3>
                {venue.nameAr && (
                  <p dir="rtl" className="text-xs font-semibold text-[#57507A]">
                    {venue.nameAr}
                  </p>
                )}
                {(cfg.receiptHeaderNote || venue.address || venue.phone || cfg.receiptRegNumber) && (
                  <div className="text-[11px] text-[#57507A] space-y-0.5 leading-snug">
                    {cfg.receiptHeaderNote && <p>{cfg.receiptHeaderNote}</p>}
                    {venue.address && <p>{venue.address}</p>}
                    {venue.phone && <p className="font-mono">{venue.phone}</p>}
                    {cfg.receiptRegNumber && <p className="font-mono text-[10px]">{cfg.receiptRegNumber}</p>}
                  </div>
                )}
              </header>
            )}

            {/* Ticket & Order Metadata */}
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs pb-3.5 border-b border-dashed border-[#E5E2F2]">
              <div>
                <span className="text-[#57507A] block text-[10px] uppercase tracking-wider">Order</span>
                <strong className="font-mono text-xs">{order.orderNumber}</strong>
                {order.roundsCount && order.roundsCount > 1 && (
                  <span className="ms-1.5 text-[10px] font-semibold text-[#57507A]">
                    ({order.roundsCount} rounds)
                  </span>
                )}
              </div>
              <div className="text-end">
                <span className="text-[#57507A] block text-[10px] uppercase tracking-wider">Settlement</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isPaid ? 'bg-[#C8FF42] text-[#17132E]' : 'bg-[#F6F5FC] text-[#17132E] border border-[#E5E2F2]'
                  }`}
                >
                  {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  <span>{isPaid ? 'PAID' : 'PAY AT VENUE'}</span>
                </span>
              </div>
              <div>
                <span className="text-[#57507A] block text-[10px] uppercase tracking-wider">Guest / Service</span>
                <span className="font-medium">
                  {order.customerName || 'Walk-In'} · {channelLabel}
                </span>
              </div>
              <div className="text-end">
                <span className="text-[#57507A] block text-[10px] uppercase tracking-wider">
                  {ticketCode ? 'Pager' : 'Date'}
                </span>
                {ticketCode ? (
                  <strong
                    style={{ color: isThermalStyle ? '#17132E' : palette.accentHex }}
                    className="font-mono font-extrabold text-sm"
                  >
                    {ticketCode}
                  </strong>
                ) : (
                  <span className="font-mono text-[11px]">{formattedDate}</span>
                )}
              </div>
              {ticketCode && (
                <div className="col-span-2 text-[11px] font-mono text-[#57507A] pt-0.5">{formattedDate}</div>
              )}
            </div>

            {/* Itemized Order Lines */}
            <ul className="divide-y divide-[#E5E2F2] text-xs">
              {(order.lineItems || []).map((li, idx) => (
                <li key={idx} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-semibold text-[#17132E]">
                      <span className="font-mono font-bold me-1.5">{li.quantity}×</span>
                      <span>{li.name}</span>
                      {li.variantLabel ? <span className="text-[#57507A]"> ({li.variantLabel})</span> : null}
                    </div>
                    {li.modifiers?.length > 0 && (
                      <p className="text-[11px] text-[#57507A] ps-5">
                        + {li.modifiers.map(m => m.label).join(', ')}
                      </p>
                    )}
                    {li.notes && <p className="text-[11px] italic text-[#57507A] ps-5">“{li.notes}”</p>}
                  </div>
                  <span className="font-mono font-semibold text-[#17132E] shrink-0">{li.lineTotal}</span>
                </li>
              ))}
            </ul>

            {/* Subtotal, Service Charge, VAT & Brand-Tinted Grand Total */}
            <div className="pt-3 border-t border-dashed border-[#E5E2F2] space-y-1.5 text-xs">
              {(fees.hasTax || fees.hasService) && (
                <div className="flex justify-between text-[#57507A]">
                  <span>{isBilingualStyle ? 'Subtotal · المجموع الفرعي' : 'Subtotal'}</span>
                  <span className="font-mono">
                    {fees.subtotal} {order.currency}
                  </span>
                </div>
              )}
              {fees.hasService && (
                <div className="flex justify-between text-[#57507A]">
                  <span>Service Charge ({cfg.serviceChargePercent}%)</span>
                  <span className="font-mono">
                    {fees.serviceChargeAmount} {order.currency}
                  </span>
                </div>
              )}
              {fees.hasTax && (
                <div className="flex justify-between text-[#57507A]">
                  <span>
                    {cfg.taxLabel} ({cfg.taxPercent}%)
                    {isBilingualStyle && cfg.taxLabelAr ? ` · ${cfg.taxLabelAr}` : ''}
                  </span>
                  <span className="font-mono">
                    {fees.taxAmount} {order.currency}
                  </span>
                </div>
              )}

              <div
                style={{
                  backgroundColor: isThermalStyle ? '#F6F5FC' : palette.tintHex,
                  borderColor: isThermalStyle ? '#E5E2F2' : palette.borderHex,
                }}
                className="mt-2 rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <strong className="text-sm font-display font-extrabold text-[#17132E]">
                  {isBilingualStyle ? 'Total · الإجمالي' : 'Total'}
                </strong>
                <strong className="text-base font-mono font-extrabold text-[#17132E]">
                  {fees.total} {order.currency}
                  {isBilingualStyle ? ` (${arCur})` : ''}
                </strong>
              </div>
            </div>

            {/* Interactive Split-the-Check Calculator (Guest Passes & Dine-In Table Checks) */}
            {allowSplitCalculator && Number(fees.total) > 0 && (
              <div className="rounded-2xl bg-[#F6F5FC] border border-[#E5E2F2] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#17132E]">
                    <Users className="w-3.5 h-3.5 text-[#57507A]" aria-hidden="true" />
                    <span>Split Check</span>
                  </span>
                  <div className="inline-flex items-center gap-1">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        type="button"
                        data-testid={`button-split-${n}`}
                        onClick={() => setSplitWays(n)}
                        className={`min-w-9 h-8 px-2 rounded-lg font-mono text-xs font-bold transition-colors cursor-pointer ${
                          splitWays === n
                            ? 'bg-[#17132E] text-white'
                            : 'bg-white border border-[#E5E2F2] text-[#17132E] hover:bg-[#EFEAFF]'
                        }`}
                      >
                        {n === 1 ? 'Full' : `÷${n}`}
                      </button>
                    ))}
                  </div>
                </div>
                {perPersonShare && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center justify-between pt-1.5 border-t border-[#E5E2F2] text-xs"
                  >
                    <span className="text-[#57507A]">Each guest ({splitWays} ways)</span>
                    <strong className="font-mono font-extrabold text-sm text-[#17132E]">
                      {perPersonShare} {order.currency}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* Scannable QR + Brand Footer + Monochrome dingzi Stamp */}
            <footer className="pt-2 text-center space-y-2.5">
              {qrUrl && cfg.receiptShowQr && (
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <LocalQrBox url={qrUrl} size={116} />
                  {qrCaption && <span className="text-[11px] text-[#57507A]">{qrCaption}</span>}
                </div>
              )}

              <div className="text-[11px] text-[#57507A] space-y-0.5">
                <p>{cfg.receiptFooterNote}</p>
                {cfg.receiptFooterNoteAr && <p dir="rtl">{cfg.receiptFooterNoteAr}</p>}
              </div>

              <div className="pt-1 inline-flex items-center justify-center gap-1.5 text-[10px] font-medium text-[#57507A]">
                <DingziMark size={16} variant="thermal" />
                <span>
                  powered by{' '}
                  <strong className="lowercase font-display font-extrabold text-[#17132E]" dir="ltr" lang="en">
                    dingzi
                  </strong>
                </span>
              </div>
            </footer>
          </div>
        </article>
      )}

      {/* Print & Download Action Row */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="button-print-branded-receipt"
          onClick={() =>
            printHtmlSlip(
              buildStandaloneReceiptHtml({
                venue,
                order,
                ticketCode,
                qrUrl,
                mode: previewMode === 'kitchen' ? 'kitchen_chit' : 'customer_receipt',
              }),
            )
          }
          className="min-h-11 rounded-xl bg-white border-[#E5E2F2] cursor-pointer gap-1.5 font-semibold"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          <span>{previewMode === 'kitchen' ? 'Print Prep Chit' : 'Print Receipt'}</span>
        </Button>
        <Button
          type="button"
          data-testid="button-download-branded-receipt"
          onClick={() => downloadBrandedReceiptHtml({ venue, order, ticketCode, qrUrl })}
          className="min-h-11 rounded-xl bg-[#17132E] hover:bg-[#241E42] text-white cursor-pointer gap-1.5 font-semibold"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Save Receipt</span>
        </Button>
      </div>
    </div>
  );
}
