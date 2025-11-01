import { buildApiUrl } from '../config/runtimeConfig';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string
  ) {
    super(message);
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

const resolveBody = (body: unknown) => {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (body instanceof FormData || typeof body === 'string') {
    return body;
  }
  return JSON.stringify(body);
};

const buildHeaders = (input?: HeadersInit, body?: unknown) => {
  const headers = new Headers(input);
  if (body !== undefined && !(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
};

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> => {
  const { body, headers, ...rest } = options;
  const response = await fetch(buildApiUrl(path), {
    ...rest,
    headers: buildHeaders(headers, body),
    body: resolveBody(body)
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      const snippet = text.slice(0, 120).trim();

      if (!response.ok) {
        throw new ApiError(response.status, undefined, 'Request failed.');
      }

      throw new Error(
        `The server returned an unexpected response: ${snippet || 'empty body'}. Check the API configuration.`
      );
    }
  }

  const structuredPayload =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;

  if (!response.ok) {
    const messageValue = structuredPayload?.message;
    const codeValue = structuredPayload?.code;

    const message = typeof messageValue === 'string' ? messageValue : 'Request failed.';
    const code = typeof codeValue === 'string' ? codeValue : undefined;
    throw new ApiError(response.status, code, message);
  }

  return payload as T;
};
