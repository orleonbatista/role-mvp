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
- **Faixa de preço da busca:** o app só pede campos da faixa **Pro** (nome, endereço, tipo, localização,
  faixa de preço, link do Maps). Nota, nº de avaliações, nível de preço e horário seriam faixa Enterprise
  (1.000 grátis/mês), além de não poderem ser guardados.
- **Cotas diárias** (APIs e serviços → Places API (New) → Cotas):
  - SearchText: **150 por dia** (≤ 4.650 por mês, abaixo das 5.000 grátis da faixa Pro);
  - SearchNearby, GetPlace e GetPhotoMedia: **30 por dia** (não usados hoje);
  - Autocomplete: **300 por dia** (≤ 9.300, abaixo de 10.000);
  - endpoints que o app não usa: **0**.
  Ao bater o limite, o Google responde 429 e o app mostra "a cota de hoje acabou". Nada é cobrado.
- **No app:** no máximo 20 buscas por aparelho por dia; busca primeiro no catálogo da comunidade, cache por busca, e só busca quando a pessoa toca em
  "Buscar no Google Maps", nunca enquanto digita.
- **Alerta de orçamento** "role-mvp alerta": R$ 10 por mês, com e-mail a 10%, 90% e 100%. A Places API não
  aceita bloqueio automático por gasto (só Cloud Run, Functions, Gemini e Vertex), por isso as cotas são a
  trava real.
- **Termos do Google:**
  - mostramos "Dados de lugares: Google Maps" onde aparecem resultados;
  - do Google guardamos só o `place_id` (permitido sem prazo) e as coordenadas por no máximo 30 dias
    (o backend apaga sozinho);
  - nome, bairro, estilo, vibe, ocasião e faixa de preço são **confirmados por quem sugeriu**: conteúdo da
    comunidade, não do Google;
  - nota, endereço completo e horário: link "Abrir no Google Maps".

## Catálogo da comunidade
- **Como entra:** quem sugere um lugar novo do Google confirma "Entendi: Drinks · Tranquilo · Date" com um
  toque. A IA (ou as regras, com o PC desligado) pré-marca estilo, vibe e ocasião pelo comentário, citando o
  trecho (mesma regra da extração de pedidos), e a pessoa pode ajustar nome, tags e faixa de preço.
- **Moderação:**
  - as regras pegam link, telefone, @, "chama no direct", cupom e textos em caixa alta;
  - a LLM pega ofensa, propaganda e texto sem relação com o lugar.
  Suspeito entra na votação daquele pedido, mas só vai pro catálogo depois da curadoria. A fila fica em
  `/testes` → **Lugares em revisão** (Liberar/Recusar), e exige a chave da curadoria.
- **Reuso:** todo lugar aprovado é carregado nos aparelhos ao abrir o app. A próxima pessoa que buscar
  "Pitico" acha no catálogo, com o selo "comunidade", sem gastar busca no Google.
- **Tabela:** `places` em `role.db` (id `g-<place_id>`, resumo, comentário, status, usos).
- **Para aumentar o limite:** suba as cotas aos poucos e acompanhe "Faturamento → Relatórios" antes de passar
  da cota grátis.

## Descoberta de lugares (Google ao vivo)
- Desde 26/11/2026 a descoberta é só pelo Google; a base do OpenStreetMap foi removida por ter muitos lugares fechados.
- **Quando busca:**
  - ao abrir o app: até 3 Text Search pelos estilos do gosto, raio de 5 km da região;
  - a cada pedido: 1 ou 2 buscas, no raio pedido ("até 8 km") ou no bairro.
- **Filtro:** só entram lugares `OPERATIONAL`.
- **Armazenamento:** os resultados ficam só em memória. O backend apaga nome e bairro de lugares do Google em pedidos e sugestões com mais de 30 dias (`purgeGoogleSnaps`), exceto os confirmados pela comunidade.
- **Cotas:** guarda de 30 buscas por aparelho por dia; no Google Cloud, SearchText 150/dia (Text Search Pro: 5.000 grátis/mês).

## Pedido: busca rica com confirmação ao vivo
- **Busca:** cada pedido faz 1 Text Search com a frase do pedido limpa (sem distância, dia, hora e nº de pessoas). O raio vale de verdade: retângulo, 5 km por padrão ou o que a pessoa pedir.
- **Confirmação no Google:** nota, nº de avaliações, horário, área externa, cerveja, drinks, grupo e música ao vivo. Isso cai na faixa Enterprise + Atmosphere (1.000 grátis/mês; depois US$ 40 por mil).
- **Limite:** 12 por aparelho por dia; passando disso, cai pra busca simples, sem confirmação.
- **Uso:** os dados ficam só em memória e servem pra ordenar e justificar ("Área externa (confirmado no Google)", "Aberto sexta (horário do Google)", "Nota 4,8 no Google").
- **Votação:** 5 opções.

