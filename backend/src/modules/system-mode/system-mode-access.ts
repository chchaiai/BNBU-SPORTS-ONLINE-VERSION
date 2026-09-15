/** Mode availability only; authentication and operation permissions remain mandatory. */
export function permitsSystemMode(mode: string | undefined, role: string): boolean {
  return mode === 'NORMAL' || (mode === 'MAINTENANCE' && role === 'ADMIN');
}
