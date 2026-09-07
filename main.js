// pp 桌宠 - Electron 主进程
// 职责:透明置顶小窗 + 本地通知接口(127.0.0.1)+ 右键菜单。
// 机器差异一律走环境变量(PET_PORT),不写死路径(路径从 import.meta.url 推导)。
import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, screen, shell } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 机器本地配置(名字、端口覆盖),按顺序找到哪份读哪份,都不入库:
// ① 自己目录 .env(源码独立部署) ② ../qa-automation/.env(与上级测试框架共用时)
// ③ 系统用户目录(打包成 .app 后前两处不存在,用这里:~/Library/Application Support/<名>/.env)
for (const p of [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', 'qa-automation', '.env'),
  path.join(app.getPath('userData'), '.env'),
]) {
  try { process.loadEnvFile(p); break; } catch {}
}
const PORT = Number(process.env.PET_PORT || 38998);
const OWNER = (process.env.PET_OWNER || '').trim();
const WIN_W = 164;
const WIN_H = 192;

let win = null;

// —— 位置记忆(存在系统 userData 目录,不进仓库)——
const stateFile = () => path.join(app.getPath('userData'), 'pet-state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}
function saveState(patch) {
  const s = { ...loadState(), ...patch };
  try { fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch {}
}

// —— 换肤:扫 assets/<状态>/ 下的图片帧,有就发给渲染进程用,没有就用内置 SVG 形象 ——
function buildAssetManifest() {
  const manifest = { frames: {}, config: {}, owner: OWNER };
  for (const st of ['idle', 'success', 'fail', 'attention', 'urgent', 'cry', 'angry', 'hello', 'sleep']) {
    const dir = path.join(__dirname, 'assets', st);
    try {
      const frames = fs.readdirSync(dir)
        .filter((f) => /\.(png|gif|webp|jpe?g)$/i.test(f))
        .sort()
        .map((f) => pathToFileURL(path.join(dir, f)).href);
      if (frames.length) manifest.frames[st] = frames;
    } catch {}
  }
  try {
    manifest.config = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'config.json'), 'utf8'));
  } catch {}
  return manifest;
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const saved = loadState();
  // 默认右下角;有记忆位置就用,但要夹回可见范围(防止换显示器后跑到屏幕外)
  let x = saved.x ?? (workArea.x + 24); // pp 默认左下角,和 Lumitest 一人一角
  let y = saved.y ?? (workArea.y + workArea.height - WIN_H - 8);
  x = Math.min(Math.max(x, workArea.x - WIN_W + 60), workArea.x + workArea.width - 60);
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - 60);
  home = { x, y };

  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x, y,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });
  // screen-saver 层级:高于普通置顶窗口;并跟随所有桌面空间、全屏应用之上也可见
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 默认整窗鼠标穿透(透明区域不挡桌面点击);光标移到猫/气泡上时渲染进程会要求接管
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('pet-assets', buildAssetManifest());
  });
}

// —— 行为引擎:散步/疯跑/抛掷下落,主进程负责挪窗口,渲染层只管画 ——
// 速度一律 px/秒,按真实 dt 积分:即使定时器被系统降频,移动速度也不变
const TICK_MS = 33; // 目标 ~30fps
const WALK_SPEED = 60;
const DASH_SPEED = 1600;   // 疯跑:满屏嗖嗖嗖
const GRAVITY = 2600;
const motion = { mode: 'still', vx: 0, vy: 0, facing: 1 };
let busy = false;      // 渲染层报告:有气泡或非待机表情时不闲逛
let sleeping = false;
let lastTick = Date.now();
// 「家」= 用户明确放置她的位置(拖拽落点/召唤角落)。散步疯跑抛掷之后都自己走回家,
// 不在半路(尤其屏幕正中)扎营挡视线。只有用户动作会改家,自动移动不改。
let home = { x: 0, y: 0 };
function setHome(x, y) { home = { x, y }; saveState({ x, y }); }

function workAreaOfPet() {
  return screen.getDisplayMatching(win.getBounds()).workArea;
}
function floorY(wa) { return wa.y + wa.height - WIN_H; }

function setMotion(mode) {
  if (motion.mode === mode) return;
  motion.mode = mode;
  if (mode === 'still') { motion.vx = 0; motion.vy = 0; }
  win?.webContents.send('pet-motion', { mode, facing: motion.facing });
}
function setFacing(f) {
  if (motion.facing === f) return;
  motion.facing = f;
  win?.webContents.send('pet-motion', { mode: motion.mode, facing: f });
}

