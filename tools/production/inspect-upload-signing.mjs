// Read-only signing diagnostics. Never prints a URL, object key or credential.
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { S3MediaStorageAdapter } from '/app/dist/common/object-storage/s3-media-storage.adapter.js';
await loadRuntimeSecrets(process.env);
const adapter = new S3MediaStorageAdapter(validateEnvironment(process.env).RUNTIME_CONFIG);
try {
  const upload = await adapter.createUploadUrl({
    storageKey: 'media/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/image',
    contentType: 'image/jpeg', contentLength: 1024, expiresInSeconds: 60,
  });
  const url = new URL(upload.url);
  console.log(JSON.stringify({check:'upload-signature-shape',
    queryKeys:[...url.searchParams.keys()].sort(),
    signedHeaders:url.searchParams.get('X-Amz-SignedHeaders'),
    requiredHeaders:upload.requiredHeaders,
  }));
} finally { adapter.onModuleDestroy(); }
