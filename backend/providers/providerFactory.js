import { LocalFallbackProvider } from './LocalFallbackProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

export function createProvider(env = process.env) {
  const provider = (env.LLM_PROVIDER || 'openai').toLowerCase();
  if (provider === 'openai') return new OpenAIProvider({ apiKey: env.OPENAI_API_KEY });
  return new LocalFallbackProvider();
}
