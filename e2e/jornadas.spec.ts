import { expect, test, type Page } from '@playwright/test'

/* Jornadas de ponta a ponta no celular: cadastro sem conta → pedido → resultados → votação (lugar, vários horários,
   horário alternativo) → detalhes do lugar → limpeza (apaga pedido e dados). Acessibilidade básica via papéis e nomes. */

async function onboard(page: Page) {
  await page.goto('./')
  await expect(page.getByText('O rolê certo,')).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: 'Começar' }).click()
  await page.getByRole('button', { name: /prefiro escolher um bairro/ }).click()
  await page.getByRole('button', { name: 'Pinheiros', exact: true }).click()
  await page.getByPlaceholder('Seu nome').fill('E2E Teste')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: /^Drinks/ }).click()
  await page.getByRole('checkbox').check()
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Montar meu feed' }).click()
  await expect(page.getByText('Pra onde')).toBeVisible({ timeout: 6000 })
  expect(Date.now() - t0, 'cadastro conclui sem esperar a busca de lugares').toBeLessThan(4000)
}

test('abertura mostra conteúdo rápido', async ({ page }) => {
  const t0 = Date.now()
  await page.goto('./')
  await expect(page.getByText('O rolê certo,').or(page.getByText('Pra onde'))).toBeVisible({ timeout: 5000 })
  expect(Date.now() - t0).toBeLessThan(5000)
})

test('rotas fixas respondem 200', async ({ request }) => {
  for (const r of ['perfil/', 'novo/', 'turmas/', 'privacidade/', 'v/']) {
    const res = await request.get(r)
    expect(res.status(), r).toBe(200)
  }
})

test('pedido → votação → limpeza', async ({ page }) => {
  await onboard(page)
  await page.getByText('Descreve o rolê que você quer…').click()
  await page.getByLabel('Descreva o rolê').fill('[E2E] drinks pra 4 pessoas sexta em Pinheiros até R$ 90')
  await page.getByRole('button', { name: 'Encontrar o rolê' }).click()
  await expect(page).toHaveURL(/\/pedido\/r-/, { timeout: 30_000 })
  await expect(page.getByText(/combina|alternativa/).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/% match/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Votar' }).click()
  await expect(page.getByText('Onde vai ser?')).toBeVisible()
  // votar num lugar (botão com nome acessível)
  await page.getByRole('button', { name: /^Votar em / }).first().click()
  // vários horários por pessoa
  const times = page.locator('section', { hasText: 'Quando?' }).getByRole('button').filter({ hasText: /votos?/ })
  await times.nth(0).click()
  await times.nth(1).click()
  await expect(times.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(times.nth(1)).toHaveAttribute('aria-pressed', 'true')
  // horário alternativo
  await page.getByRole('button', { name: 'Outro dia/horário' }).click()
  const d = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('Dia').fill(d)
  await page.getByRole('button', { name: 'Propor' }).click()
  await expect(page.getByText(/\d{2}\/\d{2} 20h/)).toBeVisible()
  // detalhes do lugar a partir da votação
  await page.getByRole('link', { name: /^Ver detalhes de / }).first().click()
  await expect(page).toHaveURL(/\/lugar\//)
  await expect(page.getByText('Reservar mesa')).toHaveCount(0)
  await page.goBack()

  // limpeza: apaga o pedido (confirmação no visual do app) e os dados do perfil
  const id = page.url().match(/r-[a-z0-9-]+/)![0]
  await page.goto(`pedido/${id}`)
  await page.getByRole('button', { name: 'Apagar pedido' }).click()
  const delReq = page.waitForResponse((r) => /\/api\/requests\/r-[^/]+\/delete/.test(r.url()), { timeout: 15_000 })
  await page.getByRole('alertdialog').getByRole('button', { name: 'Apagar pedido' }).click()
  expect((await delReq).ok(), 'pedido de teste apagado no servidor').toBeTruthy()
  await expect(page).toHaveURL(/role-mvp\/?$/)
  await page.goto('perfil/')
  await page.getByText('Apagar meus dados').click()
  const del = page.waitForResponse((r) => r.url().includes('/api/me/delete'), { timeout: 15_000 })
  await page.getByRole('alertdialog').getByRole('button', { name: 'Apagar tudo' }).click()
  expect((await del).ok(), 'perfil de teste apagado no servidor').toBeTruthy()
})
