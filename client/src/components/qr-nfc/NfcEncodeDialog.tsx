import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Smartphone, Wifi } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import {
  detectQrNfcCapabilities,
  downloadDualQrNfcPlaqueSvg,
  writeUrlToNfcTag,
} from '@/lib/qrNfcEngine';
import { useToast } from '@/hooks/use-toast';

export interface NfcEncodeTarget {
  venueName: string;
  title: string;
  code: string;
  qrUrl: string;
  nfcUrl: string;
  accentHex?: string | null;
}

interface Props {
  target: NfcEncodeTarget | null;
  onClose: () => void;
}

export function NfcEncodeDialog({ target, onClose }: Props) {
  const { toast } = useToast();
  const caps = detectQrNfcCapabilities();
  const [copied, setCopied] = useState(false);
  const [writing, setWriting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCopied(false);
    setWriting(false);
    setStatusMessage(null);
    setStatusTone('neutral');
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [target]);

  async function handleCopyNdef() {
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.nfcUrl);
      setCopied(true);
      toast({ title: 'NDEF URI copied to clipboard' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  }

  async function handleWriteNfc() {
    if (!target) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setWriting(true);
    setStatusTone('neutral');
    setStatusMessage('Hold an unlocked NTAG213 / NTAG215 / NTAG216 sticker or coaster puck steady against the back of this Android device…');

    const res = await writeUrlToNfcTag(target.nfcUrl, controller.signal);
    setWriting(false);
    setStatusTone(res.ok ? 'success' : 'error');
    setStatusMessage(res.message);
    if (res.ok) {
      toast({ title: `Encoded ${target.code} to NFC tag` });
    }
  }

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={open => {
        if (!open) {
          abortRef.current?.abort();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg font-bold">{target?.title}</DialogTitle>
            {target?.code && (
              <Badge variant="secondary" className="font-mono">
                {target.code}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Print the high-contrast QR plaque or encode the permanent NDEF URI onto any NTAG213/215/216 sticker or counter coaster.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/30 p-4 grid place-items-center gap-2">
              <LocalQrBox url={target.qrUrl} size={184} />
              <a
                href={target.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline min-h-9"
              >
                <span>Test Guest Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="rounded-2xl border p-3 bg-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">NFC NDEF URI Record</span>
                <span className="text-[11px] font-medium text-primary">iOS &amp; Android Zero-App Tap</span>
              </div>
              <p className="text-xs font-mono break-all bg-muted/50 rounded-xl px-3 py-2 select-all" data-testid="text-nfc-ndef-uri">
                {target.nfcUrl}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyNdef}
                  className="min-h-11 cursor-pointer gap-2"
                  data-testid="button-copy-ndef-uri"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied URI' : 'Copy NDEF URI'}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await downloadDualQrNfcPlaqueSvg({
                        venueName: target.venueName,
                        title: target.title,
                        code: target.code,
                        url: target.qrUrl,
                        accentHex: target.accentHex,
                      });
                    } catch (e) {
                      toast({
                        title: 'Could not export plaque',
                        description: (e as Error).message,
                        variant: 'destructive',
                      });
                    }
                  }}
                  className="min-h-11 cursor-pointer gap-2"
                  data-testid="button-download-dual-plaque"
                >
                  <Download className="w-4 h-4" />
                  <span>QR + NFC Plaque</span>
                </Button>
              </div>
            </div>

            {statusMessage && (
              <div
                role="status"
                aria-live="polite"
                className={`rounded-2xl border p-3 text-xs font-medium flex items-start gap-2.5 ${
                  statusTone === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : statusTone === 'error'
                      ? 'bg-destructive/10 border-destructive/30 text-destructive'
                      : 'bg-[#EFEAFF] border-[#6236FF]/30 text-[#4B1FE0]'
                }`}
              >
                <Wifi className={`w-4 h-4 shrink-0 mt-0.5 rotate-90 ${writing ? 'motion-safe:animate-pulse' : ''}`} />
                <span>{statusMessage}</span>
              </div>
            )}

            <div className="space-y-2">
              {writing ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full min-h-11 cursor-pointer"
                  onClick={() => {
                    abortRef.current?.abort();
                    setWriting(false);
                  }}
                >
                  Cancel NFC Write
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleWriteNfc}
                  data-testid="button-write-nfc-hardware"
                  className="w-full min-h-11 bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>
                    {caps.hasWebNfc ? 'Tap & Write to Physical NFC Tag' : 'Write to NFC Tag (Web NFC / Instructions)'}
                  </span>
                </Button>
              )}
              {!caps.hasWebNfc && (
                <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
                  Guests on iPhone XS+ and Android read encoded tags natively with zero app. To write tags from iOS or desktop USB writers (ACR122U), paste the NDEF URI above into NFC Tools or NXP TagWriter, or open this console in Chrome on Android.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
