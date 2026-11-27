# rolê.

PWA de rolês decididos em grupo: alguém descreve o que quer ("aniversário pra 14 sábado em Pinheiros,
até R$ 90"), a IA e a comunidade sugerem lugares, a turma vota por um link e o rolê fecha. Depois, quem
foi avalia, e a avaliação vira curadoria pro próximo pedido.

- Site: https://orleonbatista.github.io/role-mvp/ (noindex, em teste com amigos)
- Documentação completa: [`docs/`](docs/README.md). Jornadas passo a passo com dados de teste:
  [`docs/03-jornadas.md`](docs/03-jornadas.md)

## O que tem

| Área | Funcionalidades |
|---|---|
| Pedido e IA | texto livre → critérios (LLM ou regras) → ranking misturando catálogo curado, casas reais do Google e sugestões; busca rápida `/buscar` |
| Votação | link curto pro WhatsApp e story; vários horários por pessoa; horário alternativo; prazo; a autora tira/põe lugares e escolhe quem vota (qualquer um com o link ou só amigos e a turma) |
| Depois de fechar | vou/talvez/não, recados, álbum de fotos, rota, clima, agenda, dividir a conta com Pix, convite pra avaliar |
| Turmas | quem vota entra na turma; chat ligado às votações (recados automáticos e votações abertas); membros com @ e nível; pública ou privada |
| Social | @ único, busca por @ ou nome, pedidos de amizade, feed dos amigos, perfil público, listas, ranking, bloquear e denunciar |
| Notificações | avisos no celular (Web Push) e central `/notificacoes` com tudo guardado por 60 dias |
| Ferramentas | dividir conta, convite com flyer, post 4:5, link do WhatsApp, ponto de encontro, quem leva o quê, sorteio (sem precisar de grupo) |
| Casas (B2B) | reivindicar página, oferta pra grupos, fotos próprias, destaque patrocinado marcado, relatório |
| Curadoria | papéis admin/curador/usuário; fila de eventos, denúncias (3 ocultam sozinho), reivindicações, funil, teste de avisos |

## Arquitetura

```
GitHub Pages (PWA estático)                     PC do Orleon (Windows)
 React 19 + Vite + Tailwind + Motion             llm-gateway (Node 22, node:sqlite)
 Dexie (IndexedDB) = cópia local       ⇄ HTTPS ⇄  ├─ API /api/* (sessões, pseudônimos, social, turmas, inbox…)
 shim de fetch em src/mocks/browser.ts  túnel     ├─ IA: nuvem (Gemini/OpenAI) com fallback qwen2.5:7b local
 TanStack Query, React Router           Cloudflare├─ Web Push (VAPID)
                                                  └─ fotos em data/photos (teto 5 GB)
```

- **Local-first:** a tela lê do IndexedDB; o servidor é a fonte do que é compartilhado (votos, turmas,
  amizades, notificações). Sem servidor, o app segue funcionando com o que já tem.
- **Identidade:** cada aparelho tem uma sessão (`X-Session`, só o hash fica no banco). Os outros só veem
  pseudônimos `u-…` (sha256 com sal), nunca o id do aparelho.
- **Google Places:** a chave fica só no secret `PLACES_KEY` e no `.env.local` (fora do git). Do Google só
  guardamos `place_id` e lat/lng por até 30 dias; fotos do Google nunca são guardadas (o link vive 6 h no
  `sessionStorage` do aparelho).
- Detalhes: [`docs/04-arquitetura.md`](docs/04-arquitetura.md).

## Rodar

```bash
npm install
npm run dev               # http://localhost:5173
npm run build             # gera dist/ com cópias das rotas fixas (novo/, perfil/, amigos/, ferramentas/…)
npx playwright test       # E2E contra o site publicado (E2E_BASE muda o alvo)
```

Servidor (no PC): `powershell -ExecutionPolicy Bypass -File llm-gateway\start-role.ps1` sobe o gateway e
o túnel e publica o endereço novo no `llm.json`. Dados em `llm-gateway/data/` (fora do git: banco,
chaves de IA, chave de admin, sal dos pseudônimos, fotos).

## Automação

| Workflow | Quando | O que faz |
|---|---|---|
| `pages.yml` | push na `main` | build com `BASE_PATH` e deploy no Pages |
| `e2e.yml` | depois de cada deploy e 1x/dia | jornadas no site publicado com dados `[E2E]`, apagados no fim |
| `monitor.yml` | a cada 15 min | `/api/health`; abre/fecha a issue "Servidor fora do ar" |

## Estrutura

```
src/app        rotas, barra de abas, fallback de carregamento
src/features   telas (Home, Vote, Results, Social, Turmas, Inbox, Ferramentas, VoteSetup, Venue…)
src/lib        regras puras (Pix, slots, share, storyCard, places, push)
src/mocks      shim da API local, ranker, sincronização com o servidor (remote.ts)
src/db         Dexie
llm-gateway    servidor: api.mjs (rotas e banco), server.mjs (HTTP, mídia, IA, push), providers.mjs
e2e            Playwright
docs           produto, jornadas, arquitetura, operação, métricas, roadmap, negócio, decisões
```
