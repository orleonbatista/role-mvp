# 08 · Modelo de negócio

> Os valores são ordens de grandeza, baseados na pesquisa de mercado feita no início do projeto
> (nov/2026). Revalidar antes de qualquer decisão financeira. Isto não é aconselhamento financeiro.

## Tese
A oportunidade não está em "mais um app de recomendação", que concorreria com Google Maps, Instagram e
Sympla. Está em três espaços que ninguém organiza bem:

1. **A intenção:** "listening bar tranquilo pra conversar", "aniversário pra 14 até R$ 90". O Google
   responde "bar perto de mim".
2. **A ocasião em grupo:** aniversário, firma, despedida. O ticket é alto, as casas disputam esse
   público e hoje tudo se resolve no caos do WhatsApp.
3. **A confiança:** recomendação de quem tem gosto parecido e de quem **foi e avaliou**, e não nota
   inflada.

O ativo que se acumula é o **dado de demanda antes da decisão**: o que as pessoas querem fazer, com
quantas pessoas, quando e quanto pagam. Isso vale para as casas e para quem vai abrir uma.

## Mercado e cases

| Case | O que mostra | Lição para o rolê. |
|---|---|---|
| **Sympla** (BR) | Líder em ingressos, indo para a descoberta; comprou a Gandaya (Geração Z) | A líder vê valor no lado social. Parceira de afiliação, possível compradora |
| **Fever** (ES/global) | Começou como lista curada (Secret London), comprou a DICE e foi avaliada em US$ 5,2 bi | Comunidade e mídia viram poder de cobrança; experiências próprias têm margem alta |
| **Partiful** (EUA) | O link do convite é o canal de crescimento, sem baixar app | A votação por link é o nosso motor de aquisição |
| **Timeleft** (FR) | Validou com no-code, cobrou desde o início e recuou de cidades que não pagavam | Cobrar cedo, expandir cidade por cidade com disciplina |
| **Beli** (EUA) | Um vertical, uma cidade, gosto pessoal e indicação (> 80% chegam por indicação) | Densidade antes de amplitude |
| **Yelp** (EUA) | Anúncio de restaurante encolhe; leads de serviço crescem | Cobrar por demanda qualificada, não por clique |
| **The Infatuation** (EUA) | Blog comprado pela JPMorgan | Banco e cartão são parceiros ou compradores naturais |

## Receitas (em ordem de entrada)

| # | Fonte | Quem paga | Como | Quando |
|---|---|---|---|---|
| 1 | **Leads de grupo** | Casas | Por lead qualificado (grupo, data, orçamento), assinatura mensal para responder pedidos, ou % da reserva fechada | Fase B (piloto grátis primeiro) |
| 2 | **Afiliação** de ingresso e reserva | Plataformas | Comissão por venda (Sympla/Shotgun, plataformas de reserva) | Fase B |
| 3 | **Destaque de eventos** transparente | Produtores e artistas | Evento curado ganha destaque marcado como "divulgado"; preço atrelado aos grupos gerados (a atribuição por @ já existe) | Fase B/C |
| 4 | **Pacotes de grupo** | Organizador | Aniversário ou firma com open bar e área reservada, negociados com margem | Fase C |
| 5 | **Assinatura** | Organizadores frequentes | Benefícios em casas parceiras, reservas disputadas, listas | Fase C |
| 6 | **Dados e SaaS** | Casas, investidores de novas casas | Relatório de demanda por bairro, painel de público | Fase C |
| 7 | **Parcerias com banco e cartão** | Instituições financeiras | Benefícios de rolê para clientes | Fase C |

**O que evitar:** anúncio pago misturado com recomendação. Destrói a confiança, que é o diferencial.

## Por que a divulgação de eventos importa para o negócio
- **Aquisição gratuita:** o artista já divulga de qualquer jeito. Com o rolê., cada post vira link de
  votação de grupo e cada grupo expõe o app a 4 a 15 pessoas.
- **Argumento de venda medido:** "seu link gerou 23 grupos e 87 votos". O lado da oferta passa a ter
  prova de valor antes de pagar.
- **Curadoria como filtro:** o evento só entra se encaixa no que a comunidade pede, o que protege o
  feed de virar mural de flyer.

## Custos

| Item | Fase A (hoje) | Fase B | Fase C |
|---|---|---|---|
| Hospedagem do app | GitHub Pages, R$ 0 | Vercel/Cloudflare, grátis a baixo custo | Baixo |
| Backend | PC próprio + SQLite, R$ 0 (energia) | Supabase/D1: grátis no início, depois dezenas a poucas centenas de R$/mês | Escala com o uso |
| LLM | Local (RTX 2070), R$ 0 | Local ou API barata (centavos por pedido) | API gerenciada |
| Google Places (New) | Dentro da cota gratuita mensal por SKU, com cota diária e alerta de orçamento | Cresce com as buscas; cachear só `place_id`, como manda a licença | Relevante: negociar ou combinar com catálogo próprio |
| Domínio e túnel fixo | ~R$ 40 a 100/ano | Idem | Idem |
| Pessoas | Tempo do fundador | Fundador + curadores (benefícios, não salário) | Comercial para as casas, operação por cidade |

O custo real das fases A e B é **tempo**, principalmente para vender para as casas, que não dá para
automatizar.

## Unit economics para validar na Fase B
- **Lead de grupo:** quanto uma casa paga por um aniversário de 15 pessoas que vira reserva? Testar com
  10 a 20 casas depois do piloto grátis. A hipótese a validar é o valor por lead fechado em relação
  ao ticket médio do grupo.
- **Conversão:** pedidos → leads aceitos pela casa → reservas → comparecimento.
- **Viralidade (k):** organizadores novos gerados por organizador (votante → organizador).
- **Custo por pedido:** chamadas de Places + LLM + infraestrutura. Precisa ficar muito abaixo da
  receita por pedido monetizado.

## Riscos

| Risco | Mitigação |
|---|---|
| Ovo e galinha (sem casas não há receita, sem usuários não há casas) | IA + catálogo respondem sem comunidade; os leads de grupo provam valor antes de cobrar |
| Spam de casas e de produtores | Curadoria, conta verificada, destaque sempre rotulado |
| Dependência de Meta (WhatsApp/Instagram) | O link é nosso; o histórico e o grafo de gosto ficam no produto |
| Concorrente grande copia (Sympla, Google) | Velocidade + dado de intenção + comunidade de nicho; posicionar como parceiro ou alvo de aquisição |
| LGPD (dados de grupo e contato) | Coletar o mínimo; com login, termos e exclusão de dados |
| Custo do Google Places escalar | Cotas e alertas; catálogo próprio enriquecido pela comunidade |
| Atividade paralela e empregador | Conferir a política de conflito de interesses antes de lançar com marca pública |

## Formato de execução recomendado
- **Agora:** projeto paralelo, com investimento quase zero e foco em provar o loop e o interesse das
  casas.
- **Só com tração** (critérios da fase B cumpridos): avaliar sócio comercial (lado das casas) e, na
  fase C, captação.
