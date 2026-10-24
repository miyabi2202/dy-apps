/**
 * Replays the bot's logs to see where lyrics would end a named song (see lyricsBreak), against
 * where today's pauses and talk do (see currentSong), before the lyrics are wired into the bot.
 *
 *   pnpm replay:song-breaks [--logs <dir>] [--cache <dir>] [--out <file>] [--show <title>]…
 *
 * For each song the bot named for sure, it fetches its lyrics from NetEase (cached on disk, so a
 * second run asks NetEase nothing) and runs every line heard after through lyricsBreak, line by
 * line as the bot would, until the bot named another song. Each change from one named song to
 * the next is then judged both ways, by where the old song's lyrics last matched (`lastOwn`) and
 * where the new song started (the first line matching its lyrics, or of a song between the two
 * that the bot never named, which the lyrics search names):
 *
 * - bounded: the break, as the next song was asked about, is between the two;
 * - early: it's while the old song was still being sung;
 * - late: it's only after the new song had started;
 * - merged: there's none.
 *
 * A false split is a break inside a song that lasted for 40 sung characters (when /自动识歌 asks
 * about the "new" song) before the song's lyrics matched again, or for today's rules, a break
 * inside a song followed by 40 sung characters. It runs a grid of settings (Params), then lists
 * every run at the design's starting point and at the tuned one; the file (--out) has every run,
 * and with --show every line of the runs of a title, with how much of it matches each song's
 * lyrics.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LyricsSearch, normaliseTitle } from '@dy-apps/lyrics-search';
import {
  lyricsBreak,
  lyricsIndex,
  matchShare,
  type LyricsBreakOptions,
  type LyricsIndex,
} from '../src/core/songs/lyric-match';
import { currentSong, isSung, sungChars, type TranscriptLine } from '../src/core/songs/transcript';

/** One JSON line of the log, as far as the replay reads it. */
interface LogLine {
  message: string;
  timestamp: string;
  [field: string]: unknown;
}

/** A song the bot named for sure, and what it was asked about. */
interface Naming {
  at: number;
  title: string;
  artist: string;
  key: string;
  /** When it was asked, and the lines it was asked about (the song so far, by today's rules). */
  askedAt: number;
  asked: TranscriptLine[];
}

/** One run of the bot: a room, the lines heard, the songs named. */
interface Session {
  room: string;
  lines: TranscriptLine[];
  namings: Naming[];
  /** Chat, what the bot said, and its song naming, for reading a song change by hand (--sample). */
  events: { at: number; text: string }[];
}

/** The replay's settings: lyricsMatcher's threshold and lyricsBreak's options. */
/**
 * The replay's settings: lyricsMatcher's threshold, lyricsBreak's options, and how many of NetEase's
 * versions of the title the lyrics come from (a version's lyrics may be cut short or differ).
 */
type Params = { threshold: number; versions: number } & Required<LyricsBreakOptions>;

/** The design's starting point, and what the replay came to. */
const DEFAULT: Params = { threshold: 0.5, misses: 2, minChars: 6, heal: false, versions: 1 };
const TUNED: Params = { threshold: 0.5, misses: 3, minChars: 8, heal: true, versions: 3 };

/** Sung characters after which /自动识歌 asks about a song. */
const ASKED_AT_CHARS = 40;

