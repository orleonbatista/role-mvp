import type { Niche, Occasion, Tag, Vibe } from '../lib/types'

/* Prompt, exemplos e schema da extração por LLM.
   Compartilhado entre o app (modo dev, Ollama direto) e o gateway (llm-gateway/server.mjs),
   que monta a chamada no servidor e só aceita o texto do pedido. Sem dependências: o Node 22 importa direto. */

export const NICHES: Niche[] = ['listening', 'eletronica', 'boteco', 'gastronomia', 'drinks', 'jazz', 'ao-ar-livre']
export const VIBES: Vibe[] = ['tranquilo', 'animado', 'intimista', 'underground', 'descolado', 'raiz', 'sofisticado']
export const OCCS: Occasion[] = ['aniversario', 'date', 'amigos', 'solo', 'trabalho', 'esquenta']
export const TAGS: Tag[] = ['vegano', 'samba', 'pet', 'acessivel', 'karaoke', 'funk', 'sertanejo', 'open-bar']
export const ALL: string[] = [...NICHES, ...VIBES, ...TAGS]

export const SYSTEM = `Você extrai critérios de pedidos de rolê (bares, restaurantes, baladas, eventos em São Paulo).
Regras:
- Cada item precisa de "trecho": as palavras EXATAS do pedido que justificam o item (copie do texto).
- Só inclua o que o pedido diz ou implica claramente. Na dúvida, não inclua. Listas vazias são normais.
- Nunca repita itens. No máximo 5 itens.
- ocasiao "nenhuma", pessoas 0 e orcamento 0 quando não forem ditos.
Valores:
- nichos: listening (som/vinil), eletronica (balada, techno, dançar, pista), boteco (bar raiz, petisco, acepipe, cerveja, chopp),
  gastronomia (comer, jantar, almoçar, restaurante), drinks (drink, coquetel, vinho, rooftop), jazz (música ao vivo, jazz), ao-ar-livre (quintal, laje, céu aberto)
- vibes: tranquilo (dá pra conversar, calmo), animado (agitado, festa), intimista (romântico, a dois), underground, descolado, raiz (simples, barato), sofisticado (chique, especial)
- tags: vegano, samba (samba/pagode), pet (cachorro), acessivel (só cadeirante/mobilidade reduzida), karaoke, funk, sertanejo, open-bar
- ocasiao: aniversario, date (encontro, crush, namorada), amigos (galera, parças, família), trabalho (firma, equipe, expediente), esquenta, solo (sozinho)
- orcamento: valor máximo por pessoa em reais, só se houver número.`

export const EXAMPLES: [string, unknown][] = [
  ['quero levar minha namorada pra jantar num lugar especial, até 200 conto', {
    ocasiao: { valor: 'date', trecho: 'minha namorada' }, pessoas: { valor: 2, trecho: 'levar minha namorada' }, orcamento: { valor: 200, trecho: 'até 200 conto' },
    itens: [{ valor: 'gastronomia', trecho: 'jantar' }, { valor: 'sofisticado', trecho: 'lugar especial' }],
  }],
  ['bora tomar uma com a galera depois do trampo', {
    ocasiao: { valor: 'amigos', trecho: 'com a galera' }, pessoas: { valor: 0, trecho: '' }, orcamento: { valor: 0, trecho: '' },
    itens: [{ valor: 'boteco', trecho: 'tomar uma' }],
  }],
]

