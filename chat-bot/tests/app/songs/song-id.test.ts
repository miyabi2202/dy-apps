import { SongId } from '../../../src/app/songs/song-id';
import { silentLog } from '../../support/fakes';

test('asks for the song as JSON, and keeps an answer that is not JSON as the text', async () => {
  const schemas: (object | undefined)[] = [];
  const answers = [
    JSON.stringify({ message: '这首是中島美嘉的《ALWAYS》', title: 'ALWAYS', artist: '中島美嘉' }),
    '弹幕：没认出来',
  ];
  const songId = new SongId({
    prompt: () => '',
    codex: ({ schema }) => {
      schemas.push(schema);
      return Promise.resolve(answers.shift() ?? '');
    },
    log: silentLog,
  });
  const identify = () => songId.identifyLines({ prompt: '' }, [], 'command');

  await expect(identify()).resolves.toMatchObject({
    kind: 'named',
    answer: { message: '这首是中島美嘉的《ALWAYS》' },
  });
  await expect(identify()).resolves.toMatchObject({
    kind: 'named',
    answer: null,
    text: '弹幕：没认出来',
  });
  expect(schemas[0]).toMatchObject({ required: ['message', 'title', 'artist', 'sure'] });
});

test('with too little sung yet, it says so without asking; with enough, it asks and logs what about', async () => {
  const sung = (s: number, text: string) => ({
    start: s * 1000,
    end: s * 1000 + 4000,
    text,
    speech: 0.05,
  });
  const asked: string[] = [];
  const logged: [string, object | undefined][] = [];
  const songId = new SongId({
    prompt: () => '',
    codex: ({ prompt }) => {
      asked.push(prompt);
      return Promise.resolve(
        JSON.stringify({ message: '这首是《晴天》', title: '晴天', artist: '周杰伦', sure: true }),
      );
    },
    log: { ...silentLog, info: (message, meta) => void logged.push([message, meta]) },
    early: {
      minChars: 20,
      noLyrics: () => '没听到在唱',
      tooEarly: (heard) => `才听到「${heard}」`,
    },
  });
  const ask = async (lines: ReturnType<typeof sung>[]) => {
    const outcome = await songId.identifyLines({ prompt: '' }, lines, 'command');
    return outcome.kind === 'early' ? outcome.text : outcome.answer?.message;
  };

  await expect(ask([{ ...sung(0, '下一首唱什么'), speech: 0.8 }])).resolves.toBe('没听到在唱');
  await expect(ask([sung(0, '刮风这天'), sung(5, '我试过')])).resolves.toBe(
    '才听到「刮风这天」「我试过」',
  );
  expect(asked).toEqual([]);

  await expect(
    ask([sung(0, '刮风这天我试过握着你手'), sung(5, '但偏偏雨渐渐大到我看你不见')]),
  ).resolves.toBe('这首是《晴天》');
  expect(asked).toHaveLength(1);
  expect(logged.find(([m]) => m === 'song id asked')?.[1]).toEqual({
    why: 'command',
    lines: 2,
    chars: 24,
    othersShare: 0,
    first: '刮风这天我试过握着你手',
    last: '但偏偏雨渐渐大到我看你不见',
  });
});

test("most of the song sung by another voice: it's still named, from all of it, and the message says so", async () => {
  const sung = (s: number, text: string, host?: boolean) => ({
    start: s * 1000,
    end: s * 1000 + 4000,
    text,
    speech: 0.05,
    ...(host !== undefined && { speaker: host ? 1 : 22, host }),
  });
  const searched: string[][] = [];
  const songId = new SongId({
    prompt: () => '',
    codex: () =>
      Promise.resolve(
        JSON.stringify({
          message: '这首是《带我走》',
          title: '带我走',
          artist: '杨丞琳',
          sure: true,
        }),
      ),
    lyrics: (lines) => {
      searched.push(lines.map((line) => line.text));
      return Promise.resolve({
        title: '',
        sure: false,
        candidates: [],
        why: 'test',
        queries: [],
        ms: 1,
      });
    },
    othersNote: () => '（是别人在唱吗？）',
    log: silentLog,
  });
  const named = (lines: ReturnType<typeof sung>[]) =>
    songId.name({ prompt: '' }, { why: 'command', lines });

  const mostlyOthers = [
    sung(0, '这次你却说一起走', true),
    sung(5, '像土壤抓紧花的迷惑', false),
    sung(10, '像天空缠绵雨的汹涌在你的身后', false),
  ];
  await expect(named(mostlyOthers)).resolves.toMatchObject({
    answer: { message: '这首是《带我走》（是别人在唱吗？）', othersSang: true },
    othersSang: true,
  });
  expect(searched[0]).toEqual(mostlyOthers.map((line) => line.text));

  // Mostly hers, or too short for a voiceprint (hers): as it was.
  for (const lines of [
    [sung(0, '像天空缠绵雨的汹涌在你的身后', true), sung(5, '这次你却说一起走', false)],
    [sung(0, '像天空缠绵雨的汹涌在你的身后'), sung(5, '这次你却说一起走')],
  ]) {
    await expect(named(lines)).resolves.toMatchObject({
      answer: { message: '这首是《带我走》' },
      othersSang: false,
    });
  }
});
