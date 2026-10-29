/** What `fillTemplate` fills `{{key}}` with, by key. */
export type TemplateValues = Readonly<Record<string, string | number | undefined>>;

export interface FillOptions {
  /**
   * When a `{{key}}` is left as it is: `defined` (the default) when `values[key]` is missing or
   * undefined, `present` only when `key` isn't in `values` at all (a key set to undefined then
   * fills in as 「undefined」).
   */
  fillWhen?: 'defined' | 'present';
}

/** `template` with each `{{key}}` filled in from `values`; a key with no value stays as it is. */
export function fillTemplate(
  template: string,
  values: TemplateValues,
  { fillWhen = 'defined' }: FillOptions = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (fillWhen === 'present') return key in values ? String(values[key]) : match;
    return String(values[key] ?? match);
  });
}
