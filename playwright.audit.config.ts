import { defineConfig, devices } from '@playwright/test'

// Auditoria da due diligence (manual, pelo workflow "Auditoria"): todas as telas em 3 aparelhos.
// iPhone roda no WebKit (mesmo motor do Safari) pra pegar os problemas de área segura e layout do iOS.
const base = { actionTimeout: 10_000, navigationTimeout: 20_000, baseURL: process.env.E2E_BASE_URL ?? 'https://orleonbatista.github.io/role-mvp/', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }
export default defineConfig({
  testDir: 'auditoria',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], ...base } },
    { name: 'android-360', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 640 }, ...base } },
    { name: 'pequeno-320', use: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 }, ...base } },
  ],
})
