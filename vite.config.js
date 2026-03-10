import { defineConfig } from 'vite';
// import your plugins (react, etc.)

export default defineConfig({
  // ... your existing config
  server: {
    host: true, // or '0.0.0.0'
    allowedHosts: [
      'wintap-all-games.onrender.com',
      '.onrender.com', // allows all subdomains of onrender.com
      'localhost',
      '.localhost'
    ],
    port: 5173, // or your preferred port
    strictPort: true, // fail if port is in use
  },
  preview: {
    allowedHosts: [
      'wintap-all-games.onrender.com',
      '.onrender.com',
    ],
  }
});