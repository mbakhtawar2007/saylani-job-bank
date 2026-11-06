import { describe, expect, it } from 'vitest';
import { formatBytes, sniffFileType, validateFile, validateFileContent } from './validate-file';

const file = (name: string, type: string, size: number) => ({ name, type, size });

describe('validateFile', () => {
  const rules = { accept: ['application/pdf', 'image/*'], maxSizeBytes: 5 * 1024 * 1024 };

  it('accepts allowed types within size', () => {
    expect(validateFile(file('cv.pdf', 'application/pdf', 1000), rules)).toBeNull();
    expect(validateFile(file('cnic.jpg', 'image/jpeg', 1000), rules)).toBeNull();
  });

  it('rejects wrong type, oversize and empty files', () => {
    expect(validateFile(file('a.exe', 'application/x-msdownload', 10), rules)).toMatch(
      /not allowed/,
    );
    expect(validateFile(file('big.pdf', 'application/pdf', 6 * 1024 * 1024), rules)).toMatch(
      /larger than 5 MB/,
    );
    expect(validateFile(file('empty.pdf', 'application/pdf', 0), rules)).toMatch(/empty/);
  });
});

describe('formatBytes', () => {
  it.each([
    [500, '500 B'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5 MB'],
    [25 * 1024 * 1024, '25 MB'],
  ])('%d → %s', (bytes, expected) => expect(formatBytes(bytes)).toBe(expected));
});

describe('sniffFileType', () => {
  const bytesFile = (name: string, type: string, bytes: number[]) =>
    new File([new Uint8Array(bytes)], name, { type });

  it('identifies PDF, JPEG, PNG and WebP from magic bytes', async () => {
    await expect(
      sniffFileType(bytesFile('a.pdf', 'application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d])),
    ).resolves.toBe('application/pdf');
    await expect(
      sniffFileType(bytesFile('a.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0xe0])),
    ).resolves.toBe('image/jpeg');
    await expect(
      sniffFileType(
        bytesFile('a.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).resolves.toBe('image/png');
    await expect(
      sniffFileType(
        bytesFile(
          'a.webp',
          'image/webp',
          [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
        ),
      ),
    ).resolves.toBe('image/webp');
  });

  it('returns null for unrecognised bytes (e.g. a renamed executable)', async () => {
    await expect(
      sniffFileType(bytesFile('a.pdf', 'application/pdf', [0x4d, 0x5a, 0x90, 0x00])),
    ).resolves.toBeNull();
  });
});

describe('validateFileContent', () => {
  const rules = { accept: ['application/pdf', 'image/*'], maxSizeBytes: 5 * 1024 * 1024 };

  it('accepts a file whose bytes match its declared type', async () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cv.pdf', {
      type: 'application/pdf',
    });
    await expect(validateFileContent(file, rules)).resolves.toBeNull();
  });

  it('rejects bytes that do not match the declared type, and unverifiable files', async () => {
    const spoofed = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'cv.pdf', {
      type: 'application/pdf',
    });
    await expect(validateFileContent(spoofed, rules)).resolves.toMatch(/could not be verified/);
    const renamed = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'cv.pdf', {
      type: 'application/pdf',
    });
    await expect(validateFileContent(renamed, rules)).resolves.toMatch(/do not match/);
    const webp = new File(
      [new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])],
      'a.webp',
      { type: 'image/webp' },
    );
    await expect(validateFileContent(webp, { accept: ['application/pdf'] })).resolves.toMatch(
      /not allowed/,
    );
  });
});
