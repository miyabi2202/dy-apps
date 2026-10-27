import { SongIntro } from '../../../src/app/songs/song-intro';
import { RoomState } from '../../../src/app/room/room-state';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import { Transcript } from '../../../src/core/songs/transcript';
import type { Question } from '../../../src/app/ports';
import { testWording } from '../../support/wording';

const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const now = () => 600_000;

function setUp(answer: string) {
  const transcript = new Transcript(30 * 60_000, now);
  transcript.add({ start: 500_000, end: 503_000, text: '给你幸福的是我', speech: 0.05 });
  // A guest talking, which is no part of the song.
  transcript.add({ start: 504_000, end: 506_000, text: '谁在唱', speech: 0.8, host: false });
  const room = new RoomState({
    history: new ChatHistory(10),
    transcript,
    now,
    botName: '默认关闭',
    wording: testWording,
    log,
  });
  const asked: Question[] = [];
  const pushed: string[] = [];
  const intro = new SongIntro({
    ask: (question) => {
      asked.push(question);
      return Promise.resolve(answer);
    },
    outbox: { push: ({ text }) => void pushed.push(text) },
    promptTemplate: () => '{{question}}\n{{transcript}}',
    room,
    log,
    maxLength: 50,
  });
  return { intro, asked, pushed };
}

const plain = '这首是朱丽静、陈世安的《安静》';

test('names the song in its own words, in one message, from an answer that may search', async () => {
  const { intro, asked, pushed } = setUp(JSON.stringify({ message: '《安静》居然是 2008 年的歌' }));
  await intro.introduce({ message: plain, title: '安静', artist: '朱丽静、陈世安' });

  expect(pushed).toEqual(['《安静》居然是 2008 年的歌']);
  expect(asked[0]!.tools).toEqual(['WebSearch', 'WebFetch']);
  expect(asked[0]!.prompt).toContain('《安静》，原唱 朱丽静、陈世安');
  expect(asked[0]!.prompt).toContain('给你幸福的是我');
  expect(asked[0]!.prompt).not.toContain('谁在唱');
});

test('says the plain sentence when its message leaves the title out, is not json, or fails', async () => {
  const song = { message: plain, title: '安静', artist: '' };
  const untitled = setUp(JSON.stringify({ message: '这首好温柔' }));
  await untitled.intro.introduce(song);
  expect(untitled.pushed).toEqual([plain]);

  const broken = setUp('这首歌很好听');
  await broken.intro.introduce(song);
  expect(broken.pushed).toEqual([plain]);

  const pushed: string[] = [];
  const failing = new SongIntro({
    ask: () => Promise.reject(new Error('down')),
    outbox: { push: ({ text }) => void pushed.push(text) },
    promptTemplate: () => '{{question}}',
    room: new RoomState({
      history: new ChatHistory(10),
      transcript: new Transcript(30 * 60_000, now),
      now,
      botName: '默认关闭',
      wording: testWording,
      log,
    }),
    log,
  });
  await failing.introduce(song);
  expect(pushed).toEqual([plain]);
});

test('one song in four, by the dice, is asked to end with a hook; the rest ask nothing', async () => {
  const rolls = [0.1, 0.9];
  const asked: Question[] = [];
  const room = new RoomState({
    history: new ChatHistory(10),
    transcript: new Transcript(30 * 60_000, now),
    now,
    botName: '默认关闭',
    wording: testWording,
    log,
  });
  const intro = new SongIntro({
    ask: (question) => {
      asked.push(question);
      return Promise.resolve(JSON.stringify({ message: '《安静》' }));
    },
    outbox: { push: () => {} },
    promptTemplate: () => '{{hook}}',
    room,
    log,
    random: () => rolls.shift()!,
  });
  await intro.introduce({ message: plain, title: '安静', artist: '' });
  await intro.introduce({ message: plain, title: '安静', artist: '' });

  expect(asked[0]!.prompt).toContain('这首要加一句钩子');
  expect(asked[1]!.prompt).toContain('这首不要向直播间提问');
  expect(log.info).toHaveBeenCalledWith('song intro', {
    title: '安静',
    hook: true,
    message: '《安静》',
    named: true,
  });
});

test('says only the plain sentence for a song another voice sang most of', async () => {
  const { intro, asked, pushed } = setUp(JSON.stringify({ message: '今晚轮到虾虾唱《自愈》了' }));
  await intro.introduce({
    message: '这首是穆哲熙的《自愈》（不过不像主播在唱）',
    title: '自愈',
    artist: '穆哲熙',
    othersSang: true,
  });
  expect(asked).toEqual([]);
  expect(pushed).toEqual(['这首是穆哲熙的《自愈》（不过不像主播在唱）']);
});
