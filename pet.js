// funda-test 桌宠 - 渲染进程逻辑:状态机、气泡、拖动、换肤
const wrap = document.getElementById('petWrap');
const img = document.getElementById('petImg');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubbleText');

let assets = { frames: {}, config: {} };
let state = 'idle';
let sticky = false;
let hideTimer = null;
let revertTimer = null;
let frameTimer = null;

// ── 状态切换 ──
let motionMode = 'still';
let facing = 1; // 1 朝右(原图方向),-1 镜像朝左

function refreshClasses() {
  wrap.className = `pet-wrap state-${state}`
    + (hasFrames() ? ' skin-img' : '')
    + (motionMode === 'walk' ? ' moving-walk' : '')
    + (motionMode === 'dash' ? ' moving-dash' : '')
    + (motionMode === 'fall' ? ' moving-fall' : '');
}

function setState(next) {
  state = next;
  refreshClasses();
  playFrames();
  reportBusy();
}

// 渲染层告诉主进程"现在忙不忙",忙就不闲逛
function reportBusy() {
  const busyNow = bubble.classList.contains('show') || (state !== 'idle' && state !== 'sleep');
  window.pet.busy(busyNow, state === 'sleep');
}

function hasFrames() {
  return Object.keys(assets.frames || {}).length > 0;
}

// 自定义皮肤:轮播当前状态的帧;该状态没有专门的帧就退回 idle 的帧
// petted(被摸)没专门皮肤时借用 success 的陶醉脸
function playFrames() {
  clearInterval(frameTimer);
  if (!hasFrames()) return;
  const frames = assets.frames[state]
    || (state === 'petted' || state === 'sleep' ? assets.frames.success : null)
    || assets.frames.idle || [];
  if (!frames.length) return;
  let i = 0;
  img.src = frames[0];
  if (frames.length > 1) {
    const fps = Number(assets.config?.fps) || 6;
    frameTimer = setInterval(() => {
      i = (i + 1) % frames.length;
      img.src = frames[i];
    }, 1000 / fps);
  }
}

// ── 气泡 ──
function showBubble({ type, title, message, sticky: stick }) {
  sticky = !!stick;
  // 只显示消息正文;没给 message 时才拿 title 或默认文案兜底
  bubbleText.textContent = message || title || defaultTitle(type);
  bubble.className = `bubble show type-${type}`;
  clearTimeout(hideTimer);
  clearTimeout(revertTimer);
  if (!sticky) {
    hideTimer = setTimeout(dismiss, 8000);
  }
}

function defaultTitle(type) {
  return { success: '测试通过', fail: '测试有 Fail', attention: '需要你介入', urgent: '十万火急', cry: '崩了,呜呜', angry: '气死了', info: '通知' }[type] || '通知';
}

function dismiss() {
  sticky = false;
  bubble.classList.remove('show');
  clearTimeout(hideTimer);
  clearTimeout(revertTimer);
  revertTimer = setTimeout(() => setState('idle'), 300);
  reportBusy();
}

bubble.addEventListener('click', dismiss);

// ── 收通知 ──
window.pet.onNotify((p) => {
  markActivity();
  setState(p.type === 'info' ? 'idle' : p.type);
  showBubble(p);
  reportBusy();
  if (p.type === 'success') spawnConfetti();
});

// ── 主进程的移动指令:切动画类 + 镜像朝向 ──
window.pet.onMotion(({ mode, facing: f }) => {
  motionMode = mode;
  facing = f === -1 ? -1 : 1;
  refreshClasses();
  applySkinTransform();
});

// ── 右键菜单点选表情:纯换脸不弹气泡,点她一下或选「回待机」恢复 ──
window.pet.onState((st) => {
  markActivity();
  sticky = false;
  bubble.classList.remove('show');
  clearTimeout(hideTimer);
  clearTimeout(revertTimer);
  if (st === 'sleep') sleepGraceUntil = Date.now() + 3000; // 菜单哄睡:3 秒内别被鼠标划过吵醒
  setState(st);
  // 挥手是瞬时动作,2.2 秒后自己回待机;期间来了正事(状态已变)就不动
  if (st === 'hello') setTimeout(() => { if (state === 'hello') setState('idle'); }, 2200);
});

// ── 菜单特效 ──
window.pet.onEffect((effect) => {
  if (effect === 'confetti') spawnConfetti();
});

// ── 打瞌睡:白天 20 分钟没动静就睡(深夜 8 分钟),有动静就醒 ──
let lastActivity = Date.now();
let sleepGraceUntil = 0;

