import { SetMetadata } from '@nestjs/common';

import type { OperationId } from '../../generated/operation-policies.generated.js';

export const OPERATION_ID_METADATA = 'foundation:operation-id';

export const OperationPolicy = (operationId: OperationId): MethodDecorator =>
  SetMetadata(OPERATION_ID_METADATA, operationId);
