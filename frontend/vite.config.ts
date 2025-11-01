import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const previewHost = env.VITE_PREVIEW_HOST || '0.0.0.0';
  const previewPort = Number(env.VITE_PREVIEW_PORT || 4173);

  const allowedHostsFromEnv = (env.VITE_PREVIEW_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const defaultAllowedHosts = [
    'localhost',
    '127.0.0.1',
    'recruitment20-frontend-production.up.railway.app'
  ];

  const previewAllowedHosts = Array.from(
    new Set([...defaultAllowedHosts, ...allowedHostsFromEnv])
  );

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true
    },
    preview: {
      // Allow preview from Railway and enable configuration via .env variables
      host: previewHost,
      port: previewPort,
      allowedHosts: previewAllowedHosts
    }
  };
});
