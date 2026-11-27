import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

/* Auditoria da due diligence: percorre todas as telas em 3 aparelhos, mede tempos, tira print e roda checagens na
   página (estouro de largura, botões sem nome, alvos de toque pequenos, texto minúsculo, contraste, erros de console).
   Dados de teste marcados [E2E] e apagados no fim. Saída: audit-out/<aparelho>/*.png e audit-out/<aparelho>.json */

// rola a área que de fato rola (o app usa um contêiner com overflow, não a janela)
async function scroll(page: Page, dy: number) {
  await page.evaluate((dy) => {
    const els = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 20 })
    const el = els.sort((a, b) => b.clientHeight - a.clientHeight)[0]
    if (el) el.scrollBy(0, dy); else window.scrollBy(0, dy)
  }, dy)
}

type Finding = { screen: string; kind: string; detail: string }
const OUT = 'audit-out'

async function audit(page: Page, screen: string, device: string, out: { screens: unknown[]; findings: Finding[]; console?: string[] }, t0: number) {
  await page.waitForTimeout(900)
  const ms = Date.now() - t0
  const dir = `${OUT}/${device}`
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/${screen}.png` })
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth
    const f: { kind: string; detail: string }[] = []
    const label = (el: Element) => (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || '').trim()
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${label(el).slice(0, 40)}"`
    const vis = (el: Element) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0' }
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el)) continue
      const b = el.getBoundingClientRect()
      if (b.right > W + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.overflow-x-auto,.no-scrollbar,[data-scroll]')) f.push({ kind: 'estouro', detail: `${desc(el)} vai até ${Math.round(b.right)}px (tela ${W})` })
    }
    for (const el of document.querySelectorAll('button, a[href], [role=button], input, select, textarea')) {
      if (!vis(el)) continue
      const b = el.getBoundingClientRect()
      const isField = /INPUT|SELECT|TEXTAREA/.test(el.tagName)
      const name = label(el) || (isField && (el.getAttribute('placeholder') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || el.closest('label')?.textContent)) || ''
      if (!name && (el as HTMLInputElement).type !== 'hidden') f.push({ kind: 'sem-nome', detail: desc(el) + ` (${el.outerHTML.slice(0, 80)})` })
      if (!isField && (b.width < 32 || b.height < 32) && !el.closest('p, li span')) f.push({ kind: 'alvo-pequeno', detail: `${desc(el)} ${Math.round(b.width)}×${Math.round(b.height)}` })
    }
    // texto: tamanho e contraste aproximado contra o fundo opaco mais próximo
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const lum = ([r, g, b]: number[]) => { const a = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2] }
    const bgOf = (el: Element | null): number[] => {
      let bg = [11, 11, 12]
      const stack: number[][] = []
      for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) { stack.push(c); if ((c[3] ?? 1) >= 0.95) break } }
      for (const c of stack.reverse()) { const a = c[3] ?? 1; bg = [0, 1, 2].map((i) => c[i] * a + bg[i] * (1 - a)) }
      return bg
    }
    const seen = new Set<string>()
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1)) continue
      const s = getComputedStyle(el)
      const size = parseFloat(s.fontSize)
      const txt = (el as HTMLElement).innerText.trim().slice(0, 30)
      if (size < 11 && !seen.has('t' + txt)) { seen.add('t' + txt); f.push({ kind: 'texto-pequeno', detail: `${size}px "${txt}"` }) }
      const c = rgb(s.color); const a = c[3] ?? 1; const bg = bgOf(el)
      const fg = [0, 1, 2].map((i) => c[i] * a * parseFloat(s.opacity || '1') + bg[i] * (1 - a * parseFloat(s.opacity || '1')))
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      const big = size >= 18.6 || (size >= 14 && Number(s.fontWeight) >= 700)
      if (ratio < (big ? 3 : 4.5) && !seen.has('c' + txt)) { seen.add('c' + txt); f.push({ kind: 'contraste', detail: `${ratio.toFixed(2)}:1 ${size}px "${txt}"` }) }
    }
    const h1 = document.querySelectorAll('h1').length
    return { f, h1, title: document.title, scrollH: document.scrollingElement?.scrollHeight ?? 0 }
  })
  out.screens.push({ screen, ms, h1: r.h1, title: r.title })
  for (const x of r.f) out.findings.push({ screen, ...x })
  writeFileSync(`${OUT}/${device}.json`, JSON.stringify(out, null, 1))
}

