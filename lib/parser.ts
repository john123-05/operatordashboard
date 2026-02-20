export function parseFilename(path: string) {
  const trimmed = (path || '').trim();
  const hasPrefix = trimmed.includes('/');
  const prefix = hasPrefix ? trimmed.split('/')[0] : null;
  const filename = hasPrefix ? trimmed.split('/').slice(1).join('/') : trimmed;
  const stem = filename.replace(/\.[^.]+$/, '');

  const suffixSpeedMatch = stem.match(/^(.*?)(?:[_-][sS](\d{4}))$/);
  const baseStem = suffixSpeedMatch?.[1] ?? stem;
  const suffixSpeedRaw = suffixSpeedMatch?.[2] ?? null;

  const numericCore = baseStem.match(/^\d+$/)?.[0] ?? null;
  let ctfCore: string | null = null;
  let trailingSpeedRaw: string | null = null;

  if (numericCore?.length === 16) {
    ctfCore = numericCore;
  } else if (numericCore?.length === 20) {
    ctfCore = numericCore.slice(0, 16);
    trailingSpeedRaw = numericCore.slice(16);
  }

  const legacyCustomerCode = ctfCore ? ctfCore.slice(0, 4) : null;
  const customerCode = ctfCore
    ? `${ctfCore[0]}${ctfCore[8]}${ctfCore[3]}${ctfCore[9]}`
    : null;
  const timeCode = ctfCore ? ctfCore.slice(4, 12) : null;
  const fileCode = ctfCore ? ctfCore.slice(12, 16) : null;

  const suffixSpeed = suffixSpeedRaw ? Number.parseInt(suffixSpeedRaw, 10) / 100 : null;
  const trailingSpeed = trailingSpeedRaw ? Number.parseInt(trailingSpeedRaw, 10) / 100 : null;
  const legacyKmh = trimmed.match(/(\d{1,3}[,.]\d{1,2})\s*km\/h/i);
  const legacySpeed = legacyKmh?.[1] ? Number.parseFloat(legacyKmh[1].replace(',', '.')) : null;

  return {
    prefix,
    filename,
    customerCode,
    legacyCustomerCode,
    timeCode,
    fileCode,
    speedKmh: suffixSpeed ?? trailingSpeed ?? legacySpeed ?? 0,
  };
}
