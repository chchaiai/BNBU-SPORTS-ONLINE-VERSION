export const AUTH_CODE_PURPOSES = [
  'ADMIN_IDENTITY_VERIFICATION',
  'STUDENT_SIGN_IN',
  'ACCOUNT_RECOVERY',
  'ACCOUNT_DELETION',
  'EMAIL_FIRST_BIND',
  'EMAIL_REBIND_CURRENT',
  'EMAIL_REBIND_NEW',
] as const;
export type AuthCodePurpose = (typeof AUTH_CODE_PURPOSES)[number];

export const AUTH_CODE_CHANNELS = ['EMAIL'] as const;
export type AuthCodeChannel = (typeof AUTH_CODE_CHANNELS)[number];

export interface AuthCodeDelivery {
  deliveryId: string;
  purpose: AuthCodePurpose;
  channel: AuthCodeChannel;
  recipient: string;
  locale: 'zh-CN' | 'en';
  code: string;
  expiresAt: Date;
}

export abstract class AuthCodeDeliveryPort {
  abstract deliver(message: AuthCodeDelivery): Promise<void>;
}

export class AuthCodeDeliveryUnavailableError extends Error {
  readonly code = 'SYSTEM_SERVICE_UNAVAILABLE';

  constructor() {
    super('Authentication-code delivery is not configured for this environment.');
    this.name = 'AuthCodeDeliveryUnavailableError';
  }
}

export class AuthCodeDeliveryConflictError extends Error {
  constructor() {
    super('The test delivery identifier was reused with different content.');
    this.name = 'AuthCodeDeliveryConflictError';
  }
}

/** Production-safe default: no message is accepted until an explicit provider is wired. */
export class DisabledAuthCodeDeliveryAdapter extends AuthCodeDeliveryPort {
  deliver(message: AuthCodeDelivery): Promise<void> {
    void message;
    return Promise.reject(new AuthCodeDeliveryUnavailableError());
  }
}

/** Test-only capture adapter. Construction fails outside APP_ENV=test. */
export class InMemoryTestAuthCodeDeliveryAdapter extends AuthCodeDeliveryPort {
  private readonly captured = new Map<string, AuthCodeDelivery>();

  constructor(appEnvironment: string | undefined = process.env.APP_ENV) {
    super();
    if (appEnvironment !== 'test') throw new AuthCodeDeliveryUnavailableError();
  }

  deliver(message: AuthCodeDelivery): Promise<void> {
    const copy = cloneDelivery(message);
    const existing = this.captured.get(copy.deliveryId);
    if (existing !== undefined && deliveryFingerprint(existing) !== deliveryFingerprint(copy)) {
      return Promise.reject(new AuthCodeDeliveryConflictError());
    }
    this.captured.set(copy.deliveryId, copy);
    return Promise.resolve();
  }

  get(deliveryId: string): AuthCodeDelivery | null {
    const delivery = this.captured.get(deliveryId);
    return delivery === undefined ? null : cloneDelivery(delivery);
  }

  list(): AuthCodeDelivery[] {
    return [...this.captured.values()].map((delivery) => cloneDelivery(delivery));
  }

  clear(): void {
    this.captured.clear();
  }
}

function cloneDelivery(message: AuthCodeDelivery): AuthCodeDelivery {
  return { ...message, expiresAt: new Date(message.expiresAt.getTime()) };
}

function deliveryFingerprint(message: AuthCodeDelivery): string {
  return JSON.stringify({
    deliveryId: message.deliveryId,
    purpose: message.purpose,
    channel: message.channel,
    recipient: message.recipient,
    locale: message.locale,
    code: message.code,
    expiresAt: message.expiresAt.toISOString(),
  });
}
