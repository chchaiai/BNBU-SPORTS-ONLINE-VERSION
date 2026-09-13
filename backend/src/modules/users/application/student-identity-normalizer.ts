import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application-error.js';
import {
  STUDENT_GENDERS,
  type NormalizedStudentIdentity,
  type StudentGender,
  type StudentIdentityInput,
} from './student-identity.js';

const STUDENT_NUMBER_PATTERN = /^[A-Z0-9._-]{1,32}$/;
export const STUDENT_REGION_CODES = new Set([
  'CN-11','CN-12','CN-13','CN-14','CN-15','CN-21','CN-22','CN-23','CN-31','CN-32','CN-33','CN-34','CN-35','CN-36','CN-37',
  'CN-41','CN-42','CN-43','CN-44','CN-45','CN-46','CN-50','CN-51','CN-52','CN-53','CN-54','CN-61','CN-62','CN-63','CN-64','CN-65','HK','MO','TW','OTHER',
]);

@Injectable()
export class StudentIdentityNormalizer {
  normalize(input: StudentIdentityInput): NormalizedStudentIdentity {
    const studentNumber = input.studentNumber.trim().toUpperCase();
    const fullName = input.fullName.trim().normalize('NFC');
    if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) this.invalid('studentNumber');
    if (fullName.length < 1 || fullName.length > 100) this.invalid('fullName');
    if (!STUDENT_GENDERS.includes(input.gender as StudentGender)) this.invalid('gender');
    if (
      !Number.isSafeInteger(input.gradeYear) ||
      input.gradeYear < 1000 ||
      input.gradeYear > 9999
    ) {
      this.invalid('gradeYear');
    }
    const details: Pick<NormalizedStudentIdentity, 'collegeName' | 'majorName' | 'dateOfBirth' | 'regionCode' | 'otherRegionName'> = {};
    for (const field of ['collegeName', 'majorName'] as const) {
      if (input[field] !== undefined) {
        const value = input[field].trim().normalize('NFC');
        if (!value || value.length > 200) this.invalid(field);
        details[field] = value;
      }
    }
    if (input.dateOfBirth !== undefined) {
      const date = input.dateOfBirth;
      const at = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(at.getTime()) ||
          at.toISOString().slice(0, 10) !== date || date < '1900-01-01' || at > new Date()) this.invalid('dateOfBirth');
      details.dateOfBirth = date;
    }
    if (input.regionCode !== undefined) {
      if (!STUDENT_REGION_CODES.has(input.regionCode)) this.invalid('regionCode');
      details.regionCode = input.regionCode;
    }
    if (input.regionCode === 'OTHER') {
      const value = input.otherRegionName?.trim().normalize('NFC');
      if (!value || value.length > 100) this.invalid('otherRegionName');
      details.otherRegionName = value;
    } else if (input.otherRegionName !== undefined) this.invalid('otherRegionName');
    return {
      ...details,
      studentNumber,
      fullName,
      gender: input.gender as StudentGender,
      gradeYear: input.gradeYear,
    };
  }

  private invalid(field: keyof StudentIdentityInput): never {
    throw new ApplicationError('USER_PROFILE_INVALID', 422, {
      fieldErrors: [
        {
          field,
          code: 'INVALID',
          i18nKey: 'error.user.profileInvalid',
          params: {},
        },
      ],
    });
  }
}