/** A log field that should be text, or '' when it isn't. */
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The bot's runs in the logs, oldest first; a new one starts at each `starting`. */
function readSessions(dir: string): Session[] {
  const files = readdirSync(dir).filter((f) => /^chat-bot\d*\.log$/.test(f));
  const entries: LogLine[] = [];
  for (const file of files) {
    for (const text of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (!text.startsWith('{')) continue;
      try {
        entries.push(JSON.parse(text) as LogLine);
      } catch {
        // A line cut off as the log rotated.
      }
    }
  }
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const sessions: Session[] = [];
  let session: Session | undefined;
  let asked: { at: number; first: string } | undefined;
  for (const entry of entries) {
    const at = Date.parse(entry.timestamp);
    if (entry.message === 'starting') {
      session = { room: String(entry.roomId), lines: [], namings: [], events: [] };
      sessions.push(session);
      asked = undefined;
    } else if (!session) {
      continue;
    } else if (entry.message === 'heard' && typeof entry.text === 'string') {
      // The log has when a line came in, about when it ended.
      session.lines.push({
        start: at,
        end: at,
        text: entry.text,
        ...(typeof entry.speech === 'number' && { speech: entry.speech }),
        ...(typeof entry.speaker === 'number' && { speaker: entry.speaker }),
        ...(typeof entry.host === 'boolean' && { host: entry.host }),
      });
    } else if (entry.message === 'chat') {
      session.events.push({ at, text: `chat ${text(entry.nickname)}: ${text(entry.content)}` });
    } else if (entry.message === 'talk sent' || entry.message === 'reply sent') {
      session.events.push({ at, text: `bot: ${text(entry.text)}` });
    } else if (entry.message === 'song id asked') {
      session.events.push({ at, text: `song id asked (${text(entry.why)})` });
      asked = { at, first: text(entry.first) };
    } else if (entry.message === 'song identified' && entry.sure === true) {
      const title = text(entry.title);
      const key = normaliseTitle(title);
      if (!key) continue;
      const askedAt = asked?.at ?? at;
      const before = session.lines.filter((line) => line.end <= askedAt);
      // The lines it was asked about start at the first one it logged; without one, today's rules.
      const first = asked?.first;
      const from = first ? before.map((line) => line.text).lastIndexOf(first) : -1;
      session.namings.push({
        at,
        title,
        artist: text(entry.artist),
        key,
        askedAt,
        asked: from >= 0 ? before.slice(from) : currentSong(before),
      });
      session.events.push({ at, text: `song identified 《${title}》 ${text(entry.artist)}` });
      asked = undefined;
    }
  }
  return sessions.filter((s) => s.namings.length);
}

/** Lines today's rules start a new song at (see currentSong). */
function todaysBreaks(lines: readonly TranscriptLine[]): Set<TranscriptLine> {
  const breaks = new Set<TranscriptLine>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isSung(line)) continue;
    if (currentSong(lines.slice(0, i + 1)).find(isSung) === line) breaks.add(line);
  }
  return breaks;
}

/** A fetch that keeps each answer NetEase gave on disk, and gives it again without asking. */
function cachedFetch(dir: string): typeof fetch {
  mkdirSync(dir, { recursive: true });
  return (async (url: string, init?: RequestInit) => {
    const file = join(dir, `${createHash('sha1').update(url).digest('hex')}.json`);
    try {
      return new Response(readFileSync(file, 'utf8'));
    } catch {
      // Not asked yet.
    }
    const response = await fetch(url, init);
    const body = await response.text();
    if (response.ok && body.includes('"code":200')) writeFileSync(file, body);
    return new Response(body, { status: response.status });
  }) as typeof fetch;
}

/** What the replay asks NetEase: a named song's lyrics, and the title of some sung lines ('' when unsure). */
interface Sources {
  lyricsOf: (naming: Naming, versions: number) => Promise<string[]>;
  titleOf: (lines: readonly TranscriptLine[]) => Promise<string>;
}

