import { describe, expect, it } from 'vitest';
import { checkDuration, formatDuration, inferTitle, safeFilename } from './audio';

describe('song input', () => {
  it('removes only the MP3 extension, preserving intended spelling', () => {
    expect(inferTitle('01_Minha Canção (final).MP3')).toBe('01_Minha Canção (final)');
    expect(inferTitle('my.mp3.song.mp3')).toBe('my.mp3.song');
  });
  it('keeps Unicode filenames safe', () => {
    expect(safeFilename('../Equilíbrio: verão?')).toBe('Equilíbrio verão');
    expect(safeFilename('???')).toBe('song');
  });
  it('enforces the ten-minute limit with only encoder-padding tolerance', () => {
    expect(() => checkDuration(600)).not.toThrow();
    for (const invalid of [0, NaN, Infinity, -1, 601]) expect(() => checkDuration(invalid)).toThrow();
  });
  it('formats durations simply', () => {
    expect(formatDuration(602.2)).toBe('10:02');
    expect(formatDuration(9)).toBe('0:09');
  });
});
