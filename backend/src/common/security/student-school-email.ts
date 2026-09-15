const STUDENT_EMAIL_PATTERN = /^[^\s@]+@mail\.bnbu\.edu\.cn$/i;

export function isStudentSchoolEmail(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length <= 254 && STUDENT_EMAIL_PATTERN.test(value.trim());
}
