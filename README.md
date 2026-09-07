# pp 🐱

一只站在桌面上的测试小助手桌宠。测试跑完、出了问题、需要人介入的时候,她会变表情、弹气泡提醒你;平时就在桌面角落待机,偶尔跟你打个招呼。

A desktop pet for QA folks: a chubby kitten that lives on your desktop and reacts to your test results via a tiny local HTTP API.



## 特性

- **透明置顶小窗**,可拖动、记住位置,鼠标平时穿透不挡桌面操作;
- **7 种表情**:待机、开心(通过)、摇头(Fail)、喊你(需介入)、着急、大哭、生气,外加开机挥手和被摸时的陶醉脸;
- **本地通知接口**:任何脚本一行命令就能让她变脸弹气泡,坏消息会一直停留到你点掉;success 到达还会爆彩带🎉;
- **自主活动**:闲了会沿屏幕底边散步(到边折返),小概率 1600px/s 满屏疯跑(撞四边反弹);久不搭理会打瞌睡冒 💤,有动静就醒;
- **拖拽物理**:甩出去带惯性抛飞、重力下落、落地弹跳、撞边反弹;
- **悬停倾身 + 星星特效,双击摸摸**会咕噜咕噜;
- **不定时问候**:每 15~40 分钟随机挥手问好,分早/午/下午/晚/深夜五套话术,可配置喊你的名字;
- **换肤即换图**:往 `assets/` 各状态目录丢 PNG 就行,多张自动轮播,不用改代码;
- 跨平台:macOS / Windows,Electron 实现(已处理 macOS App Nap 定时器降频)。

## 快速开始

需要 Node.js ≥ 20。

```bash
npm install
npm start
```

或者双击 `启动桌宠.command`(Mac)/ `启动桌宠.bat`(Windows),第一次会自动装依赖。

## 让脚本通知她

她在本机 `127.0.0.1:38998` 听一个只对本机开放的接口:

```bash
node notify.mjs success "" "35 条全过"
node notify.mjs fail    "" "40 过 18 挂"
node notify.mjs urgent  "" "生产环境挂了,快来!"
```

或者在 Node 脚本里:

```js
import { petNotify } from './notify.mjs';
await petNotify({ type: 'fail', message: '回归跑完,有 18 条没过' });
```

`type` 七种:`success` `fail` `attention` `urgent` `cry` `angry` `info`。她没在跑时调用会静默返回 false,不影响你的脚本。带 `url`(或命令行 `--url=`)的气泡可点击直接打开链接;坏消息展示期间新消息自动排队,点掉一条露出下一条。

其他本地接口(同样只对 127.0.0.1 开放):

```bash
curl -s http://127.0.0.1:38998/health              # 状态:表情/位置/移动模式
curl -s http://127.0.0.1:38998/summon              # 召唤:回主屏右下角挥手
curl -s "http://127.0.0.1:38998/wander?mode=dash"  # 手动散步 walk / 疯跑 dash / 停下 still
```

## 交互

- **拖动**:随便放,位置记在系统用户目录;
- **单击**:点掉气泡 / 收回表情;
- **双击**:摸摸她;
- **悬停**:她朝光标倾身,光标划过掉星星;
- **右键**:「换表情」菜单(7 种直接点选)、「玩一下」菜单(散步/疯跑/放彩带/睡觉/停下/回右下角)、重新加载形象、退出。

## 配置

在本目录建 `.env`(不入库):

```
PET_OWNER=你的名字   # 问候时喊谁,不配就喊「主人」
PET_PORT=38998      # 通知端口,冲突时改
```

## 开机自启动

双击 `安装自启动.command`(Mac)或 `安装自启动.bat`(Windows);对应的卸载脚本一键移除。只写当前用户的自启动配置。

## 看门狗与隐身

Mac 安装自启动时会同时装一个看门狗(每分钟摸一次 `/health`,进程卡死自动重启,最多一分钟自愈);右键「隐身」可藏 30 分钟/1 小时/直到下条通知,坏消息会把她叫出来。改完源码双击 `重新打包.command` 一键出新 app。

## 换肤

见 [assets/README.md](assets/README.md)。仓库不含形象图片,默认是内置的 SVG 小检查员;放入自己的图片即可换肤。

## 素材声明

形象素材为真人照片,出于肖像隐私不随仓库分发(assets/ 下的图片已被 .gitignore 挡住)。clone 后桌宠使用内置 SVG 形象;想要自己的形象,往 assets/ 各状态目录放图即可,见 assets/README.md。

## License

Code: [MIT](LICENSE). Image assets are not distributed with this repository.

## 打包成独立应用

```bash
npm run pack:mac    # macOS:产物在 dist/mac-arm64/pp.app,拖进「应用程序」即可
npm run pack:win    # Windows:便携版 exe 在 dist/
```

打包版读取的配置在系统用户目录(macOS 为 `~/Library/Application Support/pp/.env`)。
