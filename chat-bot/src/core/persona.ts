/**
 * A Markdown persona as its parts: the text before the first `## ` heading (who the bot is, in a
 * line or two) and each `## ` section, in order.
 */
interface PersonaParts {
  intro: string;
  sections: { heading: string; body: string }[];
}

function partsOf(text: string): PersonaParts {
  const intro: string[] = [];
  const sections: { heading: string; lines: string[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = /^## (.+)$/.exec(line)?.[1]?.trim();
    if (heading !== undefined) sections.push({ heading, lines: [] });
    else (sections.at(-1)?.lines ?? intro).push(line);
  }
  return {
    intro: intro.join('\n').trim(),
    sections: sections.map(({ heading, lines }) => ({ heading, body: lines.join('\n').trim() })),
  };
}

function textOf({ intro, sections }: PersonaParts): string {
  return [intro, ...sections.map(({ heading, body }) => `## ${heading}\n\n${body}`)]
    .filter((part) => part.trim())
    .join('\n\n');
}

/**
 * A shared persona with a room's changes, section by section: a room section with a heading the
 * shared persona has replaces that section, an empty one removes it, a new heading is added at
 * the end, and the room's text before its first heading, if any, replaces the shared intro.
 */
export function mergePersona(shared: string, room: string): string {
  const base = partsOf(shared);
  const changes = partsOf(room);
  const sections = [...base.sections];
  for (const change of changes.sections) {
    const at = sections.findIndex(({ heading }) => heading === change.heading);
    if (at < 0) {
      if (change.body) sections.push(change);
    } else if (change.body) {
      sections[at] = change;
    } else {
      sections.splice(at, 1);
    }
  }
  return textOf({ intro: changes.intro || base.intro, sections });
}

/**
 * Who the bot plays in a room: the room's own persona.md as it is, or, when the room builds on a
 * shared persona, that persona with the room's changes (mergePersona). Then each `{{name}}` with a
 * value in `vars` (what this room calls its streamer, say) is filled in; `missing` lists those
 * without one, left as they are.
 */
export function composePersona({
  shared,
  room,
  vars = {},
}: {
  shared: string | null;
  room: string;
  vars?: Readonly<Record<string, string>>;
}): { text: string; missing: string[] } {
  const merged = shared === null ? room.trim() : mergePersona(shared, room);
  const missing = new Set<string>();
  const text = merged.replace(/\{\{([^{}]+)\}\}/g, (whole, name: string) => {
    const value = vars[name.trim()];
    if (value !== undefined) return value;
    missing.add(name.trim());
    return whole;
  });
  return { text, missing: [...missing] };
}

/** A room's persona file, its `---` header read out: the shared persona it builds on, and its values. */
export interface PersonaFile {
  /** The shared persona (a name in chat-bot/prompts/personas/); none when the file is the whole persona. */
  base?: string;
  /** What each `{{name}}` is filled in with. */
  vars: Record<string, string>;
  /** The persona, or the changes to `base`'s: everything after the header. */
  body: string;
}

/**
 * A room's persona file. It may start with a header between two `---` lines, one `name: value` a
 * line: `base` names the shared persona the file changes (see mergePersona), and every other line
 * gives a `{{name}}` its value. Without a header the whole file is the persona. `problems` lists the
 * header lines that couldn't be read, which are left out.
 */
export function parsePersonaFile(text: string): PersonaFile & { problems: string[] } {
  const header = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!header) return { vars: {}, body: text, problems: [] };
  const file: PersonaFile & { problems: string[] } = {
    vars: {},
    body: text.slice(header[0].length),
    problems: [],
  };
  for (const line of header[1]!.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$/.exec(line);
    if (!match) {
      file.problems.push(line);
      continue;
    }
    const [, name = '', value = ''] = match;
    if (name !== 'base') file.vars[name] = value;
    // A file name in prompts/personas/, so nothing outside that folder can be named.
    else if (/^[^/\\.][^/\\]*$/.test(value)) file.base = value;
    else file.problems.push(line);
  }
  return file;
}
