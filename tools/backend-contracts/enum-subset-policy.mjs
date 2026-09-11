export function enumSubsetFailures(schema, definitions) {
  if (!Array.isArray(schema.enum)) return [];
  if (typeof schema['x-enum-subset-of'] === 'string') {
    const name = schema['x-enum-subset-of'];
    const values = definitions[name]?.enum;
    if (!Array.isArray(values)) return [`references unknown enum ${name}`];
    const nullable = schema.type === undefined || schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null'));
    return schema.enum.filter(value => !(value === null && nullable) && !values.some(member => Object.is(member, value)))
      .map(value => `contains ${JSON.stringify(value)} outside enum ${name}`);
  }
  if (schema['x-transport-constraint'] === true) return [];
  return ['must declare x-enum-subset-of or x-transport-constraint'];
}
