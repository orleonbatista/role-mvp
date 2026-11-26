# 04 · Arquitetura

## Visão geral

```
 celular / navegador                                     PC do Orleon (Windows, RTX 2070)
┌──────────────────────────────────────────┐            ┌────────────────────────────────────────┐
│ PWA (GitHub Pages)                       │   HTTPS    │ cloudflared (Quick Tunnel)             │
│  React 19 · Vite · Tailwind v4 · motion  │ ─────────▶ │   https://<aleatório>.trycloudflare.com │
│                                          │            │              │                         │
│  UI ──fetch('/api/*')──▶ "API" local     │            │              ▼                         │
│        (handlers MSW, no próprio app)    │            │ llm-gateway/server.mjs  :8787          │
│          │          │                    │            │  ├─ POST /extract, /ask ─▶ Ollama      │
│          ▼          ▼                    │            │  │                      qwen2.5:7b     │
│     IndexedDB    remote.ts ──────────────┼────────────┼─▶└─ /api/*  (api.mjs) ─▶ SQLite        │
│     (Dexie)      (sincronização)         │            │                       data/role.db     │
│                                          │            └────────────────────────────────────────┘
│  llm.ts ─── lê llm.json (raw.github) ────┼─▶ URL do túnel
└──────────────────────────────────────────┘
```

**Offline-first.** O app inteiro roda no aparelho:

- **Catálogo:** fixo no código.
- **Ranking:** determinístico, em TypeScript.
- **Dados:** IndexedDB.
- **API:** handlers do MSW, servidos em processo, sem Service Worker.

O PC acrescenta duas camadas opcionais: o **LLM**, que entende melhor o pedido e responde perguntas, e
o **backend**, que compartilha dados entre aparelhos. Se o PC desliga, o app volta sozinho ao modo
"link + regras".

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| UI | React 19, react-router 8, Tailwind v4, motion 14 | Velocidade de iteração e transições refinadas (layoutId, springs) |
| Estado remoto | TanStack Query | Cache, polling da votação, voto otimista |
| "Backend" no app | MSW 3 (`getResponse` interceptando fetch) | Mesma interface de uma API real; trocar pelo backend definitivo é trocar o `BASE` |
| Dados locais | Dexie (IndexedDB) | Funciona offline e sobrevive a recarregar a página |
| Build | Vite 8 (rolldown), multi-página (`index.html` + `v/index.html`) | `/v/` é página estática com tags OG para o preview do WhatsApp |
| Hospedagem | GitHub Pages + workflow `pages.yml` | Grátis; `404.html` faz o fallback da SPA |
| LLM | Ollama + qwen2.5:7b (GPU de 8 GB) | Custo zero; saída JSON com schema |
| Backend | Node 22 + `node:sqlite` (sem dependências) | Roda no PC, um arquivo `.db`, zero instalação |
| Lugares reais | Google Places API (New), Text Search direto do navegador (`lib/places.ts`) | Qualquer lugar de SP sem backend; chave restrita por domínio + cotas diárias |
| Exposição | Cloudflare Quick Tunnel | HTTPS público sem conta, domínio nem abrir porta no roteador |

## Pastas

```
src/
  app/        App (rotas lazy), PhoneFrame (moldura no desktop), TabBar, FeedbackButton
  features/   uma tela por arquivo (Home, NewRequest, Results, Vote, Suggest, Place, Divulgar, …)
  ui/         primitivas (Page, Button, Chip, Cover, Sheet, Toast, motion presets)
  lib/        types, api (hooks), share (links), storyCard (arte em canvas), track, hours, labels, askPoll
  mocks/      handlers (API), ranker, llm/llmPrompt, remote (sync), extraEvents, seeds (catálogo)
  db/         Dexie (schema v3)
v/            página estática de compartilhamento (OG + redirect)
llm-gateway/  server.mjs (gateway), api.mjs (backend SQLite), start.cmd, data/ (fora do git)
public/       og.jpg, ícones
docs/         esta documentação
```

## Banco do backend (SQLite no PC, `llm-gateway/data/role.db`)
Além de pedidos, votos, sugestões, catálogo e métricas, o banco guarda:
- `base_places` e `base_areas`: base regional do OSM, carregada por célula de ~2 km;
- `gmatch`: liga o id do OSM ao `place_id` do Google.

