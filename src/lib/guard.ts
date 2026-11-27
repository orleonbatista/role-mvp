/* Filtro de entrada antes de qualquer chamada à IA (roda no app e no servidor).
   Barra tentativa de prompt injection e pedido fora do assunto sem gastar token: o texto nem chega no modelo.
   É a primeira camada; as outras são o prompt fechado (só JSON com ids conhecidos / só fatos dos lugares),
   o limite de tamanho e o limite de chamadas por aparelho no servidor. */

export type GuardResult = { ok: true; text: string } | { ok: false; reason: 'vazio' | 'longo' | 'injecao' | 'fora' | 'lixo' }

const MAX = 300

// pedidos pra mudar o comportamento da IA, revelar instruções ou trocar de papel (pt e en)
const INJECTION = [
  /\b(ignore|ignora|ignorar|desconsidere|desconsiderar|esque[cç]a|esquecer)\b.{0,40}\b(instru[cç]|regra|prompt|anterior|acima|tudo|previous|above|rules?)/i,
  /\b(ignore|disregard|forget)\b.{0,30}\b(instructions?|rules?|prompt|previous|above|everything)\b/i,
  /\b(system ?prompt|prompt do sistema|suas instru[cç][oõ]es|your instructions|developer mode|modo (desenvolvedor|dev|deus|sem filtro)|jailbreak|\bDAN\b)/i,
  /\b(voc[eê] agora [eé]|a partir de agora voc[eê]|finja (que|ser)|aja como|act as|you are now|pretend (to be|you)|roleplay|interprete o papel)/i,
  /\b(revele|mostre|repita|imprima|print|reveal|repeat)\b.{0,30}\b(prompt|instru[cç]|regras|system|configura)/i,
  /<\/?(system|assistant|user|instructions?)>|\[\/?(INST|SYS)\]|```|\{\{|\}\}|<\|/i,
  /\b(responda|answer|reply)\b.{0,20}\b(somente|only|apenas)\b.{0,20}\b(sim|yes|ok|true)\b/i,
]
// assuntos que não são sair/comer/beber/passeio: código, tarefas, conteúdo longo
const OFF_TOPIC = [
  /\b(escreva|escrever|gere|gerar|crie|criar|fa[cç]a|write|generate)\b.{0,30}\b(c[oó]digo|code|script|programa de computador|poema|poesia|reda[cç][aã]o|artigo|texto sobre|e-?mail|curr[ií]culo|tcc|trabalho escolar)/i,
  /\b(python|javascript|typescript|sql|html|css|regex|api key|chave de api|senha|password|token)\b/i,
  /\b(traduza|translate|resuma|summarize|calcule|resolva|equa[cç][aã]o|matem[aá]tica)\b/i,
  /\b(pol[ií]tica|elei[cç][aã]o|presidente|religi[aã]o|medicamento|rem[eé]dio|diagn[oó]stico|investimento|criptomoeda|bitcoin)\b/i,
]

export function screen(raw: unknown, max = MAX): GuardResult {
  const text = String(raw ?? '').normalize('NFKC').replace(/[​-‏‪-‮⁠-⁯]/g, '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, reason: 'vazio' }
  if (text.length > max) return { ok: false, reason: 'longo' }
  if (/https?:\/\/|www\./i.test(text) || /[A-Za-z0-9+/]{60,}={0,2}/.test(text)) return { ok: false, reason: 'lixo' }
  const letters = (text.match(/\p{L}/gu) ?? []).length
  if (letters < Math.min(3, text.length) || letters / text.length < 0.45 || /(.)\1{9,}/.test(text)) return { ok: false, reason: 'lixo' }
  if (INJECTION.some((re) => re.test(text))) return { ok: false, reason: 'injecao' }
  if (OFF_TOPIC.some((re) => re.test(text))) return { ok: false, reason: 'fora' }
  return { ok: true, text }
}

export const GUARD_REPLY: Record<Exclude<GuardResult, { ok: true }>['reason'], string> = {
  vazio: 'Me conta o que você quer fazer: tipo de lugar, bairro, com quem, quanto quer gastar.',
  longo: 'Escreve mais curtinho (até 300 caracteres) que eu acho mais rápido.',
  lixo: 'Não entendi. Descreve o lugar que você procura, sem links.',
  injecao: 'Aqui eu só ajudo a achar lugares pra sair: bar, restaurante, café, balada, show. O que você quer fazer?',
  fora: 'Esse assunto foge do rolê. Posso te ajudar a achar um lugar pra comer, beber, dançar ou passear.',
}
