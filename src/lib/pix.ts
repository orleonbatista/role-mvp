/* Pix "copia e cola" estático (BR Code / EMV do Banco Central): valor fixo, chave de quem pagou a conta.
   Nada passa pelo app: a pessoa copia o código e paga no app do banco dela. */
const f = (id: string, v: string) => `${id}${String(v.length).padStart(2, '0')}${v}`
const clean = (s: string, n: number) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, n) || 'ROLE'

function crc16(s: string) {
  let c = 0xffff
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff
  }
  return c.toString(16).toUpperCase().padStart(4, '0')
}

export function pixPayload({ key, name, city, amount, txid = '***' }: { key: string; name: string; city: string; amount?: number; txid?: string }) {
  const p = [
    f('00', '01'),
    f('26', f('00', 'br.gov.bcb.pix') + f('01', key.trim())),
    f('52', '0000'), f('53', '986'),
    ...(amount && amount > 0 ? [f('54', amount.toFixed(2))] : []),
    f('58', 'BR'), f('59', clean(name, 25)), f('60', clean(city, 15)),
    f('62', f('05', txid)),
  ].join('') + '6304'
  return p + crc16(p)
}

/** chave Pix plausível: CPF/CNPJ, telefone +55, e-mail ou chave aleatória */
export const pixKeyOk = (k: string) => /^\d{11}$|^\d{14}$|^\+55\d{10,11}$|^[^@\s]+@[^@\s]+\.[^@\s]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k.trim())
