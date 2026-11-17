# 05 · Operação

## Rodar local (desenvolvimento)

```cmd
cd C:\Users\orleo\Downloads\ideia
npm install
npm run dev            :: http://localhost:5173
```

- `.env.local` com `VITE_OLLAMA_MODEL=qwen2.5:7b` liga o LLM direto, pelo proxy `/ollama` do Vite.
- Para usar o backend no desenvolvimento, crie `.env.local` com `VITE_API_URL=http://127.0.0.1:8787` e
  suba o gateway (abaixo).
- `npm run typecheck` e `npm run build` antes de publicar.
- No Windows, use o **cmd**: o PowerShell bloqueia `npx` pela política de execução.

## Publicar o site

- Todo push na `main` dispara `.github/workflows/pages.yml`: build com `BASE_PATH=/role-mvp/`, cópia
  de `index.html` para `404.html` e deploy no GitHub Pages.
- Variáveis do build:
  - `VITE_SITE_URL`: tags OG;
  - `VITE_LLM_CONFIG_URL`: `llm.json`;
  - `VITE_EVENTS_URL`: `eventos.json`.
  Os dois JSON são lidos em **tempo de execução** a partir do raw.githubusercontent, ou seja, mudar o
  arquivo não exige novo deploy.

## Ligar o PC como servidor (LLM + backend)

Pré-requisitos (já instalados no PC): Ollama com `qwen2.5:7b`, Node 22.18 ou mais recente e
`cloudflared`.

```cmd
C:\Users\orleo\Downloads\ideia\llm-gateway\start.cmd
```

O script abre duas coisas:

1. **Gateway** (janela "rolê gateway"): `node server.mjs` na porta 8787. No primeiro start ele cria
   `llm-gateway\data\role.db` (banco) e `llm-gateway\data\admin-key.txt` (chave da curadoria).
2. **Túnel**: `cloudflared` imprime uma URL `https://<palavras>.trycloudflare.com`.

**Se a URL do túnel mudou** (acontece toda vez que o `cloudflared` reinicia):

1. edite `llm.json` na raiz do repositório, campo `url`;
2. faça commit e push (ou peça ao Claude).

Os aparelhos passam a usar a nova URL em até 2 minutos. Para testar só num aparelho antes disso,
use `/testes` → "URL do gateway".

**Reiniciar só o gateway, mantendo a mesma URL:** feche a janela do gateway e rode
`node server.mjs` de novo dentro de `llm-gateway`. Não feche o `cloudflared`.

### Conferir se está no ar
- `https://<túnel>/health` → `{ ok: true, model: … }` (LLM)
- `https://<túnel>/api/health` → `{ ok: true, db: true }` (backend). Pelo navegador, a resposta vem
  bloqueada por origem, o que é esperado; o próprio `/testes` mostra o status.

## Google Places (busca de qualquer lugar)
- **Projeto:** `role-mvp` no Google Cloud, com a conta de faturamento "Minha conta de faturamento 2".
  O pré-pagamento de R$ 170 fica como crédito e é reembolsável se você encerrar a conta de faturamento.
- **Chave `role-web-places`** (Credenciais):
  - aceita só os sites `https://orleonbatista.github.io/*`, `http://localhost:5173/*` e `http://localhost:4173/*`;
  - aceita só a Places API (New).
  - O site precisa ser o domínio inteiro: em chamadas entre domínios o navegador manda só o domínio, sem
    o caminho `/role-mvp/`.
- **Onde a chave fica:**
  - no site publicado: segredo `PLACES_KEY` do repositório, lido pelo `pages.yml` como `VITE_PLACES_KEY`;
  - no desenvolvimento: `.env.local`.
  Ela vai dentro do JavaScript do site, como toda chave de navegador do Google. A proteção é a restrição
  de site, a restrição de API e as cotas.