export const SCHEMA = {
  type: 'object',
  properties: {
    ocasiao: { type: 'object', properties: { valor: { type: 'string', enum: [...OCCS, 'nenhuma'] }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    pessoas: { type: 'object', properties: { valor: { type: 'integer' }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    orcamento: { type: 'object', properties: { valor: { type: 'integer' }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    itens: {
      type: 'array', maxItems: 5,
      items: { type: 'object', properties: { valor: { type: 'string', enum: ALL }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    },
  },
  required: ['ocasiao', 'pessoas', 'orcamento', 'itens'],
}

/** corpo da chamada /api/chat do Ollama para um pedido */
/** extra = exemplos aprendidos com pedidos parecidos (o gateway busca no banco) */
export function ollamaBody(model: string, text: string, extra: [string, unknown][] = []) {
  return {
    model,
    stream: false,
    format: SCHEMA,
    keep_alive: '30m',
    options: { temperature: 0, num_predict: 220, repeat_penalty: 1.15 },
    messages: [
      { role: 'system', content: SYSTEM },
      ...[...EXAMPLES, ...extra].flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: JSON.stringify(a) }]),
      { role: 'user', content: text },
    ],
  }
}

/* ---------- Perguntas sobre a votação ---------- */

/** fatos de um lugar que podem ser usados na resposta (nada além disso) */
export interface PlaceFact {
  nome: string
  bairro: string
  tipo: string
  preco_pessoa: number
  capacidade: number
  /** null = evento novo, sem avaliações */
  nota: number | null
  estilos: string[]
  clima: string[]
  extras: string[]
  horario: string
  destaques: string[]
  distancia_km?: number
  votos?: number
}

export const ASK_SYSTEM = `Você é a IA do app rolê. e responde dúvidas sobre as OPÇÕES de uma votação de rolê.
Regras:
- Use SOMENTE os fatos fornecidos. Não invente endereço, preço, cardápio, avaliação ou horário.
- Se os fatos não respondem, diga isso com honestidade e sugira o que dá pra comparar.
- Responda em português do Brasil, tom leve, no máximo 3 frases curtas.
- Cite os nomes exatos das opções que você está recomendando ou comparando.
- Preço é ESTIMADO: escreva sempre "cerca de R$ X" ou "~R$ X por pessoa", nunca "custa R$ X".
- Não termine com pergunta: a pessoa não tem como responder aqui.
- Se a pergunta não for sobre essas opções ou sobre o rolê, responda só: "Só consigo ajudar com as opções desta votação."`

export function askBody(model: string, question: string, pedido: string, facts: PlaceFact[]) {
  return {
    model,
    stream: false,
    keep_alive: '30m',
    options: { temperature: 0.2, num_predict: 170 },
    messages: [
      { role: 'system', content: ASK_SYSTEM },
      { role: 'user', content: `Pedido do grupo: "${pedido}"\nOpções (fatos):\n${JSON.stringify(facts)}\n\nPergunta: ${question}` },
    ],
  }
}

/* ---------- moderação de lugar sugerido pela comunidade ---------- */
export const MODERATE_SYSTEM = `Você modera sugestões de lugares (bares, restaurantes, baladas) no app rolê.
Recebe o nome confirmado pela pessoa e o comentário dela. Responda JSON {"ok": boolean, "motivo": string}.
ok=false SOMENTE se houver: ofensa ou discurso de ódio; propaganda/spam (pede contato, "chama no direct",
link, telefone, cupom); conteúdo sexual; ou texto claramente sem relação com um lugar para sair.
Gíria, palavrão leve de elogio ("bar foda"), comentário curto ou vazio são ok=true.
"motivo": até 8 palavras, em português, vazio se ok=true.`

export const MODERATE_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, motivo: { type: 'string' } },
  required: ['ok', 'motivo'],
}

export function moderateBody(model: string, name: string, comment: string) {
  return {
    model,
    stream: false,
    keep_alive: '30m',
    format: MODERATE_SCHEMA,
    options: { temperature: 0, num_predict: 60 },
    messages: [
      { role: 'system', content: MODERATE_SYSTEM },
      { role: 'user', content: `Nome: "${name.slice(0, 80)}"\nComentário: "${comment.slice(0, 200)}"` },
    ],
  }
}

/** regras que valem com ou sem LLM (PC desligado): sinais claros de spam/propaganda */
export function moderationRules(name: string, comment: string): string | null {
  const t = `${name} ${comment}`.toLowerCase()
  if (/https?:\/\/|www\.|\.com\b|\.com\.br\b/.test(t)) return 'contém link'
  if (/(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/.test(t)) return 'contém telefone'
  if (/@[a-z0-9_.]{3,}/.test(t)) return 'contém @ de perfil'
  if (/(chama|chame|manda|me chama) no (direct|dm|whats|zap|inbox)|cupom|promo[çc][ãa]o|desconto de|sorteio/.test(t)) return 'parece propaganda'
  if (comment.length > 20 && comment === comment.toUpperCase() && /[A-Z]{12,}/.test(comment)) return 'texto todo em maiúsculas'
  return null
}

/* ---------- escolha das melhores opções (curadoria da IA sobre os resultados da busca) ---------- */
/** candidato: só fatos verificados (Google ao vivo ou comunidade); null = não se sabe */
export interface PickFact {
  i: number
  nome: string
  tipo: string
  distancia_km: number | null
  nota_google: number | null
  avaliacoes_google: number | null
  nota_comunidade: number | null
  area_externa: boolean | null
  cerveja: boolean | null
  drinks: boolean | null
  musica_ao_vivo: boolean | null
  bom_pra_grupo: boolean | null
  aberto_no_horario_pedido: boolean | null
  /** só quando o pedido fala de orçamento; é estimativa, não preço confirmado */
  preco_estimado?: number
  curado_pela_comunidade: boolean
}

export const DESTAQUES = ['mais_perto', 'perto', 'melhor_nota', 'nota_alta', 'muito_avaliado', 'area_externa', 'cerveja', 'drinks',
  'musica_ao_vivo', 'bom_pra_grupo', 'aberto_no_horario', 'curado_pela_comunidade'] as const

export const PICK_SYSTEM = `Você é o curador do app rolê. Recebe o pedido de uma pessoa e uma lista de lugares candidatos,
cada um só com FATOS verificados (null = não se sabe). Escolha os 5 que melhor atendem AO PEDIDO (menos só se não houver 5 aceitáveis), nesta ordem de prioridade:
1) o que o pedido exige explicitamente (ex.: área externa, música ao vivo, cerveja, aberto no horário, distância);
2) o clima e a ocasião que o pedido sugere (date, grupo grande, sozinho, animado);
3) qualidade: nota alta com muitas avaliações vale mais que nota alta com poucas.
Descarte quem contraria um requisito explícito (ex.: area_externa=false quando o pedido quer ao ar livre; aberto_no_horario_pedido=false).
Para cada escolhido, dê 1 ou 2 "destaques" — o que mais justifica AQUELE lugar para ESTE pedido e o diferencia dos outros:
mais_perto (o menor distancia_km da lista), perto (até 1,5 km), melhor_nota (a maior nota_google da lista), nota_alta (4,6+ com 200+ avaliações),
muito_avaliado (1000+ avaliações), area_externa, cerveja, drinks, musica_ao_vivo, bom_pra_grupo, aberto_no_horario, curado_pela_comunidade.
Só use destaque cujo fato seja verdadeiro na lista. Varie: não dê os mesmos destaques para todos.
Responda JSON {"escolhas": [{"i": número do candidato, "destaques": ["..."]}]}.`

export const PICK_SCHEMA = {
  type: 'object',
  properties: {
    escolhas: {
      type: 'array', maxItems: 5,
      items: { type: 'object', properties: { i: { type: 'integer' }, destaques: { type: 'array', maxItems: 2, items: { type: 'string', enum: [...DESTAQUES] } } }, required: ['i', 'destaques'] },
    },
  },
  required: ['escolhas'],
}

export function pickBody(model: string, pedido: string, cands: PickFact[]) {
  return {
    model,
    stream: false,
    format: PICK_SCHEMA,
    keep_alive: '30m',
    options: { temperature: 0, num_predict: 360 },
    messages: [
      { role: 'system', content: PICK_SYSTEM },
      { role: 'user', content: `Pedido: "${pedido}"\nCandidatos:\n${cands.map((c) => JSON.stringify(c)).join('\n')}` },
    ],
  }
}
