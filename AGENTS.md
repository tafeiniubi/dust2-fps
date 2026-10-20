# AGENTS.md · 本仓库的工作约定

## 0. 最重要的一条：改代码前先备份

**任何**对 `dust2-fps/` 目录下文件的修改（新增、编辑、删除、重命名）之前，
必须先执行一次备份，把可还原的快照落到 `D:\备份`。

```powershell
cd C:\Users\admin\Documents\deepseek-harness\default-workspace\dust2-fps
powershell -ExecutionPolicy Bypass -File .\backup.ps1
```

脚本会生成：

- `D:\备份\dust2-fps\` —— 始终与项目当前状态一致的镜像（含 `.git`）
- `D:\备份\snapshots\dust2-fps-<yyyyMMdd-HHmmss>\` —— 带时间戳的历史快照，默认保留最近 10 份

出故障时用 `-Restore` 还原（会要求输入 `yes` 确认）：

```powershell
powershell -ExecutionPolicy Bypass -File .\backup.ps1 -Restore "D:\备份\snapshots\dust2-fps-20261020-170747"
```

### 什么时候必须备份

- 修改 `index.html`、`css/`、`js/` 下任何文件
- 新增 / 删除 / 重命名文件
- 批量重构、多文件联动改动
- 执行 `git checkout` / `git reset --hard` / `git clean` 等有破坏性的 git 命令之前

### 什么时候可以跳过

- 纯读取、搜索、查看代码
- 只在 `D:\备份` 内部操作
- 提交（commit）本身不破坏工作区，但**推送前的最终版本**建议已经包含在最近一次备份里

## 1. 修改后的验证要求

改完代码必须自测，不要只靠肉眼：

- 所有 JS 模块用 `node --check` 过一遍语法
- 用无头 Edge + Chrome DevTools Protocol 实测关键流程（打开页面、触发交互、读状态）
- 断言失败时先修，不要"看起来没问题"就交付
- 测试产生的临时脚本、截图、无头浏览器进程要在结束前清理

## 2. 提交与推送

- 提交信息用中文，格式：`type: 简述`（如 `feat: 开局菜单支持难度调节`）
- 第二个 `-m` 固定带共同作者标记：
  ```powershell
  git commit -m "feat: xxx" -m "Co-authored-by: DeepSeek <deepseek-ai@example.com>"
  ```
- 远程：`https://github.com/tafeiniubi/dust2-fps.git`，分支 `main`
- 本仓库 `core.autocrlf=false`，不要改回 true，否则 css 全文件 diff

## 3. 环境注意事项

- Git 不在默认 PATH，用完整路径 `C:\Program Files\Git\cmd\git.exe`
- 访问 github.com 需要 Clash 代理（已配 `http.proxy=http://127.0.0.1:7897`）；Clash 关闭时会连不上
- 本地预览用 `node server.js`（8080）或 `python server.py`，用完记得关掉
- 线上地址 <https://dust2-fps.edgeone.dev>，推送后约 40–60 秒自动部署

## 4. 代码约定

- 原生 ES Module，无构建步骤、无 npm 依赖；Three.js 走官方 CDN
- 模块分层：`core/`（引擎与状态）、`world/`（场景、地图、贴图、音效）、`entities/`（玩家、AI）、`ui/`（HUD、界面）
- 低层模块不反向依赖高层；需要回调时用 `state.js` 的 `hooks` 或显式注入函数（如 `bindBotSource`）
- 玩家可调数值集中在 `js/core/config.js`，键位在 `js/core/bindings.js`，开局偏好（难度/人数）在 `js/core/prefs.js`
- 新增功能要同步更新 `README.md` 的目录结构与操作说明
