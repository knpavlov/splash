// This module resolves base URLs for client-side network requests so that API logic
// stays isolated and ready for future migrations.

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const ensureAbsoluteUrl = (value: string, fallbackOrigin: string) => {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return value;
  }

  const normalizedPath = value.startsWith('/') ? value : `/${value}`;
  return new URL(normalizedPath, fallbackOrigin).toString();
};

const normalizeUrl = (value: string, fallbackOrigin: string) =>
  trimTrailingSlash(ensureAbsoluteUrl(value, fallbackOrigin));

const isBrowserEnvironment = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const readMetaContent = (name: string): string | undefined => {
  if (!isBrowserEnvironment()) {
    return undefined;
  }

  const element = document.querySelector(`meta[name="${name}"]`);
  const content = element?.getAttribute('content')?.trim();

  if (!content) {
    return undefined;
  }

  const looksLikePlaceholder = /^%.*%$/.test(content) && content.includes('VITE_API_URL');
  if (looksLikePlaceholder) {
    return undefined;
  }

  return content;
};

type RuntimeConfigWindow = Window & {
  __RECRUITMENT_CONFIG__?: {
    apiBaseUrl?: string;
  };
};

const readGlobalConfig = (): string | undefined => {
  if (!isBrowserEnvironment()) {
    return undefined;
  }

  const globalConfig = (window as RuntimeConfigWindow).__RECRUITMENT_CONFIG__;
  const content = globalConfig?.apiBaseUrl?.trim();
  if (!content) {
    return undefined;
  }
  const looksLikePlaceholder = /^%.*%$/.test(content) && content.includes('VITE_API_URL');
  if (looksLikePlaceholder) {
    return undefined;
  }
  return content;
};

// Attempt to derive the backend domain based on the frontend domain.
// This covers deployments where services follow the "frontend"/"backend" naming pattern on Railway.
// Удаляет суффиксы вида "-v2", "_3", "4" и т.п. из сегмента домена,
// чтобы восстановить исходное имя сервиса без числового маркера.
const stripVersionSuffix = (segment: string): string => {
  let current = segment;

  while (true) {
    const next = current.replace(/(?:[-_]?v)?\d+$/i, '');

    if (next === current) {
      break;
    }

    current = next;
  }

  return current;
};

const deriveBackendHost = (hostname: string): string | undefined => {
  const attempts: string[] = [];

  if (hostname.includes('-frontend-')) {
    attempts.push(hostname.replace('-frontend-', '-backend-'));
  }

  if (hostname.includes('-frontend.')) {
    attempts.push(hostname.replace('-frontend.', '-backend.'));
  }

  if (hostname.startsWith('frontend-')) {
    attempts.push(hostname.replace(/^frontend-/, 'backend-'));
  }

  if (hostname.startsWith('frontend.')) {
    attempts.push(hostname.replace(/^frontend\./, 'backend.'));
  }

  if (hostname.includes('.frontend-')) {
    attempts.push(hostname.replace('.frontend-', '.backend-'));
  }

  if (hostname.includes('.frontend.')) {
    attempts.push(hostname.replace('.frontend.', '.backend.'));
  }

  if (hostname.endsWith('.frontend')) {
    attempts.push(hostname.replace(/\.frontend$/, '.backend'));
  }

  const bySegments = hostname
    .split('.')
    .map((segment) => (segment === 'frontend' ? 'backend' : segment))
    .join('.');
  attempts.push(bySegments);

  if (hostname.includes('frontend')) {
    attempts.push(hostname.replace('frontend', 'backend'));
  }

  const segments = hostname.split('.');

  // Удаляем сегменты, состоящие только из цифр (часто используются как маркеры версий).
  const withoutNumericSegments = segments.filter((segment) => !/^\d+$/.test(segment));
  if (withoutNumericSegments.length > 0 && withoutNumericSegments.length !== segments.length) {
    attempts.push(withoutNumericSegments.join('.'));
  }

  // Формируем кандидата, удаляя числовые суффиксы и маркеры версий из каждого сегмента.
  const strippedSegments = segments
    .map((segment) => stripVersionSuffix(segment).trim())
    .filter((segment) => segment.length > 0);

  if (strippedSegments.length > 0 && strippedSegments.join('.') !== hostname) {
    attempts.push(strippedSegments.join('.'));
  }

  const seen = new Set<string>();

  for (const candidate of attempts) {
    if (!candidate || candidate === hostname || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    if (candidate && candidate !== hostname) {
      return candidate;
    }
  }

  return undefined;
};

const isLocalHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0'
  );
};

// For browsers, attempt to derive the backend origin from the current URL.
const deriveBackendOriginFromLocation = (): string | undefined => {
  if (!isBrowserEnvironment()) {
    return undefined;
  }

  const { location } = window;

  if (isLocalHostname(location.hostname)) {
    return undefined;
  }

  try {
    const baseUrl = new URL(location.origin);
    const backendHost = deriveBackendHost(baseUrl.hostname);

    if (!backendHost) {
      return undefined;
    }

    baseUrl.hostname = backendHost;
    baseUrl.port = '';

    return baseUrl.origin;
  } catch {
    return undefined;
  }
};

const warnMissingApiConfig = (fallback: string) => {
  if (typeof console === 'undefined') {
    return;
  }

  console.warn(
    'API base URL не настроен. Используем значение по умолчанию: %s. ' +
      'Убедитесь, что переменная окружения VITE_API_URL указывает на домен бэкенда.',
    fallback
  );
};

const resolveApiBaseUrl = (): string => {
  const browser = isBrowserEnvironment();
  const fallbackOrigin = browser ? window.location.origin : 'http://localhost:4000';

  const explicitEnvCandidates = [
    import.meta.env.VITE_API_URL,
    import.meta.env.VITE_API_BASE_URL,
  ];

  for (const candidate of explicitEnvCandidates) {
    const value = candidate?.trim();

    if (value) {
      // Поддерживаем как новое имя переменной (`VITE_API_URL`),
      // так и старое (`VITE_API_BASE_URL`), чтобы не ломать
      // существующие деплои при смене домена.
      return normalizeUrl(value, fallbackOrigin);
    }
  }

  const fromGlobal = readGlobalConfig();
  if (fromGlobal) {
    return normalizeUrl(fromGlobal, fallbackOrigin);
  }

  const fromMeta = readMetaContent('recruitment:api-base');
  if (fromMeta) {
    return normalizeUrl(fromMeta, fallbackOrigin);
  }

  if (browser) {
    const derivedOrigin = deriveBackendOriginFromLocation();
    if (derivedOrigin) {
      return trimTrailingSlash(derivedOrigin);
    }
  }

  if (browser && isLocalHostname(window.location.hostname)) {
    return 'http://localhost:4000';
  }

  if (import.meta.env.PROD && browser) {
    warnMissingApiConfig('http://localhost:4000');
  }

  return 'http://localhost:4000';
};

const API_BASE_URL = resolveApiBaseUrl();

export const getApiBaseUrl = () => API_BASE_URL;

export const buildApiUrl = (path: string) => {
  const base = getApiBaseUrl();
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(path.replace(/^\//, ''), normalizedBase).toString();
};
