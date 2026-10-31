import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vectorFiles } from '../../../src/adapters/files/vector-cache';

test('keeps vectors by model and text, a file per model, across bots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'embeddings-'));
  const one = vectorFiles(dir);
  expect(one.get('Qwen/Qwen3-Embedding-0.6B', ['稻香'])).toEqual([undefined]);
  one.put('Qwen/Qwen3-Embedding-0.6B', [['稻香', [0.6, 0.8]]]);
  one.put('Qwen/Qwen3-Embedding-4B', [['稻香', [1, 0]]]);
  expect(one.get('Qwen/Qwen3-Embedding-0.6B', ['稻香', '小黑'])).toEqual([[0.6, 0.8], undefined]);
  expect(readdirSync(dir).sort()).toEqual([
    'qwen-qwen3-embedding-0-6b.json',
    'qwen-qwen3-embedding-4b.json',
  ]);

  // Another bot sees them, and what both add is kept.
  const two = vectorFiles(dir);
  expect(two.get('Qwen/Qwen3-Embedding-4B', ['稻香'])).toEqual([[1, 0]]);
  two.put('Qwen/Qwen3-Embedding-0.6B', [['小黑', [0, 1]]]);
  one.put('Qwen/Qwen3-Embedding-0.6B', [['拉面', [1, 0]]]);
  expect(vectorFiles(dir).get('Qwen/Qwen3-Embedding-0.6B', ['稻香', '小黑', '拉面'])).toEqual([
    [0.6, 0.8],
    [0, 1],
    [1, 0],
  ]);
});
