# A QQ bot on AstrBot, with our memory

> **Status (2026-11-01):** a plan; nothing is built. Written after looking at what chat-bot's core could share and at AstrBot v4.29.4 (2026-10-31).

## The problem

We want a QQ bot, in group chats and in 1:1 private chats, that remembers people and conversations the way the Douyin bot does. The question was whether to pull the Douyin bot's core (MCP bridging, reflection, memory, persona) into its own package and build a QQ bot on it.

Decided:

- **AstrBot** connects to QQ ([AstrBot](https://github.com/AstrBotDevs/AstrBot)).
- **Group chats and private chats.**
- **Memory is never shared with the Douyin bot.** Each QQ conversation has its own.
- **The persona is configurable,** not fixed to Fairy.

## AstrBot is already a bot

AstrBot isn't only a QQ connector. Out of the box it has:

- answering in group and private chats, with chat history per conversation (`platform_settings.unique_session` for one session per sender in a group);
- personas, set in its WebUI;
- model providers (OpenAI-style APIs, Anthropic, Gemini, local models);
- a knowledge base, MCP tools (it's an MCP client for its own agent), skills and Python plugins;
- `active_reply` and group context awareness (`provider_ltm_settings`), which is recent group context, not lasting memory.

So a QQ bot that answers in character needs no code from us. What it lacks is what makes the Douyin bot ours:

| Ours (chat-bot)                                                                        | In AstrBot                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------ |
| Lasting memory of each person and conversation, recalled by embeddings and pinyin BM25 | Recent chat context only                   |
| `remember`: reflecting after a session, writing thoughts that come back later          | None                                       |
| The life diary, and what she browsed on Douyin                                         | None                                       |
| Deciding when to join in (Jev's score, the Codex picker, triggers with a `chance`)     | Simpler wake rules and random active reply |
| Speaking rules (forbidden topics) checked before sending                               | Partly, through plugins                    |
| `claude -p` / codex CLIs (a subscription)                                              | An API key per provider, billed per use    |

## What we need, and what we don't

- **MCP bridging: not needed.** AstrBot's agent already calls tools, from MCP servers or from plugin tools (`@filter.llm_tool`). The QQ tools would differ from the Douyin ones anyway (no hearts, fan lamps or song ID). chat-bot's MCP server stays where it is. The one tool we want, "remember this about X", is a plugin tool that calls our memory service.
- **Memory, reflection and knowledge: yes.** That's the part worth reusing:
  - memory per conversation (`room-memory`), and recall (`core/memory/recall.ts`, `MemoryRecall`, `RecallVectors`);
  - reflection (`RememberChat`, `chat-digest.ts`, the `remember-*.md` prompts), made to reflect once a day per conversation, since QQ has no stream end;
  - knowledge recall (`KnowledgeRecall`, `core/knowledge/entries.ts`) and the embedding client for the embedding service (port 8759).
- **Learning stays where it is.** dy-browse writes knowledge files; it doesn't need to move.
- **Persona and model stay in AstrBot.** The persona text (Fairy's or any other) is set there, which is what makes it configurable.

## How it's wired

```
QQ ⇄ NapCat ⇄ AstrBot ── its own agent, persona and model
                 │
                 └─ our plugin (Python, small)
                      ├─ before each model call: POST /recall {umo, text} → memories and knowledge added to the system prompt
                      ├─ every message:          POST /log {umo, sender, text}     → the conversation's transcript
                      └─ tool remember_this:     POST /memory {umo, …}            → a memory change
                                    │
                         memory-service (Node, on bot-core)
                           ├─ data/<umo>/: memory, thoughts, transcript (never the Douyin bot's)
                           ├─ the embedding service on 8759
                           ├─ knowledge/ (recall)
                           └─ a daily reflection per conversation (remember)
```

- **Recall is automatic,** as `{{memory}}` is in chat-bot: the plugin's `on_llm_request` hook asks for the memories that fit and adds them to the prompt. An MCP-only memory would leave it to the model to look things up, which it often doesn't.
- **A conversation is keyed by AstrBot's `unified_msg_origin` (UMO),** e.g. `aiocqhttp:GroupMessage:<群号>`, or the private one with the user's id. Its files are under the QQ memory service's own data folder.
- **Every message is logged,** not only the ones the bot answers, so reflection sees the whole conversation. The plugin's handler for every message is `@filter.event_message_type(EventMessageType.ALL)`; it logs and returns without stopping the event, so AstrBot's agent still answers as configured.

## The work

1. **`bot-core`:** a workspace package (like `room-memory/`) with what's already neutral:
   - prompt tools: `core/prompts/{template,wording,forbidden,persona,life,local-time}`;
   - memory and knowledge: `core/memory/recall.ts`, `core/knowledge/entries.ts`, `MemoryRecall`, `KnowledgeRecall`, `RecallVectors`, the embedding client, the file adapters they use (`thoughts-file`, `vector-cache`, `knowledge-files`, `atomic-file`);
   - reflection: `chat-digest.ts` over a record line whose types the platform supplies, and `RememberChat` with `streamer`/`isPrivate` as options;
   - `room-memory`'s 直播间/主播 wording as options (`streamerId` → `ownerId`).

   chat-bot imports them and keeps every test green; nothing it does changes. Roughly 3k of its 14.6k lines.

2. **`memory-service`:** a small Node HTTP service on `bot-core`: `/recall`, `/log`, `/memory`, and a daily reflection job per conversation.
3. **The AstrBot plugin:** three hooks (`on_llm_request`, every message, a `remember_this` tool), each a call to the memory service.

Not done: the MCP server and tools (no `bot-core` stage for them), and moving `prompts/personas/` out of chat-bot, which only matters if AstrBot is to read the same persona files.

## Other ways considered

- **The bridge plugin plus a Node `qq-bot` that is the whole brain** (a plugin forwards every event over a WebSocket and stops AstrBot's agent; Node decides, replies and sends unprompted through `context.send_message(umo, chain)`). Worth it only if the QQ bot should behave like the Douyin bot: its own judgement on when to speak, reflection in the reply loop, the life diary, running on `claude -p`. It needs most of chat-bot extracted (about 4.5k lines, MCP and tools included).
- **Our service as an OpenAI-compatible provider:** only called when the bot is woken, AstrBot owns the history and persona, no clean silence, no sending unprompted.
- **AstrBot's agent runners** (Dify, Coze, DashScope, DeerFlow): a fixed list in `astrbot/core/agent/runners/`, with no generic HTTP one.
- **Node talking OneBot v11 to NapCat directly:** fewest moving parts, but QQ-only, and logins, reconnects and media are ours.

## Open questions

1. **Knowledge:** does the QQ bot share the knowledge base dy-browse feeds (`chat-bot/data/knowledge/`), or keep its own? Memory is separate either way.
2. **Order:** run AstrBot as it is for a few days first, to see that memory is what's missing, or build this straight away?
3. **The model:** an API key billed per use, or the Claude/Codex subscription through a small proxy between AstrBot and the CLI?
4. **NapCat or QQ's official bot API:** the memory keys differ (a QQ number vs an openid), so pick one before memory piles up. NapCat uses an ordinary QQ account, which risks a ban; the official bot is said to limit messages sent unprompted (not checked against its docs).

## Sources

- AstrBot v4.29.4: [repo](https://github.com/AstrBotDevs/AstrBot/tree/v4.29.4), [docs](https://docs.astrbot.app). Read: `docs/en/platform/aiocqhttp.md`, `docs/en/platform/qqofficial/websockets.md`, `docs/en/dev/star/guides/send-message.md`, `docs/en/dev/openapi.md`, `docs/en/use/mcp.md`, `astrbot/core/platform/astrbot_message.py`, `astrbot/core/pipeline/waking_check/stage.py`, `astrbot/core/star/context.py`, `astrbot/core/config/default.py`.
- What in chat-bot is neutral and what is tied to the live room: an investigation of `chat-bot/src` on 2026-11-01 (files named above).