Rotas novas:
- `GET /api/geo/cep/:cep` e `GET /api/geo/rev`: BrasilAPI/ViaCEP + Nominatim;
- `POST /api/base/load` e `GET /api/base/near`;
- `GET|POST /api/gmatch`.

O código do OSM fica em `llm-gateway/osm.mjs`.

## Camadas de lugares

| Camada | Origem | Onde vive | Aparece |
|---|---|---|---|
| Fictício (demo) | `seeds/places.ts` | código | só com o modo demo ligado (`/testes`) |
| Curado | comunidade (`/indicar`, sugestões confirmadas) + eventos aprovados | backend (`places`, `submissions`) + cache local (`gplaces`) | feed, Pra você, 1ª opção da IA |
| Base | OpenStreetMap (`public/base-sp.json`, gerado por `llm-gateway/tools/fetch-osm.mjs`) | arquivo estático (~34 KB gzip) | só como reserva da IA, marcado "sem curadoria"; e na busca de indicar/sugerir |

Ordem de carga no boot (`main.tsx`): demo (se ligado) → curados (eventos, comunidade) → base. O `registerPlace`
promove um lugar da base a curado quando alguém o confirma (mesmo id `o-<n|w|r><osm id>`).

**Ranking em camadas** (`rankLayered`): curados com encaixe ≥ 55% primeiro; se não fecha 3, completa com o
melhor do resto (curados fracos ou base), por encaixe. Lugares externos não ganham nem perdem por horário,
porque o horário não é confirmado.

## Entendimento do pedido (ranker + LLM)

1. **Regras** (`ranker.ts › parseRequest`): reconhece palavras inteiras, tolera 1 erro de digitação
   (Levenshtein) e entende dia e hora ("sábado à noite", "18h"), bairro, orçamento ("até R$ 90"),
   tamanho do grupo, ocasião, estilos, vibes e requisitos (tags).
2. **LLM** (`llm.ts › refineWithLLM`): devolve JSON com schema, e **cada item precisa citar o trecho**
   do pedido que o justifica. O `grounded()` confere o trecho no texto (com tolerância a erro de
   digitação), descarta palavras genéricas e passa as tags por uma lista de proteção. O resultado
   final é a **união** com as regras. O tempo limite é de 9 a 15s; se falhar, o LLM fica 60s em pausa.
3. **Ranking** (`rank`): pontuação explicável por estilo, vibe, ocasião, capacidade, orçamento, bairro,
   horário e tags, com nota como desempate. O match calibrado é a pontuação dividida pelo máximo
   possível. Também gera avisos, confiança e "o que não deu pra atender".
4. **Perguntas sobre a votação** (`askPoll.ts`): o LLM recebe só os fatos das opções (no máximo 6) e
   responde curto. Sem LLM, regras respondem por intenção (preço, capacidade, distância, horário, nota,
   estilo, votos).

## Links compartilháveis

| Link | Abre | Carrega |
|---|---|---|
| `/v/?id=r-…&src=wa#d=…` | votação `/r/:id` | pedido comprimido (deflate-raw + base64url: id, texto, opções, autor, cor) |
| `/v/?to=s&id=r-…#d=…` | sugerir `/s/:id` | igual |
| `/v/?to=i&id=r-…#d=…&g=…` | importar sugestão `/i/:id` | + sugestão (lugar, nome, comentário) |
| `/v/?to=e&id=<evento>&src=cr_<@>` | convite `/e/:id` | atribuição ao divulgador |
| `/v/?to=p&id=<@>&src=cr_<@>` | página de bio `/p/:handle` | — |
| `/v/?to=c&id=ev-u-…#d=…` | curadoria `/c/:id` | evento enviado, comprimido |

- **Por que passar por `/v/`:** é uma página estática com tags OG que responde 200, o que garante
  preview rico no WhatsApp. Ela redireciona pela SPA.
- **Por que o fragmento `#`:** os dados vão no fragmento, que não chega ao servidor, e assim o link
  funciona sem backend.
- **Origem:** o `?src=` é registrado no primeiro toque (`role.src`) e acompanha todos os eventos
  daquele aparelho.

## Sincronização com o backend (`src/mocks/remote.ts`)

