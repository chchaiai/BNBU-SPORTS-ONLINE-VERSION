import type { JoinCapabilityPolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';
import type { JoinCapabilityState } from './join-capability.js';

export interface JoinCapabilityPolicyRecord {
  tokenHash: string;
  inviteTokenHash: string;
  context: JoinCapabilityPolicyContext;
}

export abstract class JoinCapabilityRepository {
  abstract create(state: JoinCapabilityState, transaction: object): Promise<JoinCapabilityState>;
  abstract findById(
    capabilityId: string,
    transaction?: object,
  ): Promise<JoinCapabilityState | null>;
  abstract lockById(capabilityId: string, transaction: object): Promise<JoinCapabilityState | null>;
  abstract consume(
    state: JoinCapabilityState,
    expectedVersion: number,
    transaction: object,
  ): Promise<boolean>;
  abstract findPolicyRecordById(capabilityId: string): Promise<JoinCapabilityPolicyRecord | null>;
}
