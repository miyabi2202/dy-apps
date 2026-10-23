import {
  appliesTo,
  mentionIn,
  mentionPhrases,
  streamerNamesIn,
  userMatches,
  type UserCondition,
} from '../../../src/core/tools/tool-definition';
import { parseToolDefinition, type ToolDefinition } from '../../../src/core/tools/tool-definition';

const CAN_SING = {
  name: 'can_sing',
  description: '主播会唱xxx吗：叫她{{streamerNames}}',
  guidance: 'guidance.md',
  listen: {
    when: '在问会不会唱，叫她{{streamerNames}}',
    trigger: '({{streamerNames}})会唱',
    mentions: 'artifacts/songs.txt',
  },
};

const parse = (json: unknown, folder = 'can-sing') =>
  parseToolDefinition(json, { folder, streamerNames: ['虾虾'] });

test('reads a tool: guidance, listen with all three fields, and the streamer names filled in', () => {
  expect(parse(CAN_SING)).toEqual({
    name: 'can_sing',
    description: '主播会唱xxx吗：叫她虾虾',
    guidance: 'guidance.md',
    listen: {
      when: '在问会不会唱，叫她虾虾',
      trigger: /(主播|虾虾)会唱/,
      mentions: 'artifacts/songs.txt',
    },
  });
  expect(parse({ ...CAN_SING, listen: { when: 'w' } })).toMatchObject({
    listen: { when: 'w', trigger: null },
  });
  expect(parse({ ...CAN_SING, adminOnly: true })).toMatchObject({ adminOnly: true });
  expect(parse({ ...CAN_SING, adminOnly: false })).not.toHaveProperty('adminOnly');
});

test("the name must be the folder's with _ for -, and a plain name", () => {
  expect(parse({ ...CAN_SING, name: 'can_singing' })).toBe(
    'name must be the folder\'s name with _ for -: "can_sing"',
  );
  expect(parse({ ...CAN_SING, name: 'Can-Sing' })).toBe(
    'name must be lowercase letters, digits and _, like "can_sing"',
  );
  expect(parse({ ...CAN_SING, description: ' ' })).toBe('description must be a non-empty string');
});

test('what is not an object, or has a field it does not know, is an error', () => {
  expect(parse([])).toBe('tool.json must be an object');
  expect(parse(null)).toBe('tool.json must be an object');
  expect(parse({ ...CAN_SING, price: 5 })).toBe(
    'unknown field "price" (use name, description, guidance, fixedReply, adminOnly, only, except, listen)',
  );
});

test('it has a guidance file or a fixedReply, one of them, and the guidance file is in its folder', () => {
  const { guidance, ...base } = CAN_SING;
  expect(guidance).toBe('guidance.md');
  expect(parse(base)).toBe('needs a guidance file or a fixedReply');
  expect(parse({ ...base, fixedReply: '你好' })).toMatchObject({ fixedReply: '你好' });
  expect(parse({ ...CAN_SING, fixedReply: '你好' })).toBe(
    "guidance and fixedReply can't both be set",
  );
  expect(parse({ ...base, fixedReply: ' ' })).toBe('fixedReply must be a non-empty string');
  const folderFile = 'guidance must be a file in the tool\'s folder, like "guidance.md"';
  expect(parse({ ...base, guidance: '../x.md' })).toBe(folderFile);
  expect(parse({ ...base, guidance: 'sub/guidance.md' })).toBe(folderFile);
  expect(parse({ ...base, guidance: '' })).toBe(folderFile);
  expect(parse({ ...CAN_SING, adminOnly: 'yes' })).toBe('adminOnly must be true or false');
});

