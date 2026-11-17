# 02 · Funcionalidades

Inventário do MVP (nov/2026). Entre parênteses, a rota da tela.

## Entrada e perfil
- **Onboarding** (`/onboarding`): nome, estilos favoritos (jazz, eletrônica, boteco, listening…) e vibe.
  Monta o feed "Pra você". Se a pessoa veio de um convite, volta pra onde estava ao terminar.
- **Perfil** (`/perfil`): gostos, diário de rolês, modo demo (amigos e curadores simulados, liga/desliga),
  atalhos pra Divulgar evento e Painel de testes, zerar dados locais.

## Curadoria
- **Indicar um lugar** (`/indicar`, pública): busca no catálogo (curados + base real do OSM) e no Google;
  escolhe e escreve como é. A IA marca estilo, vibe e ocasião ("Entendi: …"), a pessoa ajusta e o lugar
  entra no catálogo curado (ou vai pra revisão, se suspeito). Aceita `?n=<estilo>&h=<bairro>` (lacuna) e
  `?id=<lugar>` (vindo de "Conhece? Indicar").
- **Curador fundador** (`/fundador`, pública): missão, contadores (curados × esperando), convite por
  WhatsApp, **o que falta curar** (estilo × bairro, priorizando o gosto e o bairro de quem vê, com os
  lugares reais esperando) e curadoria por bairro.
- **Convite da IA nos resultados:** quando a recomendação vem da base, aparece o card "Falta curadoria aqui"
  com "Indicar um lugar" e "Pedir aos amigos".

## Descoberta
- **Home** (`/`): campo "Descreve o rolê…", atalhos de ocasião, **Pra você** (só curados, por gosto + perto
  do seu bairro; vazio = convite pra virar curador fundador), **Essa semana** (só eventos divulgados e
  aprovados) e **Seus pedidos**.
- **Lugar/evento** (`/lugar/:id`, pública): lugar sem curadoria mostra "Conhece? Indicar pro rolê" e o
  crédito do OpenStreetMap. Os demais: capa, nota (ou "novo" para evento sem avaliação), preço, capacidade,
  horário de funcionamento com "aberto agora", distância do seu bairro, destaques, avaliações.
  - Reserva em grupo (**fake door**: coleta o pedido pra medir interesse; ainda não reserva).
  - Evento com link de ingresso: botão de ingresso.
  - Evento: card **Vai divulgar?** e botão de compartilhar.

## Pedido e recomendação
- **Novo pedido** (`/novo`): texto livre. Ao vivo, mostra o que foi entendido (ocasião, pessoas, dia, hora,
  bairro, orçamento, estilos, vibes, requisitos). Pedido vago → pergunta de esclarecimento antes de buscar.
- **Entendimento**: regras determinísticas + LLM local (qwen2.5:7b) com extração ancorada (cada critério
  cita o trecho do texto; o que não está no texto é descartado). Sem LLM, as regras resolvem sozinhas.
- **Resultados** (`/pedido/:id`): "IA do rolê" explica o que entendeu e a confiança; top 3 com % de
  encaixe, motivos e avisos; respostas da comunidade (curadores simulados no modo demo e sugestões reais
  de quem recebeu o link), com % de encaixe e "útil".
- **Compartilhar** (folha): Story do Instagram (arte 1080×1920 gerada no aparelho), WhatsApp com preview
  rico, copiar link, abrir votação. Seção **Pedir sugestões** (link de indicação por WhatsApp ou Story).

## Votação em grupo
- **Votação** (`/r/:id`, pública, sem cadastro): vota no lugar e no horário, placar animado, coroa no líder.
  - **Placar ao vivo** entre aparelhos quando o backend está no ar; senão, "votos neste aparelho".
  - **Pergunte à IA**: "qual o mais barato?", "qual cabe todo mundo?", "qual fica aberto sexta?" — responde
    com os dados das opções e destaca o lugar citado (LLM no PC; sem ele, regras).
  - **Nenhuma te convence? Sugere outro lugar**: abre a busca de sugestão; com backend, entra na votação na hora.
  - **Falta gente votar? Cobra no grupo**: reenvia o link no WhatsApp depois de votar.
  - **Fechar no X · horário** (só o autor): celebração + arte de Story "fechado". Todo mundo vê o banner **Fechado**.
  - Convite "Tem um rolê pra decidir?" pra quem chegou pelo link.
- **Sugerir** (`/s/:id`, pública): vê os critérios do pedido, busca no catálogo com % de encaixe e avisos
  (inclui o **catálogo da comunidade**) e, se não achar, **busca no Google Maps** (qualquer lugar de SP, com
  atribuição). Lugar novo: a IA pré-marca estilo/vibe/ocasião pelo comentário e a pessoa confirma ("Entendi:
  …", "Ajustar"); o lugar entra no catálogo de todos ou, se suspeito, vai pra revisão. Escolhe, põe nome e
  comentário. Com backend → entra na votação de todos; sem → gera link de retorno
  pro autor (WhatsApp/direct).
- **Importar sugestão** (`/i/:id`): o autor toca no link de retorno e a sugestão entra na votação.

## Depois do rolê
- **Avaliar** (`/avaliar/:id`): foi? Amei / foi ok / não curti, comentário. "Amei" credita o curador que indicou.
- **Diário**: histórico do que você foi e avaliou.

## Divulgação de eventos (artistas, produtores, casas, criadores)
- **Divulgar** (folha na página do evento): @ de quem divulga, arte de Story "Bora nesse?", WhatsApp, copiar,
  **link pra bio**. O link leva `src=cr_<@>`: as chegadas e votações criadas ficam atribuídas.
- **Convite** (`/e/:id`, público): "@x indica", data/local/preço, destaques, **Bora? Chama teu grupo** → cria
  uma votação com o evento fixo como 1ª opção + 2 parecidas.
- **Página de bio** (`/p/:handle`, tipo linktree): todos os eventos que aquele @ indica, cada um vira convite.
- **Enviar evento** (`/divulgar`, sem cadastro): formulário + **encaixe com a comunidade** ao vivo (em quantos
  pedidos recentes entraria no top 5). Com backend → vai direto pra fila; sem → link de curadoria.
- **Curadoria**: fila no `/testes` e no link `/c/:id`; aprovar/recusar. Com backend + chave da curadoria,
  **aprovar publica pra todo mundo**; sem, publica-se pelo `eventos.json` do repositório.
  Quem enviou acompanha o status em "Seus envios". Eventos com data passada saem do feed sozinhos.

## Medição e testes
- **Rastreamento** de eventos de produto (local + backend), origem de primeiro toque (`?src=`), feedback
  (botão flutuante), leads da reserva (fake door).
- **Lugares em revisão** (`/testes`, com a chave): lugares que as regras/LLM marcaram, com Liberar/Recusar.
- **Painel de testes** (`/testes`): status do backend e da IA, chave da curadoria, alternância **Todos os
  aparelhos / Este aparelho**, funil do loop, fila de eventos, tabela por origem (inclui divulgadores e
  grupos gerados), feedback, leads, últimos eventos, exportar JSON.
