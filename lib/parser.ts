export function parseFilename(path: string) {
  const trimmed = (path || '').trim();
  const hasPrefix = trimmed.includes('/');
  const prefix = hasPrefix ? trimmed.split('/')[0] : null;
  const filename = hasPrefix ? trimmed.split('/').slice(1).join('/') : trimmed;
  const stem = filename.replace(/\.[^.]+$/, '');

  const ctf = stem.match(/^(\d{4})(\d{8})(\d{4})(?:_[sS](\d{4}))?$/);
  const customerCode = ctf?.[1] ?? null;
  const timeCode = ctf?.[2] ?? null;
  const fileCode = ctf?.[3] ?? null;

  const suffixSpeed = ctf?.[4] ? Number.parseInt(ctf[4], 10) / 100 : null;
  const legacyKmh = trimmed.match(/(\d{1,3}[,.]\d{1,2})\s*km\/h/i);
  const legacySpeed = legacyKmh?.[1] ? Number.parseFloat(legacyKmh[1].replace(',', '.')) : null;

  return {
    prefix,
    filename,
    customerCode,
    timeCode,
    fileCode,
    speedKmh: suffixSpeed ?? legacySpeed,
  };
}
