import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { detectDeviceCapabilities } from '@/lib/mobileBridge';
import { DingziMark } from '@/components/staff-brand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner({ compact = false }: { compact?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const caps = detectDeviceCapabilities();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (caps.isNativeApp || caps.isStandalonePwa || dismissed) return null;
  if (!deferredPrompt && !caps.isIosSafariBrowser) return null;

  return (
    <>
      <div
        className={`rounded-2xl border border-[#E5E2F2] bg-card/95 backdrop-blur px-3.5 py-3 shadow-sm flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2.5 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
        role="region"
        aria-label="Install dingzi mobile app"
      >
        <div className="flex items-start min-[420px]:items-center gap-2.5 min-w-0 flex-1">
          <DingziMark size={36} />
          <div className="min-w-0 flex-1">
            <strong className="block leading-snug">Install dingzi for Lock-Screen Ringing</strong>
            <span className="text-xs text-muted-foreground block leading-snug mt-0.5">
              Instant push alerts even when your screen is locked or switched away.
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 shrink-0">
          {deferredPrompt ? (
            <Button
              type="button"
              size="sm"
              className="min-h-11 flex-1 min-[420px]:flex-none cursor-pointer gap-1.5"
              onClick={async () => {
                await deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                setDeferredPrompt(null);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 flex-1 min-[420px]:flex-none cursor-pointer gap-1"
              onClick={() => setIosGuideOpen(true)}
            >
              <Share className="w-3.5 h-3.5" />
              Add App
            </Button>
          )}
          <button
            type="button"
            aria-label="Dismiss install banner"
            onClick={() => setDismissed(true)}
            className="w-11 h-11 rounded-xl border min-[420px]:border-0 grid place-items-center text-muted-foreground hover:bg-muted shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Dialog open={iosGuideOpen} onOpenChange={setIosGuideOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Enable iPhone Lock-Screen Push</DialogTitle>
            <DialogDescription>
              Apple enables background Web Push on iPhone when added to your Home Screen (takes 5 seconds, zero App Store download):
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2.5 text-sm list-decimal list-inside pt-1">
            <li>Tap the Safari <strong>Share</strong> button at the bottom of your screen.</li>
            <li>Tap <strong>Add to Home Screen</strong>.</li>
            <li>Open <strong>Dingzi</strong> from your Home Screen and tap <strong>Arm Lock-Screen Alerts</strong>.</li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
