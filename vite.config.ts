import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1', port: Number(process.env.VITE_PORT ?? 5173), strictPort: true,
    watch: { usePolling: true },
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT ?? 3210}`, ws: true } },
  },
  build: {
    rollupOptions: {
      input: { dashboard: 'dashboard/index.html', report: 'dashboard/report.html', overlay: 'overlay/index.html', sensor: 'sensor/index.html', privacy: 'privacy/index.html' },
    },
  },
});
