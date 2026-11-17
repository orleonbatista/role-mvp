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

## Novidades da v2 (pós-avaliação)

- **Link autossuficiente**: o pedido viaja no fragmento da URL (`#p=…`), então o link de votação abre em qualquer celular sem backend. Votos de quem abre o link ficam no aparelho dessa pessoa (placar compartilhado = próxima fase, exige backend).
- **Votação de horário** além do lugar; "Fechar no X · Sáb 20h".
- **Compartilhar**: botão direto do WhatsApp (`wa.me`), folha nativa do celular (`navigator.share`) ou copiar.
- **IA mais honesta**: casamento por palavra inteira + tolerância a 1 erro de digitação, entende dia/horário (hoje, sexta, almoço, madrugada), tags (vegano, samba, pet, acessível, karaokê), espaço reservável para grupos grandes, avisos ("fecha às 23h", "acima do orçamento"), match calibrado pela quantidade de critérios, nível de confiança e "não tenho X no catálogo". Pedido vago → pergunta antes de chutar.
- **Medição local**: eventos do funil, botão de feedback em todas as telas, "fake door" de reserva (formulário de lead) e **Painel de testes** (`/testes`, link no perfil) com export JSON.
- **Modo demonstração** (perfil): liga/desliga curadores e amigos simulados — desligue para testes com pessoas reais.
- **UX**: ícone do tipo de lugar nas capas, aberto agora/abre às, distância aproximada do seu bairro, estados de erro, folhas e celebrações fora da área de rolagem, code-split por tela.
- **IA via LLM local (opcional)**: veja a seção abaixo.

## LLM local (Ollama na sua GPU)

Testado com **qwen2.5:7b** numa RTX 2070 8 GB: roda 100% na GPU, ~1,3–1,8 s por pedido depois de carregado (a 1ª chamada leva alguns segundos para subir o modelo).

1. Instale o Ollama (`winget install Ollama.Ollama`) e baixe o modelo: `ollama pull qwen2.5:7b`.
2. Crie `.env.local` na raiz com `VITE_OLLAMA_MODEL=qwen2.5:7b`.
3. `npm run dev`. O app chama `/ollama/*` e o proxy do Vite repassa ao Ollama local (sem CORS; funciona também do celular no Wi-Fi).

Como funciona (`src/mocks/llm.ts`):
- O LLM só **extrai critérios** (ocasião, pessoas, orçamento, nichos, vibes, tags) com saída JSON por schema; o **ranking continua determinístico** e explicável.
- **Extração ancorada**: cada critério vem com o trecho exato do pedido que o justifica; o que não aparece no texto é descartado (corta alucinação de modelo pequeno). Tags exigem vocabulário da própria tag (ex.: "acessível" só com cadeirante/rampa).
- União com o parser por regras: regras garantem números, bairro e dia/horário; o LLM soma gírias e contexto ("minha mina" → date, "pagodinho" → samba, "sem barulho" → tranquilo).
- Se o Ollama estiver desligado ou demorar >15 s, cai para as regras sem quebrar nada. A tela de resultado mostra qual motor entendeu o pedido.
- No site publicado (GitHub Pages) não há proxy: lá vale só o parser por regras.

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