test('auditoria de todas as telas', async ({ page }, info) => {
  test.setTimeout(300_000)
  const device = info.project.name
  const out = { device, viewport: page.viewportSize(), screens: [] as unknown[], findings: [] as Finding[], console: [] as string[] }
  page.on('console', (m) => { if (m.type() === 'error') out.console.push(`${page.url().replace(/.*role-mvp/, '')}: ${m.text().slice(0, 200)}`) })
  page.on('pageerror', (e) => out.console.push(`${page.url().replace(/.*role-mvp/, '')}: pageerror ${e.message.slice(0, 200)}`))
  const go = async (path: string, screen: string, ready?: string | RegExp) => {
    const t0 = Date.now()
    await page.goto(path)
    if (ready) await expect(page.getByText(ready).first()).toBeVisible({ timeout: 15_000 }).catch(() => out.findings.push({ screen, kind: 'nao-carregou', detail: String(ready) }))
    await audit(page, screen, device, out, t0)
  }

  // sem cadastro
  await go('./', '01-boas-vindas', 'O rolê certo,')
  await go('ferramentas', '02-ferramentas', 'Pra qualquer rolê')
  for (const [btn, name] of [['Dividir a conta', '03-conta'], ['Convite com flyer', '04-flyer'], ['Link pro WhatsApp', '05-zap'], ['Quem leva o quê', '06-leva'], ['Decidir na sorte', '07-sorteio']]) {
    await page.goto('ferramentas'); await page.getByRole('button', { name: new RegExp(btn) }).click()
    await audit(page, name, device, out, Date.now())
  }
  await go('privacidade', '08-privacidade')
  await go('divulgar', '09-divulgar')

  // cadastro
  let t0 = Date.now()
  await page.goto('./')
  await page.getByRole('button', { name: 'Começar' }).click()
  await audit(page, '10-onboarding-local', device, out, t0)
  await page.getByRole('button', { name: /prefiro escolher um bairro/ }).click()
  await page.getByRole('button', { name: 'Pinheiros', exact: true }).click()
  await audit(page, '11-onboarding-nome', device, out, Date.now())
  await page.getByPlaceholder('Seu nome').fill('E2E Auditoria')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await audit(page, '12-onboarding-gosto', device, out, Date.now())
  await page.getByRole('button', { name: /^Drinks/ }).click()
  await page.getByRole('checkbox').check()
  t0 = Date.now()
  await page.getByRole('button', { name: 'Montar meu feed' }).click()
  await expect(page.getByText('Pra onde')).toBeVisible({ timeout: 8000 })
  await audit(page, '13-inicio', device, out, t0)
  await page.waitForTimeout(4000)
  await audit(page, '14-inicio-carregada', device, out, Date.now())

  let id = ''
  try {
  // pedido
  await page.getByText('Descreve o rolê que você quer…').click()
  await audit(page, '15-novo-pedido', device, out, Date.now())
  await page.getByLabel('Descreva o rolê').fill('[E2E] aniversário pra 8 pessoas sábado na Vila Madalena até R$ 80')
  t0 = Date.now()
  await page.getByRole('button', { name: 'Encontrar o rolê' }).click()
  await expect(page).toHaveURL(/\/pedido\/r-/, { timeout: 40_000 })
  await expect(page.getByText(/combina|alternativa/).first()).toBeVisible({ timeout: 30_000 })
  await audit(page, '16-resultados', device, out, t0)
  await scroll(page, 900); await audit(page, '17-resultados-meio', device, out, Date.now())
  await scroll(page, 1400); await audit(page, '18-resultados-fim', device, out, Date.now())
  id = page.url().match(/r-[a-z0-9-]+/)![0]
  await go(`r/${id}`, '19-votacao', 'Onde vai ser?')
  await scroll(page, 1000); await audit(page, '20-votacao-meio', device, out, Date.now())
  await scroll(page, 1600); await audit(page, '21-votacao-fim', device, out, Date.now())
  await page.goto(`r/${id}`)
  const det = page.getByRole('link', { name: /^Ver detalhes de / }).first()
  if (await det.count()) { t0 = Date.now(); await det.click(); await audit(page, '22-lugar', device, out, t0); await scroll(page, 1000); await audit(page, '23-lugar-fim', device, out, Date.now()) }
  await go(`s/${id}`, '24-sugerir')

  // abas e social
  await go('amigos', '25-amigos-feed')
  await page.getByRole('tab', { name: 'amigos' }).click().catch(() => {})
  await audit(page, '26-amigos-busca', device, out, Date.now())
  await page.getByLabel(/Buscar amigos/).fill('@orl').catch(() => {})
  await page.waitForTimeout(1500); await audit(page, '27-amigos-resultado', device, out, Date.now())
  await page.getByRole('tab', { name: 'ranking' }).click().catch(() => {})
  await audit(page, '28-ranking', device, out, Date.now())
  await go('turmas', '29-turmas')
  await go('notificacoes', '30-notificacoes', 'Notificações')
  await go('perfil', '31-perfil')
  await scroll(page, 1200); await audit(page, '32-perfil-fim', device, out, Date.now())
  await go('buscar', '33-busca-rapida')
  await go('indicar', '34-indicar')
  } catch (e) { out.findings.push({ screen: 'roteiro', kind: 'falha', detail: String(e).slice(0, 300) }) }

  // limpeza (sempre)
  if (id) {
  await page.goto(`pedido/${id}`)
  await page.getByRole('button', { name: 'Apagar pedido' }).click()
  const delReq = page.waitForResponse((r) => /\/api\/requests\/r-[^/]+\/delete/.test(r.url()), { timeout: 15_000 })
  await page.getByRole('alertdialog').getByRole('button', { name: 'Apagar pedido' }).click()
  await delReq.catch(() => out.findings.push({ screen: 'limpeza', kind: 'falha', detail: 'pedido não apagado' }))
  }
  await page.goto('perfil/')
  await page.getByText('Apagar meus dados').click()
  const del = page.waitForResponse((r) => r.url().includes('/api/me/delete'), { timeout: 15_000 })
  await page.getByRole('alertdialog').getByRole('button', { name: 'Apagar tudo' }).click()
  await del.catch(() => out.findings.push({ screen: 'limpeza', kind: 'falha', detail: 'perfil não apagado' }))

  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/${device}.json`, JSON.stringify(out, null, 1))
})