setInterval(() => {
  try {
    tickMove();
  } catch (err) {
    logError('tick', err);
    setMotion('still'); // 移动出错就地停下,别把异常循环拖成卡死
  }
}, TICK_MS);

function tickMove() {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  if (!win || win.isDestroyed() || motion.mode === 'still') return;
  if (![motion.vx, motion.vy].every(Number.isFinite)) { setMotion('still'); return; }
  const wa = workAreaOfPet();
  const fy = floorY(wa);
  let [x, y] = win.getPosition();
  const minX = wa.x - 30, maxX = wa.x + wa.width - WIN_W + 30;
  const minY = wa.y - 20;

  if (motion.mode === 'fall') {
    motion.vy += GRAVITY * dt;
    x += motion.vx * dt; y += motion.vy * dt;
    if (x < minX) { x = minX; motion.vx = -motion.vx * 0.6; setFacing(1); }
    if (x > maxX) { x = maxX; motion.vx = -motion.vx * 0.6; setFacing(-1); }
    if (y >= fy) {
      y = fy;
      if (Math.abs(motion.vy) > 260) {      // 落地弹跳,衰减
        motion.vy = -motion.vy * 0.45;
        motion.vx *= 0.7;
      } else {
        setMotion('return');                // 落定后自己走回家
      }
    }
    win.setPosition(Math.round(x), Math.round(y));
  } else if (motion.mode === 'dash') {
    // 二维满屏飞:直线冲刺,撞四边反弹,偶尔随机小变向
    x += motion.vx * dt; y += motion.vy * dt;
    if (x < minX) { x = minX; motion.vx = Math.abs(motion.vx); }
    if (x > maxX) { x = maxX; motion.vx = -Math.abs(motion.vx); }
    if (y < minY) { y = minY; motion.vy = Math.abs(motion.vy); }
    if (y > fy)   { y = fy;   motion.vy = -Math.abs(motion.vy); }
    if (Math.random() < dt * 1.5) {         // 平均每 0.7 秒抖一次方向
      const a = Math.atan2(motion.vy, motion.vx) + (Math.random() - 0.5) * 0.7;
      motion.vx = Math.cos(a) * DASH_SPEED;
      motion.vy = Math.sin(a) * DASH_SPEED;
    }
    setFacing(motion.vx >= 0 ? 1 : -1);
    win.setPosition(Math.round(x), Math.round(y));
  } else if (motion.mode === 'return') {
    // 回家:沿地面走到家的横坐标,再升回家的高度(家在半空时)
    const dx = home.x - x;
    if (Math.abs(dx) > 6) {
      y = y < fy - 3 ? Math.min(fy, y + 260 * dt) : fy;
      const step = WALK_SPEED * 1.5 * dt;
      x += Math.sign(dx) * Math.min(step, Math.abs(dx));
      setFacing(dx >= 0 ? 1 : -1);
    } else {
      x = home.x;
      const dy = home.y - y;
      if (Math.abs(dy) > 4) y += Math.sign(dy) * Math.min(340 * dt, Math.abs(dy));
      else { y = home.y; setMotion('still'); }
    }
    win.setPosition(Math.round(x), Math.round(y));
  } else { // walk
    y = y < fy - 3 ? Math.min(fy, y + 260 * dt) : fy; // 先落到"地面"
    x += WALK_SPEED * dt * motion.facing;
    if (x <= minX || x >= maxX) {
      x = Math.max(minX, Math.min(maxX, x));
      setFacing(-motion.facing);
    }
    win.setPosition(Math.round(x), Math.round(y));
  }
}

