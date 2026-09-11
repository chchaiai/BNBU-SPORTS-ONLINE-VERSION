import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parse } from 'yaml';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';

import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { ClientCapabilitiesController } from '../../src/modules/client-capabilities/client-capabilities.controller.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  assert.equal(typeof value, 'object', `${label} must be an object`);
  assert.notEqual(value, null, `${label} must not be null`);
  assert.equal(Array.isArray(value), false, `${label} must not be an array`);
  return value as JsonObject;
}

const contract = object(
  parse(
    readFileSync(new URL('../../../docs/backend-contracts/openapi.yaml', import.meta.url), 'utf8'),
  ),
  'OpenAPI',
);

const bindings = [
  ['/auth/student-sign-in-codes', 'post', 'requestStudentSignInCode'],
  ['/auth/student-sign-in-codes/verify', 'post', 'verifyStudentSignInCode'],
  ['/auth/account-recovery-requests', 'post', 'requestAccountRecovery'],
  ['/auth/account-recovery-requests/complete', 'post', 'completeAccountRecovery'],
  ['/notifications', 'get', 'listNotifications'],
  ['/notifications/{notificationId}/read', 'post', 'markNotificationRead'],
  ['/push-devices', 'post', 'registerPushDevice'],
  ['/push-devices/{deviceId}', 'delete', 'unregisterPushDevice'],
  ['/me/preferences', 'get', 'getCurrentUserPreferences'],
  ['/me/preferences', 'patch', 'updateCurrentUserPreferences'],
  ['/help-articles', 'get', 'listHelpArticles'],
  ['/help-articles/{articleId}', 'get', 'getHelpArticle'],
  ['/feedback', 'post', 'createFeedback'],
  ['/feedback', 'get', 'listFeedback'],
  ['/feedback/{feedbackId}', 'get', 'getFeedback'],
  ['/exemption-application-details', 'get', 'listStructuredExemptionApplications'],
  ['/exemption-applications', 'get', 'listExemptionApplications'],
  ['/exemption-applications', 'post', 'createExemptionApplication'],
  ['/exemption-applications/{applicationId}', 'get', 'getExemptionApplication'],
  ['/exemption-applications/{applicationId}', 'patch', 'updateExemptionApplication'],
  ['/exemption-applications/{applicationId}/submit', 'post', 'submitExemptionApplication'],
  ['/exemption-applications/{applicationId}/review', 'post', 'reviewExemptionApplication'],
  ['/app-release-policy', 'get', 'getAppReleasePolicy'],
  ['/sport-catalog', 'get', 'getSportCatalog'],
  ['/activity-conversion-rules', 'get', 'getActivityConversionRules'],
  ['/exercise-sessions/{sessionId}/location-track', 'post', 'startExerciseLocationTrack'],
  ['/exercise-sessions/{sessionId}/location-samples', 'post', 'appendExerciseLocationSamples'],
  [
    '/exercise-sessions/{sessionId}/location-track/finalize',
    'post',
    'finalizeExerciseLocationTrack',
  ],
  ['/exercise-records/{recordId}/location-summary', 'get', 'getExerciseRecordLocationSummary'],
  ['/location-privacy-policy', 'get', 'getLocationPrivacyPolicy'],
  ['/location-privacy-policy', 'patch', 'updateLocationPrivacyPolicy'],
] as const;

const requestMethods = {
  get: RequestMethod.GET,
  post: RequestMethod.POST,
  patch: RequestMethod.PATCH,
  delete: RequestMethod.DELETE,
} as const;

const defaultDenyOperations = new Set([
  'getSportCatalog',
  'getActivityConversionRules',
  'startExerciseLocationTrack',
  'appendExerciseLocationSamples',
  'finalizeExerciseLocationTrack',
  'getExerciseRecordLocationSummary',
  'getLocationPrivacyPolicy',
  'updateLocationPrivacyPolicy',
]);

