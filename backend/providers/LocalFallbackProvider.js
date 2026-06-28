import { BaseProvider } from './BaseProvider.js';
import { DEFAULT_DOKI_FALLBACK } from '../../shared/skill-contracts.js';

export class LocalFallbackProvider extends BaseProvider {
  constructor() {
    super({ name: 'local-fallback' });
  }

  async generate({ skill }) {
    return {
      provider: this.name,
      model: 'fallback-template',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      costUsd: 0,
      output: skill.metadata.fallback || DEFAULT_DOKI_FALLBACK,
    };
  }
}
