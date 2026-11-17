import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// LLM local: o app chama /ollama/* no mesmo endereço e o Vite repassa ao Ollama da máquina.
// Funciona do celular na mesma rede e dispensa configurar CORS (OLLAMA_ORIGINS).
const ollamaProxy = {
  '/ollama': {
    target: process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/ollama/, ''),
    configure: (proxy: any) => proxy.on('proxyReq', (req: any) => req.removeHeader('origin')),
  },
}

// BASE_PATH=/role-mvp/ no build do GitHub Pages; '/' localmente
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  // v/index.html: página estática com og:* para o preview do link da votação (HTTP 200, sem JS para crawlers)
  build: { rolldownOptions: { input: { main: 'index.html', v: 'v/index.html' } } },
  server: { host: true, port: 5173, proxy: ollamaProxy },
  preview: { host: true, port: 4173, proxy: ollamaProxy },
})