- **Cotas diárias** (APIs e serviços → Places API (New) → Cotas):
  - SearchText, SearchNearby, GetPlace e GetPhotoMedia: **30 por dia** (≤ 930 por mês, abaixo da menor cota
    grátis por SKU, de 1.000);
  - Autocomplete: **300 por dia** (≤ 9.300, abaixo de 10.000);
  - endpoints que o app não usa: **0**.
  Ao bater o limite, o Google responde 429 e o app mostra "a cota de hoje acabou". Nada é cobrado.
- **No app:** no máximo 12 buscas por aparelho por dia, cache por busca, e só busca quando a pessoa toca em
  "Buscar no Google Maps", nunca enquanto digita.
- **Alerta de orçamento** "role-mvp alerta": R$ 10 por mês, com e-mail a 10%, 90% e 100%. A Places API não
  aceita bloqueio automático por gasto (só Cloud Run, Functions, Gemini e Vertex), por isso as cotas são a
  trava real.
- **Termos do Google:**
  - mostramos "Dados de lugares: Google Maps" onde aparecem resultados;
  - guardamos o `place_id` e um resumo curto (nome, bairro, nota) para a opção aparecer na votação dos
    outros aparelhos;
  - a página do lugar aponta pro Google Maps.
  - Para produção: buscar os detalhes de novo pelo `place_id` em vez de guardar o resumo.
- **Para aumentar o limite:** suba as cotas aos poucos e acompanhe "Faturamento → Relatórios" antes de passar
  da cota grátis.

## Curadoria
1. Abra `llm-gateway\data\admin-key.txt` no PC e copie a chave.
2. No celular de quem cura: `/testes` → **Chave da curadoria** → colar → Salvar. Aparece "Curadoria
   ativa neste aparelho".
3. A fila fica em `/testes` → **Fila de eventos**:
   - **Aprovar** publica pra todo mundo na hora;
   - **Avisar** manda pra quem enviou o link de divulgação com o @ dela e o link da bio.
4. Sem backend: aprovar vale só no aparelho. Para publicar, use **Copiar JSON** e adicione o evento ao
   array em `eventos.json`.

**Critério de aprovação sugerido:**

- o evento parece real (link de ingresso ou perfil verificável);
- entra no top 5 de algum pedido recente (o encaixe aparece no cartão);
- a data é futura.

Na dúvida, recuse.

## Painel de testes
`/testes`:

- status do backend e da IA;
- alternância **Todos os aparelhos / Este aparelho** (exige a chave);
- funil, fila de eventos, tabela por origem (divulgadores aparecem como `@handle`);
- feedback, leads e últimos eventos;
- **Exportar** gera um JSON com tudo do aparelho.

## Backup e reset
- **Backup do banco:** com o gateway parado, copie `llm-gateway\data\role.db`. Rodando, copie os três
  arquivos `role.db`, `role.db-wal` e `role.db-shm`. Sugestão: copiar para uma pasta sincronizada
  (OneDrive) ao fim de cada dia de teste.
- **Zerar o backend:** pare o gateway e apague `role.db*`. A chave continua a mesma.
- **Trocar a chave:** apague `admin-key.txt` e reinicie. Uma nova chave é gerada e quem cura precisa
  colar de novo.
- **Zerar um aparelho:** Perfil → "zerar dados locais".

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "votos neste aparelho" em vez de "placar ao vivo" | PC desligado, gateway parado ou URL do túnel desatualizada | Conferir as janelas do `start.cmd`; atualizar `llm.json` |
| "entendido pelo parser local (regras)" | Ollama parado ou gateway fora | Abrir o Ollama; `/testes` mostra o detalhe |
| Página do celular com zoom ou maior que a tela | Cache da versão antiga | Recarregar; no iPhone, fechar a aba e abrir de novo |
| `EADDRINUSE 8787` ao subir o gateway | Já existe um gateway rodando | `netstat -ano \| findstr 8787` e encerrar o PID |
| Evento aprovado não aparece pra todos | Aprovado sem a chave ou sem backend | Salvar a chave no `/testes` e aprovar de novo, ou publicar no `eventos.json` |
| WhatsApp sem preview | Link sem `/v/` ou cache do WhatsApp | Usar os botões do app; o WhatsApp guarda o preview por URL |
