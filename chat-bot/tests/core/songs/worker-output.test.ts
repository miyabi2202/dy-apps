import { parseWorkerOutput } from '../../../src/core/songs/worker-output';

test('a line of the worker is the first of music answer, status, backing level and sentence it fits', () => {
  expect(parseWorkerOutput('{"music_id": 3, "title": "年轮说", "artist": "杜丽莎"}')).toEqual({
    kind: 'music',
    answer: { id: 3, match: { title: '年轮说', artist: '杜丽莎' } },
  });
  expect(parseWorkerOutput('{"ready": true}')).toEqual({ kind: 'status', status: 'ready' });
  expect(parseWorkerOutput('{"busy": true}')).toEqual({ kind: 'status', status: 'busy' });
  expect(parseWorkerOutput('{"backing_level": {"from": 1, "to": 2, "db": [-30]}}')).toEqual({
    kind: 'backing-level',
    level: { from: 1000, to: 2000, db: [-30] },
  });
  expect(parseWorkerOutput('{"start": 1, "end": 2, "text": "你好"}')).toEqual({
    kind: 'line',
    line: { start: 1000, end: 2000, text: '你好' },
  });
  // Music wins over a sentence the same line has.
  expect(parseWorkerOutput('{"music_id": 1, "text": "你好"}')?.kind).toBe('music');
});

test('what is not JSON, or fits none of them, is nothing', () => {
  expect(parseWorkerOutput('loading models')).toBeNull();
  expect(parseWorkerOutput('{not json')).toBeNull();
  expect(parseWorkerOutput('{"stream": 1}')).toBeNull();
  expect(parseWorkerOutput('{"backing_level": {"from": 1}}')).toBeNull();
});
