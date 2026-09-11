import type { ClientPlatform } from './client-messaging.projection.js';

export interface PushDeliveryMessage {
  notificationId: string;
  recipientUserId: string;
  platform: ClientPlatform;
  registrationToken: string;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
}

export type PushDeliveryResult =
  | { status: 'ACCEPTED'; providerMessageId: string }
  | { status: 'PERMANENT_FAILURE'; errorCode: string }
  | { status: 'RETRYABLE_FAILURE'; errorCode: string };

export abstract class PushDeliveryPort {
  abstract deliver(message: PushDeliveryMessage): Promise<PushDeliveryResult>;
}
