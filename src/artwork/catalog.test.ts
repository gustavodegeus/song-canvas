import { describe, expect, it } from 'vitest';
import { categories, metadata, motifIds, searchMotifs } from './catalog';
import { motifs } from './motifs';

describe('drawing catalog', () => {
  it('has exactly 24 distinct illustrations with complete metadata', () => {
    expect(motifIds).toHaveLength(24);
    expect(new Set(motifIds.map(id => motifs[id].label)).size).toBe(24);
    for (const id of motifIds) {
      expect(categories[metadata[id].category]).toBeTruthy();
      expect(metadata[id].keywords.length).toBeGreaterThan(20);
      expect(motifs[id].svg).toContain('viewBox="0 0 600 360"');
      expect(motifs[id].svg).not.toMatch(/<script|<image|<foreignObject|\bon\w+\s*=|\b(?:href|src)\s*=/i);
    }
  });
  it('finds soccer in either language', () => {
    for (const query of ['soccer', 'football', 'futebol', 'bola', 'gol']) {
      expect(searchMotifs(query)).toContain('soccer');
    }
  });
  it('ignores case and accents, including combining accents', () => {
    for (const query of ['CORAÇÃO', 'coracao', 'corac\u0327a\u0303o']) expect(searchMotifs(query)).toContain('heart');
    expect(searchMotifs('VIOLÃO')).toEqual(['guitar']);
    expect(searchMotifs('bússola')).toEqual(['compass']);
    expect(searchMotifs('pássaro')).toContain('birds');
  });
  it('combines category and all search tokens', () => {
    expect(searchMotifs('acoustic serenade', 'music')).toEqual(['guitar']);
    expect(searchMotifs('soccer', 'nature')).toEqual([]);
    expect(searchMotifs('', 'music')).toEqual(['drums', 'dance', 'guitar', 'vinyl']);
    expect(searchMotifs('   ')).toEqual(motifIds);
    expect(searchMotifs('<script>')).toEqual([]);
  });
});