test('listen needs a when or a trigger alone, a trigger that compiles, and a mentions file inside the room folder', () => {
  expect(parse({ ...CAN_SING, listen: {} })).toBe('listen needs a when, or a trigger alone');
  expect(parse({ ...CAN_SING, listen: { when: ' ', trigger: 'x' } })).toBe(
    'listen.when must be a non-empty string',
  );
  expect(parse({ ...CAN_SING, listen: { trigger: 'x', mentions: 't.txt' } })).toBe(
    'listen.mentions needs a when',
  );
  expect(parse({ ...CAN_SING, listen: { when: 'w', trigger: '(' } })).toBe(
    'listen.trigger is not a regular expression: (',
  );
  expect(parse({ ...CAN_SING, listen: { when: 'w', mentions: '../t.txt' } })).toBe(
    'listen.mentions must be a file inside the room folder',
  );
  expect(parse({ ...CAN_SING, listen: { when: 'w', level: 1 } })).toBe(
    'listen has an unknown field "level" (use when, trigger, mentions)',
  );
});

test('a trigger alone is a listen without a when', () => {
  const tool = parse({ ...CAN_SING, listen: { trigger: '[Bb]on voyage' } });
  expect(tool).toMatchObject({ listen: { trigger: /[Bb]on voyage/ } });
  expect((tool as ToolDefinition).listen).not.toHaveProperty('when');
});

test('reads only and except: lists of conditions, each with a known field of the right type', () => {
  const base = { name: 'x', description: 'y', fixedReply: 'z' };
  const only = [{ badge: 'V', fansLevel: 3 }, { payLevel: 10 }, { admin: true }];
  const except = [{ badge: 'V' }, { badge: 'V年' }];
  expect(parseToolDefinition({ ...base, only, except }, { folder: 'x' })).toMatchObject({
    only,
    except,
  });

  const error = (extra: object) => parseToolDefinition({ ...base, ...extra }, { folder: 'x' });
  expect(error({ only: { badge: 'V' } })).toBe('only must be a non-empty list of conditions');
  expect(error({ except: [] })).toBe('except must be a non-empty list of conditions');
  expect(error({ only: ['V'] })).toBe('only condition 1 must be an object');
  expect(error({ only: [{ badge: 'V' }, { level: 3 }] })).toBe(
    'only condition 2 has an unknown field "level" (use badge, fansLevel, payLevel, admin)',
  );
  expect(error({ except: [{}] })).toBe(
    'except condition 1 needs at least one of badge, fansLevel, payLevel, admin',
  );
  expect(error({ only: [{ badge: 3 }] })).toBe(
    'only condition 1: badge must be a non-empty string',
  );
  expect(error({ only: [{ fansLevel: '10' }] })).toBe(
    'only condition 1: fansLevel must be a whole number, 1 or more',
  );
  expect(error({ only: [{ payLevel: 0 }] })).toBe(
    'only condition 1: payLevel must be a whole number, 1 or more',
  );
  expect(error({ only: [{ admin: false }] })).toBe('only condition 1: admin must be true');
});

