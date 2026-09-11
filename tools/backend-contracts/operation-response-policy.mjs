// A disabled registration alone must never excuse an incomplete public contract.
export function responsePolicyFailures(operation, disabledOperations) {
  const failures = [];
  const responses = Object.keys(operation.responses ?? {});
  const success = responses.some(status => /^2(?:\d\d|XX)$/.test(status));
  const error = responses.some(status => /^(?:4|5)(?:\d\d|XX)$/.test(status) || status === 'default');
  const retired = operation.deprecated === true && typeof operation['x-retirement-reason'] === 'string' && operation['x-retirement-reason'].trim().length > 0;
  const deferred = operation['x-availability'] === 'DEFERRED' && typeof operation['x-deferral-reason'] === 'string' && operation['x-deferral-reason'].trim().length > 0;
  if (retired || deferred) {
    if (!disabledOperations.has(operation.operationId)) failures.push('declares unavailable behavior without a disabled registration');
    if (success) failures.push('declares a success response for an unavailable operation');
    if (retired && !responses.includes('403')) failures.push('retired operation must declare 403');
    if (deferred && !responses.includes('503')) failures.push('deferred operation must declare 503');
  } else if (!success) failures.push('has no success response');
  if (!error) failures.push('has no error response');
  return failures;
}
