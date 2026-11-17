import type { Niche, Occasion, OpenPeriod, Place, PlaceKind, Tag, Vibe } from '../../lib/types'
import { defaultPeriods, hoursLabel } from '../../lib/hours'

// Lugares fictícios em bairros reais de SP — tudo mock.
type Row = [
  id: string, name: string, kind: PlaceKind, hood: string,
  niches: Niche[], vibes: Vibe[], occasions: Occasion[],
  price: number, capacity: number, rating: number, hue: number,
  tagline: string, highlights: string[], when?: string,
]

const rows: Row[] = [
  ['sala-grave', 'Sala Grave', 'bar', 'Pinheiros', ['listening', 'drinks'], ['tranquilo', 'intimista', 'sofisticado'], ['date', 'solo', 'amigos'], 90, 8, 9.1, 28,
    'Caixas valvuladas, vinil e silêncio respeitado.', ['par de caixas Klipsch dos anos 70', 'drink de jabuticaba defumado', 'som baixo o suficiente pra conversar']],
  ['disco-lento', 'Disco Lento', 'bar', 'Santa Cecília', ['listening', 'jazz'], ['intimista', 'descolado'], ['date', 'amigos', 'solo'], 70, 10, 8.7, 268,
    'Jazz japonês, MPB rara e balcão de 12 lugares.', ['curadoria de vinis de jazz japonês', 'balcão onde o DJ conversa com você', 'quarta de MPB rara']],
  ['agulha-vinil', 'Agulha & Vinil', 'bar', 'Vila Madalena', ['listening', 'drinks'], ['descolado', 'tranquilo'], ['amigos', 'date', 'aniversario'], 80, 16, 8.4, 330,
    'Listening bar com mezanino reservável.', ['mezanino reservável pra grupo', 'noite de discos dos clientes às terças', 'carta de saquê']],
  ['hifi-club', 'Hi-Fi Club', 'bar', 'Consolação', ['listening', 'eletronica'], ['underground', 'intimista'], ['solo', 'amigos'], 60, 12, 8.9, 190,
    'Ambient, deep house e sistema de som absurdo.', ['sistema de som montado à mão', 'sets de ambient até 1h', 'chopp artesanal da casa']],
  ['estudio-33', 'Estúdio 33', 'bar', 'Barra Funda', ['listening', 'jazz'], ['sofisticado'], ['date', 'trabalho'], 120, 20, 8.2, 45,
    'Antigo estúdio de gravação virou bar.', ['sala de gravação original com tratamento acústico', 'menu degustação de drinks', 'sessões ao vivo às quintas']],
  ['galpao-norte', 'Galpão Norte', 'balada', 'Barra Funda', ['eletronica'], ['underground', 'animado'], ['amigos', 'aniversario'], 80, 40, 9.0, 140,
    'Techno até o sol nascer num galpão de 1940.', ['line-up de techno nacional forte', 'área externa pra respirar', 'lista amiga pra aniversariante']],
  ['subsolo-404', 'Subsolo 404', 'balada', 'Centro', ['eletronica'], ['underground'], ['amigos', 'solo'], 60, 25, 8.8, 300,
    'Porão escuro, house e zero celular na pista.', ['política de celular fora da pista', 'house e disco de madrugada', 'público que vai pra dançar']],
  ['lume', 'Lume', 'balada', 'Pinheiros', ['eletronica', 'drinks'], ['descolado', 'animado'], ['aniversario', 'amigos'], 100, 30, 8.1, 320,
    'Pista iluminada, bar de drinks e camarote pequeno.', ['camarote pra até 30 pessoas', 'drinks autorais na pista', 'open format depois das 2h']],
  ['pista-fria', 'Pista Fria', 'balada', 'Mooca', ['eletronica'], ['raiz', 'animado'], ['amigos'], 50, 20, 7.9, 200,
    'Antiga fábrica de gelo, festa de bairro com DJ bom.', ['ingresso barato', 'DJs da zona leste', 'pista que lota depois da meia-noite']],
  ['seu-tiao', 'Bar do Seu Tião', 'bar', 'Vila Mariana', ['boteco'], ['raiz', 'animado'], ['amigos', 'aniversario', 'trabalho'], 55, 30, 8.9, 18,
    'Torresmo de rolo e chopp no capricho desde 1987.', ['torresmo de rolo', 'bolinho de bacalhau que esgota', 'mesas na calçada pra grupo grande']],
  ['pe-sujo-primavera', 'Pé-Sujo Primavera', 'bar', 'Bixiga', ['boteco'], ['raiz'], ['amigos', 'solo'], 40, 15, 8.5, 10,
    'Pé-sujo honesto, samba no rádio e caldinho.', ['caldinho de feijão', 'cerveja sempre trincando', 'samba de domingo à tarde']],
  ['copo-lagoinha', 'Empório Copo Lagoinha', 'bar', 'Mooca', ['boteco', 'gastronomia'], ['raiz', 'tranquilo'], ['amigos', 'date'], 65, 12, 8.7, 35,
    'Empório-bar com acepipes de vó e cachaças raras.', ['tábua de acepipes da casa', 'mais de 80 cachaças', 'linguiça artesanal da Mooca']],
  ['acepipe-bar', 'Acepipe Bar', 'bar', 'Pinheiros', ['boteco', 'drinks'], ['descolado', 'animado'], ['aniversario', 'amigos', 'trabalho'], 85, 35, 8.3, 15,
    'Boteco repaginado com área pra grupo.', ['salão dos fundos reservável', 'menu de acepipes pra dividir', 'bolo do aniversariante liberado']],
  ['botequim-liberdade', 'Botequim Liberdade', 'bar', 'Liberdade', ['boteco'], ['raiz', 'animado'], ['amigos'], 45, 20, 8.0, 0,
    'Gyoza com chopp na esquina mais movimentada.', ['gyoza frito na hora', 'chopp a R$ 9 até as 20h', 'esquina pra ver o movimento']],
  ['brasa-miuda', 'Brasa Miúda', 'restaurante', 'Pinheiros', ['gastronomia'], ['descolado', 'intimista'], ['date', 'amigos'], 150, 10, 9.2, 12,
    'Cozinha de fogo, balcão pra 14 e menu curto.', ['balcão de frente pra brasa', 'menu muda toda semana', 'vinhos naturais em taça']],
  ['cozinha-da-vila', 'Cozinha da Vila', 'restaurante', 'Vila Madalena', ['gastronomia'], ['tranquilo'], ['aniversario', 'amigos', 'trabalho'], 110, 30, 8.4, 95,
    'Casarão com quintal e mesa comunitária.', ['mesa comunitária pra 30', 'menu fechado pra grupos', 'quintal com árvore centenária']],
  ['omakase-kaze', 'Omakase Kaze', 'restaurante', 'Liberdade', ['gastronomia'], ['sofisticado', 'intimista'], ['date'], 380, 6, 9.4, 350,
    'Oito lugares, dezoito tempos, um chef.', ['só 8 lugares', '18 tempos sazonais', 'saquês harmonizados']],
  ['nonna-lu', 'Cantina Nonna Lu', 'restaurante', 'Bixiga', ['gastronomia'], ['raiz', 'animado'], ['aniversario', 'amigos'], 95, 50, 8.6, 5,
    'Cantina de família, porção que serve três.', ['salão pra 50 pessoas', 'parabéns cantado pelos garçons', 'fogazza de sobremesa']],
  ['feira-fina', 'Feira Fina', 'restaurante', 'Itaim', ['gastronomia', 'drinks'], ['sofisticado', 'animado'], ['trabalho', 'aniversario'], 180, 25, 8.1, 160,
    'Food hall premium com bar central.', ['estações de chefs convidados', 'bar central com coquetelaria', 'área privativa pra empresas']],
  ['terraco-ambar', 'Terraço Âmbar', 'bar', 'Consolação', ['drinks', 'ao-ar-livre'], ['sofisticado', 'animado'], ['aniversario', 'date', 'trabalho'], 140, 30, 8.5, 38,
    'Rooftop com o pôr do sol da Paulista.', ['pôr do sol de frente pra Paulista', 'área reservável pra 30', 'DJ de sexta a domingo']],
  ['coquetelaria-norte', 'Coquetelaria Norte', 'bar', 'Santa Cecília', ['drinks'], ['intimista', 'descolado'], ['date', 'amigos'], 95, 10, 9.0, 280,
    'Coquetéis com ingredientes amazônicos.', ['drink de cumaru e cacau', 'bartenders que explicam cada copo', 'luz baixa e jazz']],
  ['laje-22', 'Laje 22', 'bar', 'Vila Madalena', ['drinks', 'ao-ar-livre'], ['animado', 'descolado'], ['aniversario', 'amigos', 'esquenta'], 70, 40, 8.2, 50,
    'Laje com vista, drinks de jarra e DJ no fim de tarde.', ['drinks de jarra pra dividir', 'laje inteira reservável', 'DJ no fim de tarde']],
  ['clandestino-5', 'Bar Clandestino Nº5', 'bar', 'Centro', ['drinks', 'jazz'], ['intimista', 'underground'], ['date', 'solo'], 110, 8, 9.1, 260,
    'Senha na porta, trio de jazz na sala dos fundos.', ['entrada por senha (muda toda semana)', 'trio de jazz às sextas', 'só 30 lugares']],
  ['porao-do-sax', 'Porão do Sax', 'bar', 'Bixiga', ['jazz'], ['intimista', 'raiz'], ['date', 'amigos', 'solo'], 75, 14, 8.8, 225,
    'Jam session no porão há 30 anos.', ['jam aberta às quartas', 'couvert justo', 'porão de pedra original']],
  ['nota-azul', 'Nota Azul', 'bar', 'Itaim', ['jazz', 'drinks'], ['sofisticado'], ['date', 'trabalho'], 160, 18, 8.3, 215,
    'Jazz club elegante com mesas numeradas.', ['mesas numeradas com reserva', 'quartetos convidados', 'carta de uísques']],
  ['quintal-amarelo', 'Quintal Amarelo', 'bar', 'Vila Mariana', ['ao-ar-livre', 'boteco'], ['tranquilo', 'raiz'], ['aniversario', 'amigos', 'solo'], 60, 40, 8.6, 48,
    'Quintal enorme, pet friendly e petisco caseiro.', ['quintal pra 40 pessoas', 'pet friendly', 'reserva de área sem taxa']],
  ['praca-viva', 'Praça Viva', 'bar', 'Barra Funda', ['ao-ar-livre', 'eletronica'], ['animado', 'descolado'], ['amigos', 'esquenta'], 45, 50, 8.0, 120,
    'Day party de domingo com food trucks.', ['day party aos domingos', 'food trucks rotativos', 'entrada gratuita até 15h']],
  ['vinhoteca-sete', 'Vinhoteca Sete', 'bar', 'Pinheiros', ['drinks', 'gastronomia'], ['intimista', 'tranquilo'], ['date', 'amigos'], 120, 10, 8.9, 340,
    'Vinho natural em taça e queijos da Canastra.', ['40 rótulos em taça', 'tábua da Canastra', 'sommelier sem pose']],
  ['karaoke-neon', 'Karaokê Neon', 'bar', 'Liberdade', ['drinks'], ['animado'], ['aniversario', 'amigos', 'esquenta'], 70, 30, 8.4, 305,
    'Salas privativas de karaokê com neon.', ['salas privativas pra 8 a 30', 'catálogo com sertanejo e K-pop', 'combo aniversariante']],
  ['cafe-silencio', 'Café-Bar Silêncio', 'bar', 'Centro', ['listening', 'drinks'], ['tranquilo'], ['solo', 'trabalho', 'date'], 55, 8, 8.6, 170,
    'Café de dia, listening bar à noite.', ['café de dia, vinil à noite', 'mesas pra trabalhar até 18h', 'regra: fala baixo']],
  ['sobrado-club', 'Sobrado Club', 'balada', 'Consolação', ['eletronica', 'drinks'], ['animado', 'descolado'], ['aniversario', 'amigos'], 90, 60, 7.8, 290,
    'Três andares, três pistas.', ['três pistas com estilos diferentes', 'lista de aniversário com bônus', 'terraço pra fumantes']],
  ['ev-domingo-vinil', 'Domingo no Vinil', 'evento', 'Santa Cecília', ['listening', 'ao-ar-livre'], ['tranquilo'], ['amigos', 'solo'], 0, 100, 8.7, 75,
    'Feira de discos com DJ na praça.', ['feira de discos', 'DJ tocando só vinil', 'grátis'], 'Dom, 14h'],
  ['ev-jazz-laje', 'Jazz na Laje', 'evento', 'Vila Madalena', ['jazz', 'ao-ar-livre'], ['tranquilo', 'descolado'], ['date', 'amigos'], 50, 60, 8.5, 230,
    'Quarteto no pôr do sol da Laje 22.', ['quarteto ao vivo', 'pôr do sol', 'drinks de jarra'], 'Sex, 19h'],
  ['ev-noite-modular', 'Noite Modular', 'evento', 'Barra Funda', ['eletronica'], ['underground'], ['amigos', 'solo'], 90, 200, 8.9, 150,
    'Live sets com sintetizadores modulares.', ['live set 100% modular', 'line-up de 6 artistas', 'galpão com som imersivo'], 'Sáb, 23h'],
  ['ev-festival-torresmo', 'Festival do Torresmo', 'evento', 'Mooca', ['boteco', 'gastronomia'], ['raiz', 'animado'], ['amigos', 'aniversario'], 30, 300, 8.3, 25,
    '20 botecos disputando o melhor torresmo.', ['20 botecos competindo', 'roda de samba', 'voto do público'], 'Sáb, 12h'],
]

