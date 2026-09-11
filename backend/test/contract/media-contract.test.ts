import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { MediaController } from '../../src/modules/media/interface/http/media.controller.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  assert.equal(typeof value, 'object', `${label} must be an object`);
  assert.notEqual(value, null, `${label} must not be null`);
  assert.equal(Array.isArray(value), false, `${label} must not be an array`);
  return value as JsonObject;
}

function stringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  const isString = (item: unknown): item is string => typeof item === 'string';
  assert.ok(value.every(isString));
  return value;
}

const contract = object(
  parse(
    readFileSync(new URL('../../../docs/backend-contracts/openapi.yaml', import.meta.url), 'utf8'),
  ),
  'OpenAPI',
);

describe('Stage 15 MediaEvidence contract', () => {
  it('binds exactly five operations to real Controller methods and frozen policies', () => {
    const expected = [
      [
        '/media-uploads',
        'post',
        'initiateMediaUpload',
        'initiate',
        ['STUDENT'],
        'EXERCISE_SESSION_FROM_REQUEST',
      ],
      [
        '/media-uploads/{uploadSessionId}/confirm',
        'post',
        'confirmMediaUpload',
        'confirm',
        ['STUDENT'],
        'MEDIA_UPLOAD_FROM_PATH',
      ],
      [
        '/media/{mediaId}',
        'get',
        'getMediaEvidence',
        'get',
        ['STUDENT', 'TEACHER'],
        'MEDIA_FROM_PATH',
      ],
      [
        '/media/{mediaId}/bind',
        'post',
        'bindMediaEvidence',
        'bind',
        ['STUDENT'],
        'MEDIA_FROM_PATH',
      ],
      [
        '/media/{mediaId}/access-url',
        'post',
        'createMediaAccessUrl',
        'accessUrl',
        ['STUDENT', 'TEACHER'],
        'MEDIA_FROM_PATH',
      ],
    ] as const;
    const paths = object(contract.paths, 'paths');
    for (const [path, method, operationId, controllerMethod, roles, resolver] of expected) {
      const pathItem = object(paths[path], path);
      const operation = object(pathItem[method], operationId);
      const policy = object(operation['x-access-policy'], `${operationId} policy`);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(stringArray(policy.allowedRoles, 'roles'), roles);
      assert.equal(policy.resourceResolver, resolver);
      assert.equal(policy.defaultDeny, true);
      assert.equal(operationPolicies[operationId].resourceResolver, resolver);
      const descriptor = Object.getOwnPropertyDescriptor(
        MediaController.prototype,
        controllerMethod,
      );
      if (descriptor === undefined) throw new Error(`${controllerMethod} descriptor is missing`);
      const handler: unknown = descriptor.value;
      if (typeof handler !== 'function') throw new Error(`${controllerMethod} handler is missing`);
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler), operationId);
    }
  });

  it('freezes stable media identity, declared/verified separation, and Session-only binding', () => {
    const components = object(contract.components, 'components');
    const schemas = object(components.schemas, 'schemas');
    const uploadSession = object(schemas.MediaUploadSession, 'MediaUploadSession');
    assert.ok(stringArray(uploadSession.required, 'upload required').includes('mediaId'));
    const mediaEvidence = object(schemas.MediaEvidence, 'MediaEvidence');
    const fields = Object.keys(object(mediaEvidence.properties, 'MediaEvidence properties'));
    for (const field of [
      'declaredMimeType',
      'verifiedMimeType',
      'declaredFileSizeBytes',
      'verifiedFileSizeBytes',
      'declaredContentSha256',
      'verifiedContentSha256',
      'declaredDurationSeconds',
      'verifiedDurationSeconds',
    ]) {
      assert.ok(fields.includes(field));
    }
    assert.equal(fields.includes('storageKey'), false);
    const bind = object(schemas.BindMediaRequest, 'BindMediaRequest');
    assert.deepEqual(stringArray(bind.required, 'bind required'), ['sessionId', 'expectedVersion']);
    assert.equal(object(bind.properties, 'bind properties').recordId, undefined);
  });

  it('publishes trusted track and location failures only on upload confirmation', () => {
    const paths = object(contract.paths, 'paths');
    const initiate = object(object(paths['/media-uploads'], 'initiate path').post, 'initiate');
    const confirm = object(
      object(paths['/media-uploads/{uploadSessionId}/confirm'], 'confirm path').post,
      'confirm',
    );
    assert.equal(
      stringArray(initiate['x-error-codes'], 'initiate errors').includes(
        'MEDIA_AUDIO_TRACK_REQUIRED',
      ),
      false,
    );
    assert.equal(
      stringArray(confirm['x-error-codes'], 'confirm errors').includes(
        'MEDIA_AUDIO_TRACK_REQUIRED',
      ),
      true,
    );
    assert.equal(
      stringArray(initiate['x-error-codes'], 'initiate errors').includes(
        'MEDIA_LOCATION_METADATA_NOT_ALLOWED',
      ),
      false,
    );
    assert.equal(
      stringArray(confirm['x-error-codes'], 'confirm errors').includes(
        'MEDIA_LOCATION_METADATA_NOT_ALLOWED',
      ),
      true,
    );
  });

  it('publishes the byte-verified browser WebM transport without requiring GPS', () => {
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    const initiate = object(schemas.InitiateMediaUploadRequest, 'initiate request');
    const mimeType = object(
      object(initiate.properties, 'initiate properties').mimeType,
      'mimeType',
    );
    assert.deepEqual(stringArray(mimeType.enum, 'media MIME enum'), [
      'image/jpeg',
      'image/png',
      'video/mp4',
      'video/quicktime',
      'video/3gpp',
      'video/webm',
    ]);
    assert.match(String(mimeType.description), /actual bytes and container/);
    assert.match(String(initiate.description), /No location permission or GPS data is required/);
  });

  it('keeps 126 total operations and exactly five MediaEvidence operations', () => {
    const operations: JsonObject[] = [];
    const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
    for (const pathItem of Object.values(object(contract.paths, 'paths'))) {
      for (const [method, value] of Object.entries(object(pathItem, 'path item'))) {
        if (!methods.has(method)) continue;
        const operation = object(value, 'operation');
        if (typeof operation.operationId === 'string') operations.push(operation);
      }
    }
    assert.equal(operations.length, 126);
    assert.equal(
      operations.filter(
        (operation) =>
          typeof operation.operationId === 'string' &&
          operation.operationId.toLowerCase().includes('media'),
      ).length,
      5,
    );
  });
});
