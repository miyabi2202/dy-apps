/** One entry of the knowledge base: a `## ` section of one of its Markdown files. */
export interface KnowledgeEntry {
  title: string;
  /** Other ways the room writes or says it (speech-to-text typos too), from its `aliases:` line. */
  aliases: string[];
  /** What the prompt shows: the heading and the body, without the lines about the entry. */
  text: string;
}

/** The lines at the top of an entry that are about it (where it's from, when to check it), not for the prompt. */
const META = /^(aliases|类型|截至|复查|来源|废弃)\s*[:：]\s*(.*)$/;

/**
 * The entries of one knowledge file, a `## ` section each: its heading, then `aliases: …` and the
 * other lines about it (类型, 截至, 复查, 来源), then what it says. What's before the first heading is
 * left out, and so is an entry marked `废弃` (it was wrong, and stays only so it isn't learned again).
 */
export function parseKnowledge(markdown: string): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  for (const section of markdown.split(/^## /m).slice(1)) {
    const [heading = '', ...rest] = section.split(/\r?\n/);
    const title = heading.trim();
    if (!title) continue;
    let aliases: string[] = [];
    let retired = false;
    let at = 0;
    // The lines about it come first, maybe after a blank line.
    for (; at < rest.length; at++) {
      const line = rest[at]!.trim();
      if (!line) continue;
      const meta = META.exec(line);
      if (!meta) break;
      if (meta[1] === 'aliases') aliases = splitAliases(meta[2]!);
      if (meta[1] === '废弃') retired = true;
    }
    const body = rest.slice(at).join('\n').trim();
    if (retired || !body) continue;
    entries.push({ title, aliases, text: `## ${title}\n\n${body}` });
  }
  return entries;
}

function splitAliases(line: string): string[] {
  return line
    .split(/[,，、]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

/** The entries whose heading or an alias is said in one of `lines`, in the order they're listed. */
export function mentioned(entries: readonly KnowledgeEntry[], lines: readonly string[]): number[] {
  const said = lines.join('\n').toLowerCase();
  return entries.flatMap(({ title, aliases }, i) =>
    [title, ...aliases].some((name) => said.includes(name.toLowerCase())) ? [i] : [],
  );
}

/** The entries for the prompt, a blank line apart. */
export function knowledgeText(entries: readonly KnowledgeEntry[]): string {
  return entries.map(({ text }) => text).join('\n\n');
}
