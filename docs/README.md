# rolê. — documentação

App de rolês decididos em grupo: alguém descreve o que quer ("aniversário pra 14 sábado em Pinheiros,
até R$ 90"), a IA e a comunidade sugerem lugares, o grupo vota por um link e o rolê fecha.

| Documento | Para que serve |
|---|---|
| [01 · Visão de produto](01-visao-produto.md) | Problema, proposta, público, princípios, o que não é |
| [02 · Funcionalidades](02-funcionalidades.md) | Inventário completo do que o MVP faz, por área |
| [03 · Jornadas, passo a passo](03-jornadas.md) | 14 jornadas com passos, dados de teste (E2E e API) e gaps |
| [04 · Arquitetura](04-arquitetura.md) | Stack, camadas, offline-first, sincronização, links, IA, segurança |
| [05 · Operação](05-operacao.md) | Rodar local, publicar, gateway/túnel, backend, curadoria, backup, problemas comuns |
| [06 · Métricas](06-metricas.md) | Eventos rastreados, funil, painel /testes, o que observar no teste com amigos |
| [07 · Roadmap](07-roadmap.md) | Fases, critérios de avanço e backlog priorizado |
| [08 · Modelo de negócio](08-modelo-de-negocio.md) | Mercado, cases, receitas, custos, unit economics, riscos |
| [09 · Decisões](09-decisoes.md) | Registro das decisões técnicas e de produto (e por quê) |

Estado atual (27/11/2026): PWA publicado no GitHub Pages (`https://orleonbatista.github.io/role-mvp/`), servidor
Node + SQLite no PC do Orleon atrás de túnel Cloudflare, IA na nuvem com fallback local, lugares reais do Google e
catálogo da comunidade. Camada social (@, amigos, turmas, notificações) e caixa de ferramentas no ar.
- [10 · Plano de uso do Google Places](10-plano-google.md): custo por fase, armazenamento e campos na experiência
