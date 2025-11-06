// Генератор идентификаторов с учётом окружений без полноценного crypto API
const getCrypto = () => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined') {
    return globalThis.crypto as Crypto;
  }
  return undefined;
};

const toHex = (value: number) => value.toString(16).padStart(2, '0');

const buildUuidFromBytes = (bytes: Uint8Array) => {
  // Формируем UUIDv4 вручную, чтобы гарантировать совместимость со старыми окружениями
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, toHex);
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-');
};

const generateFallbackUuid = () => {
  const cryptoInstance = getCrypto();
  if (cryptoInstance && typeof cryptoInstance.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoInstance.getRandomValues(bytes);
    return buildUuidFromBytes(bytes);
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return buildUuidFromBytes(bytes);
};

export const generateId = () => {
  const cryptoInstance = getCrypto();
  if (cryptoInstance && typeof cryptoInstance.randomUUID === 'function') {
    return cryptoInstance.randomUUID();
  }
  return generateFallbackUuid();
};
