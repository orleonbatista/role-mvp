# 03 · Jornadas, passo a passo

Revisado em 27/11/2026, depois das ondas de @ único, notificações, montagem da votação, turmas públicas
e caixa de ferramentas. Cada jornada traz: quem, onde começa, os passos (tela → ação → o que acontece no
app e no servidor) e os dados de teste que comprovam o comportamento.

Legenda: ✅ coberto pelo E2E publicado · 🧪 coberto pelo teste de API (servidor) · 👀 verificado à mão · ⚠️ gap conhecido.

## Como os testes foram feitos

| Bateria | Onde roda | O que usa | Resultado de 27/11 |
|---|---|---|---|
| E2E (`e2e/jornadas.spec.ts`) | GitHub Actions, contra o site publicado, depois de cada deploy e 1x por dia | Chromium em viewport de celular, dados marcados `[E2E]`, apaga tudo no fim | 4/4 passaram em 42,2 s (abertura 3,7 s · rotas 0,2 s · ferramentas 3,1 s · pedido→votação→limpeza 34,6 s) |
| API (`/tmp/t.mjs`, `/tmp/t2.mjs`) | Node 22 com banco SQLite temporário (`ROLE_DATA_DIR`) | 3 aparelhos fictícios: Ana, Bia, Caio | todas as respostas abaixo conferidas |
| Monitor (`monitor.yml`) | Actions, a cada 15 min | `GET /api/health` pelo túnel | abre/fecha a issue "Servidor fora do ar" |

Personagens: **Nina** (organiza), **Bia** (vota pelo link, nunca abriu o app), **Caio** (desconhecido),
**@luna.sax** (divulga show), **Orleon** (admin/curador), **dona do Bar** (casa B2B).

---

## J1 · Primeiro acesso e cadastro
1. Abre o site → splash da marca dentro do `#root` (aparece antes do JS carregar).
2. `/onboarding` → "Começar" → localização: GPS, CEP ou bairro (lista de São Paulo).
3. Nome → estilos (nichos) → vibe → aceite de privacidade → "Montar meu feed".
4. O app grava o perfil no IndexedDB e, com o servidor no ar, faz `POST /api/me`. O servidor cria o
   **@ único** a partir do nome (sem acento, minúsculo; se já existe, acrescenta número) e devolve.
   O celular passa a usar o @ devolvido.
- ✅ Cadastro termina em menos de 4 s sem esperar a busca de lugares (E2E: "cadastro conclui sem esperar").
- 🧪 `Ana Souza` → `@anasouza`; `Ana Lima` → `@analima`; quem se cadastrou antes do @ ganhou um na
  migração (produção: `@orleon`).
- Login Google opcional (salva o perfil entre aparelhos); sem ele, a sessão fica presa ao aparelho.

## J2 · Trocar o @
1. Perfil → toca no @ (sublinhado pontilhado) → sheet "Seu @ no rolê".
2. Digita; a prévia mostra como fica (`Bê.Lima` → `@be.lima`).
3. "Salvar" → `POST /api/me/handle`.
- 🧪 `@ana` aceito; outro aparelho tentando `@ana` recebe `{ ok:false, error:'taken' }` → a tela diz
  "@ana já é de outra pessoa". Fora do padrão (menos de 3 ou mais de 20 caracteres) → mensagem de formato.

## J3 · Achar alguém pelo @ e virar amigo
1. Aba **Amigos** → aba "amigos" → campo "Buscar por @ ou nome".
2. Com `@`, a busca casa só o @: exato primeiro, depois começo do @, depois contém. Sem `@`, casa nome também.
3. Resultado mostra nome, @ e nível; botão **+** manda o pedido (`POST /api/people/:pid/add`).
4. A outra pessoa recebe aviso no celular **e** um item na central de notificações com botão **Aceitar**.
5. Aceitar (na central, na aba Amigos ou no perfil) → `accept` → quem pediu recebe "aceitou sua amizade".
- 🧪 Caio busca `@be` → acha `@be.lima`; `GET /api/people/by-handle/be.lima` → `{ pid }`.
- 🧪 Pedido de amizade gera item `kind: 'fr'` com `actor` (pseudônimo, nunca o id do aparelho).
- Bloqueados não aparecem na busca nem abrem o perfil; limite de 30 pedidos por dia.

## J4 · Central de notificações
1. Sino no topo da Início com contador (some quando não há nada novo; mostra `9+` acima de 9).
2. `/notificacoes` lista os últimos 60 dias: pedidos de amizade, votos, sugestões, rolê fechado, prazo
   encerrado, mensagens, fotos, convite pra avaliar, casa verificada.
3. Tocar num item marca como lido e abre a tela dele; "marcar tudo como lido" zera o contador.
- 🧪 `GET /api/inbox` → `unread: 1`; depois de `POST /api/inbox/read` → `unread: 0`.
- Votos repetidos no mesmo rolê em menos de 1 h atualizam o mesmo item em vez de empilhar.
- ✅ A página abre no E2E (vazia ou com avisos).
- Funciona mesmo sem avisos ligados no celular (é o que resolve "não recebi nada").

## J5 · Criar um pedido e montar a votação (Nina)
1. Início → "Descreve o rolê que você quer…" → texto livre → "Encontrar o rolê".
2. O LLM (ou o parser local) entende ocasião, grupo, bairro, orçamento, nicho; o ranqueador mistura
   catálogo curado, casas reais (Google) e sugestões; até 3 aparecem com motivo e encaixe.
