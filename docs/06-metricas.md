# 06 · Métricas

## Como é medido
`track(nome, props)` grava no IndexedDB do aparelho e, com o backend no ar, envia em lotes para o
SQLite do PC. Cada evento leva junto:

- `src`: origem de primeiro toque, por exemplo `wa` (WhatsApp), `ig` (Instagram), `cr_<@>`
  (divulgador), `evt` (evento sem @) ou `direto`;
- `path`: a rota onde aconteceu.

## Funil principal (o loop)

| Etapa | Evento | Pergunta que responde |
|---|---|---|
| 1 | `onboarding_done` | Quem chega entende e entra? |
| 2 | `request_created` | As pessoas têm rolês pra decidir? |
| 3 | `results_viewed` | Viram as recomendações? |
| 4 | `share_opened` → `share_sent` | Acharam bom o bastante pra mandar pro grupo? |
| 5 | `vote_cast` | O grupo engaja? |
| 6 | `decided` | O app realmente decide o rolê? |
| 7 | `review_saved` | Foram, e o loop de qualidade fecha? |

## Curadoria (a métrica que define se o app funciona)

| Métrica | Evento | Meta |
|---|---|---|
| Pedidos atendidos com lugar curado | `request_curated` ÷ (`request_curated` + `request_uncurated`) | 30% na 2ª semana, 60% no 2º mês |
| Lugares curados | `community_place` | 50 nos bairros-foco nas 2 primeiras semanas |
| Convite → indicação | `curation_invite_click` ÷ `curation_invite_shown` | ≥ 10% |
| Fundadores ativos | aparelhos com ≥ 3 `community_place` | 5 a 10 |

Os dois primeiros aparecem em `/testes`, em cards próprios.

## Eventos de apoio
- **Viralidade:**
  - `vote_page_opened` (com `viaLink`), `vote_reshared`, `cta_new_request` (votante que vira
    organizador);
  - `story_opened`, `story_shared`, `suggest_page_opened`, `suggestion_sent` (com `live`),
    `suggest_from_vote`.
- **IA:** `clarify_shown` (pedido vago), perguntas na votação.
- **Monetização (fake door):** `reserve_intent`, `lead_submitted`, `ticket_click`.
- **Divulgação:**
  - `promote_opened`, `promote_story`, `promote_sent`, `bio_link_copied`;
  - `event_invite_viewed`, `event_group_created`, `creator_page_viewed`;
  - `divulgar_viewed`, `event_submitted`, `submission_reviewed`.
- **Qualidade:** `feedback_sent` (nota de 1 a 5 + texto).

## O que observar no teste com amigos (metas sugeridas para 2 a 4 semanas)

| Métrica | Como calcular | Meta "vale continuar" |
|---|---|---|
| Pedidos por organizador por semana | `request_created` ÷ organizadores | ≥ 1 |
| Taxa de compartilhamento | `share_sent` ÷ `request_created` | ≥ 50% |
| Votantes por pedido compartilhado | `vote_cast` (aparelhos distintos) ÷ `share_sent` | ≥ 3 |
| Votação que fecha | `decided` ÷ `share_sent` | ≥ 40% |
| Votante que vira organizador | `cta_new_request` → `request_created` (mesmo aparelho) | ≥ 10% |
| Foi e avaliou | `review_saved` ÷ `decided` | ≥ 30% |
| Interesse em reserva | `lead_submitted` ÷ `results_viewed` | Sinal: qualquer valor ≥ 5% |
| Divulgador que traz grupo | `event_group_created` por `cr_*` | ≥ 1 grupo por divulgador ativo |

**Leitura qualitativa:**

- o feedback com nota baixa diz onde o fluxo trava;
- a nuvem "o que a comunidade pede e não encontra" (`unmet`) diz que lugares faltam no catálogo.
