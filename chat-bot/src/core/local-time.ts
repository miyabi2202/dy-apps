/** `YYYY-MM-DD HH:MM:SS` in the machine's time zone. */
export function localDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** `YYYY-MM-DD 星期X` in the machine's time zone. */
export function localDate(ms: number): string {
  return `${localDateTime(ms).slice(0, 10)} 星期${'日一二三四五六'[new Date(ms).getDay()]}`;
}

/** `HH:MM:SS` in the machine's time zone. */
export function clock(ms: number): string {
  return localDateTime(ms).slice(11);
}
