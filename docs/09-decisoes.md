# 09 · Decisões (registro)

Formato curto: **decisão**, **por quê**, **trade-off**.

1. **PWA em vez de app nativo.** Ninguém instala app pra votar num rolê: o link precisa abrir na hora.
   *Trade-off:* sem Share to Story nativo nem push confiável no iOS (vai pra fase C).
2. **API simulada com MSW dentro do app.** Permite construir o produto inteiro antes do backend, com o
   mesmo contrato HTTP. *Trade-off:* a lógica de negócio roda no cliente.
3. **Interceptar o fetch em vez de usar Service Worker.** O Service Worker falhava no navegador do app
   desktop e complicava o cache do Pages. *Trade-off:* nenhum relevante no MVP.
4. **Links autossuficientes (`#d=` comprimido).** A votação funciona sem backend e o fragmento não vai
   pra servidor nenhum. *Trade-off:* links de ~180 a 400 caracteres; o WhatsApp não aceita hyperlink
   com texto.
5. **Página `/v/` estática com tags OG.** O GitHub Pages responde 404 para rotas da SPA e o WhatsApp não
   mostra preview de 404. *Trade-off:* um redirect a mais (imperceptível).
6. **Ranker determinístico + LLM como refinamento, nunca como fonte.** Explicável, rápido e sem
   alucinação de lugar. O LLM só extrai critérios citando o trecho. *Trade-off:* a qualidade depende
   das regras e do catálogo.
7. **LLM local (qwen2.5:7b) atrás de gateway.** Custo zero e privacidade. A API do Ollama nunca fica
   exposta; há limite e fila de 1. *Trade-off:* depende do PC ligado.
8. **Backend no mesmo gateway, com `node:sqlite`.** Zero instalação, um arquivo, mesma URL do túnel.
   *Trade-off:* é para teste, sem backup automático, autenticação real nem alta disponibilidade.
9. **Offline-first com espelho opcional.** O app nunca quebra se o PC cair; com backend, sincroniza.
   *Trade-off:* duas fontes de verdade, resolvidas com regras simples: voto por aparelho e decisão só
   do autor.
10. **Identidade por aparelho + nome, sem login.** Fricção zero para votar. *Trade-off:* homônimos e
    fechar só no aparelho autor (login leve na fase B).
11. **Divulgação começa por "compartilhar" e envio com curadoria.** Protege a confiança: nada entra no
    feed sem passar pela curadoria. *Trade-off:* curadoria manual não escala (fase B: mais curadores).
12. **Critério de encaixe = top 5 em pedidos reais.** Mede se o evento serve à demanda que existe, não
    a um ideal. *Trade-off:* com poucos pedidos a métrica é ruidosa.
13. **Modo demo ligado por padrão, mas desligado na prática quando há placar ao vivo.** Mostra o produto
    vivo para quem testa sozinho sem poluir votações reais. *Trade-off:* testes com o backend fora do
    ar ainda simulam amigos.
14. **Catálogo da comunidade em cima do Google, guardando só o `place_id`.** Os termos do Google só permitem
    guardar o ID (e coordenadas por 30 dias); o resto vem de quem sugeriu. Ganha: catálogo que cresce com o
    uso e tags reais de estilo/vibe. *Trade-off:* um toque a mais pra confirmar ao sugerir.
15. **LLM como assistente do cadastro, não como juíza.** Pré-preenche tags (citando o trecho) e marca suspeitos;
    quem decide é a pessoa (tags) e a curadoria (suspeitos). Sem LLM, regras. *Trade-off:* curadoria manual
    pros casos marcados.
16. **Busca do Google só com campos da faixa Pro.** 5× mais buscas grátis (5.000/mês) que a Enterprise. *Trade-off:*
    sem nota/horário na busca — o link pro Maps cobre.
17. **Curadoria em duas camadas (curado visível, base invisível).** Mostrar 1.270 lugares do OSM faria do rolê
    um mapa pior; mostrar só o curado mantém a proposta. A base serve à IA como reserva, sempre marcada.
    *Trade-off:* feed pequeno no começo, compensado pelo modo curador fundador.
18. **Base do OpenStreetMap, não do Google.** A licença ODbL permite guardar e redistribuir com crédito; o Google
    só permite guardar o `place_id`. *Trade-off:* sem foto, nota e quase sem horário; balada mal coberta.
19. **Nada fictício fora do demo.** Conteúdo inventado misturado ao real destrói a confiança e polui as métricas
    do teste.
