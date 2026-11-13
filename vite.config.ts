import { defineConfig } from 'vite';

// Cliente 3D em client/; o servidor (porta 4750) é separado e só entrega dados por GET.
export default defineConfig({
  root: 'client',
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5750, proxy: { '/api': 'http://127.0.0.1:4750' } },
});