const TAGS: Record<string, Tag[]> = {
  'brasa-miuda': ['vegano'], 'cozinha-da-vila': ['vegano', 'acessivel'], 'feira-fina': ['vegano', 'acessivel'],
  'pe-sujo-primavera': ['samba'], 'ev-festival-torresmo': ['samba', 'acessivel'], 'quintal-amarelo': ['pet', 'acessivel'],
  'praca-viva': ['pet'], 'karaoke-neon': ['karaoke'], 'nonna-lu': ['acessivel'], 'terraco-ambar': ['acessivel'],
  'seu-tiao': ['samba'], 'vinhoteca-sete': ['vegano'],
}

const PERIODS: Record<string, OpenPeriod[]> = {
  'cafe-silencio': [{ days: [2, 3, 4, 5, 6], open: 9, close: 24 }],
  'praca-viva': [{ days: [0], open: 12, close: 20 }],
  'quintal-amarelo': [{ days: [3, 4, 5, 6, 0], open: 16, close: 24 }],
  'seu-tiao': [{ days: [1, 2, 3, 4, 5, 6], open: 17, close: 24 }],
  'pe-sujo-primavera': [{ days: [1, 2, 3, 4, 5, 6, 0], open: 11, close: 23 }],
  'botequim-liberdade': [{ days: [1, 2, 3, 4, 5, 6], open: 16, close: 24 }],
  'copo-lagoinha': [{ days: [2, 3, 4, 5, 6], open: 12, close: 23 }],
  'omakase-kaze': [{ days: [3, 4, 5, 6], open: 19, close: 23 }],
  'porao-do-sax': [{ days: [3, 4, 5, 6], open: 20, close: 26 }],
  'clandestino-5': [{ days: [4, 5, 6], open: 20, close: 27 }],
}

