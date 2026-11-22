import { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

export function LocalQrBox({ url, size = 180 }: { url: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const qr = new QRCodeStyling({
      width: size,
      height: size,
      type: 'svg',
      data: url,
      margin: 8,
      dotsOptions: { color: '#1c1917', type: 'rounded' },
      backgroundOptions: { color: '#ffffff' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#92400e' },
    });
    qr.append(ref.current);
  }, [url, size]);

  return <div ref={ref} className="inline-flex items-center justify-center rounded-2xl border bg-white p-2" />;
}
