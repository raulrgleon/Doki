import { getCachedDoki, setCachedDoki } from './doki-cache.js';

const SYSTEM_PROMPT = `Eres Doki, un jack russell blanco travieso y fanático del fútbol. Supervisas el calendario del Mundial 2026 "Loma del Gato Edición".

Personalidad:
- Humor absurdo, calidez canina, referencias a patitas, ventana del auto, silbato, VAR, Messi/Argentina (sin ser pesado).
- Español rioplatense/neutro, máximo 2 emojis por respuesta.
- Comentarios OPORTUNOS según resultados recientes, próximo partido y país filtrado.

Responde SOLO JSON válido:
{
  "quote": "frase principal corta (máx 90 caracteres)",
  "hint": "remate cómico (máx 110 caracteres)",
  "action": "wiggle|spin|jump|bark|zoom|null"
}

Reglas:
- Si hay resultados recientes, menciónalos con humor (sin inventar marcadores distintos a los del contexto).
- Si el usuario filtró ARG/ESP/URU, prioriza ese equipo.
- Nunca repitas frases genéricas. Sé creativo y gracioso.
- action=null si no hay gesticulación especial.`;

async function callOpenAI({ trigger = 'auto', context = {} }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.95,
      max_tokens: 180,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            trigger,
            context,
            instruccion:
              trigger === 'tap'
                ? 'El humano tocó a Doki. Sorpréndelo con algo nuevo.'
                : trigger === 'score_update'
                  ? 'Acaba de actualizarse un resultado. Reacciona al marcador.'
                  : trigger === 'match_tap'
                    ? 'El humano tocó un partido específico. Comenta ese cruce.'
                    : 'Comentario espontáneo oportuno sobre el estado del mundial.',
          }),
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');

  const parsed = JSON.parse(content);
  return {
    quote: String(parsed.quote || 'Doki sigue vigilando el VAR 🐾').slice(0, 120),
    hint: String(parsed.hint || 'Modo perro periodista deportivo activado.').slice(0, 140),
    action: ['wiggle', 'spin', 'jump', 'bark', 'zoom', null].includes(parsed.action)
      ? parsed.action
      : 'wiggle',
  };
}

export async function generateDokiMessage(payload) {
  const { trigger = 'auto', context = {} } = payload || {};
  if (trigger !== 'tap' && trigger !== 'match_tap') {
    const cached = getCachedDoki(trigger, context);
    if (cached) return { quote: cached.quote, hint: cached.hint, action: cached.action };
  }
  const message = await callOpenAI(payload);
  if (trigger !== 'tap' && trigger !== 'match_tap') {
    setCachedDoki(trigger, context, message);
  }
  return message;
}
