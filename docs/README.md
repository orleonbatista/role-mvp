# rolê. — documentação

App de rolês decididos em grupo: alguém descreve o que quer ("aniversário pra 14 sábado em Pinheiros,
até R$ 90"), a IA e a comunidade sugerem lugares, o grupo vota por um link e o rolê fecha.

| Documento | Para que serve |
|---|---|
| [01 · Visão de produto](01-visao-produto.md) | Problema, proposta, público, princípios, o que não é |
| [02 · Funcionalidades](02-funcionalidades.md) | Inventário completo do que o MVP faz, por área |
| [03 · Jornadas e usabilidade](03-jornadas.md) | Jornadas ponta a ponta, avaliação, gaps corrigidos e abertos |
| [04 · Arquitetura](04-arquitetura.md) | Stack, camadas, offline-first, sincronização, links, IA, segurança |
| [05 · Operação](05-operacao.md) | Rodar local, publicar, gateway/túnel, backend, curadoria, backup, problemas comuns |
| [06 · Métricas](06-metricas.md) | Eventos rastreados, funil, painel /testes, o que observar no teste com amigos |
| [07 · Roadmap](07-roadmap.md) | Fases, critérios de avanço e backlog priorizado |
| [08 · Modelo de negócio](08-modelo-de-negocio.md) | Mercado, cases, receitas, custos, unit economics, riscos |
| [09 · Decisões](09-decisoes.md) | Registro das decisões técnicas e de produto (e por quê) |

Estado atual (nov/2026): MVP em PWA publicado no GitHub Pages
(`https://orleonbatista.github.io/role-mvp/`), com LLM local (qwen2.5:7b na RTX 2070) e backend SQLite
rodando no PC do Orleon, ambos expostos por um túnel Cloudflare. Catálogo de 36 lugares fictícios em
bairros reais de São Paulo.