20. **Sem afirmação sem lastro.** Lugar sem curadoria não recebe "aberto agora", "comunidade aprova" nem elogio:
    só o que se sabe (tipo, bairro) e "ninguém avaliou ainda".
21. **Conteúdo do Google não é salvo, nem reescrito pela IA.** Só o `place_id`; foto, nota e horário aparecem ao vivo.
    *Trade-off:* custo por visualização, que cabe na franquia grátis na fase de testes.
22. **Login com Google em vez de e-mail e senha.** Sem um serviço de envio de e-mail não dá pra confirmar o endereço
    nem recuperar a senha. O Google resolve as duas coisas e é um toque. E-mail e senha ficam pra quando houver um
    serviço de e-mail (ex.: Resend).
23. **Conta = aparelho principal.** Entrar com Google num celular novo faz ele assumir o id do aparelho da conta.
    Simples e sem sessão nova no backend. *Trade-off:* o id do aparelho continua sendo a credencial; na migração pra
    Supabase/D1, trocar por sessão assinada.
24. **Descoberta só pelo Google; OpenStreetMap removido.** A base do OSM tinha muitos lugares já fechados. O Google
    tem `businessStatus` e é mais atual. *Trade-off:* custo por busca (Text Search Pro, 5.000 grátis/mês) e nada fica
    salvo; a cada abertura o app busca de novo, com limite por aparelho.
25. **Pedido confirmado ao vivo (Enterprise + Atmosphere) em 1 chamada.** Uma Text Search rica traz 20 lugares com
    nota, horário e atributos. Custa menos que 5 Place Details e tira os motivos "chutados". *Trade-off:* SKU mais cara
    (1.000 grátis/mês), com limite por aparelho.
26. **IA aprende por exemplos, não por treino.** Os pedidos confirmados viram exemplos no prompt (busca por
    similaridade). Melhora já, sem GPU extra. Ajuste fino só com volume.
27. **A IA escolhe sobre fatos, não sobre texto livre.** A LLM recebe só campos verificados (null = não se sabe) e
    escreve o motivo citando esses campos. Assim a escolha considera o pedido inteiro (requisitos, clima, ocasião),
    sem inventar ambiente ou cardápio. *Trade-off:* +3–6 s por pedido na GPU do PC.
28. **Sessão com hash e pseudônimos (substitui a 23).** O id do aparelho deixou de ser credencial e nunca sai pra
    outras pessoas. *Trade-off:* perder o token sem login Google significa começar de novo naquele aparelho.
29. **@ único resolvido no servidor.** O celular sugere, o servidor decide (índice único) e devolve. Evita corrida
    entre dois aparelhos e funciona sem conta Google. *Trade-off:* o @ só existe com o servidor no ar.
30. **Notificação = aviso + caixa.** Todo `notify()` também grava na `inbox`. Quem não liga Web Push (iPhone sem
    instalar o app) ainda vê pedidos de amizade e votos. *Trade-off:* uma escrita a mais por destinatário; limpeza de 60 dias.
31. **Opções da votação são do servidor.** A autora edita via endpoint; `removed` evita ressurreição por aparelho
    desatualizado. *Trade-off:* tirar/pôr lugar exige conexão.
32. **"Só amigos" inclui a turma.** Restringir só a amigos do app quebraria o caso comum (galera do zap que não é
    amiga no app). Quem já está na turma continua votando.
33. **Turma privada por padrão.** Pública é opt-in da dona e só expõe nome e tamanho no perfil.
34. **Ferramentas sem servidor.** Pix, flyer, sorteio e listas rodam no aparelho: funcionam com o PC desligado
    e não criam dados pessoais no banco.
35. **Auditoria visual no CI em vez de navegador local.** O ambiente de desenvolvimento não instala navegadores; o
    GitHub Actions já instala. A auditoria roda 32 telas em 3 aparelhos e devolve prints e um JSON de achados.
36. **Limites por aparelho, não só por IP.** No Brasil a operadora coloca muita gente atrás do mesmo IP (CGNAT) e a
    turma costuma estar no mesmo Wi-Fi. Por IP fica um teto 6× mais folgado contra abuso.
37. **Toda chamada espera a sessão.** Tentar ler antes da sessão nascer economizava uma ida e volta, mas criou corrida
    que descartava o token válido (pega pelo E2E). A economia veio de outro lugar: endereço guardado e cópia local na hora.

