import { describe, expect, it } from 'vitest';
import { metadataBody, uploadedOffset, validateMetadata, videoTitleError } from './upload';

describe('YouTube upload protocol', () => {
  it('sends only requested metadata, with an explicit kids classification', () => {
    expect(metadataBody({ title: 'Canção', visibility: 'public', madeForKids: false })).toEqual({
      snippet: { title: 'Canção', categoryId: '10' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    });
  });
  it('rejects titles YouTube cannot accept instead of silently rewriting them', () => {
    for (const title of ['', '<Song>', 'a'.repeat(101)]) {
      expect(() => validateMetadata({ title, visibility: 'public', madeForKids: false })).toThrow();
    }
    expect(() => validateMetadata({ title: 'Canção', visibility: 'public', madeForKids: false })).not.toThrow();
  });
  it('accepts independent listing metadata and counts Unicode characters', () => {
    const title = 'My Love | Música Autoral | Sample Artist';
    expect(videoTitleError(title)).toBeUndefined();
    expect(metadataBody({ title, visibility: 'public', madeForKids: false }).snippet.title).toBe(title);
    expect(videoTitleError('🎵'.repeat(100))).toBeUndefined();
    expect(videoTitleError('🎵'.repeat(101))).toContain('100');
    expect(videoTitleError('   ')).toContain('enter');
    expect(videoTitleError('My <Love>')).toContain('cannot include');
  });
  it('uses the next byte after the server-confirmed range', () => {
    expect(uploadedOffset('bytes=0-8388607')).toBe(8388608);
    expect(uploadedOffset(null)).toBe(0);
    expect(() => uploadedOffset('bytes=4-8')).toThrow();
  });
});
