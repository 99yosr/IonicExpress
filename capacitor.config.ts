import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'sos',
  webDir: 'www',
  server: {
    androidScheme: 'http', // allows local dev with HTTP
  },
  android: {
    allowMixedContent: true, // allows http://192.168.x.x calls
  },
};

export default config;
