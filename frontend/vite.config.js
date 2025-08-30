import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/umdf-viewer': 'http://localhost:8000',
      '/api': 'http://localhost:8000',
      '/schemas': 'http://localhost:8000'
    }
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: '[name]-[hash][extname]',
        chunkFileNames: '[name]-[hash].js',
        entryFileNames: '[name]-[hash].js'
      }
    }
  }
}) 