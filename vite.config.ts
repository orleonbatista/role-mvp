import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// rotas fixas do app respondem 200 (cópia do index): no GitHub Pages só /v/ e a raiz existiam de verdade, o resto
// caía no 404.html. Rotas com id (/r/abc) seguem pelo 404.html; links compartilhados usam /v/ (200 + og:*)
const STATIC_ROUTES = ['novo', 'perfil', 'turmas', 'testes', 'onboarding', 'divulgar', 'indicar', 'fundador', 'privacidade']
const routeCopies = () => ({
  name: 'route-copies',
  apply: 'build' as const,
  closeBundle() {
    const out = 'dist', index = join(out, 'index.html')
    if (!existsSync(index)) return
    for (const r of STATIC_ROUTES) { mkdirSync(join(out, r), { recursive: true }); copyFileSync(index, join(out, r, 'index.html')) }
    copyFileSync(index, join(out, '404.html'))
  },
})

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
  plugins: [react(), tailwindcss(), routeCopies()],
  // v/index.html: página estática com og:* para o preview do link da votação (HTTP 200, sem JS para crawlers)
  build: { rolldownOptions: { input: { main: 'index.html', v: 'v/index.html' } } },
  server: { host: true, port: 5173, proxy: ollamaProxy },
  preview: { host: true, port: 4173, proxy: ollamaProxy },
})
