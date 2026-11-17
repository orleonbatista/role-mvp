# 03 · Jornadas e avaliação de usabilidade

Avaliação feita em nov/2026, testando no navegador com 5 aparelhos simulados (390×844, 360×640 e
320×568). Legenda: ✅ ok · 🔧 corrigido nesta rodada · ⚠️ gap aberto (vai pro roadmap).

## Personagens
- **Organizadora (Nina):** cria o pedido e fecha o rolê.
- **Votante (Bia):** recebe o link no WhatsApp ou no Story, nunca abriu o app.
- **Divulgador (@luna.sax):** artista que quer público pro show.
- **Curador (Orleon):** aprova eventos e acompanha as métricas.

---

## J1 · Primeiro acesso
`/` → onboarding (nome → estilos → vibe) → home personalizada

- ✅ São 3 passos curtos, e o feed "Pra você" já mostra o % de encaixe com o gosto.
- ✅ Quem chega por um convite volta pra onde estava depois do onboarding (`role.next`).
- 🔧 **No iPhone, tocar num campo dava zoom e a tela ficava maior que o celular.** Os campos tinham
  fonte de 15px, e o iOS amplia qualquer campo abaixo de 16px.
  - *Correção:* 16px em telas de toque.
  - *Correção:* viewport com `interactive-widget=resizes-content`, para o teclado não empurrar o
    rodapé.
  - *Correção:* a página não rola nem estica (`overflow: hidden` em `html` e `body`).
- 🔧 **Os cartões da comunidade estouravam a largura em telas de 360px e o texto era cortado à
  direita.**
  - *Correção:* item de grid com `min-width: 0` em todo o app.
  - Resultado: auditoria automática em 10 telas, 360 e 320px, sem nenhum elemento além da borda.

## J2 · Criar um pedido
Home → "Descreve o rolê" → `/novo` → resultados (`/pedido/:id`)

- ✅ Enquanto a pessoa digita, o app mostra o que entendeu (chips), e ela corrige antes de buscar.
- ✅ Um pedido vago gera uma pergunta só ("pra quantas pessoas?") em vez de resultado ruim.
- ✅ Cada sugestão traz os motivos e o que não encaixa, com a confiança da IA.
- ⚠️ Não dá pra editar nem apagar um pedido. Para mudar, a pessoa cria outro.

## J3 · Mandar pro grupo (WhatsApp)
Resultados → "Mandar pro grupo" → WhatsApp com preview rico → amigos abrem `/v/` → `/r/:id`

- ✅ O preview é rico (título, descrição e imagem) porque `/v/` é uma página estática com tags OG e
  responde 200.
- ✅ O link é autossuficiente: o pedido vai comprimido no `#d=`, então abre mesmo sem backend.
- 🔧 **Os votos não eram compartilhados.** Cada aparelho via só o próprio voto, e o app avisava
  "o placar compartilhado chega com a próxima versão".
  - Agora, com o backend no ar, o placar é ao vivo entre todos (atualiza a cada 4s), com o selo
    "placar ao vivo".

## J4 · Votar pelo Story do Instagram
Story com sticker de link → `/v/?src=ig` → votação

- ✅ A arte é gerada no aparelho e o link já vai copiado. O compartilhamento nativo abre o Instagram
  quando o sistema permite.
- ⚠️ Pela web não existe atalho direto para o Story: a pessoa cola o sticker de link manualmente.
  O app explica como, mas é um passo de atrito.
- 🔧 **Gap levantado pelo Orleon: quem chegava pelo Story não conseguia sugerir nada fora da lista.**
  - Agora a votação tem **"Nenhuma te convence? Sugere outro lugar"**.
  - Com backend, a sugestão entra na votação de todo mundo na hora.
  - Sem backend, vira um link de retorno para o autor aprovar.
- 🔧 **A sugestão só aceitava lugares do catálogo.** Agora, se o lugar não está no catálogo, um toque
  em **"Buscar no Google Maps"** traz qualquer lugar de SP, já com % de encaixe. A opção escolhida
  aparece na votação de todos com "Google Maps ★ nota".

## J5 · Votar e acompanhar
`/r/:id` → nome → vota no lugar e no horário → pergunta à IA → acompanha

- ✅ São 2 toques até votar e não precisa cadastro. Se faltar o nome, o campo treme e ganha foco.
- ✅ "Pergunte à IA" responde sobre as opções (preço, capacidade, horário, distância) e destaca o
  lugar citado.
- 🔧 **Depois de votar, não havia nada pra fazer.** Agora aparece "Falta gente votar? Cobra no
  grupo", que reenvia o link no WhatsApp.
- 🔧 **Quando a organizadora fechava o rolê, os votantes não ficavam sabendo.** Os botões só paravam
  de responder. Agora todos veem o banner **Fechado: lugar · horário**, com um atalho pro lugar.
- 🔧 **Amigos fictícios do modo demo se misturavam aos votos reais no placar ao vivo.** Com o
  backend no ar, eles não votam mais.
- ⚠️ O voto é identificado pelo nome digitado. Dois "João" em aparelhos diferentes aparecem como dois
  avatares iguais.
