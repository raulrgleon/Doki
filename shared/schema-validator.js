function typeMatches(value, expected) {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
}

export function validateJsonSchema(value, schema, path = 'output') {
  const errors = [];
  if (!schema) return { ok: true, errors };

  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`);
    return { ok: false, errors };
  }

  if (schema.type === 'object') {
    const required = schema.required || [];
    required.forEach((key) => {
      if (!(key in value)) errors.push(`${path}.${key} is required`);
    });

    Object.entries(schema.properties || {}).forEach(([key, rules]) => {
      if (!(key in value)) return;
      const current = value[key];
      if (rules.type && !typeMatches(current, rules.type)) {
        errors.push(`${path}.${key} must be ${rules.type}`);
      }
      if (rules.enum && !rules.enum.some((allowed) => allowed === current)) {
        errors.push(`${path}.${key} must be one of ${rules.enum.join(', ')}`);
      }
      if (rules.maxLength && typeof current === 'string' && current.length > rules.maxLength) {
        errors.push(`${path}.${key} must be ${rules.maxLength} characters or less`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

export function assertSafeSkillName(name) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(name)) {
    throw new Error(`Invalid skill name: ${name}`);
  }
}
