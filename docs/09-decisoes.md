# 09 · Decisões (registro)

Formato curto: **decisão**, **por quê**, **trade-off**.

1. **PWA em vez de app nativo.** Ninguém instala app pra votar num rolê: o link precisa abrir na hora.
   *Trade-off:* sem Share to Story nativo nem push confiável no iOS (vai pra fase C).
2. **API simulada com MSW dentro do app.** Permite construir o produto inteiro antes do backend, com o
   mesmo contrato HTTP. *Trade-off:* a lógica de negócio roda no cliente.
3. **Interceptar o fetch em vez de usar Service Worker.** O Service Worker falhava no navegador do app
   desktop e complicava o cache do Pages. *Trade-off:* nenhum relevante no MVP.
4. **Links autossuficientes (`#d=` comprimido).** A votação funciona sem backend e o fragmento não vai
   pra servidor nenhum. *Trade-off:* links de ~180 a 400 caracteres; o WhatsApp não aceita hyperlink
   com texto.
5. **Página `/v/` estática com tags OG.** O GitHub Pages responde 404 para rotas da SPA e o WhatsApp não
   mostra preview de 404. *Trade-off:* um redirect a mais (imperceptível).
6. **Ranker determinístico + LLM como refinamento, nunca como fonte.** Explicável, rápido e sem
   alucinação de lugar. O LLM só extrai critérios citando o trecho. *Trade-off:* a qualidade depende
   das regras e do catálogo.
7. **LLM local (qwen2.5:7b) atrás de gateway.** Custo zero e privacidade. A API do Ollama nunca fica
   exposta; há limite e fila de 1. *Trade-off:* depende do PC ligado.
8. **Backend no mesmo gateway, com `node:sqlite`.** Zero instalação, um arquivo, mesma URL do túnel.
   *Trade-off:* é para teste, sem backup automático, autenticação real nem alta disponibilidade.
9. **Offline-first com espelho opcional.** O app nunca quebra se o PC cair; com backend, sincroniza.
   *Trade-off:* duas fontes de verdade, resolvidas com regras simples: voto por aparelho e decisão só
   do autor.
10. **Identidade por aparelho + nome, sem login.** Fricção zero para votar. *Trade-off:* homônimos e
    fechar só no aparelho autor (login leve na fase B).
11. **Divulgação começa por "compartilhar" e envio com curadoria.** Protege a confiança: nada entra no
    feed sem passar pela curadoria. *Trade-off:* curadoria manual não escala (fase B: mais curadores).
12. **Critério de encaixe = top 5 em pedidos reais.** Mede se o evento serve à demanda que existe, não
    a um ideal. *Trade-off:* com poucos pedidos a métrica é ruidosa.
13. **Modo demo ligado por padrão, mas desligado na prática quando há placar ao vivo.** Mostra o produto
    vivo para quem testa sozinho sem poluir votações reais. *Trade-off:* testes com o backend fora do
    ar ainda simulam amigos.
