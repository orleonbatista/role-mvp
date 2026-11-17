@echo off
REM Sobe o gateway do LLM e abre um túnel público (Cloudflare Quick Tunnel, sem conta).
REM Pré-requisitos: Ollama rodando com qwen2.5:7b, Node 22.18+ e cloudflared instalados.
REM O endereço https://....trycloudflare.com aparece abaixo: ele vai para o llm.json do repo
REM (o site publicado lê esse arquivo). Muda a cada vez que este script reinicia.
cd /d "%~dp0"
start "rolê LLM gateway" cmd /k node server.mjs
timeout /t 2 >nul
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8787
