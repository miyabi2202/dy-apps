import { recentPosts } from '../../../src/core/memory/posts';

const file = [
  '# 123 主播的作品',
  '',
  '- 2026-10-20：翻唱了稻香 [id:a]',
  '- 2026-10-31：新歌预告，说下周直播唱 [id:b]',
  '- 日期不详：一条没有日期的 [id:c]',
  '- 2026-10-25：晒了新买的麦克风 [id:d]',
  '',
].join('\n');

describe('recentPosts', () => {
  it('gives the newest by date, oldest first, without the dash and the id', () => {
    expect(recentPosts(file, 3)).toBe(
      '2026-10-20：翻唱了稻香\n2026-10-25：晒了新买的麦克风\n2026-10-31：新歌预告，说下周直播唱',
    );
  });

  it('reads a post with no date as the oldest', () => {
    expect(recentPosts(file, 4).split('\n')[0]).toBe('日期不详：一条没有日期的');
  });

  it('keeps the file order for posts of one day, the later one counting as newer', () => {
    const same = '- 2026-10-31：甲 [id:1]\n- 2026-10-31：乙 [id:2]\n- 2026-10-31：丙 [id:3]\n';
    expect(recentPosts(same, 2)).toBe('2026-10-31：乙\n2026-10-31：丙');
  });

  it('stops at the size cap, dropping the oldest, but always shows the newest', () => {
    const lines = recentPosts(file, 8, 30);
    expect(lines).toBe('2026-10-31：新歌预告，说下周直播唱');
    expect(recentPosts('- 2026-10-31：' + '长'.repeat(50), 8, 20)).toHaveLength(20);
  });

  it('is empty when there are no post lines', () => {
    expect(recentPosts('')).toBe('');
    expect(recentPosts('# 标题\n\n随便写的\n')).toBe('');
  });
});
