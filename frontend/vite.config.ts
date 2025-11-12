import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        onError: (err, req, res) => {
          console.error('Proxy error:', err.message);
          if (err.code === 'ECONNREFUSED') {
            console.error('⚠️  Backend non accessible sur http://localhost:8080');
            console.error('   Assurez-vous que le backend est démarré');
            console.error('   Lancez: cd backend && cargo run');
          }
        },
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})

