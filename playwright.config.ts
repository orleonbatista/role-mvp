import { defineConfig, devices } from '@playwright/test'

// E2E das jornadas principais contra o site publicado (ou E2E_BASE_URL). Cria dados de teste marcados "[E2E]" e apaga no fim.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'https://orleonbatista.github.io/role-mvp/', ...devices['Pixel 7'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure' },
})
