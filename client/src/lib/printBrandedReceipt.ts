import {
  computeOrderTotalsWithVenueFees,
  CURRENCY_ARABIC_SYMBOLS,
  resolveVenueConfig,
  type ResolvedVenueConfig,
  type VenueConfig,
} from '@shared/venueConfig';
import type { OrderLineItem } from '@shared/schema';

export interface BrandReceiptVenue {
  id?: string;
  name: string;
  nameAr?: string | null;
  slug?: string | null;
  theme?: string | null;
  brandAccentHex?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  addressAr?: string | null;
  phone?: string | null;
  currency: string;
  timezone?: string | null;
  venueConfig?: VenueConfig | null;
}

export interface BrandReceiptOrderData {
  orderNumber: string;
  createdAt: string | Date;
  channel: string;
  paymentStatus: string;
  paymentProvider?: string | null;
  paymentReference?: string | null;
  customerName?: string | null;
  tableCode?: string | null;
  licensePlate?: string | null;
  vehicleColor?: string | null;
  vehicleType?: string | null;
  notes?: string | null;
  currency: string;
  subtotal: string;
  total: string;
  lineItems: OrderLineItem[];
  roundsCount?: number;
}

export interface BrandReceiptPalette {
  accentHex: string;
  inkHex: string;
  tintHex: string;
  borderHex: string;
}

const THEME_PALETTES: Record<string, BrandReceiptPalette> = {
  e3: { accentHex: '#6236FF', inkHex: '#17132E', tintHex: '#EFEAFF', borderHex: '#E5E2F2' },
  dingzi: { accentHex: '#6236FF', inkHex: '#17132E', tintHex: '#EFEAFF', borderHex: '#E5E2F2' },
  forest: { accentHex: '#246047', inkHex: '#16261E', tintHex: '#EAF4EE', borderHex: '#CFE3D7' },
  terracotta: { accentHex: '#A14A2B', inkHex: '#291A14', tintHex: '#FBF0EB', borderHex: '#EAD4C9' },
  ocean: { accentHex: '#1B6298', inkHex: '#132330', tintHex: '#EBF4FB', borderHex: '#CDE0F0' },
  plum: { accentHex: '#7B3251', inkHex: '#26161E', tintHex: '#F9EDF2', borderHex: '#E8CFD9' },
};

export function resolveBrandReceiptPalette(
  theme?: string | null,
  brandAccentHex?: string | null,
): BrandReceiptPalette {
  const base = THEME_PALETTES[theme || 'e3'] || THEME_PALETTES.e3;
  if (brandAccentHex && /^#[0-9a-fA-F]{6}$/.test(brandAccentHex)) {
    return {
      ...base,
      accentHex: brandAccentHex,
      tintHex: `${brandAccentHex}14`,
      borderHex: `${brandAccentHex}30`,
    };
  }
  return base;
}