/** NetEase through the lyrics search, each answer kept for the next setting. */
function netease(search: LyricsSearch): Sources {
  const lyrics = new Map<string, Promise<string[]>>();
  const ids = new Map<string, Promise<number[]>>();
  const titles = new Map<string, Promise<string>>();
  const once = <T>(kept: Map<string, Promise<T>>, key: string, ask: () => Promise<T>) => {
    let answer = kept.get(key);
    if (!answer) {
      answer = ask();
      kept.set(key, answer);
    }
    return answer;
  };
  return {
    // The first `versions` with lyrics (an instrumental shares the title), of the first 5.
    lyricsOf: (naming, versions) =>
      once(lyrics, `${naming.key}|${naming.artist}|${versions}`, async () => {
        const all = await once(ids, `${naming.key}|${naming.artist}`, () =>
          search.lookup(naming.title, naming.artist),
        );
        const found: string[][] = [];
        for (const id of all.slice(0, 5)) {
          if (found.length >= versions) break;
          const lines = await once(lyrics, String(id), () => search.lyrics(id));
          if (lines.length) found.push(lines);
        }
        return found.flat();
      }),
    titleOf: (lines) =>
      once(titles, lines.map((l) => l.text).join('\n'), async () => {
        const guess = await search.identify(lines.map((l) => ({ text: l.text, sung: true })));
        return guess.sure ? guess.title : '';
      }),
  };
}

const chars = (line: TranscriptLine) => line.text.replace(/[\s\p{P}]/gu, '').length;

/** Whether a line is from some lyrics, remembered per line (pinyin is slow). */
function matcher(lyrics: readonly string[], threshold: number): (text: string) => boolean {
  const index = lyricsIndex(lyrics);
  const seen = new Map<string, boolean>();
  return (text) => {
    let match = seen.get(text);
    if (match === undefined) {
      match = (matchShare(text, index) ?? 0) >= threshold;
      seen.set(text, match);
    }
    return match;
  };
}

type Verdict = 'bounded' | 'early' | 'late' | 'merged';

/** What a run of one named song came to. */
interface Run {
  room: string;
  session: Session;
  /** Today's breaks after it was named, until the next song was asked about. */
  todays: TranscriptLine[];
  song: Naming;
  /** The bot's next naming of another song in the same run of the bot, if any. */
  next?: Naming;
  lyrics: string[];
  nextLyrics: string[];
  /** The lines after it was named, until the next song was asked about. */
  window: TranscriptLine[];
  /** Share of the counted lines it was asked about that match its lyrics. */
  ownShare?: number;
  /** The first break, and the one there was as the next song was asked about. */
  firstBreak?: TranscriptLine;
  finalBreak?: TranscriptLine;
  /** Every break it made, line by line, in order (some later undone, with heal). */
  breaks?: TranscriptLine[];
  /** A break inside the song that lasted 40 sung characters. */
  falseSplit?: TranscriptLine;
  /** The bot named the same song again while a break stood. */
  renamed: boolean;
  /** The last line from its lyrics (and not the next song's). */
  lastOwn?: TranscriptLine;
  /** The first line from the next song's lyrics after that. */
  firstNext?: TranscriptLine;
  /** Counted lines between `lastOwn` and `firstNext` that match neither song. */
  between: TranscriptLine[];
  /** The song the lyrics search names from `between` (3 lines or more), when it's neither. */
  unnamed?: string;
  lyricsVerdict?: Verdict;
  todayVerdict?: Verdict;
  /** One of today's breaks inside the song, followed by 40 sung characters. */
  todayFalseSplit?: TranscriptLine;
  /** Merged by the lyrics as the next song was asked about, but bounded a minute later. */
  boundedLater?: boolean;
}

/** What the lyrics are mostly in: Japanese (any kana to speak of), English (mostly Latin letters) or Chinese. */
function language(lyrics: readonly string[]): 'ja' | 'en' | 'zh' {
  const text = lyrics.join('');
  const count = (re: RegExp) => text.match(re)?.length ?? 0;
  const letters = count(/\p{L}/gu) || 1;
  if (count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) / letters > 0.1) return 'ja';
  return count(/\p{Script=Latin}/gu) / letters > 0.5 ? 'en' : 'zh';
}

