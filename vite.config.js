import { defineConfig } from 'vite';
// import your plugins (react, etc.)

// vite.config.js
export default defineConfig({
  server: {
    allowedHosts: true, // allows ANY host - USE WITH CAUTION
  }
});