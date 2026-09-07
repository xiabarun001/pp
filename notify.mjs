// 桌宠通知客户端:测试脚本用它把消息发给桌面上的桌宠。
// 桌宠没在跑也不报错(返回 false),绝不影响测试本身。
//
// 脚本里用:
//   import { petNotify } from '../desktop-pet/notify.mjs';
//   await petNotify({ type: 'fail', title: '58 号库回归跑完', message: '40 过 18 挂,来看一眼' });
//
// 命令行用:
//   node desktop-pet/notify.mjs fail "回归跑完" "40 过 18 挂"
//   type 可选 success / fail / attention / info
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PET_PORT || 38998);

export async function petNotify({ type = 'info', title = '', message = '', sticky, url } = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, message, sticky, url }),
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false; // 桌宠没开,静默跳过
  }
}

// 直接跑本文件 = 命令行模式;--url=https://... 让气泡可点击打开
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const url = args.find((a) => a.startsWith('--url='))?.slice(6);
  const [type, title, ...rest] = args.filter((a) => !a.startsWith('--url='));
  const ok = await petNotify({ type, title, message: rest.join(' '), url });
  console.log(ok ? '[pet] 已通知桌宠' : '[pet] 桌宠没在跑,略过');
}
