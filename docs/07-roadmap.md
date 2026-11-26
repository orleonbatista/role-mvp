# 07 · Roadmap

Baseado no **plano comprimido** (3 fases em vez de 5). A ideia é pular a fase "comunidade manual"
usando IA ancorada em catálogo, link que circula no WhatsApp e conteúdo automático para as redes.
Cada fase só avança quando os critérios da anterior forem cumpridos.

## Onde estamos
**Fase A, semana ~6.** O produto mínimo com IA está no ar para testes com amigos:

- loop completo: pedido → IA → votação por link → fechar → avaliar;
- Story, sugestões, divulgação de eventos e curadoria;
- backend compartilhado e painel global.

---

## Fase A · Produto mínimo com IA (agora → +4 semanas)
**Objetivo:** provar que um grupo real usa o link pra decidir, e que quem vota vira organizador.

| Item | Status |
|---|---|
| Loop pedido → votação → fechar → avaliar | ✅ |
| LLM local + regras ancoradas | ✅ |
| Story/WhatsApp com preview, pedir sugestões, perguntar à IA | ✅ |
| Divulgação de eventos (@, bio, convite) + envio com curadoria | ✅ |
| Backend compartilhado (placar ao vivo, sugestão direta, curadoria que publica, métricas globais) | ✅ |
| Encaixe 100% no celular (zoom do iOS, overflow) | ✅ |
| Google Places (New) com cotas diárias abaixo da cota grátis | ✅ |
| Sugerir **qualquer** lugar (busca no Google Maps) | ✅ |
| Organizador também buscar no Google ao montar o pedido | ⏭ |
| Túnel com URL fixa (Cloudflare named tunnel + domínio) ou backend gerenciado | ⏭ |
| Duas camadas: curado (visível) + base real OSM (reserva da IA, "sem curadoria") | ✅ |
| Fictício só no modo demo (desligado por padrão) | ✅ |
| Convite da IA quando falta curadoria + modo curador fundador (`/indicar`, `/fundador`) | ✅ |
| Região por GPS/CEP + base regional OSM no banco do PC; Google ao vivo na ficha | ✅ |
| Usuários, avaliações da comunidade e turmas no banco; login com Google; aviso de privacidade e "apagar meus dados" | ✅ |
| Busca só Google, IA na nuvem (Gemini), escolha da IA com motivo, avisos no celular, mapa, fotos, editar/apagar | ✅ |
| Hospedar gateway + banco fora do PC (Cloudflare Workers + D1 ou Fly.io) e prévia do WhatsApp por votação | ⏭ precisa de conta |
| **Recrutar 5 a 10 curadores fundadores e curar 50 lugares em 2 ou 3 bairros** | ⏭ agora |
| Rodada de teste com 3 a 5 grupos reais | ⏭ depois da curadoria inicial |

**Critérios para avançar** (ver [métricas](06-metricas.md)):

- ≥ 50% dos pedidos compartilhados;
- ≥ 3 votantes por votação;
- ≥ 40% das votações fecham;
- ≥ 10% dos votantes criam o próprio pedido;
- pelo menos 1 divulgador traz grupos.

## Fase B · Comunidade e receita (meses 2 a 6)
**Objetivo:** curadores reais como camada de qualidade e a primeira receita vinda das casas.

- **Login leve:** link mágico por e-mail ou OTP por WhatsApp. Resolve homônimos, fechar de outro
  aparelho e editar/apagar.
- **Backend gerenciado:** Supabase (Postgres + auth + realtime) ou Cloudflare Workers + D1. O app já
  conversa com uma API, então a troca é de endereço e de autenticação. Faz backup, tira a
  dependência do PC e permite placar em tempo real sem polling.
- **Notificações:** Web Push com "chegaram 3 votos", "Bia sugeriu X" e "fechou!".
- **Curadores por nicho:** reputação (indicação que deu "amei" vale pontos), selo e fila de pedidos
  do nicho.
- **Lado das casas:**
  - perfil verificado;
  - "responder pedidos de grupo" (aniversário, firma) como lead;
  - **piloto grátis por 4 semanas** com 10 a 20 casas, medindo lead → reserva, e só depois cobrar.
- **Afiliação:** ingressos (Sympla/Shotgun) e reservas, quando houver parceria.
- **Moderação:** denúncia, curadoria com mais de uma pessoa e regras públicas.

**Critérios para avançar:**

- casas pagando de forma recorrente;
- retenção de 30 dias dos organizadores ≥ 25%;
- custo de infraestrutura coberto pela receita.

## Fase C · Escala (6 meses em diante)
- **Novas cidades:** catálogo semeado por IA + Places, um curador-âncora local e viajantes como ponte.
  Cada cidade precisa se pagar em 6 meses; se não, recua (lição da Timeleft).
- **App nativo:** Share to Instagram Stories nativo (sem sticker manual), push confiável e widgets.
- **Pacotes de grupo** negociados com margem (aniversário, firma) e **assinatura** para organizadores
  frequentes (benefícios em casas parceiras).
- **SaaS e dados para casas:** "o que o público do seu bairro pede e não encontra".
- **Parcerias com banco e cartão** (benefícios de dining/rolê). A Infatuation foi comprada pela JPMorgan
  por esse motivo.
- **Rolê com gente nova:** só com verificação de identidade e moderação.
- **Captação:** só aqui, se as métricas por cidade se sustentarem.

---

## Backlog priorizado (próximas entregas)

| # | Item | Fase | Esforço |
|---|---|---|---|
| 1 | Google Places também no fluxo do organizador (pedido e resultados) | A | M |
| 2 | Teste com grupos reais + leitura das métricas globais | A | P |
| 3 | URL fixa do túnel (named tunnel) para não editar o `llm.json` | A | P |
| 4 | Web Push (votos, sugestões, fechou) | B | M |
| 5 | Login leve + migração do backend para Supabase/D1 | B | G |
| 6 | Painel da casa (responder pedidos de grupo) | B | G |
| 7 | Editar e apagar pedido e evento | B | P |
| 8 | Reputação de curadores por nicho | B | M |
| 9 | Cadastro rico pela IA: ao se cadastrar, enriquecer os 20–30 lugares da base mais próximos e no gosto da pessoa (OSM + site do lugar + foto Mapillary), com descrição e tags pela IA, marcado "rascunho da IA" até alguém confirmar; foto da comunidade ao indicar (análise de vibe com modelo de visão); fotos no PC agora e no Cloudflare R2 depois. Nada do Google é guardado além do `place_id` | B | G |
