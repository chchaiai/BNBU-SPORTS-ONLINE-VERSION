import type { Readable } from 'node:stream';

export const MEDIA_STORAGE_PORT = Symbol('MEDIA_STORAGE_PORT');

export interface MediaObjectMetadata {
  entityTag: string | null;
  contentLength: number | null;
  contentType: string | null;
}

export abstract class MediaStoragePort {
  abstract checkHealth(): Promise<void>;

  abstract createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; method: 'PUT'; requiredHeaders: Record<string, string> }>;

  abstract headPrivateObject(storageKey: string): Promise<MediaObjectMetadata>;
  abstract getPrivateObject(storageKey: string): Promise<Readable>;

  abstract createAccessUrl(input: {
    storageKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