function verdict(
  breaks: readonly TranscriptLine[],
  lastOwn: TranscriptLine | undefined,
  target: TranscriptLine,
): Verdict {
  const after = breaks.filter((b) => !lastOwn || b.end > lastOwn.end);
  if (after.some((b) => b.end <= target.end)) return 'bounded';
  if (breaks.some((b) => lastOwn && b.end <= lastOwn.end)) return 'early';
  return after.length ? 'late' : 'merged';
}

async function replay(
  sessions: readonly Session[],
  { lyricsOf, titleOf }: Sources,
  params: Params,
): Promise<Run[]> {
  const runs: Run[] = [];
  const counted = (line: TranscriptLine) => isSung(line) && chars(line) >= params.minChars;
  for (const session of sessions) {
    const today = todaysBreaks(session.lines);
    // A run of one song: from its first naming to the first naming of another song.
    for (let i = 0; i < session.namings.length; i++) {
      const song = session.namings[i]!;
      if (i > 0 && session.namings[i - 1]!.key === song.key) continue;
      const nextAt = session.namings.findIndex((n, j) => j > i && n.key !== song.key);
      const next = nextAt >= 0 ? session.namings[nextAt] : undefined;
      const repeats = session.namings.slice(i + 1, nextAt >= 0 ? nextAt : undefined);
      const until = next?.askedAt ?? Infinity;
      const window = session.lines.filter((l) => l.end > song.askedAt && l.end <= until);
      const run: Run = {
        room: session.room,
        session,
        todays: [],
        song,
        ...(next && { next }),
        lyrics: await lyricsOf(song, params.versions),
        nextLyrics: next ? await lyricsOf(next, params.versions) : [],
        window,
        renamed: false,
        between: [],
      };
      runs.push(run);
      if (!run.lyrics.length) continue;

      const matches = matcher(run.lyrics, params.threshold);
      const nextMatches = run.nextLyrics.length
        ? matcher(run.nextLyrics, params.threshold)
        : () => false;
      const own = song.asked.filter(counted);
      if (own.length) run.ownShare = own.filter((l) => matches(l.text)).length / own.length;
      const sung = window.filter(counted);
      run.lastOwn = sung.filter((l) => matches(l.text) && !nextMatches(l.text)).at(-1);
      const lastOwn = run.lastOwn;
      const inside = (b: TranscriptLine) => lastOwn !== undefined && b.end <= lastOwn.end;

      // Line by line, as the bot would see it.
      const known = { since: song.askedAt, matches };
      const breakAt = (k: number) => lyricsBreak(window.slice(0, k + 1), known, params);
      for (let k = 0; k < window.length; k++) {
        if (!counted(window[k]!)) continue;
        const b = breakAt(k);
        if (!b) continue;
        run.firstBreak ??= b;
        if (!run.breaks?.includes(b)) (run.breaks ??= []).push(b);
        const start = window.indexOf(b);
        if (
          !run.falseSplit &&
          inside(b) &&
          sungChars(window.slice(start, k + 1)) >= ASKED_AT_CHARS
        ) {
          run.falseSplit = b;
        }
      }
      const finalBreak = lyricsBreak(window, known, params);
      if (finalBreak) run.finalBreak = finalBreak;
      run.renamed = repeats.some((n) => {
        const before = window.filter((l) => l.end <= n.askedAt);
        return lyricsBreak(before, known, params) !== undefined;
      });

      const todays = window.filter((l) => today.has(l));
      run.todays = todays;
      run.todayFalseSplit = todays.find((b, j) => {
        const end = todays[j + 1]?.end ?? Infinity;
        return (
          inside(b) &&
          sungChars(window.filter((l) => l.end >= b.end && l.end < end)) >= ASKED_AT_CHARS
        );
      });

      if (!next) continue;
      const firstNext =
        sung.find((l) => (!lastOwn || l.end > lastOwn.end) && nextMatches(l.text)) ??
        next.asked.find(counted);
      if (!firstNext) continue;
      run.firstNext = firstNext;
      run.between = sung.filter(
        (l) =>
          (!lastOwn || l.end > lastOwn.end) &&
          l.end < firstNext.end &&
          !matches(l.text) &&
          !nextMatches(l.text),
      );
      // A song the bot never named between the two: the break belongs where it starts.
      if (run.between.length >= 3) {
        const title = normaliseTitle(await titleOf(run.between));
        if (title && title !== song.key && title !== next.key) run.unnamed = title;
      }
      const target = run.unnamed ? run.between[0]! : firstNext;
      run.lyricsVerdict = verdict(finalBreak ? [finalBreak] : [], lastOwn, target);
      if (run.lyricsVerdict === 'merged') {
        // The bot asked about the next song when today's rules let it; with the lyrics it would
        // ask once they broke, so look a minute on.
        const later = session.lines.filter(
          (l) => l.end > song.askedAt && l.end <= next.askedAt + 60_000,
        );
        const b = lyricsBreak(later, known, params);
        run.boundedLater = b !== undefined && verdict([b], lastOwn, target) === 'bounded';
      }
      run.todayVerdict = verdict(todays, lastOwn, target);
    }
  }
  return runs;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};
