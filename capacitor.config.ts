import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.guimsgroup.financehub",
  appName: "Guims Finance Hub",
  webDir: "dist",
  server: {
    // En dev, décommenter pour hot-reload sur mobile :
    // url: "http://192.168.168.7:8081",
    // cleartext: true,
    androidScheme: "https",
  },
  plugins: {
    StatusBar: {
      style: "dark",
      backgroundColor: "#1a1a2e",
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#1a1a2e",
      showSpinner: false,
    },
  },
};

export default config;