function markActivity() {
  lastActivity = Date.now();
  if (state === 'sleep' && Date.now() > sleepGraceUntil) setState('idle'); // 吵醒
}

setInterval(() => {
  if (state !== 'idle' || bubble.classList.contains('show') || dragging) return;
  const h = new Date().getHours();
  const napAfter = (h >= 23 || h < 6) ? 8 * 60e3 : 20 * 60e3;
  if (Date.now() - lastActivity > napAfter) setState('sleep');
}, 30e3);

// 睡着时头顶冒 💤
setInterval(() => {
  if (state !== 'sleep') return;
  const r = wrap.getBoundingClientRect();
  spawnParticle(r.left + r.width * 0.62, r.top + r.height * 0.1, '💤');
}, 1600);

// ── 全过彩带 ──
function spawnConfetti() {
  const colors = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc', '#f472b6'];
  const r = wrap.getBoundingClientRect();
  for (let i = 0; i < 26; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    el.style.left = `${r.left + Math.random() * r.width}px`;
    el.style.top = `${r.top - 10 + Math.random() * 30}px`;
    el.style.backgroundColor = colors[i % colors.length];
    el.style.animationDuration = `${0.9 + Math.random() * 0.9}s`;
    el.style.animationDelay = `${Math.random() * 0.25}s`;
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

let greeted = false;
window.pet.onAssets((m) => {
  assets = m || { frames: {}, config: {} };
  // 启动打招呼:有 hello 皮肤就挥两秒手再回待机,只在开机时来一次
  if (!greeted && assets.frames?.hello) {
    greeted = true;
    setState('hello');
    setTimeout(() => { if (state === 'hello') setState('idle'); }, 2200);
    return;
  }
  setState(state);
});

// ── 不定时问候:15~40 分钟随机一次,分时段喊名字 ──
// 名字来自 qa-automation/.env 的 PET_OWNER(经 main.js 传入),不写死在仓库里
const GREETINGS = {
  morning: [ // 5-11 点
    '早上好,{name}!今天也要顺利全绿呀',
    '{name} 早~ 开工前记得先 git pull 哦',
    '新的一天,{name},先来杯咖啡吧☕',
  ],
  noon: [ // 11-14 点
    '{name},中午啦,吃饭了没?',
    '午安~ 测试的事有我盯着,{name} 去休息会儿',
  ],
  afternoon: [ // 14-18 点
    '{name},下午茶时间,起来伸个懒腰~',
    '下午也要加油呀 {name},有事我喊你',
    '{name} 摸会儿鱼没关系,我帮你望风',
  ],
  evening: [ // 18-23 点
    '{name} 辛苦啦,收工前记得 git push~',
    '晚上好~ {name} 今天过了几条用例呀?',
    '晚饭吃了吗 {name}?别光顾着改 bug',
  ],
  late: [ // 23-5 点
    '都这个点了,{name} 还不睡吗?',
    '夜深了,我陪 {name} 加班,喵~',
    '{name},熬夜测出来的 bug 明天看更清楚,睡吧',
  ],
};

function greetPool() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return GREETINGS.morning;
  if (h >= 11 && h < 14) return GREETINGS.noon;
  if (h >= 14 && h < 18) return GREETINGS.afternoon;
  if (h >= 18 && h < 23) return GREETINGS.evening;
  return GREETINGS.late;
}

let greetTimer = null;
function scheduleGreet(minMin = 15, maxMin = 40) {
  clearTimeout(greetTimer);
  const delay = (minMin + Math.random() * (maxMin - minMin)) * 60 * 1000;
  greetTimer = setTimeout(doGreet, delay);
}
function doGreet() {
  // 正在忙(有气泡/非待机)就让路,10 分钟内再试
  if (bubble.classList.contains('show') || state !== 'idle') {
    scheduleGreet(5, 10);
    return;
  }
  const pool = greetPool();
  const name = (assets.owner || '').trim() || '主人';
  const msg = pool[Math.floor(Math.random() * pool.length)].replaceAll('{name}', name);
  setState('hello');
  showBubble({ type: 'info', message: msg });
  scheduleGreet();
}
scheduleGreet(8, 25); // 开机后第一次来得早一点

// ── 拖动与点击(移动小于 5px 算点击:点掉气泡)──
let dragging = false;
let moved = 0;
let lastX = 0;
let lastY = 0;

let dragSamples = []; // 最近几个采样点,松手时算甩出速度

wrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  moved = 0;
  lastX = e.screenX;
  lastY = e.screenY;
  dragSamples = [{ t: performance.now(), x: e.screenX, y: e.screenY }];
  markActivity();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  if (dx || dy) {
    moved += Math.abs(dx) + Math.abs(dy);
    window.pet.drag(dx, dy);
    lastX = e.screenX;
    lastY = e.screenY;
    dragSamples.push({ t: performance.now(), x: e.screenX, y: e.screenY });
    if (dragSamples.length > 8) dragSamples.shift();
  }
});
window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  // 用最近 ~100ms 的位移换算成 px/秒,给主进程做抛掷惯性
  let vel = { vx: 0, vy: 0 };
  const now = performance.now();
  const old = dragSamples.find((s) => now - s.t < 120) || dragSamples[0];
  if (old && now - old.t > 10) {
    const k = 1000 / (now - old.t);
    vel = { vx: (e.screenX - old.x) * k, vy: (e.screenY - old.y) * k };
  }
  window.pet.dragEnd(vel);
  if (moved < 5 && e.button === 0) {
    if (bubble.classList.contains('show')) dismiss();
    else if (state !== 'idle') setState('idle'); // 菜单换的表情/瞌睡,点一下收回去
  }
});