const pct = (n: number) => `${Math.round(100 * n)}%`;
const clock = (ms: number) =>
  new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(5, 19);

/** The two merges that started this, by the line the next song started at. */
const KNOWN_MERGES = [
  { room: '259175310675', from: '开始懂了', first: '海风吹过的夏天' },
  { room: '416362684969', from: '画廊游记', first: '誰かを愛すること' },
];

/** The numbers for one setting. */
function summary(runs: readonly Run[]) {
  const withLyrics = runs.filter((r) => r.lyrics.length);
  const judged = withLyrics.filter((r) => r.lyricsVerdict);
  const count = (by: 'lyricsVerdict' | 'todayVerdict') =>
    (['bounded', 'early', 'late', 'merged'] as const).map(
      (v) => judged.filter((r) => r[by] === v).length,
    );
  return {
    runs: runs.length,
    noLyrics: runs.length - withLyrics.length,
    ownMedian: median(withLyrics.flatMap((r) => (r.ownShare === undefined ? [] : [r.ownShare]))),
    changes: judged.length,
    unnamed: judged.filter((r) => r.unnamed).length,
    lyrics: count('lyricsVerdict'),
    today: count('todayVerdict'),
    falseSplits: withLyrics.filter((r) => r.falseSplit).length,
    todayFalseSplits: withLyrics.filter((r) => r.todayFalseSplit).length,
    renamed: withLyrics.filter((r) => r.renamed).length,
    boundedLater: judged.filter((r) => r.boundedLater).length,
    byLanguage: Object.fromEntries(
      (['zh', 'ja', 'en'] as const).map((lang) => {
        const runs = withLyrics.filter((r) => language(r.lyrics) === lang);
        return [
          lang,
          {
            runs: runs.length,
            falseSplits: runs.filter((r) => r.falseSplit).length,
            todayFalseSplits: runs.filter((r) => r.todayFalseSplit).length,
          },
        ];
      }),
    ),
    knownMerges: KNOWN_MERGES.map((m) =>
      runs.some(
        (r) =>
          r.room === m.room && r.song.title === m.from && r.finalBreak?.text.startsWith(m.first),
      ),
    ),
  };
}

function summaryLine(p: Params, s: ReturnType<typeof summary>) {
  const of = (n: number, total: number) => `${n} (${pct(n / (total || 1))})`;
  const withLyrics = s.runs - s.noLyrics;
  return [
    `${p.threshold} ${p.misses} ${p.minChars} ${p.heal ? 'heal' : '-   '} ${p.versions}`,
    `own ${pct(s.ownMedian)}`,
    `lyrics ${s.lyrics.join('/')}`,
    `today ${s.today.join('/')}`,
    `false ${of(s.falseSplits, withLyrics)} vs ${of(s.todayFalseSplits, withLyrics)}`,
    Object.entries(s.byLanguage)
      .map(([lang, l]) => `${lang} ${l.falseSplits}/${l.runs}`)
      .join(' '),
    `renamed ${s.renamed}`,
    `later ${s.boundedLater}`,
    `known ${s.knownMerges.map((ok) => (ok ? 'yes' : 'no')).join('/')}`,
  ].join(' | ');
}

