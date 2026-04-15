import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: Number.parseInt(process.env.PORT || '5173', 10),
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || `http://127.0.0.1:${process.env.BACKEND_PORT || '8788'}`,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
    preserveSymlinks: true,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      '@tanstack/react-query',
      '@tanstack/query-core',
    ],
  },
  base: process.env.BASE_PATH || '/',
}))
