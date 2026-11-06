export interface FileRules {
  /** Allowed MIME types; supports wildcards like "image/*". Empty = any. */
  accept?: string[];
  maxSizeBytes?: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '')} ${units[unit]}`;
}

function matchesMime(type: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
  return type === pattern;
}

/** Returns a user-facing error message, or null when the file is acceptable. */
export function validateFile(
  file: Pick<File, 'type' | 'size' | 'name'>,
  rules: FileRules,
): string | null {
  if (rules.accept?.length && !rules.accept.some((pattern) => matchesMime(file.type, pattern))) {
    return `${file.name}: file type not allowed`;
  }
  if (rules.maxSizeBytes !== undefined && file.size > rules.maxSizeBytes) {
    return `${file.name}: larger than ${formatBytes(rules.maxSizeBytes)}`;
  }
  if (file.size === 0) return `${file.name}: file is empty`;
  return null;
}

function sniffBytes(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
    return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  return null;
}

/**
 * Identify a file from its magic bytes, client-side. Early feedback only: the
 * authoritative check runs server-side in the confirm step (detectContentType in
 * lib/s3/storage.ts), which this mirrors — keep the two signatures in step.
 * Returns null when the bytes match no known type.
 */
export async function sniffFileType(file: Pick<File, 'slice'>): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return sniffBytes(bytes);
}

/**
 * Content check to run after validateFile, before the upload starts: the file's
 * real type (magic bytes) must be one of the accepted types, and it must match
 * the browser-declared MIME type. A renamed executable or a WebP smuggled in as
 * image/png is rejected here; the server re-checks at confirm regardless.
 */
export async function validateFileContent(
  file: Pick<File, 'type' | 'size' | 'name' | 'slice'>,
  rules: FileRules,
): Promise<string | null> {
  const actual = await sniffFileType(file);
  if (!actual) return `${file.name}: file type could not be verified`;
  if (actual !== file.type) {
    return `${file.name}: file contents do not match its type (${file.type})`;
  }
  if (rules.accept?.length && !rules.accept.some((pattern) => matchesMime(actual, pattern))) {
    return `${file.name}: file type not allowed`;
  }
  return null;
}