/** A seeded random number in [0, 1) (mulberry32), so a sample can be drawn again. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `n` song changes to check by hand, drawn with `seed`: 3 the lyrics split by mistake, 3 they
 * never split, one from each room, and the rest by the old song's language (half Chinese, the
 * rest Japanese and English alike).
 */
function sample(runs: readonly Run[], n: number, seed: number): Run[] {
  const random = seeded(seed);
  const picked: Run[] = [];
  const take = (from: readonly Run[], count: number) => {
    const left = from.filter((r) => !picked.includes(r));
    for (let i = 0; i < count && left.length; i++) {
      picked.push(left.splice(Math.floor(random() * left.length), 1)[0]!);
    }
  };
  const changes = runs.filter((r) => r.lyricsVerdict);
  take(
    runs.filter((r) => r.falseSplit),
    3,
  );
  take(
    changes.filter((r) => r.lyricsVerdict === 'merged'),
    3,
  );
  // One from each room with changes, as most come from one room.
  for (const room of new Set(changes.map((r) => r.room))) {
    if (!picked.some((r) => r.room === room)) {
      take(
        changes.filter((r) => r.room === room),
        1,
      );
    }
  }
  const rest = n - picked.length;
  const zh = Math.ceil(rest / 2);
  take(
    changes.filter((r) => language(r.lyrics) === 'zh'),
    zh,
  );
  take(
    changes.filter((r) => language(r.lyrics) === 'ja'),
    Math.ceil((rest - zh) / 2),
  );
  take(
    changes.filter((r) => language(r.lyrics) === 'en'),
    n - picked.length,
  );
  return picked;
}

/** What was heard and said around a song change, marked with each rule's breaks, to judge by hand. */
function dump(r: Run, index: number, say: (text?: string) => void) {
  const own = lyricsIndex(r.lyrics);
  const next = lyricsIndex(r.nextLyrics);
  const anchor = r.falseSplit ?? r.lastOwn ?? r.finalBreak;
  const from = Math.min(anchor?.end ?? r.song.askedAt, r.song.askedAt) - 90_000;
  const to = r.next ? r.next.askedAt + 30_000 : (anchor?.end ?? r.song.askedAt) + 240_000;
  say(
    `=== case ${index + 1}: ${r.room} 《${r.song.title}》 (${language(r.lyrics)}) → 《${r.next?.title ?? ''}》 (${language(r.nextLyrics)})` +
      ` | replay: lyrics ${r.lyricsVerdict ?? '-'}, today ${r.todayVerdict ?? '-'}` +
      (r.falseSplit ? `, lyrics false split at ${clock(r.falseSplit.end)}` : '') +
      (r.todayFalseSplit ? `, today false split at ${clock(r.todayFalseSplit.end)}` : '') +
      (r.unnamed ? `, unnamed 《${r.unnamed}》` : ''),
  );
  say(
    'marks: B lyrics break (as the next song was asked), F lyrics false split, T today break, L last line of the old lyrics, N first of the new; columns: speech score, voice, share of old / new lyrics',
  );
  const lines = r.session.lines.filter((l) => l.end >= from && l.end <= to);
  const events = r.session.events.filter((e) => e.at >= from && e.at <= to);
  const rows = [
    ...lines.map((line) => {
      const marks = [
        line === r.finalBreak ? 'B' : '',
        line === r.falseSplit ? 'F' : '',
        r.todays.includes(line) ? 'T' : '',
        line === r.lastOwn ? 'L' : '',
        line === r.firstNext ? 'N' : '',
      ].join('');
      const share = (index: LyricsIndex) => {
        const value = matchShare(line.text, index);
        return value === undefined ? '  -' : `${Math.round(value * 100)}`.padStart(3);
      };
      const voice = `${line.speaker ?? '-'}${line.host === false ? 'g' : ''}`;
      return {
        at: line.end,
        text: `${marks.padEnd(3)} ${(line.speech ?? -1).toFixed(2)} ${voice.padStart(3)} ${share(own)} ${share(next)} ${line.text}`,
      };
    }),
    ...events.map((e) => ({ at: e.at, text: `    ${e.text}` })),
  ].sort((a, b) => a.at - b.at);
  for (const row of rows) say(`${clock(row.at).slice(6)} ${row.text}`);
  say();
}

