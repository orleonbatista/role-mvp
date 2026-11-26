# Sobe o gateway do rolê (IA + banco) e o túnel público, sem janela. Registrado como tarefa do Windows no login
# (tarefa "role-gateway"). Também dá pra rodar à mão:  powershell -ExecutionPolicy Bypass -File llm-gateway\start-role.ps1
# O endereço novo do túnel vai pra data\tunnel-url.txt e, se existir data\github-token.txt (token fine-grained com
# permissão Contents: write só no repo role-mvp), é publicado sozinho no llm.json do GitHub — o site passa a usar na hora.
$ErrorActionPreference = 'Continue'
$d = Split-Path -Parent $MyInvocation.MyCommand.Path
$data = Join-Path $d 'data'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$log = Join-Path $data 'start.log'
function Log($m) { Add-Content -Path $log -Value "[$(Get-Date -Format 'dd/MM HH:mm:ss')] $m" }
Log 'iniciando'

# espera a rede (no boot o Wi-Fi demora)
for ($i = 0; $i -lt 30; $i++) { if (Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet) { break }; Start-Sleep 2 }

# gateway: derruba o anterior (se houver) e sobe de novo
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
Start-Process node -ArgumentList 'server.mjs' -WorkingDirectory $d -WindowStyle Hidden -RedirectStandardOutput (Join-Path $data 'gateway.log') -RedirectStandardError (Join-Path $data 'gateway.err.log')
for ($i = 0; $i -lt 20; $i++) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/health -TimeoutSec 3 | Out-Null; break } catch { Start-Sleep 1 } }
Log 'gateway no ar'

# túnel: os nossos (iniciados por este script) saem; o de serviço do Windows, se existir, fica
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match '127\.0\.0\.1:8787' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
$tlog = Join-Path $data 'tunnel.log'
Remove-Item $tlog -ErrorAction SilentlyContinue
Start-Process cloudflared -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8787' -WindowStyle Hidden -RedirectStandardError $tlog
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep 1
  if (Test-Path $tlog) { $m = Select-String -Path $tlog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if ($m) { $url = $m.Matches[0].Value } }
}
if (-not $url) { Log 'túnel não respondeu'; exit 1 }
Set-Content -Path (Join-Path $data 'tunnel-url.txt') -Value $url
Log "túnel: $url"

# publica no llm.json do repositório (o site lê de lá)
$tokFile = Join-Path $data 'github-token.txt'
if (Test-Path $tokFile) {
  $tok = (Get-Content $tokFile -Raw).Trim()
  $api = 'https://api.github.com/repos/orleonbatista/role-mvp/contents/llm.json'
  $h = @{ Authorization = "Bearer $tok"; 'User-Agent' = 'role-gateway'; Accept = 'application/vnd.github+json' }
  try {
    $cur = Invoke-RestMethod -Uri $api -Headers $h
    $json = "{ `"enabled`": true, `"url`": `"$url`", `"model`": `"nuvem + qwen2.5:7b`", `"owner`": `"Orleon`" }`n"
    $body = @{ message = "llm.json: túnel novo (automático)"; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)); sha = $cur.sha } | ConvertTo-Json
    Invoke-RestMethod -Method Put -Uri $api -Headers $h -Body $body -ContentType 'application/json' | Out-Null
    Log 'llm.json publicado no GitHub'
  } catch { Log "falha ao publicar llm.json: $($_.Exception.Message)" }
} else { Log 'sem data\github-token.txt: atualize o llm.json à mão (ou peça ao Claude)' }
