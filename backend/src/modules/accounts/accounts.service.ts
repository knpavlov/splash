import { randomUUID } from 'crypto';
import { MailerService, MAILER_NOT_CONFIGURED } from '../../shared/mailer.service.js';
import { AccountsRepository } from './accounts.repository.js';
import type { AccountRecord, AccountRole, InterviewerSeniority } from './accounts.types.js';

export class AccountsService {
  constructor(private readonly repository: AccountsRepository, private readonly mailer = new MailerService()) {}

  private static readonly interviewerRoles: InterviewerSeniority[] = ['MD', 'SD', 'D', 'SM', 'M', 'SA', 'A'];

  private static normalizeInterviewerRole(value: InterviewerSeniority | string | null | undefined) {
    if (!value) {
      return null;
    }
    const normalized = value.toString().trim().toUpperCase();
    return AccountsService.interviewerRoles.includes(normalized as InterviewerSeniority)
      ? (normalized as InterviewerSeniority)
      : null;
  }

  async listAccounts() {
    return this.repository.listAccounts();
  }

  async findByEmail(email: string) {
    return this.repository.findByEmail(email);
  }

  private static deriveNameFromEmail(email: string): string | undefined {
    const localPart = email.split('@')[0] ?? '';
    const normalized = localPart.replace(/[._-]+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }
    return normalized.replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());
  }

  private static normalizeNamePart(value: string | undefined | null): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private static composeFullName(firstName?: string, lastName?: string): string | undefined {
    const parts = [firstName, lastName]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => Boolean(value));
    if (!parts.length) {
      return undefined;
    }
    return parts.join(' ');
  }

  private static splitFullName(name: string | undefined): { firstName?: string; lastName?: string } {
    if (!name) {
      return {};
    }
    const tokens = name
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => Boolean(token));
    if (!tokens.length) {
      return {};
    }
    const [first, ...rest] = tokens;
    const last = rest.join(' ').trim();
    return {
      firstName: first || undefined,
      lastName: last || undefined
    };
  }

  async inviteAccount(
    email: string,
    role: AccountRole,
    firstName?: string,
    lastName?: string,
    interviewerRole?: InterviewerSeniority | null
  ) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || role === 'super-admin') {
      throw new Error('INVALID_INVITE');
    }
    const normalizedFirstName = AccountsService.normalizeNamePart(firstName);
    const normalizedLastName = AccountsService.normalizeNamePart(lastName);
    if (!normalizedFirstName || !normalizedLastName) {
      throw new Error('INVALID_NAME');
    }
    const displayName = AccountsService.composeFullName(normalizedFirstName, normalizedLastName);
    const normalizedInterviewerRole = AccountsService.normalizeInterviewerRole(interviewerRole);
    const exists = await this.findByEmail(normalized);
    if (exists) {
      throw new Error('ALREADY_EXISTS');
    }
    const invitationToken = randomUUID();
    const record: AccountRecord = {
      id: randomUUID(),
      email: normalized,
      role,
      status: 'pending',
      name: displayName,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      invitationToken,
      createdAt: new Date(),
      interviewerRole: normalizedInterviewerRole
    };
    const saved = await this.repository.insertAccount(record);
    try {
      await this.mailer.sendInvitation(normalized, invitationToken);
    } catch (error) {
      await this.repository.removeAccount(record.id);
      if (error instanceof Error && error.message === MAILER_NOT_CONFIGURED) {
        throw new Error('MAILER_UNAVAILABLE');
      }
      throw error;
    }
    return saved;
  }

  async ensureUserAccount(email: string, name?: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new Error('INVALID_INVITE');
    }
    const existing = await this.findByEmail(normalized);
    if (existing) {
      return existing;
    }
    const normalizedName =
      AccountsService.normalizeNamePart(name) ?? AccountsService.deriveNameFromEmail(normalized);
    const parts = AccountsService.splitFullName(normalizedName);
    const firstName = parts.firstName;
    const lastName = parts.lastName;
    const displayName = AccountsService.composeFullName(firstName, lastName) ?? normalizedName;
    const record: AccountRecord = {
      id: randomUUID(),
      email: normalized,
      role: 'user',
      status: 'pending',
      invitationToken: randomUUID(),
      createdAt: new Date(),
      name: displayName,
      firstName,
      lastName
    };
    return this.repository.insertAccount(record);
  }

  async activateAccount(id: string) {
    const activatedAt = new Date();
    const updated = await this.repository.updateActivation(id, activatedAt);
    if (!updated) {
      throw new Error('NOT_FOUND');
    }
    return updated;
  }

  async removeAccount(id: string) {
    const account = await this.repository.findById(id);
    if (!account) {
      throw new Error('NOT_FOUND');
    }
    if (account.role === 'super-admin') {
      throw new Error('FORBIDDEN');
    }
    const removed = await this.repository.removeAccount(id);
    if (!removed) {
      throw new Error('NOT_FOUND');
    }
    return removed;
  }

  async updateRole(id: string, role: AccountRole) {
    if (role !== 'admin' && role !== 'user') {
      throw new Error('FORBIDDEN');
    }

    const account = await this.repository.findById(id);
    if (!account) {
      throw new Error('NOT_FOUND');
    }

    if (account.role === 'super-admin') {
      throw new Error('FORBIDDEN');
    }

    if (account.role === role) {
      return account;
    }

    const updated = await this.repository.updateRole(id, role);
    if (!updated) {
      throw new Error('NOT_FOUND');
    }

    return updated;
  }
}
