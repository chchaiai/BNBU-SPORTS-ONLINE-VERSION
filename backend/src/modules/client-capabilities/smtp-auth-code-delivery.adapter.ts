import nodemailer from 'nodemailer';

import type { SmtpEmailDeliveryConfig } from '../../common/config/environment.js';
import {
  AuthCodeDeliveryPort,
  AuthCodeDeliveryUnavailableError,
  type AuthCodeDelivery,
} from './auth-code-delivery.port.js';

export class SmtpAuthCodeDeliveryAdapter extends AuthCodeDeliveryPort {
  private readonly transport: Pick<nodemailer.Transporter, 'sendMail'>;
  private static readonly MAX_DELIVERY_ATTEMPTS = 3;

  constructor(
    private readonly config: SmtpEmailDeliveryConfig,
    transport?: Pick<nodemailer.Transporter, 'sendMail'>,
  ) {
    super();
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.username === null || config.password === null
          ? {}
          : { auth: { user: config.username, pass: config.password } }),
        disableFileAccess: true,
        disableUrlAccess: true,
      });
  }

  async deliver(message: AuthCodeDelivery): Promise<void> {
    if (message.channel !== 'EMAIL') throw new AuthCodeDeliveryUnavailableError();
    const template = templateFor(message);
    for (
      let attempt = 1;
      attempt <= SmtpAuthCodeDeliveryAdapter.MAX_DELIVERY_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await this.transport.sendMail({
          from: this.config.fromAddress,
          to: message.recipient,
          subject: template.subject,
          text: template.text,
          html: template.html,
          headers: { 'X-BNBU-Delivery-Id': message.deliveryId },
        });
        return;
      } catch (error: unknown) {
        if (attempt === SmtpAuthCodeDeliveryAdapter.MAX_DELIVERY_ATTEMPTS) throw error;
      }
    }
  }
}

function templateFor(message: AuthCodeDelivery): {
  subject: string;
  text: string;
  html: string;
} {
  const minutes = Math.max(1, Math.ceil((message.expiresAt.getTime() - Date.now()) / 60_000));
  const purpose =
    message.locale === 'zh-CN' ? purposeChinese(message.purpose) : purposeEnglish(message.purpose);
  if (message.locale === 'zh-CN') {
    return {
      subject: `BNBU Sports ${purpose}验证码`,
      text: `您的${purpose}验证码是 ${message.code}，约 ${minutes} 分钟内有效。请勿向任何人透露此验证码。`,
      html: `<p>您的${purpose}验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${message.code}</p><p>约 ${minutes} 分钟内有效。请勿向任何人透露此验证码。</p>`,
    };
  }
  return {
    subject: `BNBU Sports ${purpose} code`,
    text: `Your ${purpose} code is ${message.code}. It expires in about ${minutes} minutes. Never share this code.`,
    html: `<p>Your ${purpose} code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${message.code}</p><p>It expires in about ${minutes} minutes. Never share this code.</p>`,
  };
}

function purposeChinese(purpose: AuthCodeDelivery['purpose']): string {
  if (purpose === 'ADMIN_IDENTITY_VERIFICATION') return '管理员身份核验';
  if (purpose === 'ACCOUNT_DELETION') return '注销账号';
  if (purpose === 'STUDENT_SIGN_IN') return '学生登录';
  if (purpose === 'ACCOUNT_RECOVERY') return '账户找回';
  if (purpose === 'EMAIL_FIRST_BIND') return '邮箱绑定';
  if (purpose === 'EMAIL_REBIND_CURRENT') return '当前邮箱确认';
  return '新邮箱确认';
}

function purposeEnglish(purpose: AuthCodeDelivery['purpose']): string {
  if (purpose === 'ADMIN_IDENTITY_VERIFICATION') return 'administrator identity verification';
  if (purpose === 'ACCOUNT_DELETION') return 'account deletion';
  if (purpose === 'STUDENT_SIGN_IN') return 'student sign-in';
  if (purpose === 'ACCOUNT_RECOVERY') return 'account recovery';
  if (purpose === 'EMAIL_FIRST_BIND') return 'email binding';
  if (purpose === 'EMAIL_REBIND_CURRENT') return 'current-email confirmation';
  return 'new-email confirmation';
}
