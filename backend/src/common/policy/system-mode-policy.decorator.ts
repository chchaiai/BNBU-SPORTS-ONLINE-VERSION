import { SetMetadata } from '@nestjs/common';

export const SYSTEM_MODE_ALLOWLIST_METADATA = 'foundation:system-mode-allowlist';
export const SYSTEM_MODES = ['NORMAL', 'MAINTENANCE'] as const;
export type SystemMode = (typeof SYSTEM_MODES)[number];

export const AllowSystemModes = (...modes: readonly SystemMode[]): MethodDecorator =>
  SetMetadata(SYSTEM_MODE_ALLOWLIST_METADATA, modes);
