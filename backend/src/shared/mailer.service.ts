import { randomUUID } from 'crypto';
import { connect as createNetConnection, type Socket } from 'net';
import { connect as createTlsConnection, type TLSSocket } from 'tls';
import { ResendError, sendWithResend } from './resend.client.js';

type SmtpSocket = Socket | TLSSocket;

type BaseMailerConfig = {
  from: string;
};

type SmtpMailerConfig = BaseMailerConfig & {
  kind: 'smtp';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

type ResendMailerConfig = BaseMailerConfig & {
  kind: 'resend';
  apiKey: string;
};

type MailerConfig = SmtpMailerConfig | ResendMailerConfig;

export const MAILER_NOT_CONFIGURED = 'MAILER_NOT_CONFIGURED';

type MailerDeliveryReason = 'domain-not-verified' | 'provider-error';

// Ошибка верхнего уровня, чтобы модули могли различать причину сбоя доставки
export class MailerDeliveryError extends Error {
  constructor(
    public readonly reason: MailerDeliveryReason,
    message?: string
  ) {
    super(message ?? reason);
    this.name = 'MailerDeliveryError';
  }
}

const resolveConfig = (): MailerConfig | null => {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM?.trim() ?? process.env.SMTP_FROM ?? process.env.SMTP_USER;

  if (resendApiKey && resendFrom) {
    return {
      kind: 'resend',
      apiKey: resendApiKey,
      from: resendFrom
    } satisfies ResendMailerConfig;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM ?? user;
  const port = Number(process.env.SMTP_PORT ?? (process.env.SMTP_SECURE === 'true' ? 465 : 587));

  if (!host || !user || !password || !from) {
    return null;
  }

  return {
    kind: 'smtp',
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    user,
    password,
    from
  } satisfies SmtpMailerConfig;
};

const createResponseReader = (socket: SmtpSocket) => {
  let buffer = '';
  let resolver: ((response: string) => void) | null = null;
  let rejecter: ((error: Error) => void) | null = null;

  const extractResponse = () => {
    if (!buffer.includes('\n')) {
      return null;
    }
    const lines: string[] = [];
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }
      const line = buffer.slice(0, newlineIndex + 1);
      buffer = buffer.slice(newlineIndex + 1);
      lines.push(line.trimEnd());
      if (line.length >= 4 && line[3] === ' ') {
        return lines.join('\n');
      }
      if (!buffer.includes('\n')) {
        break;
      }
    }
    return null;
  };

  const tryResolve = () => {
    if (!resolver) {
      return;
    }
    const response = extractResponse();
    if (!response) {
      return;
    }
    const resolve = resolver;
    resolver = null;
    rejecter = null;
    resolve(response);
  };

  const handleData = (chunk: Buffer | string) => {
    buffer += chunk.toString();
    tryResolve();
  };

  const handleError = (error: Error) => {
    if (rejecter) {
      const reject = rejecter;
      resolver = null;
      rejecter = null;
      reject(error);
    }
  };

  socket.on('data', handleData);
  socket.on('error', handleError);

  return () =>
    new Promise<string>((resolve, reject) => {
      if (resolver) {
        reject(new Error('Awaiting previous SMTP response.'));
        return;
      }
      resolver = resolve;
      rejecter = reject;
      tryResolve();
    });
};

const createSocket = async (
  config: SmtpMailerConfig
): Promise<{ socket: SmtpSocket; wait: () => Promise<string> }> => {
  const socket: SmtpSocket = config.secure
    ? createTlsConnection({ host: config.host, port: config.port })
    : createNetConnection({ host: config.host, port: config.port });

  socket.setEncoding('utf-8');

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      socket.removeListener('connect', handleConnect);
      reject(error);
    };
    const handleConnect = () => {
      socket.removeListener('error', handleError);
      resolve();
    };
    socket.once('error', handleError);
    socket.once('connect', handleConnect);
  });

  const wait = createResponseReader(socket);
  await wait(); // server greeting (220)
  return { socket, wait };
};

const sendCommand = async (
  socket: SmtpSocket,
  wait: () => Promise<string>,
  command: string,
  expected: number | number[]
) => {
  const codes = Array.isArray(expected) ? expected : [expected];
  socket.write(`${command}\r\n`);
  const response = await wait();
  const code = Number(response.slice(0, 3));
  if (!codes.includes(code)) {
    throw new Error(`SMTP command "${command}" failed: ${response}`);
  }
  return response;
};

const formatBody = (text: string) =>
  text
    .replace(/\r?\n/g, '\r\n')
    .replace(/\r\n\./g, '\r\n..');

