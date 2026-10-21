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
