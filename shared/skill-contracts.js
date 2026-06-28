export const REQUIRED_SKILL_METADATA_FIELDS = [
  'name',
  'version',
  'description',
  'category',
  'tags',
  'owner',
];

export const REQUIRED_SKILL_SECTIONS = [
  'Purpose',
  'When To Use',
  'Inputs',
  'Outputs',
  'Rules',
  'Constraints',
  'Examples',
  'Failure Modes',
  'Validation Checklist',
  'Execution Steps',
  'Quality Standards',
  'Files Used',
  'Dependencies',
  'Prompt Template',
];

export const DOKI_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['quote', 'hint', 'action'],
  properties: {
    quote: { type: 'string', maxLength: 120 },
    hint: { type: 'string', maxLength: 160 },
    action: { enum: ['wiggle', 'spin', 'jump', 'bark', 'zoom', null] },
  },
};

export const DEFAULT_DOKI_FALLBACK = {
  quote: 'Doki sigue vigilando el VAR',
  hint: 'Modo perro periodista deportivo activado.',
  action: 'wiggle',
};

export function createSkillExecutionId() {
  return `skill_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