/**
 * Every line heard from `from` to `to` (ms), marked with where each rule put a break, for checking
 * against the truth from elsewhere (Shazam on a recording): B the lyrics' break as the next song
 * was asked about, b one they made and later undid (heal), T today's.
 */
function range(runs: readonly Run[], from: number, to: number, say: (text?: string) => void) {
  const session = runs.find((r) =>
    r.session.lines.some((l) => l.end >= from && l.end <= to),
  )?.session;
  if (!session) return;
  const mine = runs.filter((r) => r.session === session);
  const finals = new Set(mine.flatMap((r) => (r.finalBreak ? [r.finalBreak] : [])));
  const undone = new Set(mine.flatMap((r) => (r.breaks ?? []).filter((b) => !finals.has(b))));
  const todays = new Set(mine.flatMap((r) => r.todays));
  const rows = [
    ...session.lines
      .filter((l) => l.end >= from && l.end <= to)
      .map((line) => ({
        at: line.end,
        text: `${[finals.has(line) ? 'B' : '', undone.has(line) ? 'b' : '', todays.has(line) ? 'T' : ''].join('').padEnd(3)} ${(line.speech ?? -1).toFixed(2)} ${line.text}`,
      })),
    ...session.events
      .filter((e) => e.at >= from && e.at <= to && !e.text.startsWith('chat '))
      .map((e) => ({ at: e.at, text: `    ${e.text}` })),
  ].sort((a, b) => a.at - b.at);
  for (const row of rows) say(`${new Date(row.at).toISOString().slice(11, 19)}Z ${row.text}`);
}

