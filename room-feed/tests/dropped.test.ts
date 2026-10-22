import protobuf from 'protobufjs';
import { textIn } from '../src/douyin/dropped';
import { DroppedLog } from '../src/dropped-log';

// Made up, like Douyin's: a notice with its text two messages deep, next to numbers and a URL.
const noticeType = protobuf
  .parse(
    `syntax = "proto3";
     message Notice { Common common = 1; Body body = 2; uint64 count = 3; bytes raw = 4; }
     message Common { string method = 1; uint64 roomId = 3; }
     message Body { User user = 1; string content = 2; string icon = 3; }
     message User { string nickName = 3; }`,
  )
  .root.lookupType('Notice');

const notice = noticeType
  .encode({
    common: { method: 'WebcastSomethingNew', roomId: '7699168659171756841' },
    body: {
      user: { nickName: '金酒' },
      content: '开通了直播间会员',
      icon: 'https://p3.douyinpic.com/vip.png',
    },
    count: 5,
    raw: new Uint8Array([0xff, 0x00, 0x13]),
  })
  .finish();

test('finds the text in a message without its schema, nested or not, URLs and bytes left out', () => {
  expect(textIn(notice)).toEqual(['WebcastSomethingNew', '金酒', '开通了直播间会员']);
  expect(textIn(new Uint8Array([0xff, 0xff]))).toEqual([]);
});

test('keeps each message as a JSON line, a file a day', () => {
  const written: [string, string][] = [];
  const log = new DroppedLog('/data/dropped/123', {
    now: () => new Date(2026, 9, 22, 8, 31, 20).getTime(),
    append: (path, text) => void written.push([path, text]),
  });
  log.add({ method: 'WebcastSomethingNew', msgId: '9', payload: notice });

  expect(written).toHaveLength(1);
  const [path, text] = written[0]!;
  expect(path).toBe('/data/dropped/123/2026-10-22.jsonl');
  expect(text.endsWith('\n')).toBe(true);
  expect(JSON.parse(text)).toEqual({
    ts: new Date(2026, 9, 22, 8, 31, 20).getTime(),
    method: 'WebcastSomethingNew',
    msgId: '9',
    text: ['WebcastSomethingNew', '金酒', '开通了直播间会员'],
    payload: Buffer.from(notice).toString('base64'),
  });
});

test('a log that cannot be written says so once, and room-feed goes on', () => {
  const said: string[] = [];
  const log = new DroppedLog('/nowhere', {
    append: () => {
      throw new Error('EACCES');
    },
    log: (line) => void said.push(line),
  });
  log.add({ method: 'A', msgId: '1', payload: notice });
  log.add({ method: 'A', msgId: '2', payload: notice });
  expect(said).toEqual(['[room-feed] 无法记录未解析的消息：EACCES']);
});
