const STUDENT_EMAIL_PATTERN = /^[^\s@]+@mail\.bnbu\.edu\.cn$/i;

export function isStudentSchoolEmail(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length <= 254 && STUDENT_EMAIL_PATTERN.test(value.trim());
}

/** New bindings use the student prefix; existing verified accounts retain login access. */
export function isNewStudentSchoolEmail(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[a-z][0-9]{9}@mail\.bnbu\.edu\.cn$/.test(value.trim());
}
