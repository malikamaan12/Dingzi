# Dingzi — Native Mobile App (iOS & Android) + Installable PWA Guide

**Dingzi** ships from a single TypeScript/React codebase as both:
1. **Zero-Download Installable PWA** (`/manifest.webmanifest` + `/sw.js`) for instant QR-scan guest access and 1-tap Home Screen installation.
2. **Native iOS & Android Mobile App** via **Capacitor** (`capacitor.config.ts`, App ID `com.dingzi.app`) for Apple App Store and Google Play distribution.

## Official Dingzi Brand Tokens Used in Native & PWA Shells
- **App Name:** `Dingzi` (`com.dingzi.app`)
- **Theme Color:** Electric Violet `#6236FF`
- **Splash / Dark Background:** Midnight Indigo `#17132E`
- **Ready Signal Accent:** Volt Lime `#C8FF42`

## 4-Layer Lock-Screen Push & Phone Ringing Architecture
1. **RFC 8291 (`aes128gcm`) + RFC 8292 (`VAPID ES256`) Encrypted Web Push (`server/webPushCrypto.ts` & `client/public/sw.js`):**
   - Dispatches `Urgency: high` (`TTL: 300`) encrypted push payloads when baristas mark a pager `ready`, re-buzz a ticket, call a waitlist table, or when new orders/curbside cars arrive.
   - Wakes locked Android phones, Desktop browsers, and iOS 16.4+ Home-Screen PWAs with OS sound, vibration cadence, and `Open Pager` / `Stop Ringing` lock-screen action buttons.
2. **PCM WAV Lock-Screen Audio Keep-Alive + `MediaSession` (`client/src/lib/lockScreenRinger.ts`):**
   - Keeps an unlocked silent PCM loop active when a guest taps **Arm Lock-Screen Ringing & Push** on raw iOS Safari QR scans (even without Home Screen installation) and switches immediately to a loud multi-harmonic hospitality bell chime + Lock-Screen Now-Playing Stop control when called.
3. **Screen Wake Lock + Haptic Vibration Cadence:**
   - Acquires `navigator.wakeLock.request('screen')` while viewing active tickets and pulses `[450, 150, 450, 150, 650]` vibration every 2.4s until acknowledged.
4. **Capacitor Native Push & Local Notifications (`client/src/lib/mobileBridge.ts`):**
   - Bridges `@capacitor/push-notifications` (`ios_apns` / `android_fcm` `pager_critical_alarm` channel) and `@capacitor/local-notifications` automatically inside native builds.

## Building Native Android & iOS Apps
```bash
# 1. Build web bundle
npm run build

# 2. Add native platforms (first time only)
npx cap add android
npx cap add ios

# 3. Sync Dingzi web assets & plugins to native shells
npm run mobile:sync

# 4. Open in Android Studio or Xcode
npm run mobile:android
npm run mobile:ios
```
