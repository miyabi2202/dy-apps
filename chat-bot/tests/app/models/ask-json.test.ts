import { askJson } from '../../../src/app/models/ask-json';
import type { Question } from '../../../src/app/ports';
import { parseSongAnswer, SONG_ANSWER_SCHEMA } from '../../../src/core/songs/song-answer';

const answer = {
  schema: SONG_ANSWER_SCHEMA,
  parse: parseSongAnswer,
  notJson: 'song id answer is not json',
};

function setup(reply: string) {
  const asked: Question[] = [];
  const warned: unknown[][] = [];
  const log = {
    debug() {},
    info() {},
    error() {},
    warn: (...args: unknown[]) => warned.push(args),
  };
  const ask = (question: Question) => {
    asked.push(question);
    return Promise.resolve(reply);
  };
  return { asked, warned, log, ask };
}

test('asks for the schema and gives the parsed answer', async () => {
  const reply = '{"message": "好听", "title": "晴天", "artist": "", "sure": true}';
  const { ask, asked, warned, log } = setup(reply);
  const result = await askJson(ask, { prompt: 'p', maxTurns: 3 }, answer, log);

  expect(result).toEqual({
    value: { message: '好听', title: '晴天', artist: '', sure: true },
    text: reply,
  });
  expect(asked).toEqual([{ prompt: 'p', maxTurns: 3, schema: SONG_ANSWER_SCHEMA }]);
  expect(warned).toEqual([]);
});

test('warns with the text, under the field asked for, when the answer is not the schema’s', async () => {
  const one = setup('随便说说');
  expect(await askJson(one.ask, { prompt: 'p' }, answer, one.log)).toEqual({
    value: null,
    text: '随便说说',
  });
  expect(one.warned).toEqual([['song id answer is not json', { text: '随便说说' }]]);

  const other = setup('nope');
  await askJson(other.ask, { prompt: 'p' }, { ...answer, field: 'answer' }, other.log);
  expect(other.warned).toEqual([['song id answer is not json', { answer: 'nope' }]]);
});

test('lets a failing model throw', async () => {
  const { log } = setup('');
  await expect(
    askJson(() => Promise.reject(new Error('codex failed')), { prompt: 'p' }, answer, log),
  ).rejects.toThrow('codex failed');
});
