import type { BotTool, Log } from '../app/ports';
import type { RoomState } from '../app/room/room-state';
import { atName } from '../core/replies/reply';

/** The longest name the bot @s someone as. */
const MAX_NAME = 12;

/**
 * What auto-reply asks Jev about each line: someone asking the bot (not the streamer) to @ them,
 * or someone else, by another name.
 */
const AT_NAME_WHEN =
  '在让机器人改以后 @ 自己（或别人）时用的名字，比如对机器人说「以后叫我阿拂」「@ 我只写阿拂就行」「你 @ 我名字太长了」「别那样 @ 我了」；要是在跟机器人说才算：@ 了机器人、叫了机器人的名字，或者机器人刚 @ 过 TA、TA 在回机器人的话。对主播说的（「主播以后叫我小拂」「叫我小拂就好」接在跟主播聊天后面）、自我介绍、在聊别人的外号，都不算';

export interface SetAtNameOptions {
  /** The room's `atNames` (what to @ each viewer as, by user id): read now, and written whole. */
  atNames: {
    get(): Readonly<Record<string, string>>;
    set(names: Record<string, string>): void;
  };
  /** Who said what lately, to find whom `who` means; its 单推符号 for matching a name without them. */
  room: Pick<RoomState, 'recentChat' | 'atTrimStart'>;
  log: Log;
}

/** A viewer as the chat shows them. */
interface Chatter {
  userId: string;
  nickname: string;
}

/**
 * `set_at_name`: what the bot @s someone as (room_config.json's `atNames`), for 「以后叫我阿拂」 or
 * `/叫我 阿拂`. Anyone may change their own; an admin (or the streamer) anyone's, named by `who`,
 * found among those who chatted lately. Claude fills in the arguments, so a name said on the
 * stream comes with speech recognition's typos fixed as the description asks. An empty name goes
 * back to the nickname.
 */
export function setAtNameTool({ atNames, room, log }: SetAtNameOptions): BotTool {
  return {
    name: 'set_at_name',
    description: `改机器人 @ 某人时用的名字（弹幕开头的「@名字」）。有人说「以后叫我阿拂」「@ 我的时候只写阿拂」「别那样叫我了」时调用；改自己的谁都可以，改别人的只有主播和管理员可以（who 填那个人）。name 是新名字，最多 ${MAX_NAME} 个字，填空字符串就改回昵称。话是主播说的、从语音识别来的，人名可能是同音错字（「啊拂」「阿福」）：按最近弹幕里的昵称、上下文改成对的字再填。改完用你自己的话告诉对方以后怎么 @ TA。没 @ 你的「以后叫我xxx」多半是在跟主播说，不是跟你说的就别调用。`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: `新名字，最多 ${MAX_NAME} 个字；空字符串改回昵称` },
        who: {
          type: 'string',
          description:
            '要改的是别人时，那个人的昵称（照弹幕里写的，或者能认出来的一部分）；改自己的不填',
        },
      },
      required: ['name'],
    },
    listen: { when: AT_NAME_WHEN },
    commands: [
      {
        name: '叫我',
        parse: (args) => ({ args: { name: args } }),
        say: (result) => (JSON.parse(result.text) as { message: string }).message,
      },
    ],
    call(args, { asker, userId, admin }) {
      // A typed `/叫我` says the error's text as it is.
      const fail = (text: string) => Promise.resolve({ text, isError: true });
      const name =
        typeof args.name === 'string' ? args.name.trim().replace(/^@+/, '').trim() : null;
      if (name === null) return fail('name 要写成字符串');
      if ([...name].length > MAX_NAME) return fail(`名字最多 ${MAX_NAME} 个字`);
      const who = typeof args.who === 'string' ? args.who.trim() : '';
      let target: Chatter | undefined = userId ? { userId, nickname: asker } : undefined;
      if (who && who !== asker) {
        const found = find(who, chatters(room), atNames.get(), room.atTrimStart());
        if (found.length === 1 && found[0]!.userId === userId) {
          // Themselves, by a name close enough to theirs.
        } else if (!admin) {
          return fail('只有主播和管理员能改别人的称呼');
        } else if (!found.length) {
          return fail(`最近的弹幕里没找到「${who}」`);
        } else if (found.length > 1) {
          return fail(
            `「${who}」对上了好几个人：${found.map((c) => c.nickname).join('、')}，问清楚是哪一个`,
          );
        } else {
          target = found[0];
        }
      }
      if (!target) return fail('不知道你是谁，改不了');
      const current = atNames.get();
      const before = current[target.userId] ?? '';
      const next = { ...current, [target.userId]: name };
      if (!name) delete next[target.userId];
      atNames.set(next);
      log.info('at name set', {
        by: asker,
        userId: target.userId,
        nickname: target.nickname,
        before,
        after: name,
      });
      const message = name ? `好，以后 @${name}` : '好，以后按昵称 @';
      return Promise.resolve({
        text: JSON.stringify({ who: target.nickname, before, after: name, message }),
      });
    },
  };
}

/** Everyone who chatted lately, the latest nickname each. */
function chatters(room: Pick<RoomState, 'recentChat'>): Chatter[] {
  const byId = new Map<string, Chatter>();
  for (const { userId, nickname } of room.recentChat()) {
    if (userId) byId.set(userId, { userId, nickname });
  }
  return [...byId.values()];
}

/**
 * The chatters `who` means: those whose nickname, nickname without the room's 单推符号 or name in
 * `atNames` is it; failing that, those whose nickname has it in it.
 */
function find(
  who: string,
  among: readonly Chatter[],
  names: Readonly<Record<string, string>>,
  trim: readonly string[],
): Chatter[] {
  const exact = among.filter(
    (c) => c.nickname === who || atName(c.nickname, trim) === who || names[c.userId] === who,
  );
  return exact.length ? exact : among.filter((c) => c.nickname.includes(who));
}
