import { getSkillEngine } from '../backend/skills/skillRegistry.js';

const TRIGGER_TO_SKILL = {
  tap: 'doki-context-commentary',
  auto: 'doki-context-commentary',
  context: 'doki-context-commentary',
  score_update: 'doki-score-reaction',
  match_tap: 'doki-match-commentary',
  day_select: 'doki-day-summary',
};

const NON_CACHEABLE_TRIGGERS = new Set(['tap', 'match_tap', 'day_select']);

export function skillForDokiTrigger(trigger = 'auto') {
  return TRIGGER_TO_SKILL[trigger] || 'doki-context-commentary';
}

export async function generateDokiSkillMessage(payload = {}) {
  const trigger = payload.trigger || 'auto';
  const skillName = skillForDokiTrigger(trigger);
  const engine = getSkillEngine();
  const result = await engine.executeSkill(
    skillName,
    {
      trigger,
      context: payload.context || {},
    },
    { cache: !NON_CACHEABLE_TRIGGERS.has(trigger) }
  );
  return {
    ...result.output,
    _skill: {
      name: skillName,
      executionId: result.executionId,
      cacheHit: result.cacheHit,
    },
  };
}
