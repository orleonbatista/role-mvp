// Web Push sem dependências (RFC 8291 aes128gcm + RFC 8292 VAPID) com node:crypto.
// Chaves VAPID geradas no 1º start em data/vapid.json (fora do git).
import { createECDH, createPrivateKey, createCipheriv, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const b64u = (b) => Buffer.from(b).toString('base64url')
const fromB64u = (s) => Buffer.from(String(s), 'base64url')

export function createPush(dataDir, subject = 'https://orleonbatista.github.io/role-mvp/') {
  const file = join(dataDir, 'vapid.json')
  if (!existsSync(file)) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const jwk = privateKey.export({ format: 'jwk' })
    const pub = publicKey.export({ format: 'jwk' })
    writeFileSync(file, JSON.stringify({ jwk, publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(pub.x), fromB64u(pub.y)])) }))
  }
  const { jwk, publicKey } = JSON.parse(readFileSync(file, 'utf8'))
  const priv = createPrivateKey({ key: jwk, format: 'jwk' })

  function vapid(endpoint) {
    const aud = new URL(endpoint).origin
    const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
    const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }))
    const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: priv, dsaEncoding: 'ieee-p1363' })
    return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`
  }

  /** cifra o payload pro navegador (aes128gcm, um registro) */
  function encrypt(sub, payload) {
    const uaPub = fromB64u(sub.keys.p256dh)
    const auth = fromB64u(sub.keys.auth)
    const ecdh = createECDH('prime256v1')
    const asPub = ecdh.generateKeys()
    const shared = ecdh.computeSecret(uaPub)
    const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32))
    const salt = randomBytes(16)
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
    const c = createCipheriv('aes-128-gcm', cek, nonce)
    const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()])
    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096)
    return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct])
  }

  /** envia; devolve 'gone' quando a inscrição não vale mais (404/410) */
  async function send(sub, data) {
    try {
      const r = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapid(sub.endpoint) },
        body: encrypt(sub, JSON.stringify(data)),
        signal: AbortSignal.timeout(10_000),
      })
      if (r.status === 404 || r.status === 410) return 'gone'
      if (!r.ok) console.warn('push', r.status, (await r.text()).slice(0, 120))
      return r.ok ? 'ok' : 'fail'
    } catch (e) { console.warn('push:', e.message); return 'fail' }
  }
  return { publicKey, send }
}
