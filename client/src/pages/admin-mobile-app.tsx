import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, Cpu, ShieldCheck, Smartphone, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { detectDeviceCapabilities, subscribeStaffLockScreenPush } from '@/lib/mobileBridge';
import { startContinuousRinger, stopContinuousRinger } from '@/lib/lockScreenRinger';
import { PwaInstallBanner } from '@/components/mobile/PwaInstallBanner';

export default function AdminMobileAppPage() {
  const { toast } = useToast();
  const [staffArmed, setStaffArmed] = useState(false);
  const caps = detectDeviceCapabilities();

  const statusQuery = useQuery<{
    vapidPublicKey: string;
    staffDevices: number;
    guestDevices: number;
    nativeDevices: number;
    totalSubscriptions: number;
  }>({
    queryKey: ['/api/hospitality/push/status'],
    refetchInterval: 10_000,
  });

  const testStaffPush = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/push/test', {});
      return res.json();
    },
    onSuccess: data => {
      startContinuousRinger({
        cafeName: 'Staff Console',
        ticketCode: 'TEST',
        subtitle: 'Staff lock-screen alert test ringing!',
      });
      setTimeout(() => stopContinuousRinger(), 3500);
      toast({
        title: 'Lock-Screen Push Dispatched',
        description: `Sent to ${data.attempted} subscribed staff device(s) (${data.delivered} delivered immediately).`,
      });
    },
    onError: (e: Error) => toast({ title: 'Push test failed', description: e.message, variant: 'destructive' }),
  });

  async function handleArmStaffDevice() {
    const result = await subscribeStaffLockScreenPush();
    if (result.ok) {
      setStaffArmed(true);
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/push/status'] });
      toast({
        title: 'Staff Device Subscribed',
        description: 'This phone/tablet will ring on new orders and arrived curbside vehicles even when locked.',
      });
    } else {
      toast({ title: 'Could not subscribe push', description: result.reason, variant: 'destructive' });
    }
  }

  const info = statusQuery.data;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <p className="manager-eyebrow">DINGZI MOBILE APP &amp; PWA ENGINE</p>
        <h1 className="text-2xl sm:text-3xl font-bold">Dingzi Mobile App, PWA &amp; Lock-Screen Ringing</h1>
        <p className="text-sm text-muted-foreground">
          Configure encrypted VAPID Web Push, iOS/Android lock-screen audio keep-alive, and Capacitor native mobile builds for Dingzi.
        </p>
      </div>

      <PwaInstallBanner />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="manager-panel p-5">
          <span className="text-xs uppercase font-semibold text-muted-foreground">Current Runtime</span>
          <strong className="block text-2xl font-black mt-1">
            {caps.isNativeApp ? `Native (${caps.nativePlatform})` : caps.isStandalonePwa ? 'Installed PWA' : 'Mobile / Web Browser'}
          </strong>
          <span className="text-xs text-muted-foreground mt-1 block">
            {caps.serviceWorkerSupported ? 'Service Worker Active' : 'Standard Web'}
          </span>
        </div>

        <div className="manager-panel p-5">
          <span className="text-xs uppercase font-semibold text-muted-foreground">Guest Pager Subscriptions</span>
          <strong className="block text-2xl font-black mt-1">{info?.guestDevices ?? '…'}</strong>
          <span className="text-xs text-muted-foreground mt-1 block">Active lock-screen guest phones</span>
        </div>

        <div className="manager-panel p-5">
          <span className="text-xs uppercase font-semibold text-muted-foreground">Staff KDS / Runner Devices</span>
          <strong className="block text-2xl font-black mt-1">{info?.staffDevices ?? '…'}</strong>
          <span className="text-xs text-muted-foreground mt-1 block">Receiving order &amp; curbside pushes</span>
        </div>

        <div className="manager-panel p-5">
          <span className="text-xs uppercase font-semibold text-muted-foreground">VAPID ES256 Cryptography</span>
          <strong className="block text-2xl font-black mt-1 text-emerald-600">Active</strong>
          <span className="text-xs text-muted-foreground mt-1 block">RFC 8291 aes128gcm + RFC 8292</span>
        </div>
      </div>

      {/* Arm This Staff Device */}
      <section className="manager-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" aria-hidden="true" />
              Staff Phone / Tablet Lock-Screen Alerts
            </h2>
            <p className="text-xs text-muted-foreground">
              Subscribe this device so baristas and carhop runners receive instant lock-screen notifications when orders arrive or cars pull into a bay.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleArmStaffDevice}
              className="min-h-11 cursor-pointer gap-2"
              data-testid="button-arm-staff-push"
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              {staffArmed ? 'Device Subscribed' : 'Enable Push on This Device'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => testStaffPush.mutate()}
              disabled={testStaffPush.isPending}
              className="min-h-11 cursor-pointer gap-2"
              data-testid="button-test-staff-push"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              Test Lock-Screen Ring
            </Button>
          </div>
        </div>
      </section>

      {/* 4-Layer Lock-Screen Compatibility Matrix */}
      <section className="manager-panel p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" aria-hidden="true" />
          4-Layer Lock-Screen Ringing Architecture
        </h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-2xl border p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <strong>1. Encrypted VAPID Web Push (`sw.js`)</strong>
              <Badge variant="secondary">Android · Desktop · iOS 16.4+ PWA</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Sends RFC 8291 `Urgency: high` push frames that wake the OS lock screen with sound, vibration pattern, and interactive Open/Stop buttons even if the browser tab is closed.
            </p>
          </div>

          <div className="rounded-2xl border p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <strong>2. Lock-Screen Audio Keep-Alive + MediaSession</strong>
              <Badge variant="secondary">iOS Safari QR Scan (Zero Install)</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Maintains an unlocked PCM audio session + iOS/Android Lock-Screen Now-Playing widget so even non-installed Safari scans ring audibly through a locked iPhone speaker.
            </p>
          </div>

          <div className="rounded-2xl border p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <strong>3. Screen Wake Lock + Vibration Cadence</strong>
              <Badge variant="secondary">Counter &amp; Table Phones</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Prevents unexpected screen sleep while viewing the live pager and pulses haptic vibration every 2.4s until acknowledged.
            </p>
          </div>

          <div className="rounded-2xl border p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <strong>4. Native Capacitor App (`com.dingzi.app`)</strong>
              <Badge variant="secondary">Google Play &amp; Apple App Store</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Ships the identical Dingzi React bundle inside Capacitor iOS &amp; Android shells with Android `pager_critical_alarm` channels and iOS Time-Sensitive APNs alerts.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-muted/50 p-4 space-y-2 text-xs font-mono">
          <div className="flex items-center gap-2 font-sans font-semibold text-sm">
            <Cpu className="w-4 h-4 text-primary" aria-hidden="true" />
            <span>Build Native Android / iOS Projects</span>
          </div>
          <p>npm run build &amp;&amp; npx cap add android &amp;&amp; npx cap add ios &amp;&amp; npm run mobile:sync</p>
          {info?.vapidPublicKey && (
            <p className="text-muted-foreground break-all pt-1">
              VAPID Public Key: {info.vapidPublicKey}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