## LLM na nuvem (gateway)
- **Fila de provedores:** Gemini (`gemini-3.5-flash-lite`, ~2 s) → Groq (`openai/gpt-oss-20b`) → OpenRouter (`openai/gpt-oss-20b:free`) → GPU do PC (Ollama `qwen2.5:7b`). Todos usam a API compatível com OpenAI (`llm-gateway/providers.mjs`).
- **Falhas:** quem falhar (limite do plano grátis, timeout, JSON inválido) fica 1–2 min fora e a chamada segue pro próximo.
- **Chaves:** ficam em `llm-gateway/data/llm-keys.json` (pasta fora do git), relido a cada 30 s, então não precisa reiniciar o gateway. Também dá pra mudar `order` e `models` ali.
- **Gemini:** a chave do AI Studio é "role-gateway", no projeto padrão do Gemini. O plano grátis pode usar os prompts pra treino; isso está no aviso de privacidade. Ao sair do plano grátis (com faturamento ativo), os dados deixam de ser usados.
- **`/health`:** mostra cada provedor (configurado, em castigo, acertos e falhas).
- **Sem o PC:** com o gateway na nuvem, basta não pôr `ollama` na ordem.

## Curadoria da IA sobre os resultados
- **O que faz:** depois da busca, o ranking separa 8 candidatos. O app manda pro gateway (`POST /pick`) só os fatos verificados de cada um: distância, nota e nº de avaliações do Google, nota da comunidade, área externa, cerveja, drinks, música ao vivo, bom pra grupo, aberto no horário pedido e preço estimado. Vai junto o texto do pedido.
- **O que a IA devolve:** os 5 melhores e, pra cada um, 1 ou 2 "destaques" de uma lista fechada (mais perto, melhor nota, área externa, música ao vivo, bom pra grupo, aberto no horário…). A escolha da IA soma um bônus ao encaixe do ranking (1º +1,5 … 5º +0,3). Ela ajusta a ordem, mas não tira um lugar muito bom que esqueceu; no teste, escolhendo sozinha, o modelo 7B deixava de fora o lugar de nota 5,0. O app confere cada destaque contra os fatos (inclusive superlativos como "melhor nota" entre os escolhidos) e só então monta a frase de "Por que a IA escolheu". Texto livre do modelo 7B inventava ("tem música ao vivo") e errava comparações.
- **Sem LLM:** fica a ordem do ranking. O motivo fica só em memória, porque usa dados do Google.

## Aprendizado da IA
- **O que guarda:** cada pedido salva no banco (`examples`) o que a IA entendeu e o que ficou depois dos chips corrigidos, no formato da LLM, com o trecho exato do texto.
- **Como usa:** o gateway busca até 3 pedidos parecidos (palavras em comum), priorizando os corrigidos por gente, e coloca como exemplos no prompt. A IA melhora sem precisar treinar.
- **Painel `/testes`:** mostra quantos exemplos já existem e quais termos as pessoas pedem que o app ainda não cobre (candidatos a estilo novo).
- **Ajuste fino (fase 2):** com alguns milhares de exemplos, dá pra exportar `examples` e treinar um LoRA do qwen2.5.

## Login com Google (Google Cloud, projeto role-mvp)
Configuração:
- **Plataforma de autenticação:** app "rolê", público externo, em produção. Escopos só básicos (openid, e-mail, perfil), então não precisa de verificação do Google.
- **Cliente OAuth "role-web-login"** (aplicativo web). Origens autorizadas: `https://orleonbatista.github.io`, `http://localhost:5173` e `http://localhost:4173`.
- **ID do cliente:** está no workflow (`VITE_GOOGLE_CLIENT_ID`) e no gateway (`GOOGLE_CLIENT_ID`, com padrão no código). Não é segredo. O segredo do cliente não é usado e não fica em lugar nenhum.

Ao mudar o domínio do site:
1. Adicione a nova origem no cliente.
2. Atualize a página inicial e o link da privacidade em Branding.

## Dados pessoais (LGPD)
- **Apagar dados:** a própria pessoa apaga em Perfil → Apagar meus dados. Se alguém pedir por fora, apague no SQLite pelo `device` ou pelo `email` em `users`, e depois em `reviews` e `group_members`.
- **Backup:** `llm-gateway/data/role.db` tem dados pessoais. Não compartilhe e não suba pro git (a pasta `data` já está no `.gitignore`).

## Modo demo
- Desligado por padrão. Quem já usava a versão antiga foi migrado pra desligado.
- Ligar/desligar em `/testes` → **Modo demonstração**. A página recarrega e passa a mostrar ou esconder
  lugares, pedidos e curadores fictícios.
- Nunca deixar ligado nos testes com amigos: o conteúdo fictício se mistura ao real.

## Curadoria de eventos
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
