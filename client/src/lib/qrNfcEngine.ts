import QRCodeStyling from 'qr-code-styling';

export interface QrNfcCapabilities {
  hasCameraApi: boolean;
  hasBarcodeDetector: boolean;
  hasWebNfc: boolean;
  isSecureContext: boolean;
}

export function detectQrNfcCapabilities(): QrNfcCapabilities {
  if (typeof window === 'undefined') {
    return {
      hasCameraApi: false,
      hasBarcodeDetector: false,
      hasWebNfc: false,
      isSecureContext: false,
    };
  }
  return {
    hasCameraApi: Boolean(navigator.mediaDevices?.getUserMedia),
    hasBarcodeDetector: 'BarcodeDetector' in window,
    hasWebNfc: 'NDEFReader' in window,
    isSecureContext: Boolean(window.isSecureContext),
  };
}

export type ParsedDingziScan =
  | { kind: 'route'; path: string; label: string }
  | { kind: 'code'; code: string }
  | { kind: 'unknown'; raw: string };

const UUID_RE = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const SLUG_RE = '[a-z0-9]+(?:-[a-z0-9]+)*';

export function parseDingziScanPayload(raw: string): ParsedDingziScan {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { kind: 'unknown', raw: '' };

  let candidateUrl: URL | null = null;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      candidateUrl = new URL(trimmed);
    } else if (trimmed.startsWith('/')) {
      candidateUrl = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'https://dingzi.local');
    }
  } catch {
    candidateUrl = null;
  }

  if (candidateUrl) {
    const pathname = candidateUrl.pathname.replace(/\/+$/, '');
    const search = candidateUrl.search || '';

    if (new RegExp(`^/tag/${UUID_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: `${pathname}${search}`, label: 'Smart QR/NFC Tag' };
    }
    if (new RegExp(`^/pager/${UUID_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: pathname, label: 'Virtual Pager' };
    }
    if (new RegExp(`^/menu/${UUID_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: `${pathname}${search}`, label: 'Venue Menu' };
    }
    if (new RegExp(`^/v/${SLUG_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: `${pathname}${search}`, label: 'Venue Link' };
    }
    if (new RegExp(`^/table/${UUID_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: pathname, label: 'Dine-In Table' };
    }
    if (new RegExp(`^/bay/${UUID_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: pathname, label: 'Curbside / Drive-Thru Bay' };
    }
    if (new RegExp(`^/waitlist/${UUID_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: pathname, label: 'Walk-In Waitlist Pass' };
    }
    if (new RegExp(`^/booking/${UUID_RE}$`, 'i').test(pathname)) {
      return { kind: 'route', path: pathname, label: 'Table Reservation Pass' };
    }
  }

  if (/^[A-Za-z0-9_-]{1,40}$/.test(trimmed)) {
    return { kind: 'code', code: trimmed.toUpperCase() };
  }

  return { kind: 'unknown', raw: trimmed };
}

export async function decodeQrFromSource(source: ImageBitmapSource): Promise<string | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const Detector = (window as any).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    const results = await detector.detect(source);
    if (Array.isArray(results) && results.length > 0 && results[0]?.rawValue) {
      return String(results[0].rawValue);
    }
  } catch {
    return null;
  }
  return null;
}

export async function writeUrlToNfcTag(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string }> {
  if (typeof window === 'undefined' || !('NDEFReader' in window)) {
    return {
      ok: false,
      message:
        'Direct browser NFC writing requires Chrome on Android over HTTPS. On iOS or desktop USB writers, copy the NDEF URI below into NFC Tools or NXP TagWriter.',
    };
  }
  try {
    const ndef = new (window as any).NDEFReader();
    await ndef.write(
      {
        records: [{ recordType: 'url', data: url }],
      },
      { signal },
    );
    return {
      ok: true,
      message: 'NDEF URI encoded onto NFC tag. Tap any iPhone or Android phone to test.',
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, message: 'NFC write cancelled.' };
    }
    if (err?.name === 'NotAllowedError') {
      return { ok: false, message: 'NFC permission was denied. Enable NFC in device and browser settings.' };
    }
    if (err?.name === 'NotSupportedError') {
      return { ok: false, message: 'This NFC tag is write-protected or incompatible. Use NTAG213, NTAG215, or NTAG216.' };
    }
    return {
      ok: false,
      message: err?.message || 'Could not write to NFC tag. Hold the tag steady against the back of the phone and retry.',
    };
  }
}

export async function startNfcTagTapListener(
  onPayload: (value: string) => void,
  onError?: (message: string) => void,
): Promise<() => void> {
  if (typeof window === 'undefined' || !('NDEFReader' in window)) {
    onError?.('Web NFC tap scanning requires Chrome on Android. On iPhone, tap the NFC tag directly from the home screen.');
    return () => {};
  }
  const controller = new AbortController();
  try {
    const ndef = new (window as any).NDEFReader();
    ndef.addEventListener(
      'reading',
      (event: any) => {
        const records = event?.message?.records || [];
        for (const record of records) {
          try {
            if (record.recordType === 'url' || record.recordType === 'text') {
              const decoder = new TextDecoder(record.encoding || 'utf-8');
              const decoded = decoder.decode(record.data);
              if (decoded) {
                onPayload(decoded);
                return;
              }
            }
          } catch {}
        }
      },
      { signal: controller.signal },
    );
    ndef.addEventListener(
      'readingerror',
      () => {
        onError?.('Could not read NFC tag. Hold the phone steady over the coaster or sticker.');
      },
      { signal: controller.signal },
    );
    await ndef.scan({ signal: controller.signal });
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      onError?.(err?.message || 'Unable to start NFC reader.');
    }
  }
  return () => controller.abort();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function downloadDualQrNfcPlaqueSvg(opts: {
  venueName: string;
  title: string;
  code: string;
  url: string;
  accentHex?: string | null;
}) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(opts.accentHex || '') ? opts.accentHex! : '#6236FF';
  const qr = new QRCodeStyling({
    width: 480,
    height: 480,
    type: 'svg',
    data: opts.url,
    margin: 16,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: { color: '#17132E', type: 'rounded' },
    backgroundOptions: { color: '#FFFFFF' },
    cornersSquareOptions: { type: 'extra-rounded', color: accent },
    cornersDotOptions: { type: 'dot', color: '#4B1FE0' },
  });

  const rawBlob = await qr.getRawData('svg');
  if (!rawBlob) throw new Error('Could not render vector QR');
  const innerQrSvg = await (rawBlob as Blob).text();
  const strippedQr = innerQrSvg.replace(/<\?xml[^>]*\?>/gi, '').trim();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1040" width="800" height="1040">
  <rect width="800" height="1040" rx="48" fill="#17132E"/>
  <rect x="28" y="28" width="744" height="984" rx="36" fill="#241E42" stroke="#6236FF" stroke-width="2" stroke-opacity="0.45"/>

  <!-- Official Volt Ringer Lockup + Contactless NFC Header -->
  <g transform="translate(64, 62)">
    <g transform="scale(0.24)">
      <rect x="8" y="8" width="240" height="240" rx="58" fill="#6236FF"/>
      <rect x="11" y="11" width="234" height="234" rx="55" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="3"/>
      <path d="M 152 68 A 56 56 0 0 1 189 126" fill="none" stroke="#C8FF42" stroke-width="13" stroke-linecap="round"/>
      <path d="M 156 44 A 80 80 0 0 1 212 130" fill="none" stroke="#C8FF42" stroke-width="13" stroke-linecap="round"/>
      <g transform="translate(114, 138) rotate(-25)">
        <path d="M -22 44 A 22 22 0 0 0 22 44 Z" fill="#C8FF42"/>
        <rect x="-18" y="-76" width="36" height="11" rx="5.5" fill="#FFFFFF"/>
        <rect x="-6" y="-67" width="12" height="14" fill="#FFFFFF"/>
        <path d="M -52 16 L -50 -10 A 50 50 0 0 1 50 -10 L 52 16 Z" fill="#FFFFFF"/>
        <path d="M -56 23 L 56 23 L 68 38 Q 70 42 65 42 L -65 42 Q -70 42 -68 38 Z" fill="#FFFFFF"/>
      </g>
    </g>
    <g transform="translate(74, 0)">
      <text x="0" y="45" font-family="'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" font-size="38" font-weight="800" fill="#FFFFFF">d&#305;ngz&#305;</text>
      <circle cx="30" cy="17" r="4.2" fill="#C8FF42"/>
      <circle cx="111" cy="17" r="4.2" fill="#C8FF42"/>
    </g>

    <!-- Contactless NFC Waves Icon -->
    <g transform="translate(604, 8)">
      <rect width="68" height="44" rx="14" fill="#C8FF42"/>
      <path d="M24 29a9 9 0 0 1 0-14M32 33a15 15 0 0 1 0-22M40 37a21 21 0 0 1 0-30" fill="none" stroke="#17132E" stroke-width="3" stroke-linecap="round"/>
      <circle cx="18" cy="22" r="2.6" fill="#17132E"/>
    </g>
  </g>

  <!-- Venue & Plaque Title -->
  <text x="400" y="182" text-anchor="middle" font-family="'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" font-size="34" font-weight="800" fill="#FFFFFF">${escapeXml(opts.venueName.slice(0, 38))}</text>
  <text x="400" y="224" text-anchor="middle" font-family="'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" font-size="22" font-weight="600" fill="#C8FF42">${escapeXml(opts.title.slice(0, 46))}</text>

  <!-- Pure White Scannable QR Stage -->
  <rect x="136" y="262" width="528" height="528" rx="36" fill="#FFFFFF" stroke="${accent}" stroke-width="4"/>
  <g transform="translate(160, 286)">
    ${strippedQr}
  </g>

  <!-- Volt Lime High-Visibility Code Pill (15.3:1 AAA with #17132E Midnight Indigo Ink) -->
  <rect x="230" y="820" width="340" height="60" rx="30" fill="#C8FF42"/>
  <text x="400" y="859" text-anchor="middle" font-family="'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24" font-weight="800" fill="#17132E" letter-spacing="1.2">${escapeXml(opts.code.slice(0, 22))}</text>

  <!-- Bilingual Scan / Tap Instructions -->
  <text x="400" y="928" text-anchor="middle" font-family="'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">Scan QR Camera or Tap Phone (NFC)</text>
  <text x="400" y="968" text-anchor="middle" font-family="'IBM Plex Sans Arabic', system-ui, sans-serif" font-size="21" font-weight="600" fill="#E5E2F2">امسح الرمز بالكاميرا أو قرّب هاتفك</text>
</svg>`;

  const outBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const href = URL.createObjectURL(outBlob);
  const a = document.createElement('a');
  const safeSlug = opts.code.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  a.href = href;
  a.download = `dingzi-qr-nfc-${safeSlug || 'plaque'}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export function exportNdefBatchCsv(
  venueName: string,
  rows: {
    tagCode: string;
    label: string;
    targetType: string;
    nfcUrl: string;
    qrUrl: string;
  }[],
) {
  const escapeCsv = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;
  const header = ['Tag Code', 'Label', 'Target Type', 'NFC NDEF URI', 'QR Print URL'].map(escapeCsv).join(',');
  const lines = rows.map(r =>
    [r.tagCode, r.label, r.targetType, r.nfcUrl, r.qrUrl].map(escapeCsv).join(','),
  );
  const csv = `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeVenue = venueName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'venue';
  a.href = href;
  a.download = `dingzi-nfc-ndef-${safeVenue}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 2000);
}
