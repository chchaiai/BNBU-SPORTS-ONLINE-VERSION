import type { ValidationError } from 'class-validator';

import { ApplicationError } from '../errors/application-error.js';

interface FieldError {
  field: string;
  code: 'INVALID';
  i18nKey: 'error.validation.failed';
  params: Record<string, never>;
}

function flatten(errors: ValidationError[], prefix = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = prefix.length === 0 ? error.property : `${prefix}.${error.property}`;
    const own =
      error.constraints === undefined
        ? []
        : [
            {
              field,
              code: 'INVALID' as const,
              i18nKey: 'error.validation.failed' as const,
              params: {},
            },
          ];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export function validationException(errors: ValidationError[]): ApplicationError {
  return new ApplicationError('VALIDATION_FAILED', 422, { fieldErrors: flatten(errors) });
}
