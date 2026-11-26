# 10 · Plano de uso do Google Places

Status: **implementado (26/11/2026)**: opção A + base regional por localização/CEP. Preços da tabela global do Google Maps Platform (nov/2026), câmbio de
referência R$ 5,50.

## 1. Custo nas fases

| Fase | Usuários ativos/mês | Google por mês |
|---|---|---|
| Teste (amigos, fundadores) | até ~600 | **R$ 0** (dentro da franquia grátis) |
| Começo | ~1.000 | ~R$ 550 |
| Lucro de R$ 20 mil (cenário base) | ~5.000 | ~R$ 5.700 |

Franquia grátis mensal por SKU: Place Details Pro 5.000; Text Search Pro 5.000; Place Details Enterprise 1.000;
Enterprise + Atmosphere 1.000; Photos 1.000. **A foto é a primeira a estourar** (~125 usuários com 8 fichas cada).

## 2. Estratégia de armazenamento

### Opção A, recomendada: ao vivo desde o início, gastando pouco
- Guardar só o que os termos permitem: `place_id` (sem prazo) e lat/lng (30 dias, a expiração já existe).
- Buscar o Google **só ao abrir a ficha**, nunca nos cards das listas.
- Uma foto por ficha, no tamanho da tela (`maxWidthPx=800`).
- Aproveitar o cache HTTP normal do navegador e o limite diário por aparelho, como na busca.
- Ficha do Google **só para lugares sem foto ou dado próprio**: o custo cai à medida que o acervo da comunidade e das casas cresce.
- Manter as cotas diárias no console como trava.

### Opção B (salvar o conteúdo do Google e virar ao vivo depois): **não implementada**
O Orleon pediu essa opção em 26/11/2026, mas ela não foi implementada:
- **Termos:** guardar foto, nota, avaliação ou horário, inclusive reescritos pela LLM, viola os termos do Google. As fotos ainda têm direito autoral de quem tirou. Não cabe a nós dispensar essa regra.
- **Economia:** quase nenhuma. Com cerca de 1.000 usuários, são ~R$ 550/mês.
- **O que resolve o custo no lugar dela:**
  - **Base regional própria (OpenStreetMap, ODbL):** pode ser guardada à vontade e cobre a IA, o feed de lacunas e a busca.
  - **Google ao vivo:** só na ficha, com o `place_id` guardado.

### Base regional (implementada)
- **Cadastro:** no passo do nome, "Usar minha localização" (GPS) ou CEP. Escolher um bairro da lista continua como alternativa.
- **Privacidade:** guardamos só a região arredondada a ~1 km. O CEP e o endereço não são salvos.
- **CEP:** BrasilAPI/ViaCEP dão rua e bairro; o Nominatim (OSM) converte em coordenada. A BrasilAPI costuma devolver o centro da cidade, por isso fica por último. O GPS passa por geocodificação reversa no Nominatim (máx. 1 req/s, com User-Agent) pra obter o nome do bairro.
- **Carga:** o gateway (`POST /api/base/load`) consulta o Overpass num raio de 5 km, uma vez por célula de ~2 km, e grava no SQLite do PC (`base_places`, `base_areas`). A célula vale 30 dias, e quem mora perto aproveita a carga de quem chegou antes.
- **No app:** `GET /api/base/near` devolve os lugares num raio de 5 km. O "Pra você" mostra primeiro os curados; enquanto houver menos de 6, completa com lugares da base num raio de 5 km que batem com o gosto, marcados "sem curadoria". O app registra como camada base e o bairro novo entra no cálculo de distância. O cadastro espera até 12 s pela carga; se demorar mais, segue em segundo plano e atualiza o feed ao terminar.
- **Gosto:** a base traz todos os bares, restaurantes e baladas da região. O gosto ordena e filtra no app (ranker, "falta curar" do fundador).
- **OSM → Google:** a tabela `gmatch` liga o lugar do OSM ao `place_id`. A ligação é descoberta pela Text Search "IDs only", que não tem custo.

## 3. O que o Google retorna e o que usar na experiência

A SKU cobrada é a do campo mais caro pedido no field mask, então a escolha dos campos define o custo.

