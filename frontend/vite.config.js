import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pinned port: OceanScope always serves on 5180 so the backend's CORS rule and
// the README stay accurate. strictPort makes a clash fail loudly instead of
// silently drifting to another port.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, strictPort: true },
});
