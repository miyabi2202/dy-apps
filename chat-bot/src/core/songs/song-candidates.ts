import type { TitleCandidate } from '@dy-apps/lyrics-search';

/**
 * The lyrics search's candidates as Codex's hint reads them: `《遇萤》（原唱 CRITTY；翻唱 只有影子、李蚊香）`,
 * by NetEase's own marks, as its order doesn't tell an original from a cover; with no marks, the
 * top two singers as they came (`《晴天》（周杰伦）`).
 */
export function candidateHints(candidates: readonly TitleCandidate[]): string {
  return candidates
    .map(({ title, artists, originals, covers }) => {
      const marked = [
        ...(originals.length ? [`原唱 ${originals.slice(0, 2).join('、')}`] : []),
        ...(covers.length ? [`翻唱 ${covers.join('、')}`] : []),
      ];
      const singers = marked.length ? marked.join('；') : artists.slice(0, 2).join('、');
      return `《${title}》${singers ? `（${singers}）` : ''}`;
    })
    .join('、');
}
