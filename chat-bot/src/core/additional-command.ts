/**
 * One of a room's own commands, as `data/<房间号>/additional_commands/index.md` lists it: a prompt
 * the bot answers with when someone asks what it's for, whether they @ the bot or not.
 */
export interface AdditionalCommandEntry {
  /** Its `## <id>` heading, which the picker and Claude call it by: can-sing. */
  id: string;
  /** What it's for, as viewers would say it: 主播会唱xxx吗. */
  name: string;
  /** When to use it, for the judge and the picker: 在问主播会不会唱某首歌…. */
  when: string;
  /** What's said that's surely for it, even when the judge doesn't think so; null for none. */
  trigger: RegExp | null;
  /** Its prompt file, relative to the `additional_commands/` folder: can-sing/prompt.md. */
  prompt: string;
}

/**
 * The commands in `index.md`: each `## <id>` heading with `- key: value` lines under it (`name`,
 * `when` and `prompt` needed, `trigger` a regular expression); what's before the first heading is
 * left alone. Those that aren't right are left out, each with why.
 */
export function parseCommandIndex(text: string): {
  commands: AdditionalCommandEntry[];
  errors: string[];
} {
  const commands: AdditionalCommandEntry[] = [];
  const errors: string[] = [];
  const sections = `\n${text.replace(/\r\n/g, '\n')}`.split(/\n## /).slice(1);
  for (const section of sections) {
    const [heading = '', ...lines] = section.split('\n');
    const id = heading.trim();
    const fields = new Map<string, string>();
    for (const line of lines) {
      const match = /^- (\w+):\s*(.*)$/.exec(line.trim());
      if (match) fields.set(match[1]!, match[2]!.trim());
    }
    const entry = toEntry(id, fields);
    if (typeof entry === 'string') errors.push(`${id}: ${entry}`);
    else commands.push(entry);
  }
  return { commands, errors };
}

function toEntry(id: string, fields: Map<string, string>): AdditionalCommandEntry | string {
  if (!/^[\w-]+$/.test(id)) return 'the heading should be the id, letters, digits and - only';
  const name = fields.get('name');
  const when = fields.get('when');
  const prompt = fields.get('prompt');
  if (!name || !when || !prompt) return 'needs name, when and prompt';
  if (!isInside(prompt)) return `prompt must be inside the folder: ${prompt}`;
  let trigger: RegExp | null = null;
  const pattern = fields.get('trigger');
  if (pattern) {
    try {
      trigger = new RegExp(pattern);
    } catch {
      return `trigger is not a regular expression: ${pattern}`;
    }
  }
  return { id, name, when, trigger, prompt };
}

/** Whether `path` is relative and stays inside its folder (no `..`). */
export function isInside(path: string): boolean {
  return !/^([\\/]|[A-Za-z]:)/.test(path) && !path.split(/[\\/]/).includes('..');
}
