import type { Readable } from 'node:stream';

export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');

export interface PutPrivateObjectInput {
  storageKey: string;
  body: Readable;
  contentType: string;
  contentLength?: number;
}

export interface PutPrivateObjectResult {
  entityTag: string | null;
}

export interface ObjectStoragePort {
  checkHealth(): Promise<void>;
  putPrivateObject(input: PutPrivateObjectInput): Promise<PutPrivateObjectResult>;
  getPrivateObject(storageKey: string): Promise<Readable>;
  deletePrivateObject(storageKey: string): Promise<void>;
}
