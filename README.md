# rolê. — MVP local

App mobile-first (PWA) de curadoria de rolês: você descreve o que quer, a "IA" sugere, a comunidade refina, o grupo vota por link e depois você avalia.
**Tudo roda 100% local e mockado** — sem backend, sem chaves, sem rede.

## Rodar

```bash
npm install
npm run dev
```

- Desktop: abra http://localhost:5173 (o app aparece numa moldura de celular).
- Celular na mesma rede Wi-Fi: use o endereço `Network:` que o Vite mostra (ex.: `http://192.168.0.10:5173`). Libere a porta 5173 no firewall do Windows se pedir.
- Build de produção local: `npm run build && npm run preview`.

## Versão web (testes)

Deploy automático no GitHub Pages via `.github/workflows/pages.yml` a cada push na `main`
(build com `BASE_PATH=/<repo>/` + `404.html` para as rotas da SPA). A página tem `noindex`.
Cada visitante tem seus próprios dados no navegador (IndexedDB) — nada é compartilhado entre pessoas.

## Stack

| Camada | Escolha |
|---|---|
| Build | Vite + React 19 + TypeScript |
| Rotas | React Router (transições com `AnimatePresence` + telas em camadas absolutas) |
| Estilo | Tailwind v4, tokens em `src/index.css` (dark-first, acento lima `#c6ff3d`, Geist + Instrument Serif) |
| Animação | Motion: elementos compartilhados (`layoutId`), springs, stagger, blur-in, sheet arrastável, parallax |
| API mock | MSW (Mock Service Worker) — o front chama `fetch('/api/...')` normal |
| Persistência | Dexie (IndexedDB): perfil, pedidos, respostas, votos, avaliações |
| Estado servidor | TanStack Query (cache, polling das respostas, votos otimistas) |
| "IA" | `src/mocks/ranker.ts`: extrai ocasião/grupo/bairro/preço/nicho/vibe do texto e ranqueia com motivos |

## Fluxo para testar

1. **Onboarding** → nome, bairro, nichos e vibes.
2. **Início** → "Pra você", eventos da semana e feed da comunidade.
3. **+** → escreva, por ex.: `aniversário pra 14 pessoas sábado em Pinheiros, até R$ 90` (veja os chips detectados ao vivo).
4. **Resultado** → a IA responde em streaming, 3 recomendações com % de match e motivos; curadores "respondem" nos segundos seguintes.
5. **Mandar pro grupo** → preview do link como no WhatsApp → **página de votação** (`/r/:id`): amigos simulados votam ao vivo → **Fechar no …**.
6. **Avaliar** → foi/não foi, nota e diário. Se o lugar veio de um curador e você "amou", ele ganha reputação.
7. **Você** → reputação, curadoria por nicho, diário e pedidos.

Zerar tudo: botão "zerar dados locais" no perfil (ou na lateral, no desktop).

## Estrutura

```
src/
  app/        App (rotas + transições), PhoneFrame, TabBar
  features/   Onboarding, Home, NewRequest, Results, Vote, Place, Review, Profile
  ui/         primitives (Button, Chip, Cover, StreamText…), Sheet, Toast, motion presets
  mocks/      handlers MSW, ranker ("IA"), seeds (36 lugares, 10 curadores, 7 pedidos)
  db/         Dexie
  lib/        tipos, rótulos, cliente da API (hooks React Query)
```

## Trocar mock por real (próximas fases)

- **Backend**: implemente as rotas de `src/mocks/handlers.ts` numa API real e remova `worker.start()` de `src/main.tsx` — os hooks em `src/lib/api.ts` não mudam.
- **IA real**: troque `parseRequest`/`rank` por uma chamada a LLM (ex.: Ollama local) mantendo a mesma interface `Criteria` → `Ranked[]`.
- **Dados de lugares**: substitua `seeds/places.ts` por Google Places + sua camada de tags de vibe/ocasião.
- **Loja**: empacotar com Capacitor.