wrap.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.pet.contextMenu();
});

// ── 悬停:朝光标微微倾身 + 光标拖出星星 ──
const skinEls = [img, document.getElementById('petSvg')];
let lastSpark = 0;

function spawnParticle(x, y, char) {
  const el = document.createElement('span');
  el.className = 'particle';
  el.textContent = char;
  el.style.left = `${x - 7}px`;
  el.style.top = `${y - 7}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// 皮肤 transform 统一出口:镜像朝向 + 悬停倾身叠加
let leanDeg = 0;
let leanLift = 0;
function applySkinTransform() {
  const t = `scaleX(${facing}) rotate(${(leanDeg * facing).toFixed(1)}deg) translateY(${leanLift}px)`;
  for (const el of skinEls) el.style.transform = t;
}
function leanToward(e) {
  const r = wrap.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / r.width;   // -0.5 ~ 0.5
  leanDeg = dx * 10;
  leanLift = -3;
  applySkinTransform();
}
function leanReset() {
  leanDeg = 0;
  leanLift = 0;
  applySkinTransform();
}

// ── 双击:摸摸/爱抚 ──
let pettedTimer = null;
const PURRS = ['咕噜咕噜~', '好舒服喵~', '蹭蹭你', '再摸一下嘛', '喵呜~ 干活都有劲了'];

wrap.addEventListener('dblclick', () => {
  markActivity();
  clearTimeout(pettedTimer);
  clearTimeout(hideTimer);
  clearTimeout(revertTimer);
  sticky = false;
  setState('petted');
  bubbleText.textContent = PURRS[Math.floor(Math.random() * PURRS.length)];
  bubble.className = 'bubble show type-pet';
  // 头顶冒一圈小爱心
  const r = wrap.getBoundingClientRect();
  for (let i = 0; i < 7; i++) {
    setTimeout(() => {
      const x = r.left + r.width * (0.25 + Math.random() * 0.5);
      const y = r.top + r.height * (0.05 + Math.random() * 0.25);
      spawnParticle(x, y, Math.random() < 0.7 ? '💗' : '✨');
    }, i * 130);
  }
  pettedTimer = setTimeout(() => {
    bubble.classList.remove('show');
    setState('idle');
  }, 3000);
});

// 鼠标穿透切换:主进程开启 forward 模式后,穿透状态下页面仍收得到 mousemove,
// 据此判断光标是否落在猫或气泡上,进出时切换接管/穿透
function overInteractive(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  return !!(el && (wrap.contains(el) || bubble.contains(el)));
}
let hoverOn = false;
window.addEventListener('mousemove', (e) => {
  if (dragging) return;
  const over = overInteractive(e);
  if (over !== hoverOn) {
    hoverOn = over;
    window.pet.hover(over);
    if (!over) leanReset();
  }
  if (over && wrap.contains(document.elementFromPoint(e.clientX, e.clientY))) {
    markActivity();
    leanToward(e);
    const now = performance.now();
    if (now - lastSpark > 110) {
      lastSpark = now;
      spawnParticle(e.clientX, e.clientY, Math.random() < 0.8 ? '✨' : '💫');
    }
  }
});
