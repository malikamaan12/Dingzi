import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Camera, Flashlight, QrCode, Upload, Wifi } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { saveGuestPass } from '@/lib/guestSession';
import {
  decodeQrFromSource,
  detectQrNfcCapabilities,
  parseDingziScanPayload,
  startNfcTagTapListener,
} from '@/lib/qrNfcEngine';

interface VenueOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId?: string;
  restaurantName?: string;
  venues?: VenueOption[];
  dir?: 'ltr' | 'rtl';
  lang?: string;
  t?: (key: string) => string;
}

export function QrNfcScannerModal({
  open,
  onOpenChange,
  restaurantId,
  restaurantName,
  venues,
  dir = 'ltr',
  lang = 'en',
  t = (k: string) => k,
}: Props) {
  const [, navigate] = useLocation();
  const caps = detectQrNfcCapabilities();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const nfcStopRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedVenueId, setSelectedVenueId] = useState(restaurantId || venues?.[0]?.id || '');
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [nfcListening, setNfcListening] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const activeBranchId = restaurantId || selectedVenueId || venues?.[0]?.id || '';
  const activeBranchName =
    restaurantName || venues?.find(v => v.id === activeBranchId)?.name || 'Dingzi Venue';

  const stopHardware = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try { track.stop(); } catch {}
      }
      streamRef.current = null;
    }
    if (nfcStopRef.current) {
      nfcStopRef.current();
      nfcStopRef.current = null;
    }
    setCameraActive(false);
    setTorchSupported(false);
    setTorchOn(false);
    setNfcListening(false);
  }, []);

  const resolveCodeOrPayload = useCallback(
    async (raw: string) => {
      setErrorMsg(null);
      const parsed = parseDingziScanPayload(raw);
      if (parsed.kind === 'route') {
        stopHardware();
        onOpenChange(false);
        navigate(parsed.path);
        return;
      }

      if (parsed.kind === 'code') {
        if (!activeBranchId) {
          setErrorMsg('Select a venue first to look up this code.');
          return;
        }
        setResolving(true);
        try {
          const pagerRes = await fetch('/api/public/pager/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurantId: activeBranchId, ticketCode: parsed.code }),
          });
          if (pagerRes.ok) {
            const data = await pagerRes.json();
            stopHardware();
            onOpenChange(false);
            if (data.trackingToken) {
              saveGuestPass({
                kind: 'pager',
                trackingToken: data.trackingToken,
                code: data.ticketCode,
                restaurantId: activeBranchId,
                restaurantName: activeBranchName,
              });
              navigate(`/pager/${data.trackingToken}`);
              return;
            }
            if (data.coasterToken) {
              navigate(`/tag/${data.coasterToken}`);
              return;
            }
          }

          const tagRes = await apiRequest('POST', '/api/public/tag/lookup', {
            restaurantId: activeBranchId,
            code: parsed.code,
          });
          const tagData = await tagRes.json();
          stopHardware();
          onOpenChange(false);
          if (tagData.destination) {
            navigate(tagData.destination);
          } else if (tagData.tag?.token) {
            navigate(`/tag/${tagData.tag.token}`);
          }
        } catch (err: any) {
          setErrorMsg(err?.message || 'No active pager, table, or coaster matched that code.');
        } finally {
          setResolving(false);
        }
        return;
      }

      setErrorMsg('Unrecognized QR or NFC tag. Scan a Dingzi table, bay, menu, or pager coaster.');
    },
    [activeBranchId, activeBranchName, navigate, onOpenChange, stopHardware],
  );

  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    if (!caps.hasCameraApi) {
      setStatusMsg('Camera access requires HTTPS or localhost. Use photo scan or enter your code below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = (videoTrack?.getCapabilities?.() || {}) as Record<string, any>;
      if (capabilities.torch) setTorchSupported(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      if (caps.hasBarcodeDetector) {
        scanTimerRef.current = window.setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          const decoded = await decodeQrFromSource(v);
          if (decoded) {
            if (scanTimerRef.current !== null) {
              window.clearInterval(scanTimerRef.current);
              scanTimerRef.current = null;
            }
            void resolveCodeOrPayload(decoded);
          }
        }, 240);
      } else {
        setStatusMsg('Live QR auto-detection is unavailable in this browser. Capture a photo or enter your code below.');
      }
    } catch {
      setCameraActive(false);
      setStatusMsg('Camera permission was not granted. You can scan from a photo or enter your code below.');
    }
  }, [caps.hasBarcodeDetector, caps.hasCameraApi, resolveCodeOrPayload]);

  useEffect(() => {
    if (restaurantId) setSelectedVenueId(restaurantId);
  }, [restaurantId]);

  useEffect(() => {
    if (!open) {
      stopHardware();
      setErrorMsg(null);
      setStatusMsg(null);
      setManualCode('');
      return;
    }
    if (caps.hasCameraApi && caps.hasBarcodeDetector) {
      void startCamera();
    }
    return () => stopHardware();
  }, [open, caps.hasCameraApi, caps.hasBarcodeDetector, startCamera, stopHardware]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as any;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {}
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      const bitmap = await createImageBitmap(file);
      const decoded = await decodeQrFromSource(bitmap);
      bitmap.close?.();
      if (decoded) {
        await resolveCodeOrPayload(decoded);
      } else {
        setErrorMsg('Could not detect a clear QR code in that image. Try moving closer or enter the code below.');
      }
    } catch {
      setErrorMsg('Could not process that image.');
    }
  }

  async function handleStartNfcTap() {
    setErrorMsg(null);
    setNfcListening(true);
    setStatusMsg('Hold the back of your phone near the Dingzi NFC coaster or table tag…');
    const stop = await startNfcTagTapListener(
      payload => {
        void resolveCodeOrPayload(payload);
      },
      msg => {
        setNfcListening(false);
        setErrorMsg(msg);
      },
    );
    nfcStopRef.current = stop;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} lang={lang} className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#17132E] dark:text-white">
            <QrCode className="w-5 h-5 text-[#6236FF]" aria-hidden="true" />
            <span>{t('Scan QR or Tap NFC')}</span>
          </DialogTitle>
          <DialogDescription>
            {t('Point your camera at any Dingzi table, curbside bay, menu, or reusable pager coaster.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera Viewfinder */}
          <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#17132E] border border-[#241E42] grid place-items-center">
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Viewfinder Frame */}
                <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-[#C8FF42]/85 shadow-[0_0_0_9999px_rgba(23,19,46,0.38)]" />
                {torchSupported && (
                  <button
                    type="button"
                    aria-label="Toggle camera torch"
                    onClick={toggleTorch}
                    className={`absolute top-3 end-3 w-11 h-11 rounded-xl grid place-items-center cursor-pointer transition-colors ${
                      torchOn ? 'bg-[#C8FF42] text-[#17132E]' : 'bg-[#17132E]/80 text-white border border-white/20'
                    }`}
                  >
                    <Flashlight className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <div className="p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#241E42] text-[#C8FF42] grid place-items-center mx-auto">
                  <Camera className="w-6 h-6" aria-hidden="true" />
                </div>
                <p className="text-xs text-white/80 max-w-xs mx-auto">
                  {statusMsg || t('Tap Start Camera to scan a Dingzi QR code, or tap your phone directly on any NFC coaster.')}
                </p>
                {caps.hasCameraApi && (
                  <Button
                    type="button"
                    onClick={startCamera}
                    data-testid="button-scanner-start-camera"
                    className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{t('Start Camera Scanner')}</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Photo Scan + Web NFC Action Row */}
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {caps.hasBarcodeDetector && (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-11 rounded-xl cursor-pointer gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>{t('Scan from Photo')}</span>
              </Button>
            )}
            {caps.hasWebNfc ? (
              <Button
                type="button"
                variant={nfcListening ? 'default' : 'outline'}
                onClick={handleStartNfcTap}
                data-testid="button-scanner-nfc-tap"
                className="min-h-11 rounded-xl cursor-pointer gap-2"
              >
                <Wifi className={`w-4 h-4 rotate-90 ${nfcListening ? 'motion-safe:animate-pulse' : ''}`} />
                <span>{nfcListening ? t('Ready for NFC Tap…') : t('Tap NFC Coaster')}</span>
              </Button>
            ) : (
              <div className="rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] px-3 py-2 text-[11px] text-[#57507A] flex items-center gap-2">
                <Wifi className="w-4 h-4 text-[#4B1FE0] rotate-90 shrink-0" aria-hidden="true" />
                <span>{t('Tip: Hold the top of your phone near any Dingzi NFC coaster to open instantly.')}</span>
              </div>
            )}
          </div>

          {/* Manual Pager / Coaster Code Fallback */}
          <form
            onSubmit={e => {
              e.preventDefault();
              if (manualCode.trim()) void resolveCodeOrPayload(manualCode);
            }}
            className="pt-3 border-t space-y-2.5"
          >
            {!restaurantId && venues && venues.length > 1 && (
              <select
                aria-label={t('Select venue')}
                value={activeBranchId}
                onChange={e => setSelectedVenueId(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] px-3 text-base sm:text-sm font-medium text-[#17132E]"
              >
                {venues.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-col min-[380px]:flex-row gap-2">
              <Input
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder={t('Pager or coaster # (A-001, COASTER-01)')}
                data-testid="input-scanner-manual-code"
                className="min-h-11 rounded-xl font-mono uppercase placeholder:font-sans placeholder:normal-case flex-1"
              />
              <Button
                type="submit"
                disabled={!manualCode.trim() || resolving}
                data-testid="button-scanner-lookup-code"
                className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer shrink-0"
              >
                {resolving ? '…' : t('Open')}
              </Button>
            </div>
          </form>

          {errorMsg && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errorMsg}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