/** Each line heard during the runs of `title`, with how much of it is in that song's lyrics and the next one's. */
function show(runs: readonly Run[], title: string, say: (text?: string) => void) {
  for (const r of runs.filter((run) => run.song.title === title)) {
    say(`《${r.song.title}》 ${clock(r.song.at)} → 《${r.next?.title ?? ''}》`);
    const own = lyricsIndex(r.lyrics);
    const next = lyricsIndex(r.nextLyrics);
    for (const line of [...r.song.asked, ...r.window]) {
      const share = (index: LyricsIndex) => {
        const value = matchShare(line.text, index);
        return value === undefined ? '  -' : `${Math.round(value * 100)}`.padStart(3);
      };
      const mark =
        line === r.finalBreak
          ? '>>'
          : line === r.firstBreak
            ? '> '
            : line.end <= r.song.askedAt
              ? 'as'
              : '  ';
      say(
        `${mark} ${clock(line.end)} ${isSung(line) ? 'sung' : 'talk'} ${share(own)} ${share(next)} ${line.speaker ?? '-'} ${line.text.slice(0, 40)}`,
      );
    }
    say();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      logs: { type: 'string', default: 'logs' },
      cache: { type: 'string', default: 'logs/netease-cache' },
      out: { type: 'string', default: 'logs/song-breaks-replay.txt' },
      show: { type: 'string', multiple: true, default: [] },
      /** Song changes to check by hand, written to --sample-out (at the tuned setting). */
      sample: { type: 'string', default: '0' },
      seed: { type: 'string', default: '1' },
      'sample-out': { type: 'string', default: 'logs/song-breaks-sample.txt' },
      /** Skip the grid of settings. */
      'no-grid': { type: 'boolean', default: false },
      /** Lines from one time to another, `<ISO>..<ISO>`, written to --range-out (at the tuned setting). */
      range: { type: 'string' },
      'range-out': { type: 'string', default: 'logs/song-breaks-range.txt' },
    },
  });
  const sessions = readSessions(values.logs);
  const sources = netease(new LyricsSearch({ fetch: cachedFetch(values.cache), timeoutMs: 8000 }));
  // The numbers go to the terminal too; every run, line by line, only to the file.
  const out: string[] = [];
  let quiet = false;
  const say = (text = '') => {
    if (!quiet) console.log(text);
    out.push(text);
  };

  say(
    'threshold misses minChars heal versions | own lines matched (median) | lyrics and today: bounded/early/late/merged | false splits, lyrics vs today | lyrics false splits by language | renamed | merged then bounded a minute on | known merges',
  );
  for (const versions of values['no-grid'] ? [] : [1, 3]) {
    for (const heal of [false, true]) {
      for (const threshold of [0.4, 0.5, 0.6]) {
        for (const misses of [2, 3]) {
          for (const minChars of [6, 8]) {
            const params = { threshold, misses, minChars, heal, versions };
            say(summaryLine(params, summary(await replay(sessions, sources, params))));
          }
        }
      }
    }
  }

  for (const params of [DEFAULT, TUNED]) {
    const runs = await replay(sessions, sources, params);
    say();
    say(`At ${JSON.stringify(params)}:`);
    say(JSON.stringify(summary(runs)));

    quiet = true;
    say();
    say(`Every run, at ${JSON.stringify(params)}:`);
    for (const r of runs) {
      const where = `${clock(r.song.at)} ${r.room} 《${r.song.title}》`;
      if (!r.lyrics.length) {
        say(`${where}: no lyrics`);
        continue;
      }
      const at = (line: TranscriptLine | undefined) =>
        line ? `${clock(line.end)} 「${line.text.slice(0, 16)}」` : '-';
      const parts = [
        `own ${r.ownShare === undefined ? '-' : pct(r.ownShare)}`,
        `break ${at(r.finalBreak)}`,
        ...(r.falseSplit ? [`FALSE SPLIT ${at(r.falseSplit)}`] : []),
        ...(r.todayFalseSplit ? [`today false split ${at(r.todayFalseSplit)}`] : []),
        ...(r.renamed ? ['renamed'] : []),
      ];
      if (r.next) {
        parts.push(
          `→ 《${r.next.title}》 ${clock(r.next.at)}: lyrics ${r.lyricsVerdict ?? '?'}, today ${r.todayVerdict ?? '?'}`,
        );
        if (r.unnamed) parts.push(`unnamed 《${r.unnamed}》 from ${at(r.between[0])}`);
        parts.push(`last own ${at(r.lastOwn)}`, `first next ${at(r.firstNext)}`);
      }
      say(`${where}: ${parts.join('; ')}`);
    }
    for (const title of values.show) {
      say();
      show(runs, title, say);
    }
    if (params === TUNED && values.range) {
      const [from = '', to = ''] = values.range.split('..');
      const lines: string[] = [];
      range(runs, Date.parse(from), Date.parse(to), (t = '') => lines.push(t));
      writeFileSync(values['range-out'], `${lines.join('\n')}\n`);
    }
    const n = Number(values.sample);
    if (params === TUNED && n > 0) {
      const lines: string[] = [];
      sample(runs, n, Number(values.seed)).forEach((r, i) => dump(r, i, (t = '') => lines.push(t)));
      writeFileSync(values['sample-out'], `${lines.join('\n')}\n`);
    }
    quiet = false;
  }
  writeFileSync(values.out, `${out.join('\n')}\n`);
  console.log(`\nwritten to ${values.out}`);
}

await main();
