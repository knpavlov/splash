import { randomUUID } from 'crypto';
import type { AccountRecord } from '../accounts/accounts.types.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import { MailerDeliveryError, MailerService, MAILER_NOT_CONFIGURED } from '../../shared/mailer.service.js';
import { OtpService } from '../../shared/otp.service.js';
import { AccessCodesRepository } from './accessCodes.repository.js';

export class AuthService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly codesRepository = new AccessCodesRepository(),
    private readonly mailer = new MailerService(),
    private readonly otp = new OtpService()
  ) {}

  async requestAccessCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const account = await this.accountsService.findByEmail(normalizedEmail);
    if (!account) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    const allowedStatuses: Array<AccountRecord['status']> = ['pending', 'active'];
    if (!allowedStatuses.includes(account.status)) {
      throw new Error('ACCESS_DENIED');
    }
    const code = this.otp.generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.codesRepository.saveCode({
      email: normalizedEmail,
      code,
      expiresAt
    });
    try {
      await this.mailer.sendAccessCode(account.email, code);
    } catch (error) {
      await this.codesRepository.deleteCode(account.email);
      if (error instanceof MailerDeliveryError) {
        if (error.reason === 'domain-not-verified') {
          throw new Error('MAILER_DOMAIN_NOT_VERIFIED');
        }
        throw new Error('MAILER_DELIVERY_FAILED');
      }
      if (error instanceof Error && error.message === MAILER_NOT_CONFIGURED) {
        throw new Error('MAILER_UNAVAILABLE');
      }
      throw error;
    }
    return { email: account.email };
  }

  async verifyAccessCode(email: string, code: string) {
    const normalized = email.trim().toLowerCase();
    const record = await this.codesRepository.findCode(normalized, code);
    if (!record) {
      throw new Error('CODE_INVALID');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      await this.codesRepository.deleteCode(normalized);
      throw new Error('CODE_EXPIRED');
    }

    const account = await this.accountsService.findByEmail(normalized);
    if (!account) {
      await this.codesRepository.deleteCode(normalized);
      throw new Error('ACCOUNT_NOT_FOUND');
    }

    if (account.status === 'pending') {
      await this.accountsService.activateAccount(account.id);
    }

    await this.codesRepository.deleteCode(normalized);

    return {
      token: randomUUID(),
      role: account.role,
      email: account.email
    };
  }
}
