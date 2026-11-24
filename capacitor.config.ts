import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.dingzi.app',
  appName: 'Dingzi',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    ...(serverUrl ? { url: serverUrl, cleartext: serverUrl.startsWith('http://') } : {}),
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_dingzi',
      iconColor: '#6236FF',
      sound: 'dingzi_chime.wav',
    },
  },
};

export default config;
