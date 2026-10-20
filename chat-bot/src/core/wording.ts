/**
 * Piece `name` of the wording file (see wording.md), `{{key}}` in it filled in from `values`; a
 * key not given stays as it is.
 */
export type Wording = (name: string, values?: Readonly<Record<string, string | number>>) => string;

/** The `## name` sections of a Markdown file, by name, each without its heading and trimmed. */
export function wordingSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const part of `\n${text}`.split('\n## ').slice(1)) {
    const end = part.indexOf('\n');
    const name = (end < 0 ? part : part.slice(0, end)).trim();
    sections.set(name, (end < 0 ? '' : part.slice(end)).trim());
  }
  return sections;
}

/** A Wording over `read`, the file's text as it is now. A name the file lacks is an error. */
export function wordingOf(read: () => string): Wording {
  return (name, values = {}) => {
    const section = wordingSections(read()).get(name);
    if (section === undefined) throw new Error(`wording.md has no section "${name}"`);
    return section.replace(/\{\{(\w+)\}\}/g, (match, key: string) => String(values[key] ?? match));
  };
}
