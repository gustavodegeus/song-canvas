import { motifs, type Motif } from './motifs';

export const categories = {
  all: 'All themes',
  love: 'Love & connection',
  nature: 'Nature & skies',
  journeys: 'Journeys & discovery',
  music: 'Music & rhythm',
  peace: 'Peace & growth',
  places: 'Home & Bahia',
  life: 'Life & play',
} as const;
export type Category = keyof typeof categories;
interface SearchMetadata { category: Exclude<Category, 'all'>; keywords: string }

// Explicit metadata makes every illustration discoverable in English/Portuguese.
// Search is entirely local; no query or song information is sent to a service.
export const metadata = {
  heart: { category: 'love', keywords: 'heart love connection romance coracao coração amor carinho conexão paixão' },
  drums: { category: 'music', keywords: 'drum drums percussion swing samba rhythm tambor tambores percussao percussão ritmo musica música' },
  mountains: { category: 'journeys', keywords: 'mountain courage adventure montanha montanhas coragem aventura hiking trilha' },
  stones: { category: 'peace', keywords: 'stones balance peace zen meditation pedras equilibrio equilíbrio paz calma meditação' },
  chains: { category: 'peace', keywords: 'chains freedom release liberation corrente correntes liberdade libertacao libertação superar' },
  beach: { category: 'nature', keywords: 'beach sunshine sun ocean palms praia sol mar oceano coqueiro palmeira alegria verão verao' },
  traveler: { category: 'journeys', keywords: 'traveler traveller road discovery travel journey viajante estrada caminho descoberta viagem jornada' },
  bahia: { category: 'places', keywords: 'bahia belonging architecture salvador pelourinho city town arquitetura cidade pertencimento brasil' },
  soccer: { category: 'life', keywords: 'soccer football ball sport futebol bola esporte paixão paixao jogo campo gol goal' },
  moon: { category: 'nature', keywords: 'moon stars night wonder dream lua estrela estrelas noite sonho sonhos luar ceu céu' },
  birds: { category: 'nature', keywords: 'bird birds dove beginnings freedom passaro pássaro passaros pássaros pomba ave aves recomeço renascimento' },
  flowers: { category: 'nature', keywords: 'flower flowers bouquet gratitude flor flores buque buquê gratidao gratidão presente primavera' },
  roots: { category: 'peace', keywords: 'roots growth tree sprout raiz raizes raízes crescimento arvore árvore broto origem esperança' },
  rain: { category: 'nature', keywords: 'rain umbrella renewal rainy chuva guarda-chuva renovacao renovação tempestade agua água' },
  butterfly: { category: 'nature', keywords: 'butterfly change transformation borboleta mudanca mudança transformacao transformação metamorfose' },
  compass: { category: 'journeys', keywords: 'compass direction north explore bussola bússola direcao direção norte destino rumo' },
  sailboat: { category: 'journeys', keywords: 'sail sailing sailboat boat horizon sea vela veleiro barco navegar horizonte mar vento' },
  coffee: { category: 'life', keywords: 'coffee slow morning cup cafe café manha manhã xicara xícara pausa cotidiano aconchego' },
  dance: { category: 'music', keywords: 'dance dancing joy dancer samba danca dança dançar dancar alegria festa baile movimento' },
  friendship: { category: 'love', keywords: 'friendship together friends handshake friend amizade amigos amigo amiga união uniao parceria juntos mãos maos' },
  home: { category: 'places', keywords: 'home house comfort family casa lar conforto familia família saudade acolhimento' },
  guitar: { category: 'music', keywords: 'guitar acoustic serenade song violao violão serenata cancao canção musica música cordas bossa' },
  vinyl: { category: 'music', keywords: 'vinyl record memories nostalgia disco vinil memoria memória memorias memórias saudade recordação' },
  lighthouse: { category: 'places', keywords: 'lighthouse hope coast light farol esperança esperanca costa luz porto guia bahia mar' },
} as const satisfies Record<Motif, SearchMetadata>;

export const motifIds = Object.keys(motifs) as Motif[];
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
const searchIndex = Object.fromEntries(motifIds.map(id => [id, normalizeSearch(
  `${motifs[id].label} ${metadata[id].keywords} ${categories[metadata[id].category]}`,
)])) as Record<Motif, string>;

export function searchMotifs(query = '', category: Category = 'all'): Motif[] {
  const tokens = normalizeSearch(query).split(/\s+/u).filter(Boolean);
  return motifIds.filter(id => (category === 'all' || metadata[id].category === category)
    && tokens.every(token => searchIndex[id].includes(token)));
}
