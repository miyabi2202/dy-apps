import { parseJsonObject } from './json-answer';

/** What the model decides about one chat: whether it's malicious, and why. */
export interface MaliceAnswer {
  malicious: boolean;
  reason: string;
}

/** The JSON Schema MaliceAnswer follows (strict: every field required, no others). */
export const MALICE_SCHEMA = {
  type: 'object',
  properties: { malicious: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['malicious', 'reason'],
  additionalProperties: false,
} as const;

/**
 * `text` as a MaliceAnswer. An answer that isn't the schema's is taken as no: better to miss one
 * than flag someone.
 */
export function parseMaliceAnswer(text: string): MaliceAnswer {
  const answer = parseJsonObject(text.trim());
  return {
    malicious: answer?.malicious === true,
    reason: typeof answer?.reason === 'string' ? answer.reason : '',
  };
}