const DAY_IDX: Record<string, number> = { Dom: 0, Seg: 1, Ter: 2, Qua: 3, Qui: 4, Sex: 5, Sáb: 6 }
const PRIVATE_RE = /reserv|salão|camarote|mezanino|privativ|menu fechado|mesa comunitária|laje inteira|área pra|quintal pra|salas/i

export const places: Place[] = rows.map(
  ([id, name, kind, hood, niches, vibes, occasions, price, capacity, rating, hue, tagline, highlights, when]) => {
    let periods = PERIODS[id] ?? defaultPeriods(kind)
    if (kind === 'evento' && when) {
      const [d, h] = when.split(', ')
      const start = Number(h.replace('h', ''))
      periods = [{ days: [DAY_IDX[d]], open: start, close: start + 6 }]
    }
    return {
      id, name, kind, hood, niches, vibes, occasions, price, capacity, rating, hue, tagline, highlights, when,
      ratingCount: 40 + ((id.length * 37 + hue) % 260),
      description: `${tagline} ${highlights[0][0].toUpperCase()}${highlights[0].slice(1)}, ${highlights[1]} e ${highlights[2]}.`,
      address: `${hood}, São Paulo`,
      hours: kind === 'evento' ? (when ?? '') : hoursLabel(periods),
      tags: TAGS[id] ?? [],
      privateSpace: kind !== 'evento' && highlights.some((h) => PRIVATE_RE.test(h)),
      periods,
    }
  },
)

export const placeById = new Map(places.map((p) => [p.id, p]))
