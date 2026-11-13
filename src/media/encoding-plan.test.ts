import { describe, expect, it } from 'vitest';
import { artworkCommand, assembleCommand, templateFrames } from './encoding-plan';

describe('static-artwork video plan', () => {
  it('bounds video encoding at two seconds, regardless of song length', () => {
    expect(templateFrames(0.01)).toBe(1);
    expect(templateFrames(0.5)).toBe(12);
    expect(templateFrames(1.01)).toBe(25);
    for (const duration of [2, 20.37, 216, 600]) expect(templateFrames(duration)).toBe(48);
    for (const invalid of [0, -1, NaN, Infinity]) expect(() => templateFrames(invalid)).toThrow();
  });
  it('makes an independently decodable, full-HD-compatible H.264 loop', () => {
    const args = artworkCommand(48);
    expect(args).toContain('yuv420p');
    expect(args.slice(args.indexOf('-bf'), args.indexOf('-bf') + 2)).toEqual(['-bf', '0']);
    expect(args).toContain('open-gop=0');
    expect(args.slice(args.indexOf('-g'), args.indexOf('-g') + 2)).toEqual(['-g', '48']);
  });
  it('copies video and processes the original audio once without duration cuts', () => {
    const args = assembleCommand();
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 2)).toEqual(['-c:v', 'copy']);
    expect(args).toContain('-shortest');
    expect(args).toContain('+faststart');
    expect(args).toContain('audio.mp3');
    expect(args).not.toContain('-t');
    expect(args).not.toContain('-ss');
    expect(args).not.toContain('-af');
  });
});
