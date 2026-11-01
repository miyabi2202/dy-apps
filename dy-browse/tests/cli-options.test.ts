import { parseOptions } from '../src/cli-options';
import { UsageError } from '../src/core/errors';

describe('parseOptions', () => {
  it('has the defaults of the design', () => {
    const o = parseOptions(['--feed']);
    expect(o).toMatchObject({
      feed: true,
      streamer: null,
      topics: [],
      knowledge: null,
      minutes: 15,
      maxVideos: 30,
      depth: 1,
      maxSearches: 6,
      maxTopics: 5,
      olderPosts: 3,
      asr: true,
      ocr: true,
      into: 'topics',
      dataDir: null,
      botDataDir: null,
    });
  });

  it("takes the data folders: its own, and the chat bot's that the bot reads from", () => {
    expect(parseOptions(['--feed', '--data', '/a', '--bot-data', '/b'])).toMatchObject({
      dataDir: '/a',
      botDataDir: '/b',
    });
  });

  it('takes --topic more than once, and the streamer with a sec_uid', () => {
    const o = parseOptions([
      '--topic',
      '鸣潮',
      '--topic',
      '至此间',
      '--streamer',
      '416362684969',
      '--sec-uid',
      'MS4w',
    ]);
    expect(o.topics).toEqual(['鸣潮', '至此间']);
    expect(o.streamer).toBe('416362684969');
    expect(o.secUid).toBe('MS4w');
  });

  it('reads --knowledge with and without a folder', () => {
    expect(parseOptions(['--knowledge']).knowledge).toEqual({ folder: null });
    expect(parseOptions(['--knowledge', 'douyin']).knowledge).toEqual({ folder: 'douyin' });
    expect(parseOptions(['--knowledge=douyin', '--max-topics', '2']).knowledge).toEqual({
      folder: 'douyin',
    });
    // A following flag is not a folder.
    const o = parseOptions(['--knowledge', '--max-topics', '2']);
    expect(o.knowledge).toEqual({ folder: null });
    expect(o.maxTopics).toBe(2);
    expect(parseOptions(['--streamer', '484088206186', '--older-posts', '30']).olderPosts).toBe(30);
  });

  it('reads the numbers and switches', () => {
    const o = parseOptions([
      '--feed',
      '--minutes',
      '10',
      '--max-videos',
      '5',
      '--depth',
      '0',
      '--max-searches',
      '3',
      '--no-asr',
      '--no-ocr',
    ]);
    expect(o).toMatchObject({
      minutes: 10,
      maxVideos: 5,
      depth: 0,
      maxSearches: 3,
      asr: false,
      ocr: false,
    });
  });

  it('says so when there is nothing to do', () => {
    expect(() => parseOptions([])).toThrow(UsageError);
    expect(() => parseOptions(['--minutes', '5'])).toThrow('没有要做的事');
  });

  it('refuses a bad room number, a stray --sec-uid, a bad number and an unknown flag', () => {
    expect(() => parseOptions(['--streamer', 'abc'])).toThrow('房间号');
    expect(() => parseOptions(['--feed', '--sec-uid', 'x'])).toThrow('--streamer');
    expect(() => parseOptions(['--feed', '--minutes', '0'])).toThrow('--minutes');
    expect(() => parseOptions(['--feed', '--nope'])).toThrow(UsageError);
  });

  it('lets --help stand alone', () => {
    expect(parseOptions(['--help']).help).toBe(true);
  });
});
