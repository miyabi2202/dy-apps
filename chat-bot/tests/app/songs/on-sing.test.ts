import { OnSing } from '../../../src/app/songs/on-sing';
import { Transcript, type TranscriptLine } from '../../../src/core/songs/transcript';
import { fakeRoom } from '../../support/fake-room';
import { silentLog } from '../../support/fakes';

/** A room whose on_sing is `onSing`; `rolls` are the random numbers, one per song. */
function setup(rolls: number[], onSing = { message: '🩵缇娅 缇娅🩵', probability: 2 / 3 }) {
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const sent: string[] = [];
  let config: typeof onSing | undefined = onSing;
  const hook = new OnSing({
    config: () => config,
    room: fakeRoom({ transcript, now: () => now }),
    outbox: { push: ({ text }) => sent.push(text) },
    log: silentLog,
    random: () => rolls.shift() ?? 0,
  });
  /** The streamer sings (or says) `text` at `at` seconds. */
  const line = (at: number, text: string, sung = true) => {
    now = at * 1000;
    const heard: TranscriptLine = { start: now - 3000, end: now, text, speech: sung ? 0.05 : 0.8 };
    transcript.add(heard);
    hook.hear(heard);
  };
  return { line, sent, turnOff: () => (config = undefined) };
}

test('speaks once a song starts, at most once a song, when the roll comes under the probability', () => {
  const { line, sent } = setup([0.5, 0.9, 0.1]);
  // Talk: nothing said.
  for (let t = 0; t < 60; t += 10) line(t, `说话${t}`, false);
  expect(sent).toEqual([]);
  // A song: said once, however long it goes.
  for (let t = 100; t < 200; t += 10) line(t, `歌词${t}`);
  expect(sent).toEqual(['🩵缇娅 缇娅🩵']);
  // After a pause, a song that rolls too high, then one that doesn't.
  for (let t = 300; t < 400; t += 10) line(t, `另一首${t}`);
  expect(sent).toHaveLength(1);
  for (let t = 500; t < 600; t += 10) line(t, `第三首${t}`);
  expect(sent).toEqual(['🩵缇娅 缇娅🩵', '🩵缇娅 缇娅🩵']);
});

test('rolls again every 3 minutes of singing on, and says nothing without on_sing', () => {
  const { line, sent, turnOff } = setup([0, 0, 0]);
  // Seven minutes of singing without a pause.
  for (let t = 0; t <= 420; t += 10) line(t, `歌词${t}`);
  expect(sent).toHaveLength(3);

  turnOff();
  for (let t = 600; t <= 700; t += 10) line(t, `歌词${t}`);
  expect(sent).toHaveLength(3);
});
