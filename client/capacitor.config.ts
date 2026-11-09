import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.leveltest.app",
  appName: "Level Test",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
