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

test('says what it chose to, in order, from one answer that may search', async () => {
  const { intro, asked, pushed } = setUp(
    JSON.stringify({ messages: ['这首是 2008 年的歌', '「给你幸福的是我」这句好温柔'] }),
  );
  await intro.introduce({ title: '安静', artist: '朱丽静、陈世安' });

  expect(pushed).toEqual(['这首是 2008 年的歌', '「给你幸福的是我」这句好温柔']);
  expect(asked[0]!.tools).toEqual(['WebSearch', 'WebFetch']);
  expect(asked[0]!.prompt).toContain('《安静》，原唱 朱丽静、陈世安');
  expect(asked[0]!.prompt).toContain('给你幸福的是我');
  expect(asked[0]!.prompt).not.toContain('谁在唱');
});

test('may say nothing, says no more than two, and nothing for an answer that is not json', async () => {
  const none = setUp(JSON.stringify({ messages: [] }));
  await none.intro.introduce({ title: '安静', artist: '' });
  expect(none.pushed).toEqual([]);

  const many = setUp(JSON.stringify({ messages: ['一', '二', '三'] }));
  await many.intro.introduce({ title: '安静', artist: '' });
  expect(many.pushed).toEqual(['一', '二']);

  const broken = setUp('这首歌很好听');
  await broken.intro.introduce({ title: '安静', artist: '' });
  expect(broken.pushed).toEqual([]);
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
      return Promise.resolve(JSON.stringify({ messages: [] }));
    },
    outbox: { push: () => {} },
    promptTemplate: () => '{{hook}}',
    room,
    log,
    random: () => rolls.shift()!,
  });
  await intro.introduce({ title: '安静', artist: '' });
  await intro.introduce({ title: '安静', artist: '' });

  expect(asked[0]!.prompt).toContain('这首要加一句钩子');
  expect(asked[1]!.prompt).toContain('这首不要向直播间提问');
  expect(log.info).toHaveBeenCalledWith('song intro', { title: '安静', hook: true, messages: [] });
});

test('says nothing about a song another voice sang most of', async () => {
  const { intro, asked, pushed } = setUp(JSON.stringify({ messages: ['今晚轮到虾虾唱给他听了'] }));
  await intro.introduce({ title: '自愈', artist: '穆哲熙', othersSang: true });
  expect([...asked, ...pushed]).toEqual([]);
});
