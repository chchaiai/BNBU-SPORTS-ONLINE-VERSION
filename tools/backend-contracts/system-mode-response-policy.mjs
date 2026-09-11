export function missingServiceUnavailableResponses(api) {
  const missing = [];
  for (const [path, item] of Object.entries(api.paths ?? {})) {
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const operation = item[method];
      if (!operation) continue;
      if (!operation.responses) throw new Error(`Operation has no responses block: ${method.toUpperCase()} ${path}`);
      if (!Object.hasOwn(operation.responses, '503')) missing.push({ path, method });
    }
  }
  return missing;
}