describe('userMatches', () => {
  const viewer = { admin: false };

  test('a viewer matches the list when they match any entry, an entry when they match all its fields', () => {
    const conditions: UserCondition[] = [{ badge: 'V', payLevel: 10 }, { admin: true }];
    expect(userMatches(conditions, { ...viewer, badges: ['V'], payLevel: 10 })).toBe(true);
    expect(userMatches(conditions, { ...viewer, badges: ['V'], payLevel: 9 })).toBe(false);
    expect(userMatches(conditions, { ...viewer, payLevel: 50 })).toBe(false);
    expect(userMatches(conditions, { admin: true })).toBe(true);
    expect(userMatches([], { admin: true })).toBe(false);
  });

  test('badges are matched exactly', () => {
    expect(userMatches([{ badge: 'V' }], { ...viewer, badges: ['V年'] })).toBe(false);
    expect(userMatches([{ badge: 'V' }], { ...viewer, badges: ['V年', 'V'] })).toBe(true);
    expect(userMatches([{ badge: 'V' }], viewer)).toBe(false);
  });

  test("the fan club counts when it's the streamer's, or doesn't say whose it is", () => {
    const fans = [{ fansLevel: 10 }];
    const club = (level: number, anchorId?: string) => ({
      ...viewer,
      fansClub: { level, anchorId },
    });
    expect(userMatches(fans, club(10, 's1'), 's1')).toBe(true);
    expect(userMatches(fans, club(9, 's1'), 's1')).toBe(false);
    expect(userMatches(fans, club(20, 's2'), 's1')).toBe(false);
    expect(userMatches(fans, club(10), 's1')).toBe(true);
    expect(userMatches(fans, club(10), undefined)).toBe(true);
    // Says whose, but the streamer isn't known yet: can't tell it's theirs.
    expect(userMatches(fans, club(10, 's1'), undefined)).toBe(false);
    expect(userMatches(fans, viewer, 's1')).toBe(false);
  });

  test('appliesTo needs a match of only and none of except; neither applies to everyone', () => {
    const fan = { ...viewer, payLevel: 30 };
    expect(appliesTo({}, viewer)).toBe(true);
    expect(appliesTo({ only: [{ payLevel: 30 }] }, fan)).toBe(true);
    expect(appliesTo({ only: [{ payLevel: 30 }] }, viewer)).toBe(false);
    expect(appliesTo({ except: [{ payLevel: 30 }] }, fan)).toBe(false);
    expect(appliesTo({ except: [{ payLevel: 30 }] }, viewer)).toBe(true);
    expect(appliesTo({ only: [{ payLevel: 30 }], except: [{ payLevel: 30 }] }, fan)).toBe(false);
  });
});

test('finds the longest listed phrase a chat contains, ignoring case', () => {
  const titles = '喂猪\n喂猪歌\nLemon\n\n  晴天  \n';
  expect(mentionIn('虾虾会喂猪歌吗', titles)).toBe('喂猪歌');
  expect(mentionIn('会唱lemon吗', titles)).toBe('Lemon');
  expect(mentionIn('今天晴天', titles)).toBe('晴天');
  expect(mentionIn('晚上吃什么', titles)).toBeNull();
});

test('a mentions file may be a song list: the first column of its rows, brackets split, short ones left out', () => {
  const list = [
    '会唱的歌（3 首），每行：歌名、原唱、语言：',
    '',
    '晴天｜周杰伦｜中文',
    'ヤキモチ（吃醋）｜高橋優｜日语',
    '光｜陈粒｜中文',
    'if｜西野加奈｜日语',
    'Self｜｜英语',
  ].join('\n');
  expect(mentionPhrases(list)).toEqual(['晴天', 'ヤキモチ', '吃醋', 'Self']);
  expect(mentionPhrases('喂猪\n光\nLemon\n')).toEqual(['喂猪', 'Lemon']);
  expect(mentionIn('主播会唱吃醋吗', list)).toBe('吃醋');
  expect(mentionIn('光好亮', list)).toBeNull();
});

test('{{streamerNames}} is the names joined for text, and escaped alternatives after 主播 for a trigger', () => {
  expect(streamerNamesIn('叫她{{streamerNames}}', ['茜茜', '茜颜'])).toBe('叫她茜茜、茜颜');
  expect(streamerNamesIn('叫她{{streamerNames}}', [])).toBe('叫她主播');
  expect(streamerNamesIn('({{streamerNames}})会', ['a.b'], { pattern: true })).toBe(
    '(主播|a\\.b)会',
  );
  const definition = parseToolDefinition(
    {
      name: 'x',
      description: '叫{{streamerNames}}',
      fixedReply: 'z',
      listen: { when: 'y', trigger: '({{streamerNames}})会' },
    },
    { folder: 'x', streamerNames: ['虾虾'] },
  );
  expect(definition).toMatchObject({
    description: '叫虾虾',
    listen: { trigger: /(主播|虾虾)会/ },
  });
});
