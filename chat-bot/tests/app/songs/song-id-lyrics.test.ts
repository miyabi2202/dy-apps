import type { SongGuess } from '@dy-apps/lyrics-search';
import type { SearchLyrics } from '../../../src/app/ports';
import { SongId } from '../../../src/app/songs/song-id';
import { silentLog } from '../../support/fakes';

const sung = (s: number, text: string) => ({
  start: s * 1000,
  end: s * 1000 + 4000,
  text,
  speech: 0.05,
});
const lines = [sung(0, '刮风这天我试过握着你手'), sung(5, '但偏偏雨渐渐大到我看你不见')];

const guess = (over: Partial<SongGuess>): SongGuess => ({
  title: '',
  sure: false,
  candidates: [],
  why: 'test',
  queries: ['a', 'b'],
  ms: 800,
  ...over,
});

const codexAnswer = JSON.stringify({
  message: '这首是《晴天》',
  title: '晴天',
  artist: '周杰伦',
  sure: true,
});

function setup(lyrics: SearchLyrics, early?: { minChars: number }) {
  const asked: string[] = [];
  const logged: [string, object | undefined][] = [];
  const songId = new SongId({
    prompt: () => '',
    codex: ({ prompt }) => {
      asked.push(prompt);
      return Promise.resolve(codexAnswer);
    },
    lyrics,
    found: ({ title, artist }) => `找到了${artist}${title}`,
    hints: (candidates) => `候选：${candidates.map((c) => c.title).join('、')}`,
    early: early && { ...early, noLyrics: () => '没听到', tooEarly: () => '太早' },
    log: {
      ...silentLog,
      info: (message, meta) => void logged.push([message, meta]),
      warn: (message, meta) => void logged.push([message, meta]),
    },
  });
  return { songId, asked, logged };
}

test('answers from the lyrics search when it is sure of the title and singer, without asking Codex', async () => {
  const { songId, asked, logged } = setup(() =>
    Promise.resolve(guess({ title: '雨爱', artist: '杨丞琳', sure: true })),
  );
  const outcome = await songId.identifyLines({ prompt: 'P' }, lines, 'tool');
  expect(outcome).toMatchObject({
    kind: 'named',
    by: 'lyrics-search',
    answer: { title: '雨爱', artist: '杨丞琳', sure: true, message: '找到了杨丞琳雨爱' },
  });
  expect(asked).toEqual([]);
  expect(logged.find(([m]) => m === 'song identified')?.[1]).toMatchObject({
    by: 'lyrics-search',
    title: '雨爱',
  });
});

test('asks Codex for the singer when the search is sure of the title but names none', async () => {
  const { songId, asked } = setup(() =>
    Promise.resolve(
      guess({ title: '晴天', sure: true, candidates: [{ title: '晴天', score: 4, artists: [] }] }),
    ),
  );
  const outcome = await songId.identifyLines({ prompt: 'P' }, lines, 'auto');
  expect(outcome).toMatchObject({ by: 'codex', answer: { title: '晴天', artist: '周杰伦' } });
  expect(asked).toEqual(['P\n\n候选：晴天']);
});

test('asks Codex when it is not sure, with the candidates added to its prompt', async () => {
  const { songId, asked } = setup(() =>
    Promise.resolve(
      guess({
        candidates: [
          { title: '晴天', score: 1.2, artists: [] },
          { title: '七里香', score: 1, artists: [] },
        ],
      }),
    ),
  );
  const outcome = await songId.identifyLines({ prompt: 'P' }, lines, 'auto');
  expect(outcome).toMatchObject({ kind: 'named', by: 'codex', answer: { title: '晴天' } });
  expect(asked).toEqual(['P\n\n候选：晴天、七里香']);
});

test('asks Codex as before when the search throws', async () => {
  const { songId, asked, logged } = setup(() => Promise.reject(new Error('boom')));
  const outcome = await songId.identifyLines({ prompt: 'P' }, lines, 'auto');
  expect(outcome).toMatchObject({ by: 'codex' });
  expect(asked).toEqual(['P']);
  expect(logged.map(([m]) => m)).toContain('lyrics search failed');
});

test('does not search at all when too little was sung', async () => {
  let searched = 0;
  const { songId } = setup(
    () => {
      searched++;
      return Promise.resolve(guess({}));
    },
    { minChars: 100 },
  );
  expect(await songId.identifyLines({ prompt: 'P' }, lines, 'tool')).toEqual({
    kind: 'early',
    text: '太早',
  });
  expect(searched).toBe(0);
});

test('knows a song named one way by the way another spells it, and can skip the intro', () => {
  const intros: string[] = [];
  const songId = new SongId({
    prompt: () => '',
    codex: () => Promise.resolve(''),
    log: silentLog,
    onTold: (song) => void intros.push(song.title),
  });
  songId.told({ message: '', title: '晴天 (Live)', artist: '', sure: true }, { introduce: false });
  expect(songId.namedAt('晴天')).toBeDefined();
  expect(intros).toEqual([]);
  songId.told({ message: '', title: '七里香', artist: '', sure: true });
  expect(intros).toEqual(['七里香']);
});