**Regra de ouro:** escreve sempre primeiro no local; o backend é um espelho opcional.

- **Descoberta:** `apiBase()` lê a URL do túnel no `llm.json` (ou na sobrescrita do `/testes`, ou
  em `VITE_API_URL`) e consulta `GET /api/health`. Cacheia por 60s; depois de uma falha, pausa 30s.
- **Identidade:** cada aparelho tem um `deviceId` aleatório (`role.device`), enviado no cabeçalho
  `X-Device`. Não há login nem dado pessoal além do nome que a pessoa digita.

| Ação no app | Local | Backend |
|---|---|---|
| Criar pedido (ou convite de evento) | `db.requests` | `POST /api/requests` (o dono é o aparelho autor) |
| Abrir pedido (polling a cada 4s) | — | `GET /api/requests/:id` → mescla opções, **votos de outros aparelhos**, sugestões e decisão |
| Sugerir lugar do Google | `db.gplaces` (id + resumo) | resumo vai junto na sugestão e no pedido (`places`); link carrega o resumo no 6º item do `#d=` |
| Votar | `db.votes` | `POST …/votes` (1 voto por aparelho e tipo; voto do modo demo nunca sobe) |
| Sugerir | `db.answers` + opção | `POST …/suggestions` → vira opção pra todos (máx. 6) |
| Fechar | `status=decidido` | `POST …/decide` (só o aparelho autor; outro recebe 403) |
| Enviar evento | `db.submissions` | `POST /api/submissions`; quem enviou consulta `GET /api/submissions/mine` |
| Curadoria (com chave) | espelha a fila | `GET /api/submissions`, `POST …/status` → **aprovado = publicado** |
| Eventos publicados | `registerPlace` no boot | `GET /api/events` (+ `eventos.json` + aprovações locais) |
| Métricas | `db.events` | `POST /api/track` em lotes de até 60, a cada 4s e ao sair da página |
| Feedback / leads | `db.feedback` / `db.leads` | `POST /api/feedback`, `/api/leads` |
| Painel global (com chave) | — | `GET /api/stats` |

## Modelo de dados

**Local (Dexie v3):**

- `profile`, `requests`, `answers`, `votes`, `reviews`, `helpful`, `diary`
- `events` (métricas), `feedback`, `leads`, `submissions`

**Backend (SQLite):**

```sql
requests    (id PK, data JSON, author_device, created_at, decided_place, decided_time, decided_at)
votes       (request_id, device, kind, value, voter, at)  PK(request_id, device, kind)
suggestions (id PK, request_id, place_id, by_name, comment, hue, device, at)  UNIQUE(request_id, place_id, by_name)
submissions (id PK, data JSON, status, device, at, reviewed_at)
events      (id PK, device, name, src, path, props JSON, at)
feedback    (id PK, device, data JSON, at)
leads       (id PK, device, data JSON, at)
```

## Segurança (nível "teste com amigos")

**Gateway:**

- Expõe **só** `/extract`, `/ask` e `/api/*`. A API crua do Ollama nunca fica pública.
- Origem permitida por lista (CORS): `orleonbatista.github.io` e localhost.
- Limites por IP (via `cf-connecting-ip`):
  - LLM: 20 por minuto e 400 por dia, com fila de 1 job por vez na GPU;
  - API: 90 escritas e 400 leituras por minuto.
- Corpo de até 16 KB.

**Validação no backend:**

- Todo identificador passa por regex: pedido, evento, aparelho e lugar.
- Textos têm tamanho truncado e JSON tem tamanho limitado.
- Só o aparelho autor fecha ou edita o próprio pedido.

**Curadoria:**

- A chave é gerada no primeiro start em `llm-gateway/data/admin-key.txt`, fora do git.
- A comparação é em tempo constante.
- No app, a chave fica salva só no aparelho de quem cura.

**Privacidade:**

- Guarda só o nome digitado, o identificador aleatório do aparelho e o contato opcional do
  formulário de reserva ou de evento. Não guarda localização, e o IP não é gravado.

**O que não é seguro o bastante para produção:**

- não há autenticação de usuário;
- um `deviceId` pode ser forjado;
- o túnel não tem WAF;
- não há backup automático.

Ver o roadmap da fase B.
