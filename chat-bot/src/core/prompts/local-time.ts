/**
 * Times as the models and the records show them: in a room's time zone (an IANA name like
 * `Asia/Shanghai`, room_config.json's `timeZone`: where the streamer is, Beijing time when that's
 * not known), or the machine's when none is given.
 */

/** The time zone a room's times are in when its room_config.json doesn't say: Beijing time. */
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

/** Whether `timeZone` is a time zone this machine knows (`Asia/Shanghai`, `America/New_York`…). */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** How a prompt names `timeZone`: 北京时间 for Beijing's, else the zone's name. */
export function timeZoneName(timeZone: string = DEFAULT_TIME_ZONE): string {
  return timeZone === DEFAULT_TIME_ZONE ? '北京时间' : `${timeZone} 时间`;
}

/** The parts of `ms` in `timeZone` (the machine's when undefined). */
function parts(ms: number, timeZone?: string): Record<string, string> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  return Object.fromEntries(format.formatToParts(ms).map(({ type, value }) => [type, value]));
}

const WEEKDAYS: Record<string, string> = {
  Sun: '日',
  Mon: '一',
  Tue: '二',
  Wed: '三',
  Thu: '四',
  Fri: '五',
  Sat: '六',
};

/** `YYYY-MM-DD HH:MM:SS` in `timeZone` (the machine's when undefined). */
export function localDateTime(ms: number, timeZone?: string): string {
  const p = parts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** `YYYY-MM-DD 星期X` in `timeZone` (the machine's when undefined). */
export function localDate(ms: number, timeZone?: string): string {
  const p = parts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day} 星期${WEEKDAYS[p.weekday ?? ''] ?? ''}`;
}

/** `HH:MM:SS` in `timeZone` (the machine's when undefined). */
export function clock(ms: number, timeZone?: string): string {
  return localDateTime(ms, timeZone).slice(11);
}

/** `+08:00`: how far `timeZone` (the machine's when undefined) is from UTC at `ms`. */
function utcOffset(ms: number, timeZone?: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(ms)
    .find((part) => part.type === 'timeZoneName')?.value;
  // `GMT+08:00`, or plain `GMT` for UTC itself.
  return name?.replace('GMT', '') || '+00:00';
}

/**
 * `YYYY-MM-DD HH:MM:SS+08:00`: a record's time, in `timeZone` (the room's: where the streamer is),
 * with how far that is from UTC, so a model reading the record files needn't convert, and the
 * moment is still exact. Lines written before (no offset) are in the machine's time zone.
 */
export function recordStamp(ms: number, timeZone?: string): string {
  return `${localDateTime(ms, timeZone)}${utcOffset(ms, timeZone)}`;
}

/** This machine's time zone, which records written before had their times in (no offset). */
export function machineTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * `text` with each line's leading `YYYY-MM-DD HH:MM:SS` that has no offset after it (a record
 * written before, in the machine's time zone) shown in `timeZone` instead; lines with an offset
 * (already in the room's) and the rest as they are. Unchanged without a zone.
 */
export function retimeLines(text: string, timeZone?: string): string {
  if (!timeZone) return text;
  return text.replace(
    /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?![+-]\d\d:\d\d)/gm,
    (_, y: string, mo: string, d: string, h: string, mi: string, sec: string) =>
      localDateTime(new Date(+y, +mo - 1, +d, +h, +mi, +sec).getTime(), timeZone),
  );
}
