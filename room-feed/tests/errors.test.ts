import { httpStatusOf, PageActionError, RoomEndedError, RoomError } from '../src/errors';

describe('PageActionError', () => {
  it('keeps the message as given without a screenshot', () => {
    const e = new PageActionError('找不到弹幕输入框');
    expect(e.message).toBe('找不到弹幕输入框');
    expect(e.screenshot).toBeUndefined();
  });

  it('ends the message with the screenshot path and keeps the cause', () => {
    const cause = new Error('boom');
    const e = new PageActionError('发不出去', { screenshot: '/shots/a.png', cause });
    expect(e.message).toBe('发不出去\n截图：/shots/a.png');
    expect(e.screenshot).toBe('/shots/a.png');
    expect(e.cause).toBe(cause);
  });

  it('treats a null screenshot as none', () => {
    expect(new PageActionError('x', { screenshot: null }).message).toBe('x');
  });
});

describe('httpStatusOf', () => {
  it('is a RoomError’s own status, and 500 for anything else', () => {
    expect(httpStatusOf(new RoomError('还没建立', 409))).toBe(409);
    expect(httpStatusOf(new PageActionError('x'))).toBe(500);
    expect(httpStatusOf(new RoomEndedError('over'))).toBe(500);
    expect(httpStatusOf('text')).toBe(500);
  });
});
