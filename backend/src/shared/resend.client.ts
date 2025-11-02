import { request as createHttpsRequest } from 'node:https';

interface ResendRequest {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

interface ResendErrorResponse {
  name?: string;
  message?: string;
}

// Собственный класс ошибки помогает передавать статус и код Resend дальше по цепочке
export class ResendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    // Дополнительная информация о паузе перед повтором запроса
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ResendError';
  }
}

const parseRetryAfter = (value: string | string[] | null | undefined): number | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDate = new Date(raw);
  const delay = retryDate.getTime() - Date.now();
  return Number.isNaN(delay) || delay <= 0 ? undefined : delay;
};

const raiseResendError = (
  status: number,
  statusText: string,
  bodyText: string,
  retryAfter: string | string[] | null | undefined
) => {
  let details: ResendErrorResponse | undefined;

  if (bodyText.trim().length > 0) {
    try {
      details = JSON.parse(bodyText) as ResendErrorResponse;
    } catch (error) {
      // Логируем, чтобы на проде было проще понять неожиданный формат ответа
      console.error('Не удалось разобрать ответ Resend', error, bodyText);
    }
  }

  const code = typeof details?.name === 'string' ? details.name : undefined;
  const message =
    typeof details?.message === 'string' && details.message.trim().length > 0
      ? details.message
      : statusText || 'Failed to send email via Resend.';

  const retryAfterMs = parseRetryAfter(retryAfter);

  throw new ResendError(message, status, code, retryAfterMs);
};

const sendWithFetch = async ({ apiKey, from, to, subject, text }: ResendRequest) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    raiseResendError(response.status, response.statusText, bodyText, response.headers.get('retry-after'));
  }
};

const sendWithHttps = async ({ apiKey, from, to, subject, text }: ResendRequest) => {
  const payload = JSON.stringify({ from, to, subject, text });

  const { statusCode, statusMessage, headers, body } = await new Promise<{
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    const request = createHttpsRequest(
      {
        method: 'POST',
        hostname: 'api.resend.com',
        path: '/emails',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString()
        }
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            statusMessage: response.statusMessage ?? '',
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf-8')
          });
        });
      }
    );

    request.on('error', (error) => {
      reject(error);
    });

    request.write(payload);
    request.end();
  });

  if (statusCode < 200 || statusCode >= 300) {
    raiseResendError(statusCode, statusMessage, body, headers['retry-after']);
  }
};

// Минимальный HTTP-клиент для Resend, чтобы изолировать сетевую логику от остального приложения
export const sendWithResend = async (request: ResendRequest) => {
  if (typeof fetch === 'function') {
    await sendWithFetch(request);
    return;
  }

  console.warn('Глобальный fetch недоступен, используем резервный HTTPS-клиент для Resend.');
  await sendWithHttps(request);
};
