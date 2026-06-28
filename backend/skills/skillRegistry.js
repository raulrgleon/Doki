import { SkillEngine } from './SkillEngine.js';
import { createProvider } from '../providers/providerFactory.js';

let engine;

export function getSkillEngine() {
  if (!engine) {
    engine = new SkillEngine({ provider: createProvider() });
  }
  return engine;
}

export function resetSkillEngine() {
  engine = new SkillEngine({ provider: createProvider() });
  return engine;
}
