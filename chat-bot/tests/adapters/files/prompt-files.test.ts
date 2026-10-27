import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { livePersona, livePrompt } from '../../../src/adapters/files/prompt-files';

describe('livePrompt', () => {
  const dirs = () => ({
    promptsDir: mkdtempSync(join(tmpdir(), 'prompts-')),
    roomDir: mkdtempSync(join(tmpdir(), 'room-')),
  });

  test("the room's own file, named with underscores, wins over the shared one", () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'song-id.md'), 'shared');
    const prompt = livePrompt('songId', { promptsDir, roomDir });
    expect(prompt()).toBe('shared');

    writeFileSync(join(roomDir, 'song_id.md'), 'room');
    expect(prompt()).toBe('room');

    rmSync(join(roomDir, 'song_id.md'));
    expect(prompt()).toBe('shared');
  });

  test('edits to the shared file are picked up', () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'gift-thanks.md'), 'one');
    const prompt = livePrompt('giftThanks', { promptsDir, roomDir });
    writeFileSync(join(promptsDir, 'gift-thanks.md'), 'two');
    expect(prompt()).toBe('two');
  });

  test('a prompt without roomDir ignores room files, and sharedPath replaces the shared file', () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'prompt.md'), 'shared');
    writeFileSync(join(roomDir, 'prompt.md'), 'room');
    writeFileSync(join(roomDir, 'mine.md'), 'mine');
    expect(livePrompt('mention', { promptsDir })()).toBe('shared');
    expect(livePrompt('mention', { promptsDir, sharedPath: join(roomDir, 'mine.md') })()).toBe(
      'mine',
    );
  });

  test('the shared file read at the start is used if it can no longer be read', () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'gift-thanks.md'), 'first');
    const prompt = livePrompt('giftThanks', { promptsDir, roomDir });
    rmSync(join(promptsDir, 'gift-thanks.md'));
    expect(prompt()).toBe('first');
  });

  test('a missing shared file throws at construction', () => {
    const { promptsDir, roomDir } = dirs();
    expect(() => livePrompt('replyPick', { promptsDir, roomDir })).toThrow();
  });
});

describe('livePersona', () => {
  const setup = () => {
    const roomDir = mkdtempSync(join(tmpdir(), 'room-'));
    const sharedDir = mkdtempSync(join(tmpdir(), 'shared-'));
    mkdirSync(join(roomDir, 'personas'));
    const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    let file: string | undefined;
    const persona = livePersona({ roomDir, sharedDir, file: () => file, log });
    return { roomDir, sharedDir, log, persona, choose: (next?: string) => (file = next) };
  };

  test('plays the file room_config.json names, read as it changes; switching is naming another', () => {
    const { roomDir, persona, choose } = setup();
    expect(persona()).toBe('');
    writeFileSync(join(roomDir, 'personas', '课代表.md'), '数学课代表\n');
    writeFileSync(join(roomDir, 'personas', '小猫.md'), '小猫\n');
    choose('personas/课代表.md');
    expect(persona()).toBe('数学课代表');

    writeFileSync(join(roomDir, 'personas', '课代表.md'), '嘴毒的数学课代表\n');
    expect(persona()).toBe('嘴毒的数学课代表');
    choose('personas/小猫.md');
    expect(persona()).toBe('小猫');
  });

  test('a file with a base header is changes to that shared persona, its blanks filled from the header', () => {
    const { roomDir, sharedDir, persona, choose } = setup();
    writeFileSync(
      join(sharedDir, 'fairy.md'),
      'Fairy，{{主播}}的助手\n\n## 说话方式\n\n- 一本正经\n',
    );
    writeFileSync(
      join(roomDir, 'personas', 'fairy.md'),
      '---\nbase: fairy\n主播: 咿咿\n---\n## 说话方式\n\n- 正经里带点俏皮\n',
    );
    choose('personas/fairy.md');
    expect(persona()).toBe('Fairy，咿咿的助手\n\n## 说话方式\n\n- 正经里带点俏皮');

    // An edit to the shared persona applies at once too.
    writeFileSync(join(sharedDir, 'fairy.md'), 'Fairy，{{主播}}的首席助手\n');
    expect(persona()).toBe('Fairy，咿咿的首席助手\n\n## 说话方式\n\n- 正经里带点俏皮');
  });

  test('a room that names no persona plays the shared default one, if there is one', () => {
    const { sharedDir, log, persona, choose } = setup();
    expect(persona()).toBe('');
    writeFileSync(join(sharedDir, 'default.md'), '普通观众\n');
    expect(persona()).toBe('普通观众');
    choose('personas/gone.md');
    expect(persona()).toBe('');
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  test("what it can't read is warned about once, and the bot plays what is left", () => {
    const { roomDir, log, persona, choose } = setup();
    choose('personas/gone.md');
    expect(persona()).toBe('');
    writeFileSync(join(roomDir, 'personas', 'mine.md'), '---\nbase: nowhere\n---\n小人机\n');
    choose('personas/mine.md');
    expect(persona()).toBe('小人机');
    expect(persona()).toBe('小人机');

    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not read the persona file'),
      expect.anything(),
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not read the shared persona'),
      expect.anything(),
    );
  });
});
