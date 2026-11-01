/** Anything that ends a run on purpose, with a message to show the user as it is. */
export class RunStopped extends Error {}

/** Usage error in the command line: show the message and the usage, exit 1. */
export class UsageError extends Error {}

/** A stream is on (a port is listening) when the run started. */
export class StreamRunningError extends RunStopped {
  constructor(readonly port: number) {
    super(`端口 ${port} 正在监听，说明直播在进行：直播期间不浏览抖音。等直播结束后再运行。`);
  }
}

/** A stream started while the run was going: stop cleanly. */
export class StreamStartedError extends RunStopped {
  constructor(readonly port: number) {
    super(`运行中端口 ${port} 开始监听，直播开始了：浏览到此为止。`);
  }
}

/** Another run holds the lock file. */
export class LockHeldError extends RunStopped {
  constructor(
    readonly pid: number,
    readonly startedAt: number,
  ) {
    super(
      `另一个 pnpm browse 正在运行（pid ${pid}，开始于 ${new Date(startedAt).toISOString()}）。` +
        `如果它已经不在了，删除 dy-browse/data/browse.lock。`,
    );
  }
}

/** A list kept showing 「服务异常」 after every 刷新 it was given: the run ends there. */
export class ServiceErrorStopped extends RunStopped {
  constructor(
    readonly what: string,
    readonly tries: number,
  ) {
    super(`抖音的${what}一直显示「服务异常」（点了 ${tries} 次刷新），今天到此为止。`);
  }
}

/** Douyin showed a captcha or a login wall: the run ends there, nothing is retried. */
export class BlockedError extends RunStopped {
  constructor(readonly kind: 'captcha' | 'login') {
    super(
      kind === 'captcha'
        ? '抖音要求验证（验证码），今天到此为止。请手动打开抖音处理后再运行。'
        : '抖音要求登录，今天到此为止。请先用 room-feed 重新登录（pnpm room-feed login）。',
    );
  }
}

/** A reader got no items from responses that had a body: Douyin's JSON probably changed. */
export class EmptyReadError extends RunStopped {
  constructor(
    readonly kind: string,
    readonly bodies: readonly string[],
    /** Where the raw bodies were saved, once they are. */
    public savedTo: string | null = null,
  ) {
    super(`读不到任何${kind}：抖音的 JSON 可能改版了（或页面没有加载）。`);
  }
}