function escapeHtml(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function computeReceiptFeeBreakdown(
  order: BrandReceiptOrderData,
  cfg: ResolvedVenueConfig,
) {
  const subtotalCents = Math.round(Number(order.subtotal || order.total) * 100);
  const totalCents = Math.round(Number(order.total) * 100);
  const computed = computeOrderTotalsWithVenueFees(subtotalCents, cfg);
  // Respect persisted order total while surfacing configured tax/service breakdown
  return {
    subtotal: (subtotalCents / 100).toFixed(2),
    taxAmount: computed.taxCents > 0 ? computed.taxAmount : '0.00',
    serviceChargeAmount: computed.serviceCents > 0 ? computed.serviceChargeAmount : '0.00',
    total: (totalCents / 100).toFixed(2),
    hasTax: computed.taxCents > 0,
    hasService: computed.serviceCents > 0,
  };
}

export function buildStandaloneReceiptHtml(params: {
  venue: BrandReceiptVenue;
  order: BrandReceiptOrderData;
  ticketCode?: string | null;
  qrUrl?: string | null;
  mode?: 'customer_receipt' | 'kitchen_chit';
  origin?: string;
}): string {
  const { venue, order, ticketCode, qrUrl, mode = 'customer_receipt' } = params;
  const origin = params.origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const cfg = resolveVenueConfig(venue.venueConfig);
  const palette = resolveBrandReceiptPalette(venue.theme, venue.brandAccentHex);
  const paperWidth = cfg.receiptPaperWidth === '58mm' ? '58mm' : '80mm';
  const arCur = cfg.currencySymbolAr || CURRENCY_ARABIC_SYMBOLS[order.currency] || order.currency;
  const fees = computeReceiptFeeBreakdown(order, cfg);
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

  const logoSrc =
    venue.logoUrl && cfg.receiptShowLogo
      ? venue.logoUrl.startsWith('http')
        ? venue.logoUrl
        : `${origin}${venue.logoUrl}`
      : '';

  const channelDisplay =
    order.channel === 'dine_in'
      ? `DINE-IN${order.tableCode ? ` · TABLE ${order.tableCode}` : ''}`
      : order.channel === 'curbside' || order.channel === 'drive_thru'
        ? `CURBSIDE${order.licensePlate ? ` · ${order.licensePlate}` : ''}`
        : 'COUNTER PICKUP';

  if (mode === 'kitchen_chit') {
    const itemsHtml = (order.lineItems || [])
      .map(
        li => `
        <div class="chit-item">
          <div class="chit-qty-name"><strong>${Number(li.quantity)}×</strong> <span>${escapeHtml(li.name)}${li.variantLabel ? ` (${escapeHtml(li.variantLabel)})` : ''}</span></div>
          ${li.modifiers?.length ? `<div class="chit-mod">+ ${escapeHtml(li.modifiers.map(m => m.label).join(', '))}</div>` : ''}
          ${li.notes ? `<div class="chit-note">NOTE: ${escapeHtml(li.notes)}</div>` : ''}
        </div>`,
      )
      .join('');

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kitchen Ticket ${escapeHtml(ticketCode || order.orderNumber)}</title>
<style>
  @page { size: ${paperWidth} auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; width: ${paperWidth}; font-family: 'JetBrains Mono', ui-monospace, monospace; color: #17132E; background: #FFF; }
  .banner { border: 3px solid #17132E; padding: 10px; text-align: center; margin-bottom: 10px; }
  .code { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; }
  .chan { font-size: 13px; font-weight: 800; margin-top: 4px; text-transform: uppercase; }
  .meta { font-size: 11px; border-bottom: 2px dashed #17132E; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; }
  .chit-item { padding: 7px 0; border-bottom: 1px dashed #E5E2F2; }
  .chit-qty-name { font-size: 15px; font-weight: 700; display: flex; gap: 8px; }
  .chit-mod { font-size: 12px; font-weight: 700; padding-left: 26px; margin-top: 2px; }
  .chit-note { font-size: 12px; font-weight: 800; padding: 3px 6px; margin: 4px 0 0 26px; border: 1.5px solid #17132E; }
</style></head><body>
  <div class="banner">
    <div style="font-size:11px;font-weight:700;">PREP TICKET · ${escapeHtml(venue.name)}</div>
    <div class="code">${escapeHtml(ticketCode || order.orderNumber)}</div>
    <div class="chan">${escapeHtml(channelDisplay)}</div>
  </div>
  <div class="meta">
    <span>${escapeHtml(order.customerName || 'Walk-In')}</span>
    <span>${escapeHtml(formattedDate)}</span>
  </div>
  ${itemsHtml}
  ${order.notes ? `<div class="chit-note" style="margin:10px 0 0 0;">ORDER NOTE: ${escapeHtml(order.notes)}</div>` : ''}
</body></html>`;
  }

  const linesHtml = (order.lineItems || [])
    .map(
      li => `
      <div class="line">
        <div class="line-top">
          <span><strong>${Number(li.quantity)}×</strong> ${escapeHtml(li.name)}${li.variantLabel ? ` (${escapeHtml(li.variantLabel)})` : ''}</span>
          <span class="amt">${escapeHtml(li.lineTotal)}</span>
        </div>
        ${li.modifiers?.length ? `<div class="sub">+ ${escapeHtml(li.modifiers.map(m => m.label).join(', '))}</div>` : ''}
        ${li.notes ? `<div class="sub">“${escapeHtml(li.notes)}”</div>` : ''}
      </div>`,
    )
    .join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${escapeHtml(order.orderNumber)}</title>
<style>
  @page { size: ${paperWidth} auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: #F6F5FC; color: #17132E; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  .sheet { width: ${paperWidth === '58mm' ? '280px' : '340px'}; margin: 16px auto; background: #FFF; border: 1px solid #E5E2F2; border-radius: 16px; overflow: hidden; }
  .bar { height: 7px; background: ${escapeHtml(palette.accentHex)}; }
  .pad { padding: 18px 18px 16px; }
  .hdr { text-align: center; border-bottom: 1.5px dashed #E5E2F2; padding-bottom: 12px; }
  .logo { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; margin: 0 auto 8px; display: block; border: 1px solid #E5E2F2; }
  .vname { font-size: 18px; font-weight: 800; margin: 0; color: #17132E; }
  .vname-ar { font-size: 14px; font-weight: 700; margin: 2px 0 0; color: #57507A; }
  .vmeta { font-size: 11px; color: #57507A; margin-top: 4px; line-height: 1.4; }
  .meta-grid { padding: 10px 0; border-bottom: 1.5px dashed #E5E2F2; font-size: 11px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
  .pager-box { margin: 10px 0; padding: 8px 10px; border-radius: 10px; border: 1.5px solid #17132E; text-align: center; font-family: ui-monospace, monospace; }
  .lines { padding: 8px 0; border-bottom: 1.5px dashed #E5E2F2; }
  .line { padding: 5px 0; font-size: 12px; }
  .line-top { display: flex; justify-content: space-between; gap: 8px; }
  .amt { font-family: ui-monospace, monospace; font-weight: 700; white-space: nowrap; }
  .sub { font-size: 10.5px; color: #57507A; padding-left: 16px; margin-top: 1px; }
  .totals { padding: 10px 0; border-bottom: 1.5px dashed #E5E2F2; font-size: 12px; space-y: 4px; }
  .trow { display: flex; justify-content: space-between; padding: 2px 0; }
  .grand { font-size: 15px; font-weight: 800; padding-top: 6px; margin-top: 4px; border-top: 1px solid #E5E2F2; }
  .ftr { text-align: center; padding-top: 12px; font-size: 11px; color: #57507A; line-height: 1.45; }
  .stamp { margin-top: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: #57507A; }
  @media print {
    body { background: #FFF; }
    .sheet { width: 100%; margin: 0; border: 0; border-radius: 0; }
    .bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
  <div class="sheet">
    <div class="bar"></div>
    <div class="pad">
      <div class="hdr">
        ${logoSrc ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="" />` : ''}
        <h1 class="vname">${escapeHtml(venue.name)}</h1>
        ${venue.nameAr ? `<p class="vname-ar" dir="rtl">${escapeHtml(venue.nameAr)}</p>` : ''}
        ${cfg.receiptHeaderNote ? `<div class="vmeta">${escapeHtml(cfg.receiptHeaderNote)}</div>` : ''}
        ${venue.address ? `<div class="vmeta">${escapeHtml(venue.address)}</div>` : ''}
        ${venue.phone ? `<div class="vmeta">Tel: ${escapeHtml(venue.phone)}</div>` : ''}
        ${cfg.receiptRegNumber ? `<div class="vmeta" style="font-family:monospace;">${escapeHtml(cfg.receiptRegNumber)}</div>` : ''}
      </div>

      ${
        ticketCode
          ? `<div class="pager-box"><div style="font-size:10px;font-weight:700;">VIRTUAL PAGER / PICKUP CODE</div><div style="font-size:22px;font-weight:900;">${escapeHtml(ticketCode)}</div></div>`
          : ''
      }

      <div class="meta-grid">
        <div><strong>Order:</strong> <span style="font-family:monospace">${escapeHtml(order.orderNumber)}</span></div>
        <div style="text-align:right"><strong>Status:</strong> ${escapeHtml(order.paymentStatus.replace(/_/g, ' ').toUpperCase())}</div>
        <div><strong>Guest:</strong> ${escapeHtml(order.customerName || 'Walk-In')}</div>
        <div style="text-align:right">${escapeHtml(channelDisplay)}</div>
        <div style="grid-column:1 / -1;color:#57507A;">${escapeHtml(formattedDate)}</div>
      </div>

      <div class="lines">${linesHtml}</div>

      <div class="totals">
        ${
          fees.hasTax || fees.hasService
            ? `<div class="trow"><span>Subtotal / المجموع الفرعي</span><span class="amt">${escapeHtml(fees.subtotal)} ${escapeHtml(order.currency)}</span></div>`
            : ''
        }
        ${
          fees.hasService
            ? `<div class="trow"><span>Service (${cfg.serviceChargePercent}%)</span><span class="amt">${escapeHtml(fees.serviceChargeAmount)} ${escapeHtml(order.currency)}</span></div>`
            : ''
        }
        ${
          fees.hasTax
            ? `<div class="trow"><span>${escapeHtml(cfg.taxLabel)} (${cfg.taxPercent}%) / ${escapeHtml(cfg.taxLabelAr)}</span><span class="amt">${escapeHtml(fees.taxAmount)} ${escapeHtml(order.currency)}</span></div>`
            : ''
        }
        <div class="trow grand">
          <span>TOTAL / الإجمالي</span>
          <span class="amt">${escapeHtml(fees.total)} ${escapeHtml(order.currency)} (${escapeHtml(arCur)})</span>
        </div>
      </div>

      <div class="ftr">
        <div>${escapeHtml(cfg.receiptFooterNote)}</div>
        ${cfg.receiptFooterNoteAr ? `<div dir="rtl">${escapeHtml(cfg.receiptFooterNoteAr)}</div>` : ''}
        ${qrUrl && cfg.receiptShowQr ? `<div style="margin-top:8px;font-family:monospace;font-size:10px;word-break:break-all;">${escapeHtml(qrUrl)}</div>` : ''}
        <div class="stamp">powered by dingzi</div>
      </div>
    </div>
  </div>
</body></html>`;
}

export function printHtmlSlip(html: string) {
  if (typeof window === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 1500);
  };

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  }, 350);
}

export function downloadBrandedReceiptHtml(params: {
  venue: BrandReceiptVenue;
  order: BrandReceiptOrderData;
  ticketCode?: string | null;
  qrUrl?: string | null;
}) {
  const html = buildStandaloneReceiptHtml(params);
  const slug = (params.venue.slug || params.venue.name || 'venue')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-receipt-${params.order.orderNumber}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