3. Em **Montar a votação** (só a autora):
   - **×** tira um lugar (pede confirmação se já tem voto; votos nele são apagados). Mínimo de 2.
   - **Pôr outro lugar** abre a busca (catálogo + Google) e o escolhido entra na votação. Máximo de 6.
   - **Quem vota:** "Qualquer um com o link" ↔ "Só amigos e a turma".
4. "Mandar pro grupo" → link curto `/v/?id=` pro WhatsApp, story pro Instagram ou copiar.
- ✅ E2E: pedido criado, resultados com "combina/alternativa", sem "% match", "Montar a votação" e o
  botão de quem vota visíveis.
- 🧪 Remover `p-3` → `optionIds: [p-1, p-2]`; a autora reenviar o pedido antigo **não** ressuscita o
  removido; adicionar `p-9` → `[p-1, p-2, p-9]`.

## J6 · Votar pelo link (Bia)
1. Abre o link → tela "Onde vai ser?" sem cadastro (nome em "Votando como").
2. Vota num lugar; marca **vários horários** (disponibilidade); propõe "Outro dia/horário".
3. "Ver detalhes" leva à ficha do lugar e volta.
4. Ao votar, Bia entra na turma do pedido.
- ✅ E2E: voto, dois horários com `aria-pressed`, horário alternativo `dd/mm 20h`, ficha do lugar sem
  "Reservar mesa" falso.
- 🧪 Com "só amigos": Caio (desconhecido) → `403 so_amigos`; Bia (já na turma) → 200. Na tela, quem não
  pode votar vê o aviso com cadeado e o voto não sai.

## J7 · Turma, chat e votação ligados
1. Na votação/resultados: **Conversar com a turma** abre o chat da turma ali mesmo.
2. No chat: faixa com as **votações abertas** da turma (toque abre) e recados automáticos
   "Nova votação: …" e "Fechou: …" com link "abrir votação".
3. Aba **Turmas**: cartão com membros (5 primeiros) + **ver membros** (lista com @ e nível; toque abre o
   perfil), chat, "Novo rolê com essa turma", sair.
4. Dona da turma alterna **privada** (só entra quem recebe link de votação) ↔ **pública** (aparece no
   perfil dos membros e qualquer pessoa com cadastro entra).
- 🧪 Chat da turma traz `system: true, ref: r-test1` pros dois recados; turma pública aparece no perfil
  da Ana pra Caio como "Ana, Bia · 2 pessoas"; Caio entra → turma com 3.

## J8 · Fechar o rolê e depois
1. Autora fecha no líder (lugar + horário) → todos que votaram recebem "Fechou o rolê!" e o chat da
   turma ganha o recado.
2. Depois de fechado: rota/clima/agenda, "vou/talvez/não", dividir a conta (Pix), álbum de fotos (com
   opção de mandar pra página do lugar) e prazo.
3. 3 h depois do horário: convite pra avaliar (aviso + central). A avaliação vira curadoria e pontos.
- 🧪 `decide` → 200 e recado "Fechou: …" no chat.

## J9 · Caixa de ferramentas (sem grupo)
Acesso: ícone de chave na Início, ou `/ferramentas` direto (não exige cadastro).
| Ferramenta | Passos | Resultado |
|---|---|---|
| Dividir a conta | total, pessoas, 10% opcional, chave Pix, nome, cidade | valor por pessoa + Pix copia e cola + "Mandar no grupo" |
| Convite com flyer | título, quando, onde, recado, link | arte 1080×1920 com área pro sticker de link |
| Post pro Instagram | mesmos campos | arte 1080×1350 (4:5) pro feed |
| Link pro WhatsApp | mensagem | `wa.me/?text=…` pra copiar ou abrir |
| Ponto de encontro | usa o GPS na hora | link do Google Maps + recado, nada salvo no servidor |
| Quem leva o quê | itens e nomes (fica no aparelho) | lista formatada no zap |
| Decidir na sorte | opções por linha ou vírgula | sorteio com `crypto.getRandomValues` + resultado no zap |
- ✅ E2E: sorteio entre "Bar A, Bar B, Bar C" devolve um deles; conta de R$ 100 pra 4 → "R$ 25,00".

## J10 · Rede social
Feed dos amigos (avaliações, listas, rolês fechados), perfil público (@, nível, avaliações, listas,
turmas públicas, amigos), ranking geral ou do bairro, listas de curadoria, bloquear/denunciar.

## J11 · Curadoria e admin (Orleon)
`/testes` (admin por e-mail Google): usuários, denúncias (3 ocultam sozinho), reivindicações de casas,
funil, teste de aviso no celular, saúde das APIs. Fila de eventos enviados por divulgadores.

## J12 · Casa (B2B)
Reivindica a página → admin aprova → edita bio, Instagram, tamanho de grupo, oferta; fotos próprias;
destaque patrocinado por 30 dias (no máximo 1 por votação, sempre marcado "patrocinado"); relatório mensal.

## J13 · Divulgador
`/divulgar` → envia evento → curadoria → link `/e/:id` com origem do divulgador e story do evento.

## J14 · Trocar de aparelho
Login Google → o servidor devolve a sessão do perfil → o app puxa pedidos, turmas e avisos
(`/api/requests/mine`, `/api/inbox`). O @ e as amizades são do perfil, não do aparelho.

---

## Gaps conhecidos ⚠️
- Layout no iPhone usa a área segura real, mas falta confirmar num aparelho físico.
- Busca por @ percorre todos os usuários em memória: ok até alguns milhares; na nuvem vira índice.
- Turma privada não tem "convidar pelo @" ainda (entra quem recebe o link de uma votação).
- Ferramentas "Quem leva o quê" e Pix ficam só no aparelho (de propósito); não sincronizam.
- Instagram da casa conectado (NF15) depende do app de desenvolvedor da Meta.
