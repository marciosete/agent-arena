import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port assignment lives in contracts/src/api.ts (PORTS.traderOps) — keep in sync.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
});
