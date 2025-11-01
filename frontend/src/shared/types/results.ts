export type DomainErrorCode =
  | 'not-found'
  | 'version-conflict'
  | 'duplicate'
  | 'invalid-input'
  | 'mailer-unavailable'
  | 'process-already-started'
  | 'forms-pending'
  | 'missing-assignment-data'
  | 'invalid-assignment-data'
  | 'invalid-assignment-resources'
  | 'access-denied'
  | 'invalid-portal-url'
  | 'invalid-selection'
  | 'invitation-delivery-failed'
  | 'form-locked'
  | 'unknown';

export interface DomainFailure {
  ok: false;
  error: DomainErrorCode;
}

export interface DomainSuccess<T> {
  ok: true;
  data: T;
}

export type DomainResult<T> = DomainSuccess<T> | DomainFailure;
