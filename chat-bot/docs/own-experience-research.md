# Giving the bot its own experiences

## The problem

When someone talks to the bot, it can only answer with what is already in the room: the streamer's words, the chat and its memory. A person brings their own life, opinions and curiosity into a conversation, so there is always something new to talk about. The bot has nothing of its own to bring up.

Two of our own prompts also push against new topics:

- `prompts/personas/fairy.md` says "答完问题不再补一句……抛个新话题".
- `prompts/auto-message.md` ties every message to what the streamer or chat just said.

Those rules make sense against rambling and padding, but they also remove any chance of the bot bringing up something new.

## What the research says

Researchers handle this in about five ways, listed from easiest to hardest to add to our bot.

### 1. A simulated life: give the bot things that happened to it

- **LoCoMo** (Snap Research) gives each agent a timeline of life events, and the long conversations are written to stay grounded in those events.
- **PersonaLife** (open source) gives a persona a simulated day between conversations. It keeps a log that separates what was planned from what actually happened, and the model can't rewrite past entries. That stops it contradicting itself.
- **Generative Agents** (Park et al., 2023) is the usual starting point. Everything the agent sees or does goes into one memory store. It recalls items by how recent, important and relevant they are. Now and then it also writes short "reflections" (what it makes of things) back into the same store, and those can come up later as its own opinions.
- **LD-Agent** keeps past events in a memory bank and the speakers' personas in a separate one that updates, so the character stays consistent across sessions.

Takeaway: "experiences" must be stored and kept consistent. If you just ask the model to invent an anecdote each time, the story changes from one telling to the next.

### 2. "Inner thoughts": keep thinking and only speak when there's something worth saying

- _Proactive Conversational Agents with Inner Thoughts_ (Liu et al., CHI 2025) is the closest match to this problem. Alongside the conversation, the agent keeps writing private thoughts using its long-term and short-term memory. It scores each thought on how much it wants to say it, and speaks only when one scores high enough.
- It works in five stages: trigger, retrieval, thought formation, evaluation, participation.
- It beat a "persona + predict who speaks next" baseline on all 7 measures, and people preferred it in over 82% of comparisons.
- New topics come out of the agent's own train of thought instead of only reacting to the last message. It was built for group chat, which fits a live room.

### 3. Self-disclosure: the bot shares its own view or story, not just answers

- In one study, the more the chatbot disclosed about itself, the more people enjoyed the chat.
- A 2026 preprint with 170 participants found bots with a generated persona built better rapport than both a no-persona bot and one that only self-disclosed.

### 4. User-oriented proactivity: open topics by getting curious about the person

- An IJCAI 2025 paper argues that bots which plan topics steer toward their own target topics and ignore the user. It proposes exploring the user's background instead.
- An older line of work found that how much a bot learns about the user tracks with how engaging humans rate it.
- A CHI 2024 study warns that bringing up remembered personal details can feel like surveillance to some people (in that study, health information), so choose what to recall with care.

### 5. Bring in fresh outside material

- _Conversation Initiation by Diverse News Contents Introduction_ starts topics from current news. It's a cheap way to have "something new to say" without making up a life.

## Ideas for our bot

The bot currently has only a fixed persona plus the transcript, chat history and memory. It has no state of its own that changes over time. Ideas, from cheapest to most work:

1. **An "own life" log per persona** (from idea 1). A scheduled job writes a few small, in-character events or opinions each day: things Fairy "did" in the HDD system, a song it "got hooked on", a take on tonight's set. They're added to a file only, never rewritten, and a few recent ones go into the prompt as `{{ownLife}}`. The persona rule changes to something like "you may occasionally bring one up when it connects".
2. **Reflections after each stream** (Generative Agents). `pnpm remember` already summarises the room. It could also write the bot's own opinions ("主播今天高音比上周稳"), which it can mention in later streams.
3. **Inner thoughts in auto-message** (idea 2). Split it into two steps. First, write 3–5 candidate thoughts from memory and current context, some tied to the room and some from its own life. Then score each one for how much the bot wants to say it, and send the best one only if it scores high enough. This also replaces the current "always send one" rule with a real reason to stay quiet.
4. **Follow-ups on viewers** (idea 4). Store small facts about regular viewers and ask about them later ("你上次说要去考试，考完了吗？").

Start with 1 and 3 together, because 3 needs 1 to have new material to choose from.

## Sources

- [Proactive Conversational Agents with Inner Thoughts (CHI 2025)](https://arxiv.org/abs/2501.00383v2)
- [Generative Agents: Interactive Simulacra of Human Behavior](https://ar5iv.labs.arxiv.org/html/2304.03442)
- [Generative Agents memory stream pattern](https://agentpatterns.ai/patterns/agent-design/generative-agents-memory-stream/)
- [LoCoMo: Evaluating Very Long-Term Conversational Memory](https://snap-research.github.io/locomo/)
- [PersonaLife (GitHub)](https://github.com/GermanAutodidact/PersonaLife)
- [Hello Again! LD-Agent for long-term dialogue](https://arxiv.org/pdf/2406.05925)
- [AutoPersonas: open-ended persona evolution](https://arxiv.org/pdf/2607.08252)
- [Do AI Personas Grow? Life events benchmark](https://arxiv.org/html/2608.06485v1)
- [Enhancing User-Oriented Proactivity in Open-Domain Dialogues (IJCAI 2025)](https://www.ijcai.org/proceedings/2025/0919.pdf)
- [Dynamic In-Group Persona Generation for Human–AI Rapport](https://arxiv.org/html/2606.18256v1)
- [Effect of a Chatbot's Reciprocal Self-Disclosures](https://aodr.org/xml/38536/38536.pdf)
- [Long-Term Memory and Self-Disclosure (CHI 2024)](https://depstein.net/assets/pubs/ejo_chi24.pdf)
- [A Survey on Proactive Dialogue Systems (IJCAI 2023)](https://www.ijcai.org/proceedings/2023/0738.pdf)
- [Aiming to Know You Better… More Engaging Dialogue Partner](https://arxiv.org/pdf/1808.07104)
- [ConvAI2 challenge report](https://arxiv.org/pdf/1902.00098)
- [Conversation Initiation by Diverse News Contents Introduction](https://liner.com/review/conversation-initiation-by-diverse-news-contents-introduction)
