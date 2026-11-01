// Like chat-bot's parseKnowledge (src/core/knowledge/entries.ts), but it keeps the meta lines that
// one drops (类型, 截至, 复查, 来源) and the folder, which the rotation and the drafts need.

/** One entry of the knowledge base: a `## ` section of one of its Markdown files. */
export interface KnowledgeEntry {
  /** The folder of `knowledge/` it's in (`douyin`, `zzz`, …); '' when not known. */
  folder: string;
  title: string;
  /** Other ways the room writes or says it, from its `aliases:` line. */
  aliases: string[];
  type: string;
  /** What it's true as of (a version or a month); '' when not said. */
  asOf: string;
  /** When to check it again, usually `YYYY-MM-DD`; '' when not said. */
  reviewOn: string;
  source: string;
  /** The heading and the body, without the lines about the entry. */
  text: string;
}

const META = /^(aliases|类型|截至|复查|来源|废弃)\s*[:：]\s*(.*)$/;

/**
 * The entries of one knowledge file, a `## ` section each: its heading, then `aliases: …` and the
 * other lines about it, then what it says. An entry marked `废弃` is left out (it was wrong, and
 * stays only so it isn't learned again), and so is one with no body.
 */
export function parseKnowledge(markdown: string, folder = ''): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  for (const section of markdown.split(/^## /m).slice(1)) {
    const [heading = '', ...rest] = section.split(/\r?\n/);
    const title = heading.trim();
    if (!title) continue;
    const meta: Record<string, string> = {};
    let at = 0;
    for (; at < rest.length; at++) {
      const line = rest[at]!.trim();
      if (!line) continue;
      const found = META.exec(line);
      if (!found) break;
      meta[found[1]!] = found[2]!.trim();
    }
    const body = rest.slice(at).join('\n').trim();
    if ('废弃' in meta || !body) continue;
    entries.push({
      folder,
      title,
      aliases: (meta.aliases ?? '')
        .split(/[,，、]/)
        .map((alias) => alias.trim())
        .filter(Boolean),
      type: meta['类型'] ?? '',
      asOf: meta['截至'] ?? '',
      reviewOn: meta['复查'] ?? '',
      source: meta['来源'] ?? '',
      text: `## ${title}\n\n${body}`,
    });
  }
  return entries;
}

/** Whether `term` is something the knowledge base already has: a substring check over every heading and alias. */
export class KnowledgeIndex {
  private readonly names: string[];

  constructor(readonly entries: readonly KnowledgeEntry[]) {
    this.names = entries.flatMap((e) => [e.title, ...e.aliases]).map((n) => n.toLowerCase());
  }

  known(term: string): boolean {
    const t = term.trim().toLowerCase();
    return (
      t.length > 0 &&
      this.names.some((name) => name.length >= 2 && (name.includes(t) || t.includes(name)))
    );
  }

  /**
   * The entries about `term`, at most `max`: those whose heading or an alias is it, holds it or is
   * held by it first, then those whose body says it. For looking an unknown up, and for the entries a
   * `--topic` search may change.
   */
  lookup(term: string, max = 3): KnowledgeEntry[] {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    const named = this.entries.filter((e) =>
      [e.title, ...e.aliases].some((name) => {
        const n = name.toLowerCase();
        return n.length >= 2 && (n.includes(t) || t.includes(n));
      }),
    );
    const said = this.entries.filter((e) => !named.includes(e) && e.text.toLowerCase().includes(t));
    return [...named, ...said].slice(0, max);
  }

  /** The entries whose heading or alias appears in `text`. */
  mentionedIn(text: string): KnowledgeEntry[] {
    const said = text.toLowerCase();
    return this.entries.filter((e) =>
      [e.title, ...e.aliases].some((name) => name.length >= 2 && said.includes(name.toLowerCase())),
    );
  }
}
