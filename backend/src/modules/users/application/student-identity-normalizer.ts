import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application-error.js';
import {
  STUDENT_GENDERS,
  type NormalizedStudentIdentity,
  type StudentGender,
  type StudentIdentityInput,
} from './student-identity.js';

const STUDENT_NUMBER_PATTERN = /^[A-Z0-9._-]{1,32}$/;

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
    return {
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
