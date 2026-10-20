import { Billing } from '../src/app/billing';
import { Wallet } from '../src/core/wallet';

test('/修改收费 sets what a mention costs', async () => {
  const wallet = new Wallet({ load: () => ({ accounts: {} }), save: () => {} });
  const billing = new Billing({ wallet, cost: 1 });
  const run = (args: string) => billing.commands()[0]?.run?.(args);

  expect(await run('2')).toEqual({ ok: true, reply: '已处理修改收费请求' });
  expect(billing.cost).toBe(2);
  expect(await run('两钻')).toEqual({ ok: false, reply: '收费要写成钻石数，用法：/修改收费 2' });
  expect(billing.cost).toBe(2);
});
