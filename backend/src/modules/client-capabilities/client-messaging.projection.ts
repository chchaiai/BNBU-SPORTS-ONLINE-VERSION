export type ClientPlatform = 'ANDROID' | 'WEB' | 'IOS';

export interface NotificationRow {
  id: string;
  organizationId: string;
  recipientUserId: string;
  notificationType: string;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
  readAt: Date | null;
  createdAt: Date;
  version: number;
}

export interface NotificationProjection {
  id: string;
  recipientUserId: string;
  notificationType: string;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface PushDeviceRow {
  id: string;
  organizationId: string;
  userId: string;
  authSessionId: string;
  platform: ClientPlatform;
  appVersion: string;
  locale: string;
  status: string;
  registrationTokenHash: string;
  registrationTokenCiphertext: string | null;
  encryptionKeyVersion: number;
  registeredAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  version: number;
}

export interface PushDeviceProjection {
  id: string;
  platform: ClientPlatform;
  appVersion: string;
  locale: string;
  status: string;
  registeredAt: string;
  version: number;
}

export interface UserPreferenceRow {
  id: string;
  organizationId: string;
  userId: string;
  locale: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferenceProjection {
  locale: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  version: number;
}

export interface HelpArticleRow {
  id: string;
  category: string;
  locale: string;
  title: string;
  bodyMarkdown: string;
  status: string;
  publishedAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HelpArticleProjection {
  id: string;
  category: string;
  locale: string;
  title: string;
  bodyMarkdown: string;
  publishedAt: string;
  version: number;
}

export interface FeedbackRow {
  id: string;
  organizationId: string;
  createdByUserId: string;
  category: string;
  content: string;
  status: string;
  publicReply: string | null;
  clientPlatform: ClientPlatform | null;
  clientAppVersion: string | null;
  clientOsVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface FeedbackProjection {
  id: string;
  category: string;
  content: string;
  status: string;
  publicReply: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export function projectNotification(row: NotificationRow): NotificationProjection {
  return {
    id: row.id,
    recipientUserId: row.recipientUserId,
    notificationType: row.notificationType,
    title: row.title,
    body: row.body,
    targetType: row.targetType,
    targetId: row.targetId,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export function projectPushDevice(row: PushDeviceRow): PushDeviceProjection {
  return {
    id: row.id,
    platform: row.platform,
    appVersion: row.appVersion,
    locale: row.locale,
    status: row.status,
    registeredAt: row.registeredAt.toISOString(),
    version: row.version,
  };
}

export function projectUserPreference(row: UserPreferenceRow): UserPreferenceProjection {
  return {
    locale: row.locale,
    pushEnabled: row.pushEnabled,
    emailEnabled: row.emailEnabled,
    version: row.version,
  };
}

export function projectHelpArticle(row: HelpArticleRow): HelpArticleProjection {
  return {
    id: row.id,
    category: row.category,
    locale: row.locale,
    title: row.title,
    bodyMarkdown: row.bodyMarkdown,
    publishedAt: row.publishedAt.toISOString(),
    version: row.version,
  };
}

export function projectFeedback(row: FeedbackRow): FeedbackProjection {
  return {
    id: row.id,
    category: row.category,
    content: row.content,
    status: row.status,
    publicReply: row.publicReply,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}
