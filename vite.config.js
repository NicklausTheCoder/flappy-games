import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      'flappy-games.onrender.com',
      '.onrender.com',  // This allows ALL subdomains of onrender.com
      'localhost',
      '.localhost',
      '.wintapgames.com'
    ],
    port: 10000,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: [
      'flappy-games.onrender.com',
      '.onrender.com',
      'localhost',
      '.localhost',
       '.wintapgames.com'
    ],
    port: 10000,
    strictPort: true,
  }
});