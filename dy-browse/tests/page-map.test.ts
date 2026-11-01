import { answerKindOf } from '../src/douyin/page-map';

describe('answerKindOf', () => {
  it.each([
    ['https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=x', 'posts'],
    ['https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=1', 'comments'],
    ['https://www.douyin.com/aweme/v1/web/comment/list/reply/?comment_id=1', 'replies'],
    ['https://www.douyin.com/aweme/v1/web/general/search/single/?keyword=a', 'search'],
    ['https://www.douyin.com/aweme/v2/web/module/feed/?x=1', 'feed'],
    ['https://www.douyin.com/aweme/v1/web/other/', null],
    ['not a url', null],
  ])('%s is %s', (url, kind) => {
    expect(answerKindOf(url)).toBe(kind);
  });
});
