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
export function ollamaBody(model: string, text: string) {
  return {
    model,
    stream: false,
    format: SCHEMA,
    keep_alive: '30m',
    options: { temperature: 0, num_predict: 220, repeat_penalty: 1.15 },
    messages: [
      { role: 'system', content: SYSTEM },
      ...EXAMPLES.flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: JSON.stringify(a) }]),
      { role: 'user', content: text },
    ],
  }
}
