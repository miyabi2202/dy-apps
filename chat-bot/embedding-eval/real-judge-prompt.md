You are labelling a test set for a chat bot's memory recall in a Chinese Douyin live-stream room.

The bot is a regular viewer of this room. Before it replies, it can be reminded of a few items from its memory of the room: facts about the streamer and the room, the room's in-jokes and rules, and notes about individual viewers. Below is everything it remembers of this room (numbered), then several moments from real streams. Each moment shows what had just been said: the streamer's last few lines from speech-to-text (which has typos and homophones: a word may be written as another word that sounds alike, and sung lyrics may appear among them), then the last few chat lines from viewers, newest last. Viewers' names are not shown, only what they wrote.

For each moment, pick which memory items (0 to 3, by number) a regular viewer who remembers them would find **genuinely useful to bring up or keep in mind when replying right now**. Be strict:

- An item counts only if it bears on what is actually being talked about or done at this moment: it explains something said, answers or informs a likely reply, is about a viewer or topic being discussed, or is the room rule or in-joke that is happening right now.
- Sharing a word is not enough. An item that merely mentions the same word, or is generally true of the room (the streamer's name, the usual schedule, who the regulars are) is not relevant unless the moment is about that.
- A note about a viewer is relevant only if the moment is about that viewer or the thing the note says (their name being called, their topic coming up).
- If nothing fits, answer none (an empty list). Many moments are ordinary chatter that no memory item helps with; that is expected.
- Pick at most 3, the most useful first.

## The room's memory

{{pool}}

## The moments

{{moments}}

Answer with one entry per moment, using its id, and the numbers of the relevant items (an empty list for none).
