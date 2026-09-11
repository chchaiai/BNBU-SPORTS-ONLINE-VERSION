import { timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../errors/application-error.js';
import { canonicalJson } from '../idempotency/idempotency.service.js';
import { SecureDigestService } from '../security/secure-digest.service.js';

export interface CursorBinding {
  resource:
    | 'COURSE'
    | 'CLASS_SECTION'
    | 'ENROLLMENT'
    | 'OFFICIAL_ROSTER_IMPORT'
    | 'OFFICIAL_ROSTER_ENTRY'
    | 'ROSTER_ALIGNMENT_RESULT'
    | 'EXERCISE_RECORD'
    | 'REVIEW_RECORD'
    | 'STUDENT_PROFILE'
    | 'AUDIT_LOG'
    | 'NOTIFICATION'
    | 'FEEDBACK'
    | 'EXEMPTION_APPLICATION'
    | 'SCORE_RULE'
    | 'STUDENT_SCORE'
    | 'STUDENT_PROGRESS'
    | 'TEACHER_PROGRESS'
    | 'CERTIFICATION'
    | 'CERTIFICATION_REVISION'
    | 'SCORE_ADJUSTMENT';
  organizationId: string;
  principalId: string;
  role: string;
  filters: Record<string, string | number | boolean | null>;
  sort: string;
  limit: number;
}

export interface CursorPosition {
  value: string;
  id: string;
}

interface CursorPayload {
  version: 1;
  bindingDigest: string;
  position: CursorPosition;
}

@Injectable()
export class ScopedCursorService {
  constructor(private readonly digest: SecureDigestService) {}

  encode(binding: CursorBinding, position: CursorPosition): string {
    const payload: CursorPayload = {
      version: 1,
      bindingDigest: this.bindingDigest(binding),
      position,
    };
    const encoded = Buffer.from(canonicalJson(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.digest.digest('pagination-cursor', encoded)}`;
  }

  decode(cursor: string | undefined, binding: CursorBinding): CursorPosition | null {
    if (cursor === undefined) return null;
    if (cursor.length < 1 || cursor.length > 2048) this.invalid();
    const [encoded, signature, extra] = cursor.split('.');
    if (encoded === undefined || signature === undefined || extra !== undefined) this.invalid();

    const expected = this.digest.digest('pagination-cursor', encoded);
    const actualBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      this.invalid();
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<CursorPayload>;
      if (
        payload.version !== 1 ||
        payload.bindingDigest !== this.bindingDigest(binding) ||
        payload.position === undefined ||
        typeof payload.position.value !== 'string' ||
        typeof payload.position.id !== 'string' ||
        payload.position.value.length > 200 ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          payload.position.id,
        )
      ) {
        this.invalid();
      }
      return payload.position;
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error;
      this.invalid();
    }
  }

  private bindingDigest(binding: CursorBinding): string {
    return this.digest.digest('pagination-binding', canonicalJson(binding));
  }

  private invalid(): never {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422, {
      fieldErrors: [
        {
          field: 'cursor',
          code: 'INVALID',
          i18nKey: 'error.validation.failed',
          params: {},
        },
      ],
    });
  }
}
