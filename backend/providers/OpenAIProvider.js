import { BaseProvider } from './BaseProvider.js';

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function extractJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = String(content).match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Provider response did not contain JSON');
    return JSON.parse(match[0]);
  }
}

export class OpenAIProvider extends BaseProvider {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || 'gpt-4o-mini',
    endpoint = 'https://api.openai.com/v1/chat/completions',
  } = {}) {
    super({ name: 'openai' });
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint;
  }

  buildMessages({ skill, context, input }) {
    const templateText = context.templates.map((template) => template.content).join('\n\n');
    const examplesText = context.examples.map((example) => example.content).join('\n\n');
    return [
      {
        role: 'system',
        content: [
          'You are executing a reusable Agent Skill.',
          'All behavior, rules, constraints, and prompt instructions are contained in the loaded Skill.',
          'Return only valid JSON matching the Skill output schema.',
          '',
          skill.markdown,
          '',
          'Templates:',
          templateText,
          '',
          'Examples:',
          examplesText,
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({ input }, null, 2),
      },
    ];
  }

  async generate({ skill, context, input }) {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY missing');
    const messages = this.buildMessages({ skill, context, input });
    const promptText = messages.map((message) => message.content).join('\n');
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: input.trigger === 'match_tap' ? 0.72 : 0.9,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty provider response');
    const output = extractJson(content);
    const inputTokens = json.usage?.prompt_tokens || estimateTokens(promptText);
    const outputTokens = json.usage?.completion_tokens || estimateTokens(content);
    const totalTokens = json.usage?.total_tokens || inputTokens + outputTokens;

    return {
      provider: this.name,
      model: this.model,
      output,
      usage: { inputTokens, outputTokens, totalTokens },
      costUsd: 0,
    };
  }
}
