# 10 · Plano de uso do Google Places

Status: **planejado, não implementado**. Preços da tabela global do Google Maps Platform (nov/2026), câmbio de
referência R$ 5,50.

## 1. Custo nas fases

| Fase | Usuários ativos/mês | Google por mês |
|---|---|---|
| Teste (amigos, fundadores) | até ~600 | **R$ 0** (dentro da franquia grátis) |
| Começo | ~1.000 | ~R$ 550 |
| Lucro de R$ 20 mil (cenário base) | ~5.000 | ~R$ 5.700 |

Franquia grátis mensal por SKU: Place Details Pro 5.000; Text Search Pro 5.000; Place Details Enterprise 1.000;
Enterprise + Atmosphere 1.000; Photos 1.000. **A foto é a primeira a estourar** (~125 usuários com 8 fichas cada).

## 2. Estratégia de armazenamento

### Opção A, recomendada: ao vivo desde o início, gastando pouco
- Guardar só o que os termos permitem: `place_id` (sem prazo) e lat/lng (30 dias, a expiração já existe).
- Buscar o Google **só ao abrir a ficha**, nunca nos cards das listas.
- Uma foto por ficha, no tamanho da tela (`maxWidthPx=800`).
- Aproveitar o cache HTTP normal do navegador e o limite diário por aparelho, como na busca.
- Ficha do Google **só para lugares sem foto ou dado próprio**: o custo cai à medida que o acervo da comunidade e das casas cresce.
- Manter as cotas diárias no console como trava.

### Opção B, pedida pelo Orleon: salvar o conteúdo do Google e virar ao vivo depois
**Não recomendada.**
- **Viola os termos:** guardar foto, nota, avaliação ou horário, inclusive reescritos pela LLM, viola os Service Specific Terms.
- **Quanto economiza:** na fase de teste, nada, porque o ao vivo já sai R$ 0. Com ~1.000 usuários, ~R$ 550/mês.
- **Riscos:**
  - bloqueio da chave sem aviso;
  - base contaminada numa due diligence de investimento ou venda;
  - notificação do Google;
  - exposição pessoal (atividade paralela, emprego em banco).
- **Se for adotada mesmo assim**, a virada precisa ser planejada desde o início:
  - campo `origem: 'google'` em todo dado salvo;
  - prazo de corte definido;
  - script que apaga tudo que tem essa origem e troca pela leitura ao vivo.

**Decisão:** pendente do Orleon. O padrão é a opção A.

## 3. O que o Google retorna e o que usar na experiência

A SKU cobrada é a do campo mais caro pedido no field mask, então a escolha dos campos define o custo.

| Campo | SKU | Usar? | Como |
|---|---|---|---|
| `businessStatus` (fechado temporária ou definitivamente) | Pro | **Sim, prioridade 1** | Esconder lugar fechado da base e da IA. Evita mandar grupo pra porta fechada |
| `photos` (1ª foto + crédito do autor) | Photos | **Sim** | Só na ficha, quando não há foto própria. Crédito do autor é obrigatório |
| `googleMapsUri` | Pro | Sim | Botão "Abrir no Maps" (hoje montado pelo `place_id`) |
| `formattedAddress`, `location` | Pro | Sim | Endereço na ficha + mapa |
| **Mapa embutido** (Maps Embed API, sem custo) | grátis | **Sim** | Mapa pequeno na ficha pelo `place_id`. Ajuda o grupo a combinar ponto de encontro |
| `currentOpeningHours` / `regularOpeningHours` | Enterprise | **Sim** | Volta o "aberto sexta às 22h" **só com dado do Google ao vivo**, e entra no encaixe da IA na hora da ficha |
| `rating` + `userRatingCount` | Enterprise | Sim, discreto | "Google 4,6 (1,2 mil)" pequeno e separado da nota da comunidade. Dá confiança, sem competir com a curadoria |
| `nationalPhoneNumber` | Enterprise | Sim | "Ligar pra reservar" em pedidos de grupo e aniversário |
| `websiteUri` | Enterprise | Talvez | Só se o OSM não tiver |
| `priceLevel` / `priceRange` | Enterprise | Talvez | Só pra lugares sem faixa da comunidade |
| `goodForGroups`, `reservable`, `liveMusic`, `outdoorSeating`, `servesCocktails`, `allowsDogs`, `goodForChildren` | Atmosphere | **Sim, só na ficha** | Selinhos "bom pra grupo · reserva · ao vivo". Ao indicar, aparecem como **sugestão ao curador**, que confirma ou não; o que fica salvo é a resposta do curador |
| `reviews` (até 5) | Atmosphere | **Não** | Concorre com a voz da comunidade e é caro. No máximo um link "ver avaliações no Google" |
| `reviewSummary` / `generativeSummary` (resumo por IA do Google) | Atmosphere | Não | Mesmo motivo; e a IA do rolê precisa falar com base na comunidade |
| `editorialSummary` | Atmosphere | Não | Pouco preenchido em SP; a descrição deve ser da comunidade ou da IA sobre dados próprios |
| `accessibilityOptions`, `parkingOptions`, `paymentOptions` | Pro/Enterprise | Talvez, fase B | Filtros úteis, mas secundários |
| `types` / `primaryType` | Pro | Sim, internamente | Mapear pro estilo do rolê ao indicar (já fazemos) |

## 4. Field masks propostos

- **Busca** (indicar/sugerir), Text Search Pro:
  `id, displayName, formattedAddress, location, types, businessStatus`.
  Nada de foto nem nota na lista.
- **Ficha básica**, Details Enterprise (US$ 20 por mil, 1.000 grátis):
  `businessStatus, googleMapsUri, formattedAddress, location, currentOpeningHours, rating, userRatingCount, nationalPhoneNumber, photos`.
  Mais 1 chamada de Photos (US$ 7 por mil).
- **Ficha de pedido de grupo**, Enterprise + Atmosphere (US$ 25 por mil):
  a básica + `goodForGroups, reservable, liveMusic, outdoorSeating`.
  Só quando o pedido é de grupo ou aniversário.
- **Mapa:** Maps Embed por `place_id`, sem chamada à Places API.

## 5. Ordem de implementação (quando o PC estiver ligado)
1. `businessStatus` na busca e limpeza de fechados da base.
2. Ficha ao vivo: foto + crédito, horário, nota discreta, telefone, mapa embutido.
3. Atmosphere só em pedido de grupo; sugestões pro curador no `/indicar`.
4. Prioridade de foto: casa/comunidade → embed do Instagram → Google → ícone do estilo.
5. Métrica de custo em `/testes`: chamadas por SKU no mês × preço, contra a franquia.
