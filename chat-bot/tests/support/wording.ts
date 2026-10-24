import { join } from 'node:path';
import { liveWording } from '../../src/adapters/files/prompt-files';

/** The real wording.md, which the prompts built in tests say their sentences from. */
export const testWording = liveWording(join(__dirname, '..', '..', 'prompts', 'wording.md'));
