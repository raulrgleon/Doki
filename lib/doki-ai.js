import { generateDokiSkillMessage } from '../services/doki-skill-service.js';

export async function generateDokiMessage(payload) {
  return generateDokiSkillMessage(payload);
}
