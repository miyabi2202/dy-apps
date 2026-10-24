import type { ChatRecord } from '../../core/chat/chat-record';
import { clock } from '../../core/prompts/local-time';
import { lastBreak } from '../../core/songs/song-breaks';
import { singingSong, type TranscriptLine } from '../../core/songs/transcript';
import type { RoomRecord } from '../ports';
import type { RoomState } from '../room/room-state';

/** Why a song was taken to have ended, by what found the next one's start (see song-breaks.ts). */
const WHY: Record<string, string> = {
  lyrics: '歌词对不上了',
  shazam: '伴奏换了一首',
  backingGaps: '伴奏停过',
  pauses: '停顿或说话',
};

export interface SongEndsOptions {
  room: Pick<RoomState, 'recentTranscript'> & Partial<Pick<RoomState, 'songSpans'>>;
  record: Pick<RoomRecord, 'add'>;
  /** The song last told to the room, and when (SongId's lastTold), to name the one that ended. */
  lastTold?: () => { song: { title: string }; at: number } | undefined;
  /** The room's time zone, for the time the next song started. */
  timeZone?: () => string;
}

/**
 * Writes a line to the chat record when a song the streamer sang has ended:
 * `[主播](song) 《璀璨冒险人》唱完了，下一首从 10:48:11 开始（歌词对不上了）`, the title when the bot
 * told the room that song while it was sung. That is known once the next song has started (see
 * singingSong, and the song break sources), so the line comes then, with when that one started
 * and what told it apart.
 */
export class SongEnds {
  /** The song being sung: when it started, and when its latest line ended. */
  private song: { start: number; end: number } | undefined;

  constructor(private readonly options: SongEndsOptions) {}

  /** Called with each line the streamer says or sings, after it joined the transcript. */
  hear(line: TranscriptLine): void {
    const { room, record, lastTold, timeZone } = this.options;
    const transcript = room.recentTranscript();
    const spans = room.songSpans?.(transcript);
    const song = singingSong(transcript, line, spans);
    if (!song) return;
    const last = this.song;
    // A song's start moves on as its first lines drop out of the transcript, but never past its
    // own lines: one that starts after them is the next song.
    const next = last !== undefined && song.start > last.end;
    this.song = { start: next || !last ? song.start : last.start, end: line.end };
    if (!next) return;
    const told = lastTold?.();
    const title = told && told.at >= last.start && told.at <= song.start && told.song.title;
    const found = spans && lastBreak(spans);
    const by = found && found.from > last.end ? found.by : 'pauses';
    const ended: ChatRecord = {
      type: 'song',
      sender: '主播',
      text: `${title ? `《${title}》` : '一首歌'}唱完了，下一首从 ${clock(song.start, timeZone?.())} 开始（${WHY[by] ?? by}）`,
    };
    record.add(ended);
  }
}