| Campo | SKU | Usar? | Como |
|---|---|---|---|
| `businessStatus` (fechado temporária ou definitivamente) | Pro | **Sim, prioridade 1** | Esconder lugar fechado da base e da IA. Evita mandar grupo pra porta fechada |
| `photos` (1ª foto + crédito do autor) | Photos | **Sim** | Só na ficha, quando não há foto própria. Crédito do autor é obrigatório |
| `googleMapsUri` | Pro | Sim | Botão "Abrir no Maps" (hoje montado pelo `place_id`) |
| `formattedAddress`, `location` | Pro | Sim | Endereço na ficha + mapa |
| **Mapa embutido** (Maps Embed API, sem custo) | grátis | **Sim** | Mapa pequeno na ficha pelo `place_id`. Ajuda o grupo a combinar ponto de encontro |
| `currentOpeningHours` / `regularOpeningHours` | Enterprise | **Sim** | Volta o "aberto sexta às 22h" **só com dado do Google ao vivo**, e entra no encaixe da IA na hora da ficha |
| `rating` + `userRatingCount` | Enterprise | Sim, discreto | "Google 4,6 (1,2 mil)" pequeno e separado da nota da comunidade. Dá confiança, sem competir com a curadoria |
| `nationalPhoneNumber` | Enterprise | Sim | "Ligar pra reservar" em pedidos de grupo e aniversário |
| `websiteUri` | Enterprise | Talvez | Só se o OSM não tiver |
| `priceLevel` / `priceRange` | Enterprise | Talvez | Só pra lugares sem faixa da comunidade |
| `goodForGroups`, `reservable`, `liveMusic`, `outdoorSeating`, `servesCocktails`, `allowsDogs`, `goodForChildren` | Atmosphere | **Sim, só na ficha** | Selinhos "bom pra grupo · reserva · ao vivo". Ao indicar, aparecem como **sugestão ao curador**, que confirma ou não; o que fica salvo é a resposta do curador |
| `reviews` (até 5) | Atmosphere | **Não** | Concorre com a voz da comunidade e é caro. No máximo um link "ver avaliações no Google" |
| `reviewSummary` / `generativeSummary` (resumo por IA do Google) | Atmosphere | Não | Mesmo motivo; e a IA do rolê precisa falar com base na comunidade |
| `editorialSummary` | Atmosphere | Não | Pouco preenchido em SP; a descrição deve ser da comunidade ou da IA sobre dados próprios |
| `accessibilityOptions`, `parkingOptions`, `paymentOptions` | Pro/Enterprise | Talvez, fase B | Filtros úteis, mas secundários |
| `types` / `primaryType` | Pro | Sim, internamente | Mapear pro estilo do rolê ao indicar (já fazemos) |

## 4. Field masks propostos

- **Busca** (indicar/sugerir), Text Search Pro:
  `id, displayName, formattedAddress, location, types, businessStatus`.
  Nada de foto nem nota na lista.
- **Ficha básica**, Details Enterprise (US$ 20 por mil, 1.000 grátis):
  `businessStatus, googleMapsUri, formattedAddress, location, currentOpeningHours, rating, userRatingCount, nationalPhoneNumber, photos`.
  Mais 1 chamada de Photos (US$ 7 por mil).
- **Ficha de pedido de grupo**, Enterprise + Atmosphere (US$ 25 por mil):
  a básica + `goodForGroups, reservable, liveMusic, outdoorSeating`.
  Só quando o pedido é de grupo ou aniversário.
- **Mapa:** Maps Embed por `place_id`, sem chamada à Places API.

## 5. Ordem de implementação
1. ✅ `businessStatus` na busca (fechados definitivamente saem) e aviso de fechado na ficha.
2. ✅ Ficha ao vivo (`src/features/GoogleLive.tsx`): foto + crédito, aberto agora, horário de hoje e da semana, nota discreta, telefone, mapa embutido (ativo quando a Maps Embed API estiver liberada na chave: `VITE_MAPS_EMBED=1`). Só em memória; guarda de 25 fichas/dia por aparelho.
3. ✅ Atmosphere só em pedido de grupo (≥ 6 pessoas ou aniversário → `/lugar/:id?grupo=1`). ⏭ Sugestões pro curador no `/indicar`.
4. ⏭ Prioridade de foto: casa/comunidade → embed do Instagram → Google → ícone do estilo.
5. ⏭ Métrica de custo em `/testes`: chamadas por SKU no mês × preço, contra a franquia.
