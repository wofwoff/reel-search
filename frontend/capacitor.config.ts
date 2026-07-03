import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reelsearch.app',
  appName: 'SaveIt',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
