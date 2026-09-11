import CvmRoleCredentialModule from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/cvm_role_credential.js';
import { ses } from 'tencentcloud-sdk-nodejs-ses';

import type { TencentSesEmailDeliveryConfig } from '../../common/config/environment.js';
import {
  AuthCodeDeliveryPort,
  AuthCodeDeliveryUnavailableError,
  type AuthCodeDelivery,
} from './auth-code-delivery.port.js';

const { default: CvmRoleCredential } = CvmRoleCredentialModule;

interface TencentSesClientPort {
  SendEmail(request: {
    FromEmailAddress: string;
    Subject: string;
    Destination: string[];
    ReplyToAddresses?: string;
    Template: { TemplateID: number; TemplateData: string };
    TriggerType: number;
    SmtpHeaders: string;
  }): Promise<unknown>;
}

const SesClient = ses.v20201002.Client;

export class TencentSesAuthCodeDeliveryAdapter extends AuthCodeDeliveryPort {
  private static readonly MAX_DELIVERY_ATTEMPTS = 3;
  private readonly client: TencentSesClientPort;

  constructor(
    private readonly config: TencentSesEmailDeliveryConfig,
    client?: TencentSesClientPort,
  ) {
    super();
    this.client =
      client ??
      new SesClient({
        credential: new CvmRoleCredential(),
        region: config.region,
        profile: {
          signMethod: 'TC3-HMAC-SHA256',
          httpProfile: {
            endpoint: 'ses.tencentcloudapi.com',
            protocol: 'https://',
            reqMethod: 'POST',
            reqTimeout: 10,
          },
        },
      });
  }

  async deliver(message: AuthCodeDelivery): Promise<void> {
    if (message.channel !== 'EMAIL') throw new AuthCodeDeliveryUnavailableError();
    const request = this.request(message);
    for (
      let attempt = 1;
      attempt <= TencentSesAuthCodeDeliveryAdapter.MAX_DELIVERY_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await this.client.SendEmail(request);
        return;
      } catch {
        if (attempt === TencentSesAuthCodeDeliveryAdapter.MAX_DELIVERY_ATTEMPTS) {
          throw new AuthCodeDeliveryUnavailableError();
        }
      }
    }
  }

  private request(message: AuthCodeDelivery): Parameters<TencentSesClientPort['SendEmail']>[0] {
    const minutes = Math.max(1, Math.ceil((message.expiresAt.getTime() - Date.now()) / 60_000));
    const variables: Record<string, string> = {
      [this.config.templateVariables.code]: message.code,
    };
    const expiryVariable = this.config.templateVariables.expiryMinutes;
    if (expiryVariable !== null) variables[expiryVariable] = String(minutes);
    const purposeVariable = this.config.templateVariables.purpose;
    if (purposeVariable !== null) variables[purposeVariable] = purposeLabel(message);

    return {
      FromEmailAddress: this.config.fromAddress,
      Subject:
        message.locale === 'zh-CN'
          ? `BNBU Sports ${purposeLabel(message)}验证码`
          : `BNBU Sports ${purposeLabel(message)} code`,
      Destination: [message.recipient],
      ...(this.config.replyToAddress === null
        ? {}
        : { ReplyToAddresses: this.config.replyToAddress }),
      Template: {
        TemplateID: this.config.templateId,
        TemplateData: JSON.stringify(variables),
      },
      TriggerType: 1,
      SmtpHeaders: JSON.stringify({ 'X-BNBU-Delivery-Id': message.deliveryId }),
    };
  }
}

function purposeLabel(message: AuthCodeDelivery): string {
  if (message.locale === 'zh-CN') {
    if (message.purpose === 'ADMIN_IDENTITY_VERIFICATION') return '管理员身份核验';
    if (message.purpose === 'ACCOUNT_DELETION') return '注销账号';
    if (message.purpose === 'STUDENT_SIGN_IN') return '学生登录';
    if (message.purpose === 'ACCOUNT_RECOVERY') return '账户找回';
    if (message.purpose === 'EMAIL_FIRST_BIND') return '邮箱绑定';
    if (message.purpose === 'EMAIL_REBIND_CURRENT') return '当前邮箱确认';
    return '新邮箱确认';
  }
  if (message.purpose === 'ADMIN_IDENTITY_VERIFICATION') return 'administrator identity verification';
  if (message.purpose === 'STUDENT_SIGN_IN') return 'student sign-in';
  if (message.purpose === 'ACCOUNT_DELETION') return 'account deletion';
  if (message.purpose === 'ACCOUNT_RECOVERY') return 'account recovery';
  if (message.purpose === 'EMAIL_FIRST_BIND') return 'email binding';
  if (message.purpose === 'EMAIL_REBIND_CURRENT') return 'current-email confirmation';
  return 'new-email confirmation';
}