const sendViaSmtp = async (config: SmtpMailerConfig, to: string, subject: string, text: string) => {
  const { socket, wait } = await createSocket(config);
  try {
    await sendCommand(socket, wait, `EHLO ${config.host}`, 250);
    await sendCommand(socket, wait, 'AUTH LOGIN', 334);
    await sendCommand(socket, wait, Buffer.from(config.user).toString('base64'), 334);
    await sendCommand(socket, wait, Buffer.from(config.password).toString('base64'), 235);
    await sendCommand(socket, wait, `MAIL FROM:<${config.from}>`, 250);
    await sendCommand(socket, wait, `RCPT TO:<${to}>`, [250, 251]);
    await sendCommand(socket, wait, 'DATA', 354);

    const messageId = `<${randomUUID()}@${config.host}>`;
    const now = new Date().toUTCString();
    const payload = [
      `Message-ID: ${messageId}`,
      `Date: ${now}`,
      `From: ${config.from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      formatBody(text),
      ''
    ].join('\r\n');

    socket.write(`${payload}\r\n.\r\n`);
    const dataResponse = await wait();
    if (!dataResponse.startsWith('250')) {
      throw new Error(`SMTP did not confirm message delivery: ${dataResponse}`);
    }
    await sendCommand(socket, wait, 'QUIT', 221);
  } finally {
    socket.end();
  }
};

// Если SMTP не настроен, предупреждаем и выкидываем контролируемую ошибку
export class MailerService {
  private readonly config = resolveConfig();
  private warned = false;

  // Универсальный helper для ожидания между повторными попытками
  private async pause(ms: number) {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private ensureConfig(): MailerConfig {
    if (!this.config) {
      if (!this.warned) {
        console.warn('SMTP/Resend is not configured. Emails will not be sent.');
        this.warned = true;
      }
      throw new Error(MAILER_NOT_CONFIGURED);
    }
    return this.config;
  }

  private async deliver(to: string, subject: string, text: string) {
    let config: MailerConfig;
    try {
      config = this.ensureConfig();
    } catch (error) {
      if (error instanceof Error && error.message === MAILER_NOT_CONFIGURED) {
        console.info(`[mailer] Email for ${to}: ${subject} — ${text}`);
      }
      throw error;
    }

    if (config.kind === 'resend') {
      let attempt = 0;
      let nextDelay = 500;
      const maxDelay = 8000;
      const maxAttempts = 6;
      let lastRateLimitError: ResendError | null = null;

      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          await sendWithResend({
            apiKey: config.apiKey,
            from: config.from,
            to,
            subject,
            text
          });
          return;
        } catch (error) {
          if (error instanceof ResendError && error.status === 429) {
            // Плавно замедляем отправку при превышении лимита, чтобы не терять письма
            lastRateLimitError = error;
            const waitMs = Math.max(error.retryAfterMs ?? nextDelay, 250);
            console.warn(
              `Resend вернул ограничение по скорости для ${to}. Повтор через ${waitMs} мс (попытка ${attempt}).`
            );
            await this.pause(waitMs);
            nextDelay = Math.min(nextDelay * 2, maxDelay);
            continue;
          }
          if (error instanceof ResendError) {
            const normalizedCode = error.code?.toLowerCase();
            const reason: MailerDeliveryReason =
              normalizedCode === 'domain_not_verified' || normalizedCode === 'missing_domain_verification'
                ? 'domain-not-verified'
                : error.status === 403 && error.message.toLowerCase().includes('domain')
                  ? 'domain-not-verified'
                  : 'provider-error';

            throw new MailerDeliveryError(reason, error.message);
          }
          throw error;
        }
      }

      const rateLimitMessage =
        lastRateLimitError?.message ??
        'Почтовый сервис временно ограничил скорость отправки. Попробуйте повторить позже.';
      throw new MailerDeliveryError('provider-error', rateLimitMessage);
    }

    await sendViaSmtp(config, to, subject, text);
  }

  async sendInvitation(email: string, token: string) {
    const subject = 'Invitation to the case management system';
    const inviteUrl = process.env.INVITE_URL?.trim();
    const separator = inviteUrl && inviteUrl.includes('?') ? '&' : '?';
    const activationLink = inviteUrl
      ? `${inviteUrl}${separator}email=${encodeURIComponent(email)}&invitation=${encodeURIComponent(token)}`
      : null;
    const bodyLines = [
      'You have been invited to the case management system.',
      activationLink
        ? `Open this link to activate your access: ${activationLink}`
        : inviteUrl
          ? `Open this link to activate your access: ${inviteUrl}`
          : null,
      `If the link is unavailable, use this invitation token: ${token}`,
      'Once activated, return to the login page and request a one-time access code.'
    ].filter((line): line is string => Boolean(line));
    await this.deliver(email, subject, bodyLines.join('\n\n'));
  }

  async sendAccessCode(email: string, code: string) {
    const subject = 'Your access code';
    const body = `One-time access code: ${code}. Enter it within 10 minutes.`;
    await this.deliver(email, subject, body);
  }

  async sendInterviewAssignment(
    email: string,
    payload: {
      candidateName: string;
      interviewerName: string;
      interviewerFirstName?: string;
      caseTitle: string;
      fitQuestionTitle: string;
      link: string;
    }
  ) {
    const subject = `Interview scheduled with ${payload.candidateName}`;
    const lines = [
      `Hello ${payload.interviewerFirstName?.trim() || payload.interviewerName},`,
      `You have been assigned to interview ${payload.candidateName}.`,
      payload.link
        ? `Open the interviewer workspace here: ${payload.link}.`
        : 'Sign in to the interviewer workspace to review materials and submit feedback.',
      'You will find the interview materials and the evaluation form on the interviewer portal.',
      'If you are not logged in, request a one-time code for this email address on the login screen.'
    ].filter((line): line is string => Boolean(line));
    await this.deliver(email, subject, lines.join('\n\n'));
  }
}