describe('Stage 21 client capability contract', () => {
  it('binds all thirty added operations and keeps only unresolved capabilities default-deny', () => {
    const paths = object(contract.paths, 'paths');
    for (const [path, method, operationId] of bindings) {
      const operation = object(object(paths[path], path)[method], operationId);
      assert.equal(operation.operationId, operationId);
      if (defaultDenyOperations.has(operationId)) {
        assert.equal(operation['x-enabled-by-default'], false);
        assert.equal(operation['x-default-deny-error'], 'SYSTEM_MODE_UNSUPPORTED');
        assert.equal(typeof operation['x-business-blocker'], 'string');
      } else {
        assert.equal(Object.hasOwn(operation, 'x-enabled-by-default'), false);
        assert.equal(Object.hasOwn(operation, 'x-default-deny-error'), false);
        assert.equal(Object.hasOwn(operation, 'x-business-blocker'), false);
      }
      assert.equal(object(operation['x-access-policy'], `${operationId} policy`).defaultDeny, true);
      assert.ok(operationPolicies[operationId]);

      const handler: unknown = Object.getOwnPropertyDescriptor(
        ClientCapabilitiesController.prototype,
        operationId,
      )?.value;
      assert.equal(typeof handler, 'function', `${operationId} must have a controller handler`);
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler as object), operationId);
      assert.equal(
        Reflect.getMetadata(PATH_METADATA, handler as object),
        path.slice(1).replace(/\{([^}]+)\}/gu, ':$1'),
        `${operationId} route must match OpenAPI`,
      );
      assert.equal(
        Reflect.getMetadata(METHOD_METADATA, handler as object),
        requestMethods[method],
        `${operationId} method must match OpenAPI`,
      );
    }
  });

  it('keeps GPS raw coordinates write-only and exposes only a coarse review summary', () => {
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    const sampleProperties = object(
      object(schemas.LocationSample, 'LocationSample').properties,
      'p',
    );
    assert.equal(object(sampleProperties.latitude, 'latitude').writeOnly, true);
    assert.equal(object(sampleProperties.longitude, 'longitude').writeOnly, true);

    const summaryProperties = object(
      object(schemas.LocationSummary, 'LocationSummary').properties,
      'LocationSummary properties',
    );
    assert.equal(Object.hasOwn(summaryProperties, 'latitude'), false);
    assert.equal(Object.hasOwn(summaryProperties, 'longitude'), false);
    assert.ok(Object.hasOwn(summaryProperties, 'coarseRoutePolyline'));
    assert.ok(Object.hasOwn(summaryProperties, 'coarseDistanceMeters'));
  });

  it('supports IOS in every public client-platform contract without removing Android or Web', () => {
    const paths = object(contract.paths, 'paths');
    const releasePolicyOperation = object(
      object(paths['/app-release-policy'], '/app-release-policy').get,
      'getAppReleasePolicy',
    );
    const parameters = releasePolicyOperation.parameters as unknown[];
    const platformParameter = parameters
      .map((parameter) => object(parameter, 'getAppReleasePolicy parameter'))
      .find((parameter) => parameter.name === 'platform');
    assert.ok(platformParameter);
    assert.deepEqual(object(platformParameter.schema, 'platform query schema').enum, [
      'ANDROID',
      'WEB',
      'IOS',
    ]);

    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    for (const schemaName of ['PushDeviceRegistrationRequest', 'PushDevice', 'AppReleasePolicy']) {
      const properties = object(object(schemas[schemaName], schemaName).properties, 'properties');
      assert.deepEqual(object(properties.platform, `${schemaName}.platform`).enum, [
        'ANDROID',
        'WEB',
        'IOS',
      ]);
    }

    const feedbackProperties = object(
      object(schemas.CreateFeedbackRequest, 'CreateFeedbackRequest').properties,
      'CreateFeedbackRequest properties',
    );
    const contextProperties = object(
      object(feedbackProperties.clientContext, 'clientContext').properties,
      'clientContext properties',
    );
    assert.deepEqual(object(contextProperties.platform, 'clientContext.platform').enum, [
      'ANDROID',
      'WEB',
      'IOS',
    ]);
  });

  it('preserves exact exemption subtypes and the pre-authentication QR join sequence', () => {
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    for (const schemaName of [
      'StructuredExemptionApplication',
      'CreateExemptionApplicationRequest',
      'UpdateExemptionApplicationRequest',
    ]) {
      const properties = object(object(schemas[schemaName], schemaName).properties, 'properties');
      assert.ok(Object.hasOwn(properties, 'applicationSubtype'));
      assert.ok(Object.hasOwn(properties, 'organizationName'));
    }
    const createRequired = object(
      schemas.CreateExemptionApplicationRequest,
      'CreateExemptionApplicationRequest',
    ).required as string[];
    assert.equal(createRequired.includes('applicationSubtype'), false);
    assert.equal(createRequired.includes('organizationName'), false);

    const paths = object(contract.paths, 'paths');
    const join = object(
      object(paths['/course-invites/{inviteToken}/join'], 'join path').post,
      'join operation',
    );
    assert.match(String(join.description), /PENDING_CONTACT_BINDING/u);
    assert.deepEqual(join.security, [{ JoinCapability: [] }]);

    const submitExemption = object(
      object(paths['/exemption-applications/{applicationId}/submit'], 'submit path').post,
      'submit operation',
    );
    assert.ok(Object.hasOwn(object(submitExemption.responses, 'submit responses'), '422'));
  });

  it('closes all 126 operations and reports the persisted subset separately from default deny', () => {
    const coverage = JSON.parse(
      readFileSync(new URL('../../runtime-coverage.manifest.json', import.meta.url), 'utf8'),
    ) as {
      expectedOperationCount: number;
      implemented: JsonObject;
      implementedDefaultDeny: string[];
    };
    assert.equal(coverage.expectedOperationCount, 126);
    assert.equal(Object.keys(coverage.implemented).length, 126);
    assert.equal(coverage.implementedDefaultDeny.length, 17);
    for (const [, , operationId] of bindings) {
      assert.equal(
        coverage.implementedDefaultDeny.includes(operationId),
        defaultDenyOperations.has(operationId),
      );
    }

    const prisma = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    for (const model of [
      'Notification',
      'PushDevice',
      'Feedback',
      'ExemptionApplication',
      'LocationTrack',
    ]) {
      assert.equal(new RegExp(`model\\s+${model}\\b`, 'u').test(prisma), true);
    }
  });
});