// 主进程异常落盘(userData/error.log),下次再出问题有据可查
function logError(tag, err) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'error.log'),
      `${new Date().toISOString()} [${tag}] ${err?.stack || err}\n`,
    );
  } catch {}
}
process.on('uncaughtException', (err) => logError('uncaught', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

// 召唤:停下一切,回主屏左下角,置顶露脸并挥手
function summon() {
  if (!win) return;
  showPet();
  setMotion('still');
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + 24;
  const y = workArea.y + workArea.height - WIN_H - 8;
  win.setPosition(x, y);
  setHome(x, y);
  win.show();
  win.moveTop();
  win.webContents.send('pet-state', 'hello'); // hello 由渲染层自己超时回待机,不会盖掉随后到的通知
}

// —— 隐身:看视频/演示时把她藏起来,到时或来通知自动现身 ——
let hideTimer2 = null;
let hideUntilNotify = false;
function hidePet(ms) {
  if (!win) return;
  clearTimeout(hideTimer2);
  hideUntilNotify = ms == null;
  setMotion('still');
  win.hide();
  if (ms != null) hideTimer2 = setTimeout(showPet, ms);
}
function showPet() {
  clearTimeout(hideTimer2);
  hideTimer2 = null;
  hideUntilNotify = false;
  if (win && !win.isVisible()) win.show();
}

// 疯跑起手:随机一个偏上的方向起飞
function launchDash() {
  const a = (Math.random() * 0.6 + 0.2) * Math.PI; // 36°~144°,朝上扇形
  motion.vx = Math.cos(a) * DASH_SPEED * (Math.random() < 0.5 ? 1 : -1);
  motion.vy = -Math.abs(Math.sin(a)) * DASH_SPEED;
  setFacing(motion.vx >= 0 ? 1 : -1);
  setMotion('dash');
}

// 闲逛调度:2~5 分钟一次,55% 散步 / 20% 疯跑 / 25% 歇着
function scheduleWander() {
  const delay = (120 + Math.random() * 180) * 1000;
  setTimeout(() => {
    if (win && !busy && !sleeping && motion.mode === 'still') {
      const r = Math.random();
      if (r < 0.55) {
        setFacing(Math.random() < 0.5 ? -1 : 1);
        setMotion('walk');
        setTimeout(() => { if (motion.mode === 'walk') setMotion('return'); }, 10000 + Math.random() * 12000);
      } else if (r < 0.75) {
        launchDash();
        setTimeout(() => { if (motion.mode === 'dash') setMotion('fall'); }, 3000 + Math.random() * 2500);
      } else if (win && motion.mode === 'still') {
        // 这轮不闲逛:若上次被打断停在了半路,顺便走回家
        const [x, y] = win.getPosition();
        if (Math.abs(x - home.x) > 40 || Math.abs(y - home.y) > 40) setMotion('return');
      }
    }
    scheduleWander();
  }, delay);
}
scheduleWander();

ipcMain.on('pet-busy', (_e, p) => {
  busy = !!p?.busy;
  sleeping = !!p?.sleeping;
  if (busy && ['walk', 'dash', 'return'].includes(motion.mode)) setMotion('still');
});

// —— 拖动:渲染进程发屏幕坐标增量,主进程挪窗口 ——
ipcMain.on('pet-drag', (_e, { dx, dy }) => {
  if (!win) return;
  if (motion.mode !== 'still') setMotion('still'); // 被抓住就停下
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});
// 松手:悬空或甩得快就进入抛掷下落,否则原地记位置
ipcMain.on('pet-drag-end', (_e, vel) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  const fy = floorY(workAreaOfPet());
  const vx = Number(vel?.vx) || 0; // px/秒
  const vy = Number(vel?.vy) || 0;
  if (y < fy - 6 || Math.abs(vx) > 200) {
    motion.vx = Math.max(-1600, Math.min(1600, vx));
    motion.vy = Math.max(-1600, Math.min(1600, vy));
    if (Math.abs(motion.vx) > 60) setFacing(motion.vx > 0 ? 1 : -1);
    setMotion('fall');
  } else {
    setHome(x, y); // 轻放 = 你给她安的新家
  }
});

// 点击带链接的气泡 → 在默认浏览器打开(只放行 http/https)
ipcMain.on('pet-open-url', (_e, u) => {
  if (typeof u === 'string' && /^https?:\/\//.test(u)) shell.openExternal(u);
});

// 光标在猫/气泡上 → 接管鼠标;离开 → 恢复穿透
ipcMain.on('pet-hover', (_e, over) => {
  win?.setIgnoreMouseEvents(!over, over ? undefined : { forward: true });
});

// —— 右键菜单 ——
ipcMain.on('pet-context', () => {
  const face = (label, state) => ({ label, click: () => win?.webContents.send('pet-state', state) });
  const menu = Menu.buildFromTemplate([
    {
      label: '换表情',
      submenu: [
        face('😊 开心', 'success'),
        face('🙅 摇头(Fail)', 'fail'),
        face('📣 喊你', 'attention'),
        face('💦 着急', 'urgent'),
        face('😭 大哭', 'cry'),
        face('💢 生气', 'angry'),
        face('👋 挥手', 'hello'),
        { type: 'separator' },
        face('😌 回待机', 'idle'),
      ],
    },
    {
      label: '玩一下',
      submenu: [
        {
          label: '🚶 出去散步',
          click: () => {
            setFacing(Math.random() < 0.5 ? -1 : 1);
            setMotion('walk');
            setTimeout(() => { if (motion.mode === 'walk') setMotion('return'); }, 15000);
          },
        },
        {
          label: '🛫 疯跑一圈',
          click: () => {
            launchDash();
            setTimeout(() => { if (motion.mode === 'dash') setMotion('fall'); }, 4000);
          },
        },
        { label: '🎉 放彩带', click: () => win?.webContents.send('pet-effect', 'confetti') },
        { label: '😴 睡觉', click: () => win?.webContents.send('pet-state', 'sleep') },
        { type: 'separator' },
        { label: '🧍 停下别动', click: () => setMotion('still') },
        { label: '🏠 回到左下角', click: () => summon() },
      ],
    },
    {
      label: '隐身(有正事会出来)',
      submenu: [
        { label: '30 分钟', click: () => hidePet(30 * 60e3) },
        { label: '1 小时', click: () => hidePet(60 * 60e3) },
        { label: '直到下条通知', click: () => hidePet(null) },
      ],
    },
    { label: '重新加载形象', click: () => { win?.reload(); } },
    { type: 'separator' },
    { label: '退出桌宠', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

// —— 本地通知接口:测试脚本 POST 过来,桌宠做动作 + 弹气泡 ——
// 只听 127.0.0.1,不对外。POST /notify {type, title, message, sticky} ; GET /health
function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true, pet: 'pp',
        motion: motion.mode, facing: motion.facing,
        pos: win ? win.getPosition() : null,
      }));
    }
    // 调试用:渲染层真实状态(表情/类名/当前帧)
    if (req.method === 'GET' && req.url === '/state') {
      win?.webContents.executeJavaScript(
        '({ state, cls: wrap.className, frames: Object.keys(assets.frames || {}), img: (img.src || "").split("/").slice(-2).join("/") })',
      ).then((s) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(s));
      }).catch((e) => { res.writeHead(500); res.end(String(e)); });
      return;
    }
    // 调试用:收掉当前气泡(等价于点她一下)
    if (req.method === 'GET' && req.url === '/dismiss') {
      win?.webContents.send('pet-dismiss');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    // 召唤:回主屏右下角并置顶露脸
    if (req.method === 'GET' && req.url === '/summon') {
      summon();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    // 调试用:手动让她散步/疯跑/停下
    if (req.method === 'GET' && req.url?.startsWith('/wander')) {
      const mode = new URL(req.url, 'http://x').searchParams.get('mode') || 'walk';
      if (mode === 'still') setMotion('still');
      else if (mode === 'dash') {
        launchDash();
        setTimeout(() => { if (motion.mode === 'dash') setMotion('fall'); }, 4000);
      } else if (mode === 'walk') {
        setFacing(Math.random() < 0.5 ? -1 : 1);
        setMotion('walk');
        setTimeout(() => { if (motion.mode === 'walk') setMotion('return'); }, 15000);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, motion: motion.mode }));
    }
    // 调试用:抓当前桌宠窗口画面(含透明通道),返回 PNG
    if (req.method === 'GET' && req.url === '/shot') {
      if (!win) { res.writeHead(503); return res.end(); }
      win.webContents.capturePage().then((img) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img.toPNG());
      }).catch(() => { res.writeHead(500); res.end(); });
      return;
    }
    if (req.method === 'POST' && req.url === '/notify') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 64 * 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const p = JSON.parse(body || '{}');
          const type = ['success', 'fail', 'attention', 'urgent', 'cry', 'angry', 'info'].includes(p.type) ? p.type : 'info';
          const url = typeof p.url === 'string' && /^https?:\/\//.test(p.url) ? p.url.slice(0, 500) : undefined;
          const payload = {
            type,
            title: String(p.title || '').slice(0, 80),
            message: String(p.message || '').slice(0, 500),
            url, // 有链接时点气泡直接在浏览器打开
            // 坏消息(fail/attention/urgent/cry/angry)默认停留到你点掉为止,success/info 自动消失
            sticky: p.sticky ?? ['fail', 'attention', 'urgent', 'cry', 'angry'].includes(type),
          };
          setMotion('still'); // 来正事了,别逛了
          win?.webContents.send('pet-notify', payload);
          // 隐身中:「直到下条通知」任何消息都现身;定时隐身只有坏消息才打断
          if (win && !win.isVisible() && (hideUntilNotify || payload.sticky)) showPet();
          if (payload.sticky) { win?.show(); win?.moveTop(); }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'bad json' }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.on('error', (err) => {
    console.error(`[pet] 通知端口 ${PORT} 起不来(${err.code}),可能已有一只桌宠在跑`);
  });
  server.listen(PORT, '127.0.0.1');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide();
    // 阻止 macOS App Nap 把后台定时器降频,否则散步/疯跑会慢成三分之一速
    powerSaveBlocker.start('prevent-app-suspension');
    createWindow();
    startServer();
  });
  app.on('window-all-closed', () => app.quit());
}