- ⚠️ Não há notificação: a organizadora precisa abrir a votação para ver se chegaram votos.

## J6 · Pedir sugestões (Instagram e WhatsApp)
Compartilhar → "Pedir sugestões" → Story "Me indica um lugar?" ou WhatsApp → `/s/:id`

- ✅ Quem recebe vê os critérios e o % de encaixe de cada lugar, e o que já está na lista aparece
  bloqueado.
- 🔧 **Precisava de um link de volta.** O autor tinha que tocar em cada sugestão recebida. Com
  backend, a sugestão já cai na votação e aparece em "Da comunidade" como "sugestão pelo link".

## J7 · Fechar e avaliar
Votação → "Fechar no X · horário" → celebração e Story → depois, "Já foi? Conta como foi"

- ✅ Fechar exige pelo menos 2 votos e só aparece para o autor.
- ✅ Avaliar com "amei" credita o curador que indicou, o que fecha o loop de reputação.
- ⚠️ O autor só consegue fechar no aparelho onde criou o pedido (identidade por aparelho).

## J8 · Reservar em grupo (fake door)
Lugar → "Reservar pro grupo" → formulário → "pedido enviado"

- ✅ Mede intenção real de reserva e o texto não promete o que não existe.
- 🔧 Os leads agora vão pro backend, então aparecem no painel de todos os aparelhos.
- ⚠️ Ninguém liga de verdade ainda. Isso só deve virar operação quando houver casas parceiras
  (ver o modelo de negócio).

## J9 · Divulgar um evento (fase 1)
Página do evento → Divulgar → @ → Story, WhatsApp ou link da bio → amigo abre `/e/:id` → "Bora? Chama
teu grupo" → votação com o evento como 1ª opção

- ✅ São 3 toques do convite até a votação montada. Quem não tem cadastro faz e volta direto pra
  votação.
- ✅ A atribuição funciona: a coluna "grupos" por @ aparece no painel.
- ✅ A página de bio reúne os eventos do @ e funciona como link fixo do Instagram.

## J10 · Enviar um evento (fase 2) e curadoria
`/divulgar` → formulário com encaixe ao vivo → enviar → curadoria aprova → evento no feed → status
"aprovado" para quem enviou

- ✅ Não exige cadastro. O encaixe ao vivo mostra se o evento combina com o que a comunidade pede.
- 🔧 **Precisava de link pra curadoria e de editar o `eventos.json` à mão.** Com backend:
  - o envio cai direto na fila;
  - aprovar publica pra todo mundo na hora;
  - quem enviou vê o status mudar em "Seus envios".
- ⚠️ Não há como editar um evento já enviado.
- ⚠️ A curadoria é manual e única (Orleon).

## J11 · Acompanhar o teste (curador)
`/testes` → chave da curadoria → Todos os aparelhos

- 🔧 **As métricas eram por aparelho e era preciso exportar o JSON de cada testador.**
  - Agora, com a chave, o painel mostra todos os aparelhos: funil, origem, divulgadores,
    feedback, leads e totais (pedidos, votos, sugestões, fechados).

## J12 · Curador fundador
Convite no WhatsApp (`/v/?to=f`) → `/fundador` → "O que falta curar" (ex.: Jazz em Pinheiros, com 3 lugares
reais esperando) → `/indicar` com os candidatos → escolhe → comentário → "Entendi: …" → Adicionar ao rolê

- ✅ Indicar leva menos de 1 minuto por lugar: a IA marca as tags e a base já traz o lugar real.
- ✅ O lugar curado aparece no "Pra você" de outros aparelhos (com backend) e passa a ser a 1ª opção da IA.
- ✅ Os resultados sem curadoria convidam a comunidade a curar, o que fecha o loop.
- 🔧 **Lugares sem curadoria apareciam com "Aberto sexta", "Comunidade aprova" e "Música de qualidade",
  afirmações sem base.** Agora os motivos são neutros ("Jazz & ao vivo, pelo tipo do lugar") e vem junto
  "Ninguém da comunidade avaliou ainda". O horário fica pro link do Maps.

---

## Gaps abertos, por prioridade

| # | Gap | Impacto | Caminho |
|---|---|---|---|
| 1 | ~~Sugestão só aceita lugares do catálogo~~ | Resolvido com o Google Places (New) | Próximo: usar o Google também para o organizador montar o pedido |
| 2 | Sem notificação de votos e sugestões | Médio: a organizadora precisa abrir a votação | Web Push, ou resumo pelo WhatsApp |
| 3 | Identidade por nome e aparelho | Médio: homônimos; fechar só no aparelho de origem | Login leve (link mágico ou WhatsApp OTP) na fase B |
| 4 | Story exige sticker manual | Médio: atrito no canal mais viral | App nativo (Share to Story com AppID) na fase C |
| 5 | Editar e apagar pedido ou evento | Baixo | CRUD simples quando houver login |
| 6 | Backend depende do PC ligado e o túnel muda de URL | Operacional | Túnel nomeado, ou backend gerenciado (ver roadmap) |
