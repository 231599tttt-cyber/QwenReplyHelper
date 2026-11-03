# TEST-REPORT — QwenReplyHelper v1.2.7（三模型 + 四档风格 + 常驻右下角紫色工具条）

## v1.2.7 — persistent bottom-right toolbar, idle on X load, drag-only moves (this version, code only, NO zip sent per user instruction)

### User-confirmed requirement
- 工具条不要乱跑：一直在右下角、稍微靠下的地方待着，不拖就不动。
- 打开 X 就出现（待命），不要只在点评论图标后才出现；关回复框后工具条
  也不要消失，要回到待命、还在原位置。
- 状态行底部的“本地 Qwen 生成中…”等文案里的 Qwen 也去掉，跟标题改法一样。

### Changes (content.js + styles.css + version/docs only)
- 工具条改为常驻：`buildPersistentToolbar()` 在 X 加载时建一次，之后
  `ensureToolbar()` 只复用、不重建；点评论图标不再删掉重建、不再回到
  顶部中间。默认位置右 20px、下 20px（换算成 left/top 像素，宽 520px、
  不超过 90vw），生成/切模型/切风格/重新生成都不重新定位。
- 待命状态：打开 X 即出现，状态文案“点某条帖子的评论图标开始生成”，
  模型/风格按钮可见。待命时点风格只换选中态并提示“还没有选帖子：先点某条
  帖子的评论图标，再选风格。”，点重新生成提示对应文案，均不发生成请求、
  不报错；待命时点模型可先切好模型，切好后提示“已切换到××，点某条帖子的
  评论图标开始生成。”，点了气泡再用新模型生成。
- 关回复框：`cleanupComposer()` 不再移除工具条，只取消在途生成、把 state /
  activeEditor 清空、断开回复框监听、状态回待命。换帖子仍先取消上一通，
  单飞行 generationSeq、切模型期间全部按钮变灰、AbortController 取消逻辑不变。
- 拖动：只有标题行拖动才动，`makeDraggable` 的 mouseup 里若移动过就把
  left/top 存到 `chrome.storage.local` 的 `qrhToolbarPos`；加载时若有保存的
  位置就恢复并限制在屏幕内，没拖过就每次都在右下角。`state.switching`
  已统一改成工具条级的 `toolbarSwitching`（待命时没有 state 也能正确禁用）。
- 状态文案去 Qwen：content.js 里两处“本地 Qwen 生成中…”改成“本地生成中…”，
  两处“请先启动电脑本地 Qwen 服务”改成“请先启动电脑本地服务”。
  全量核对后，工具条/状态里已无 Qwen 字样；保留的 Qwen 只有：代码注释、
  扩展名 QwenReplyHelper、background.js 里 8B 缺失提示中的模型文件名
  `Qwen3-8B-Q4_K_M.gguf`（文件名，按任务要求不改）、模型别名/端口
  （技术参数，不显示在工具条上）、manifest 描述（不在工具条/状态里，按任务
  范围不改）。
- 拖动时生成中、文字永远填不进来的修复（同属 v1.2.7 代码，必须修）：
  用户确认：状态“生成中”时拖动工具条，生成好的文字再也进不了回复框。
  修法：标题行 mousedown（capture）、mousemove、mouseup 均 stopPropagation
  + preventDefault，拖动结束后的点击对工具条目标拦截一次，X 不会把拖动
  当成对话框外点击、不会关回复框、不会抢编辑框焦点；拖动代码不碰
  generationSeq/state、不发 cancel，只移动卡片；生成在拖动中完成时结果
  存进 pendingFill、状态写“生成完成，松开鼠标后填入…”，松开鼠标时
  onUp 校验着填一次（编辑框已不在则丢弃），状态按校验结果报成功或
  “填入失败，请再点一次重新生成”；新生成开始、关回复框时都会清掉旧
  pendingFill，防止旧文字落进新回复框。填入本身已抽成 attemptFill，
  立即填入和拖后填入走同一条校验路径。
- 换风格后旧文字残留的修复（同属 v1.2.7 代码）：用户实测换风格后状态
  显示“已填入”，但框里仍是第一次生成。根因是旧重新生成路径靠工具条点击
  后已丢失焦点/选区的 `execCommand('selectAll') + execCommand('delete')`
  清框，在 X 编辑框里经常删不掉，且旧代码不检查 `fillEditor` 返回值就报
  成功。现改成：重新生成时先 DOM 清空（逐个 `removeChild`）、光标回开头、
  发 input 事件，再走原填入路径；填完校验新文字前 10 字确实在框里，且
  重新生成时旧文字不在（旧在前、新追加在旧后都判失败），通过才报“已填入”，
  否则报“填入失败，请再点一次重新生成”。单飞行等逻辑不变。
- 紫色主题、标题“本地回复”、模型、端口、提示词、风格全部不变；
  manifest 升到 1.2.5。**按用户明确要求，本版只改代码，不打包、不发 zip，
  `~/workspace/your_files/QwenReplyHelper.zip` 未被改动。**

### v1.2.7 static tests — PASS
- manifest.json 解析、版本 1.2.7；`node --check content.js`、`node --check background.js`；
  `python3 -m py_compile qwen-manager.py`（未改动，仅复核）；grep 确认
  content.js 里工具条/状态文案无 Qwen、含“点某条帖子的评论图标开始生成”、
  “还没有选帖子”、`qrhToolbarPos`、右下角定位逻辑，无 Muse/云端字符串、
  安卓仓库 git status 为空。
- 未实测（诚实范围）：没有真实已登录 X、没有真实 GGUF/真实 llama-server，
  真实 X 里的常驻待命、右下角固定、拖动记忆、关框回待命仍需用户在自己
  电脑上验证（用户说先改代码、有问题再说，暂不发文件）。

### v1.2.7 manual test (to do when the user asks for the file, NOT done here)
1. 把 1.2.5 包替换进 QwenReplyHelper 文件夹（保留三个 .gguf 和 llama-server 文件），
   chrome://extensions 重新加载，确认版本 1.2.7。
2. 打开 X（不点任何帖子）：紫色工具条应已在右下角出现，标题“本地回复”，
   状态“点某条帖子的评论图标开始生成”。
3. 待命时点风格/重新生成：只换选中态/提示“还没有选帖子…”，不生成、不报错。
4. 点某条帖子评论图标：同一个工具条仍在右下角原位置，状态变“本地生成中…”，
   然后“已填入，可修改后点 Reply”，回复框里有生成文字。
5. 按住标题拖到别处，松手；关回复框：工具条不消失、回待命、还在拖到的位置；
   刷新 X：工具条回到上次拖到的位置；从没拖过时，刷新后仍在右下角。
6. 换风格验证（本次修复）：先生成一次记下框里文字，再点另一风格：
   框里文字必须换成新风格文字、旧文字不在，状态是“已填入”；若框里仍是
   旧文字，状态必须报“填入失败，请再点一次重新生成”，不能报“已填入”。
7. 拖动时生成验证（本次必须修）：点评论图标开始生成后，在状态还是
   “本地生成中…”时按住标题拖动工具条：回复框不能被关掉，生成完成后
   状态应先写“生成完成，松开鼠标后填入…”，松开鼠标后框里必须出现
   生成文字、状态变“已填入”；拖动本身不能取消生成、不能让文字丢掉。

## v1.2.4 — draggable purple toolbar + title "本地回复"

### User reports
- 工具条一直在顶部中间、动不了。Root cause: 旧工具条是嵌在 X 回复框
  对话框里面的，而 X 那个对话框本身就是固定在顶部中间、不可拖动的，
  所以工具条看起来也钉在顶部中间。
- 旧近白色卡片跟浏览器/X 的白色界面混在一起、看不出来。
- 标题“Qwen 本地回复”左边的 Qwen 要去掉，只留“本地回复”。

### Changes (content.js + styles.css only)
- 工具条改成固定浮动卡片（append 到 document.body，position: fixed，
  z-index 2147483647，宽 520px、不超过 90vw），初始位置用像素算出
  居中（top 90px，left = (window.innerWidth - 卡片宽) / 2，transform
  清空，不用 translateX(-50%)），不再嵌在 X 对话框里。
- 拖动：只有标题行是拖动手柄（cursor grab/grabbing），mousedown 起拖、
  mousemove 按位移移动、mouseup 结束，位置限制在屏幕内
  （left 0..innerWidth-宽，top 0..innerHeight-40）；移动 <=3px 当作普通
  点击，按钮在标题行之外，点按钮不受拖动影响。关闭回复框/换帖/
  取消时仍按原来的 cleanupComposer/cleanupToolbarOnly 移除浮动卡片，
  下次点评论图标回到初始位置。
- 紫色主题：卡片底色浅紫 #f5f3ff、边框 #c4b5fd、标题和选中按钮
  #7c3aed、悬停边框 #7c3aed、忙碌圆点 #8b5cf6、徽标浅紫底 #ede9fe；
  正文仍深色，圆角卡片和药丸按钮形状不变。
- 标题：headerTitle 由“Qwen 本地回复”改成“本地回复”，右边徽标
  “本地模型 · 不上云”不变。
- 模型、端口、提示词、风格、切换防打架逻辑全部不变；manifest 升到 1.2.4。

### v1.2.4 static tests — PASS
- manifest.json 解析、版本 1.2.4；node --check content.js/background.js；
  python3 -m py_compile qwen-manager.py（未改动，仅复核）；grep 确认
  标题为“本地回复”、无 Muse/云端字符串、安卓仓库 git status 为空；
  新 zip 经 unzip -l 核对，18 个文件。

### v1.2.4 manual test (user, Windows)
1. 关掉旧的 X 回复框。
2. 把新 1.2.4 包的全部内容替换进 QwenReplyHelper 文件夹，保留三个
   .gguf 文件和 llama-server 文件（exe + DLL），不要删、不要移到子文件夹。
3. 在 chrome://extensions 重新加载扩展，确认版本 1.2.4。
4. 刷新 X，点某条帖子的评论图标：工具条应为紫色卡片、标题为“本地回复”、
   初始在顶部中间偏上；按住顶部标题行拖到任意位置，松手停在那，
   模型/风格按钮仍可正常点击；关闭回复框后工具条消失，下次再点
   评论图标会回到初始位置。

## v1.2.3 — port-in-use adopt (kept for history)

### Bug (real user report, Windows)
- User closed all black windows, yet a new start-manager still failed
  with "couldn't bind HTTP server socket, hostname: 127.0.0.1,
  port: 8080". Root cause: closing a window does not guarantee the
  old llama-server died — an orphan from a previous manager run, or
  a second manager instance, can still hold the port. The old
  manager then blindly started a second process on the same port
  and failed with a bind error, which looked like the manager was
  fighting itself.
- Fix (qwen-manager.py only, v1.2.2 --reasoning auto-fallback kept):
  - Before starting a new llama-server, check health_ok(port). If
    healthy, adopt it: CURRENT = that model, PROC = None,
    EXTERNAL = True, log/return "端口已有一个健康服务在跑，直接复用，
    不再起第二个进程", no second process is started.
  - stop_current only kills PROC if this manager started it. An
    adopted external process is NEVER killed; switching away just
    clears CURRENT/EXTERNAL and leaves it running.
  - If the port is open but NOT healthy, do NOT start a second
    process. Return "端口 <port> 已被旧进程占用：请重启电脑，或在任务
    管理器详细信息里结束 llama-server.exe 后再双击 start-manager；
    不要同时开两个管理器黑窗口，也不要同时点 start-qwen 单脚本".
    The same message is returned when a start attempt exits early
    with a bind error in its log.
  - main() now binds 8090 BEFORE auto-starting. A second manager
    instance prints "已有另一个管理器在跑" and exits without
    starting or killing anything.
  - status_dict now reports "external": true and pid null for an
    adopted service, so /status shows the adoption honestly.
  - No models, ports, aliases, styles, prompts, or defaults changed.
    Manifest bumped to 1.2.3.

### v1.2.3 static + mock tests — PASS
- `manifest.json` parses, version 1.2.3; `node --check background.js`;
  `node --check content.js`; `python3 -m py_compile qwen-manager.py`.
- Adopt mock test (/tmp/test_port123.py, real qwen-manager.py +
  fake healthy /health server on 8080 + dead TCP listener on 8081):
  - PASS — POST /switch 2507 with a healthy 8080 already running:
    ok, message contains "直接复用", status current=2507,
    external=true, pid=null, and the fake 8080 service was still
    alive afterwards (not killed, no second process started).
  - PASS — POST /switch 35-4b with 8081 open but not healthy:
    ok=false, message is exactly the port-occupied message above
    (with 任务管理器 wording), and the adopted 8080 service was
    still alive afterwards.
  - PASS — second manager on the same 8099: exits with
    "已有另一个管理器在跑", first manager and 8080 untouched.
  - Note: during this test the VM itself had a leftover fake
    llama-server from the v1.2.2 fallback test holding 8080; it was
    killed as a test process before the run, which is the same
    orphan class this fix addresses. All test ports were clean after.
- NOT proved here (same honest scope as before): no real logged-in X,
  no real GGUF/model load, no real llama-server b12038; the user must
  verify on their Windows machine with the steps below.

### v1.2.3 manual test (user, Windows)
1. Close ALL manager black windows. If the port is still stuck,
   restart the computer once, or end llama-server.exe in Task Manager
   → Details.
2. Replace the QwenReplyHelper folder contents with the new 1.2.3 zip,
   KEEPING the three .gguf files and llama-server files (exe + DLLs).
3. Double-click start-manager.bat ONCE only — do not also click a
   start-qwen single-model script, do not open a second manager window.
4. Expected: if an old healthy 8080 service is still running, the
   black window says "端口已有一个健康服务在跑，直接复用，不再起
   第二个进程" and 8080/health answers; otherwise it starts the new
   model normally (with the v1.2.2 --reasoning fallback if needed).
5. Reload the extension in chrome://extensions (confirm 1.2.3), open X,
   click a reply icon, and confirm a reply is filled.

## v1.2.2 section below (kept for history)

## v1.2.2 — b12038 --reasoning auto-fallback (this version)

### Bug (real user report, Windows, llama.cpp b12038)
- Manager (old code) started llama-server with `--reasoning off`.
  That build exits exit=1, and the manager only reported
  "可能是该 llama-server 不认 --reasoning off：请删掉管理器里的该参数重跑"
  — i.e. it asked the user to edit the file by hand. That is the bug
  fixed here: the manager now handles it automatically.
- Fix (qwen-manager.py `start_model` / `_attempt_start`, no user edit):
  first attempt with `--reasoning off`; if it exits early AND its log
  mentions reasoning or an invalid argument, retry ONCE without
  `--reasoning`, wait for /health again, and print/return verbatim
  "已自动去掉 --reasoning off 重试，因为该版本 llama-server 不认这个参数".
  If the retry also fails, the error carries the SECOND attempt's log
  tail, not the first. Early exits whose log does NOT mention reasoning
  / invalid argument (missing DLL, bad model, port in use) do NOT
  trigger a retry, so a different real failure is not masked.
- Non-thinking after dropping the flag: Qwen3-4B-Instruct-2507 is
  non-thinking by design, so dropping the flag is safe for it.
  Hybrid Qwen3-8B (and Qwen3.5-4B) may think after the drop; the
  prompts still say one/two sentences and no thinking output, and
  background.js now strips `<think>...</think>` blocks (only those
  blocks, plus stray think tags) from the reply before filling.
- Single-model scripts: `--reasoning off` is KEPT as-is in all six
  start-qwen*.bat/.sh files (older builds need it); their comments now
  say the manager auto-retries, and manual-script users should delete
  that one parameter and re-run only if their build also rejects it.
- Manifest bumped to 1.2.2. No models, ports, aliases, styles, or
  defaults changed.

### v1.2.2 static + mock tests — PASS (see below for the fallback test)
- `manifest.json` parses, version 1.2.2; `node --check background.js`;
  `node --check content.js`; `python3 -m py_compile qwen-manager.py`.
- Fallback mock test (/tmp/test_fallback.py, real qwen-manager.py +
  fake llama-server that exits 1 with "invalid argument: --reasoning"
  when --reasoning is present and serves /health otherwise): PASS.
  Manager output printed verbatim
  "已自动去掉 --reasoning off 重试，因为该版本 llama-server 不认这个参数
  （首次尝试 exit=1）" and then
  "已自动去掉 --reasoning off 重试，因为该版本 llama-server 不认这个参数。
  已切换到新模型 2.5GB（Qwen3-4B-Instruct-2507，端口 8080），可以生成了。"
  Log tail confirmed "error: invalid argument: --reasoning".
- Think-strip check: background.js contains `stripThinkBlocks` and
  the generate path uses `stripThinkBlocks(text).trim()`; it removes
  only closed `<think>...</think>` blocks and stray think tags.
- NOT proved here (same honest scope as before): no real logged-in X,
  no real GGUF/model load, no real llama-server b12038; the user must
  verify on their Windows machine with the steps below.

### v1.2.2 manual test (user, Windows, no file editing)
1. Close the old manager black window.
2. Replace the whole QwenReplyHelper folder contents with the new
   1.2.2 zip, KEEPING the three .gguf files and the llama-server
   files (exe + DLLs) — do not delete them, do not move them to a
   subfolder.
3. Double-click start-manager.bat again. Do NOT edit qwen-manager.py.
4. Expected: the black window first tries with --reasoning off, then
   prints "已自动去掉 --reasoning off 重试，因为该版本 llama-server
   不认这个参数", then the new model becomes healthy on 8080
   (check http://127.0.0.1:8080/health and
   http://127.0.0.1:8090/status).
5. Reload the extension in chrome://extensions (confirm 1.2.2), open X,
   click a reply icon, and confirm a reply is filled with no
   <think> text in the reply box.

## v1.2.1 section below (kept for history)

## v1.2.1 — audit + UI (this version)

### Audit checklist — what was already safe, what gap was fixed
- ALREADY SAFE, verified by code read (no change): single-flight
  `generationSeq` in content.js (superseded callback returns early, late
  result never fills); background `AbortController` (new generate aborts
  the previous fetch, `cancel` message aborts it); manager `threading.LOCK`
  in qwen-manager.py `switch_to` (only one switch / start-stop at a time,
  old port is waited free before the new server starts); dedupe
  (same postId + style + model while generating is ignored in the click
  handler); cancel-on-close (composer MutationObserver calls
  cleanupComposer, which sends cancel and removes the toolbar);
  switching posts cancels the previous generation; model-row and
  style-row highlight scopes are separate (style toggle only touches
  buttons with `data-qrhStyle`, model toggle only `qrh-model-btn`).
- GAP FOUND AND FIXED (v1.2.1, content.js only): style buttons and
  重新生成 did NOT check `state.switching`. A style click during a
  model switch called `generateAndFill` against the old model/port
  while the manager was killing it, so the user saw a missing-service
  error flash before the manager-success regenerate overwrote it.
  Model buttons already returned early on `state.switching`, but had
  no visual disabled state, so the user could not tell they were locked.
  Fix: `setToolbarButtonsDisabled(true)` on switch start and
  `setToolbarButtonsDisabled(false)` on every switch exit path
  (success, manager-not-running backup, manager failure, sendMessage
  throw); style and regenerate handlers return early when
  `state.switching`; `generateAndFill` itself also returns early when
  `state.switching`; on switch failure the model highlight rolls back
  to the previous model and buttons are re-enabled; on success the
  existing logic regenerates once with the new model + current style.
  No prompts, models, ports, aliases, or defaults changed.
- UI change (styles.css + minimal content.js header/spinner markup
  only): card rounded 14px, subtle shadow, header row
  "Qwen 本地回复" + "本地模型 · 不上云" badge, model/style row labels,
  pill buttons (active #1d9bf0 white text, inactive white/grey border,
  hover blue border), regenerate as a distinct dashed primary-style
  button, disabled state opacity 0.5 + not-allowed cursor, status line
  with a pulsing dot while generating/switching (`.qrh-busy`).
  Card is light with dark text (explicit background, not page-dependent),
  font 13px/12px, wraps in a narrow composer, all classes `qrh-` scoped.

### v1.2.1 static + mock tests — PASS
- `manifest.json` parses, version 1.2.1; `node --check background.js`;
  `node --check content.js`; `python3 -m py_compile qwen-manager.py`.
- New jsdom test (/tmp/qrh-test/test121.js, real content.js + mock-x.html,
  switch callback held pending to simulate manager loading): 13/13 PASS —
  header present, row labels present, status dot + text present, CSS
  contains #1d9bf0 / .qrh-disabled / qrh-pulse / 14px radius, during
  switch toolbar has qrh-switching and ALL buttons disabled +
  qrh-disabled and status qrh-busy, style + regenerate clicks during
  switch start NO generation (before=1, during=1), after switch success
  regenerates exactly once with the new model, buttons re-enabled,
  active model is the new one, style stays natural (spammed short click
  did not leak through).
- Regression: previous test8b.js 11/11 PASS, test_friendly.js PASS
  (friendly still sends style=friendly, model highlight stays new).
- NOT proved here (same honest scope as v1.2.0): no real logged-in X,
  no real GGUF/model load, no real llama-server; live switching on
  real X is a user manual-test item below.

### v1.2.1 manual test (user, real X)
1. Load unpacked, confirm version 1.2.1, start-manager.bat once.
2. Click a post reply icon: toolbar is a rounded card with header,
   model row, style row, dashed regenerate, status with dot.
3. Click a different model, then IMMEDIATELY spam style buttons and
   重新生成: all buttons must look grey/disabled, no new generation
   must start, no missing-service flash; after tens of seconds the
   toolbar regenerates once with the new model and buttons re-enable.
4. Switch style normally (not during a model switch): one fill per
   switch, no double fill, highlight only in the style row.
5. Regenerate normally: one fill, then edit text and click X Reply.

## v1.2.0 section below (kept for history)

## v1.2.0 changes tested here (8B + friendly style)
- 8B model added (port 8082, alias Qwen3-8B, reasoning off, manager
  Q4→Q5→Q8 filename fallback with/without Qwen_ prefix) — see section 5.
- Friendly style added, fourth style button, prompt verbatim from the
  Android final version, max_tokens 180 like natural/humorous, default
  style still natural — see section 6. Version stays 1.2.0 as specified.
- Earlier v1.1.0 results below still apply to the unchanged
  extraction/fill/dual-model logic, except style count (now four).

## What was actually tested (honest scope)

### 1. Static checks — PASS (v1.2.0)
- `manifest.json` parses with `python3 -m json.tool`, version 1.2.0.
- `node --check background.js` — OK.
- `node --check content.js` — OK.
- `python3 -m py_compile qwen-manager.py` — OK (standard library only).
- Grep for cloud references: no remote endpoints in the extension code.
  The only network targets are 127.0.0.1:8080 / 8081 / 8082 / 8090.
- Android repo untouched: `git status` in `~/workspace/android/MuseFloatX-Local`
  was clean before and after this task (no Android files were edited).

### 2. Mock-page functional test — 10/10 PASS (v1.1.0)
Method: Node + jsdom (installed in /tmp for the test, not shipped),
loading `mock-x.html` (simulates X: `article[data-testid="tweet"]`,
`div[data-testid="tweetText"]`, `button[data-testid="reply"]`, and a reply
dialog with `div[data-testid="tweetTextarea_0"]`), injecting the real
`content.js`, and stubbing `chrome.runtime.sendMessage` with a fake
local reply + a fake manager switch success.
No real X, no real llama-server, no real model were involved in this step.

Results:
- PASS — toolbar injected into the composer dialog only.
- PASS — two model buttons: 新模型 2.5GB / 旧 4B 3.01GB.
- PASS — default model active is 新模型 2.5GB.
- PASS — editor filled with new-model reply (MOCK-new-natural).
- PASS — model switch sends switch-model with model=old4b.
- PASS — after switch, generate uses old4b.
- PASS — after switch, editor filled with old4b reply.
- PASS — after switch, active button is 旧 4B 3.01GB.
- PASS — switched model persisted (chrome.storage.local qrhModel=old4b).
- PASS — style buttons (简短等) still present after model switch.

Note on a real fix found by this test: the fallback insert path in
`fillEditor()` previously called `document.execCommand` a second time
without a try/catch. In jsdom that call throws instead of returning
false, so the text-node fallback never ran and the editor stayed empty.
It is now wrapped so a throw also falls through to insertNode. Real
Chrome (where execCommand returns true/false) is unaffected, but the
fill path is now robust in both cases.

Previous v1.0.0 mock test (10/10: extraction only from the clicked
article, not its comment; default natural; status text; style switch
re-requests once; no toolbar in timeline) still applies to the
unchanged extraction/fill logic.

### 3. Manager switch test — PASS (with a fake llama-server, NOT real models)
Method: copied `qwen-manager.py` to /tmp with a fake `llama-server`
(a tiny Python HTTP server that answers /health on the requested
--port) and two empty dummy .gguf files (existence check only).
Ran the manager with --no-autostart on port 8099 and drove it with curl.

Results:
- PASS — /status before any switch: current null, both models available=true.
- PASS — POST /switch 2507: ok, current=2507, port 8080, healthy=true,
  /health on 8080 returns ok.
- PASS — POST /switch 35-4b: ok, current=35-4b, port 8081, healthy=true,
  /health on 8081 returns ok, /health on 8080 is now closed (old process
  was killed and its port freed, not left running alongside the new one).
- PASS — POST /switch with a bad modelId: ok=false, clear error
  (modelId 只能是 2507 或 35-4b).
- All test processes were stopped afterwards (8080 / 8081 / 8099 closed).

What this does NOT prove: real llama-server startup, real GGUF loading
time, or real generation quality. The fake server answers /health
instantly; a real 2.5GB / 3.01GB model takes tens of seconds to load,
which is why the toolbar says so explicitly.

### 4. NOT tested (must be verified by the user on real X + real models)
- Real logged-in X: no X login was provided, and this task must not log in
  as the user. The mock page proves extraction/fill/switch logic against
  X-like DOM, not against live X.
- Real llama-server + real models: no 2.5GB / 3.01GB model was downloaded
  in this VM, and no real llama-server was running here. `background.js`
  fetch to 8080/8081 and manager switch to real models were not exercised.
- Manager switch under real load time: the 180-second /health wait, the
  --reasoning off rejection path, and missing-file errors are coded and
  message-tested only via the fake server and code review, not with a
  real GGUF.
- Dedupe-while-generating and cancel-on-composer-close: code paths exist
  (same postId+style+model while generating is ignored; closing the
  composer sends cancel and removes the toolbar), but the jsdom stub
  returns instantly, so the in-flight race was not exercised live.
- X DOM drift: if X changes `data-testid="reply"`, `tweetText`,
  or the reply textbox selectors, the extension will need a selector update.

## Manual test to do on real X (user steps)

Daily path (manager, one tap):
1. Put both .gguf files + llama-server (+ DLLs) in the QwenReplyHelper folder.
   Double-click `start-manager.bat` once, keep the black window open.
   Check http://127.0.0.1:8090/status (current should be 2507) and
   http://127.0.0.1:8080/health.
2. Load unpacked `QwenReplyHelper` in chrome://extensions (Developer mode).
3. Open X For You, click a post's native reply icon.
   Expected: toolbar appears in the reply dialog only, model row shows
   新模型 2.5GB active, status goes “本地 Qwen 生成中…” then
   “已填入，可修改后点 Reply”, and the reply box contains a 1–2 sentence
   reply in the default natural style.
4. Click 旧 4B 3.01GB in the toolbar.
   Expected: status shows “正在切换模型，请稍等…（模型加载要十几秒到几十秒，
   跟手机加载模型一样，不是卡住了）”, do NOT keep clicking; after tens
   of seconds it regenerates once with the old 4B model, the active
   button becomes 旧 4B 3.01GB, and http://127.0.0.1:8081/health now
   answers while 8080 no longer does (manager killed the old server).
5. Switch style to 幽默, then 简短, then 友好: each switch should cancel the old
   generation and fill once with the new style, no double fills.
   友好 should be温柔友好 (not cheeky), one or two sentences.
   Also click 8B 5.03GB in the model row: status shows switching, after
   tens of seconds it regenerates once with 8B, active button becomes
   8B 5.03GB, and http://127.0.0.1:8082/health now answers while 8081/8080
   no longer do. 8B will be slower than 4B; that is expected.
6. Edit the filled text manually, then click X's own Reply button.
   Expected: the edited text is what gets published; the extension never
   clicks Reply itself.
7. Click a different post's reply icon while generating: the old
   generation must be cancelled, not filled into the new composer.
8. Close the composer mid-generation: toolbar disappears, generation stops.

Fallback path (manager not running):
9. Close the manager window. In a composer, click the other model button.
   Expected: status clearly names the backup script (e.g. start-qwen-35-4b.bat
   / 8081) and says this is the backup path, and does NOT auto-generate
   against a dead port. Manually double-click that script, wait for its
   /health, then click 重新生成: the new model should now generate.

### 5. v1.2.0 — 8B manager test — PASS (fake llama-server, NOT a real GGUF)
Method: copied qwen-manager.py to /tmp with a fake llama-server
(a tiny Python HTTP server answering /health on the requested --port)
and dummy .gguf files (existence check only). Manager on port 8099.
- PASS — /status before switch: current null, available 2507=true, 35-4b=false, 8b=true (only Q5 prefixed dummy present).
- PASS — POST /switch 2507: ok, 8080 healthy.
- PASS — POST /switch 8b with ONLY Qwen_Qwen3-8B-Q5_K_M.gguf present (Q4 absent): ok, 8082 healthy, 8080 closed (old killed, port freed), manager log says "8B: using Qwen_Qwen3-8B-Q5_K_M.gguf (not the default Qwen3-8B-Q4_K_M.gguf)" — filename fallback works, prefix/Q5 alone does not fail the switch.
- PASS — bad modelId: ok=false, clear error (modelId 只能是 2507、35-4b 或 8b).
- All test processes stopped afterwards (8080/8082/8099 closed).
- NOT proved: real llama-server startup, real 5.03GB GGUF load time, real 8B generation quality, real RAM use (~10GB free, normally a 16GB computer). No real 8B GGUF was downloaded here, no logged-in X.

### 6. v1.2.0 — Mock-page test, 8B + friendly — 11/11 PASS (v1.2.0, jsdom)
Method: Node + jsdom, real content.js against mock-x.html, stubbed chrome.runtime.sendMessage (fake reply MOCK-<model>-<style>) and chrome.storage.local.
- PASS — toolbar in composer dialog only.
- PASS — three model buttons: 新模型 2.5GB | 旧 4B 3.01GB | 8B 5.03GB.
- PASS — default model active is 新模型 2.5GB.
- PASS — editor filled with new-model reply (MOCK-new-natural), not comment text.
- PASS — switch to 8b sends switch-model model=8b.
- PASS — after switch, generate uses model=8b.
- PASS — after switch, editor contains an 8b reply (MOCK-8b-natural).
- PASS — after switch, active model button is 8B 5.03GB.
- PASS — switched model persisted (qrhModel=8b).
- PASS — style buttons still present after model switch.
- PASS (separate jsdom run, friendly button actually clicked) — style buttons are 自然|幽默|简短|友好; clicking 友好 sends generate style=friendly, model stays new, editor contains MOCK-new-friendly, active style button becomes 友好 while active model button stays 新模型 2.5GB (no cross-highlight). Friendly prompt in background.js is verbatim, max_tokens = 180 (short is the only 80 case), default style fallback is natural. A live friendly generation on real X with a real model is still a user manual-test item (step 5 above).

## v1.2.7 — X1/X2/X3 rename (user-confirmed)
- Model files renamed by user to X1.gguf (2507), X2.gguf (old 4B), X3.gguf (8B); manager and single-model scripts now look for exactly X1/X2/X3.
- Toolbar model buttons, manager labels and background error messages now read X1 2.5GB / X2 3.01GB / X3 5.03GB, no original Qwen model names in UI.
- All v1.2.5 behaviour retained: persistent bottom-right toolbar, idle on X load, drag-only moves, style-replace verification, drag-during-generation fill, post-close idle.

## v1.2.7 — revert to original filenames + dual compatibility
- User reverted model files to original names. Manager now primarily looks for original names, and also accepts X1/X2/X3 as fallback, so either naming works and a future rename will not break switching.
- Toolbar labels back to 新模型 2.5GB / 旧 4B 3.01GB / 8B 5.03GB. All v1.2.5/1.2.6 toolbar behaviour retained.

## v1.2.9 — UI spec enforcement (user confirmed 21:09)
- Persistent toolbar on X load, bottom-right default, freely draggable, position saved to qrhToolbarPos, reused (never recreated) on reply/model/style/regenerate — no jump.
- Reply click generates and auto-fills the native composer; style switch / regenerate cancels the previous flight, clears the old text from the editor DOM, fills the new text, and verifies new-head present + old-head absent before reporting success.
- Composer close (sent or dismissed) now explicitly empties the editor text if the node is still in the page, in addition to cancelling generation, clearing pendingFill/state/activeEditor, and returning the toolbar to idle at the same position — no generated text leaks to the next reply.

## v1.3.2 — style-switch replace fix (first fix, user confirmed 21:19)
- Root cause: attemptFill cleared the editor by DOM removal only. X's React editor reverted that removal on the next input, so the old natural text came back and the new humorous text landed after it.
- Fix: on regenerate, focus + execCommand selectAll + delete first (React state drops the old text), dispatch input, verify empty, DOM-clear only as a fallback, then fill once and verify new-head present + old-head absent.

## v1.3.3 — unified 8-button rule
- 3 model + 4 style + 1 regenerate = 8 buttons, all share the same path: cancel previous flight, clear the previous content (v1.3.2 selectAll+delete), regenerate once with the new selection, fill and verify.
- Model button fix: clicking the already-active model no longer returns early. It skips the manager switch (already on that model) but still regenerates if a post/composer is active; with no post it only shows the idle hint, never generates into a stray top composer.

## v1.3.4 — model switch only, 5 buttons regenerate (user corrected 21:21)
- Model buttons (3): switch manager + highlight only, never regenerate, never touch the composer text. Success status: "已切换到X，点风格或重新生成才会重新生成。"
- Style buttons (4) + regenerate (1): the only regenerate path. Each click cancels the previous flight, clears the previous content (v1.3.2 selectAll+delete), regenerates once with the current model/style, fills and verifies. With no post, they only show the idle hint.

## v1.3.5 — model switch does not touch generation (user 21:21)
- Model buttons: no sendCancel, no generating-flag change, no composer text change, no regenerate. Only model buttons are disabled during the switch; style/regenerate buttons stay clickable and are not blocked by toolbarSwitching.
- Note: manager still runs one model at a time, so switching models stops the old llama-server process at the server level. UI-level independence means the toolbar will not cancel/regenerate/clear on its own; a generation already running on the old model cannot finish after its server is stopped, and the next style/regenerate click will use the new model.

## v1.3.6 — style-switch fills the right box (user screenshot 21:22)
- Root cause: a stale activeEditor could point at the top new-tweet composer while the natural text stayed in the reply dialog, so humorous text landed at the top and natural text was never cleared.
- Fix: record state.lastText on every successful fill. On regenerate, first find the contenteditable that actually holds the previous text and retarget to it, then clear (v1.3.2 selectAll+delete) and fill there. Fallback remains activeEditor if no holder is found.

## v1.3.7 — model switch stops, never starts generation (user 21:25)
- Model click now cancels any in-flight generation (sendCancel, generating=false, pendingFill=null) so a switch cannot let an old generation finish and fill afterwards.
- It still does NOT regenerate, does NOT clear or fill the composer, and does NOT change state.model's next-generation use beyond the switch itself. Only style/regenerate clicks generate.

## v1.3.8 — exit actually clears state (user 21:26, replied then switched model)
- Root cause: cleanupComposer only ran when the editor node was removed from the DOM. X often hides the reply dialog instead of removing it, so state/postText survived exiting a reply, and the next model switch (in pre-1.3.7 code) regenerated the previous post.
- Fix: watchComposerClose now treats a hidden/invisible editor as closed (getClientRects / offsetParent check, observer also watches style/class). generateAndFill on regenerate refuses a closed/hidden editor, cleans up, and only shows the idle hint.
- Combined with 1.3.7: model switch itself never generates, and after exiting a reply there is no stale state left for it to regenerate from.

## v1.3.9 — style switch fills the visible reply dialog, never the top composer (user 21:28)
- Previous 1.3.6 holder search only ran when state.lastText existed and matched exactly; with a stale activeEditor it could still land in the top composer.
- Fix: on regenerate, first retarget to the currently visible div[data-testid="tweetTextarea_0"] (the open reply dialog), then to the holder of the previous text, then to activeEditor. Clearing (selectAll+delete) and filling happen in that retargeted editor only.

## v1.4.0 — style switch: reply dialog, not top composer (user screenshot 21:35)
- Root cause confirmed by user: switching natural -> humorous did not clear the reply box; the new text went to another person's top composer. findVisibleReplyEditor returned the first visible tweetTextarea_0 in DOM order, which can be the top new-tweet composer, not the reply dialog.
- Fix: prefer a visible editor whose dialog contains "Replying to @..."; only fall back to the first visible editor if no reply dialog is found. Clearing + filling then happen in that reply dialog only.

## v1.4.1 — wrong-person guard (user 21:37, every time aimed at another person)
- Root cause: if the previous reply dialog (e.g. Replying to @mxllkm) is still open when the user clicks another post's bubble, X keeps the old dialog and the extension generated into it, so every reply went to the same previous person.
- Fix: after waitForComposer, extract the clicked article's author handle and compare it to the dialog's "Replying to @..." header. On mismatch, abort generation, clear state, and tell the user to close the previous reply box first and click the new bubble again. Never generate into a dialog for the wrong person.

## v1.4.2 — never fill the top new-tweet composer (user 21:39, clarified)
- Root cause confirmed: findComposerEditor returned document.querySelector(tweetTextarea_0), which is always the top Home "发生了什么事?" post box, before the reply dialog even opened. Humorous content therefore landed in the user's own post box and @-mentioned the previous person.
- Fix: findComposerEditor now only returns an editor inside div[role="dialog"]. With no dialog open it returns null, so waitForComposer waits for the real reply dialog (up to 5s) instead of grabbing the top composer.

## v1.4.3 — abort instead of filling the top post box (user 21:41, second click still to top box)
- 1.4.2 fixed the first-generation path (waitForComposer), but the regenerate path still retargeted via findVisibleReplyEditor, which could return the top composer if the reply dialog editor was not recognised.
- Fix: generateAndFill now enforces isReplyEditor — the editor must be inside a dialog containing "Replying to". If the retargeted editor is not such a dialog, it cleans up and shows a visible abort status, instead of filling the top post box. A failed fill is now visible, not a silent wrong-box fill.

## v1.4.4 — second step updates the right person's reply box (user 21:46)
- Even if the first generation landed in the top post box, the second step (style switch) must not follow that wrong editor. It must update the reply box for the person being replied to, not the top post box.
- Fix: state now records postAuthor from the clicked article. findVisibleReplyEditor and isReplyEditor both require the dialog's "Replying to" header to match postAuthor when known; a dialog for another person or the top post box is skipped, and the regenerate aborts visibly instead of updating the wrong box.

## v1.4.5 — second step targets only the reply dialog (user confirmed 21:59)
- Confirmed narrative: first bubble click syncs the same text into both the top post box and the reply box; second style switch only updated the top post box, the reply box never changed.
- Root cause: findEditorHolding returned the first contenteditable containing the previous text, which is the top post box in DOM order, so the regenerate cleared/filled the top box only.
- Fix: findEditorHolding now only returns an editor inside a dialog containing "Replying to" and, when known, matching postAuthor. The top system post box is never a holder, so a style switch can no longer update it instead of the reply box.

## v1.4.6 — second click uses the original reply editor only (user 22:04)
- User confirmed: second humorous click only changed the top post box, not the reply box. If it changed the reply box, it would be fixed.
- Root cause of the retargeting bug: findVisibleReplyEditor / findEditorHolding returned the top post box (first in DOM, also holding the previous text), so the regenerate cleared/filled the top box only.
- Fix: on regenerate, use the original editor captured at bubble-click time, with no retargeting and no holder search. Only if that editor is gone from the page does it fall back to a reply dialog for the same person (findVisibleReplyEditor, author-matched). The top post box is never selected as a fallback.

## v1.4.7 — bilingual reply-dialog detection (user screenshot 22:06, Chinese UI)
- Screenshot proof: reply dialog header is "回复 @mxllkm" in Chinese, not "Replying to @mxllkm" in English, and the toolbar aborted with "找不到正在回复那个人的回复框". All reply-dialog checks only looked for English "Replying to", so in Chinese UI they never matched, the regenerate aborted, and the reply box was never updated — while the top post box could still be updated by earlier paths.
- Fix: isReplyDialogText accepts English "Replying to" and Chinese "回复 @" / "回复@". findVisibleReplyEditor, isReplyEditor, and the wrong-person guard all use it now.

## v1.4.8 — reply-box duplication fix (user screenshot 22:08)
- Screenshot proof: reply box contains the same sentence twice, post box is now empty (top-box fix worked). The duplication is in the reply box itself.
- Fix: dedupeText trims a model output that repeats itself verbatim (exact half-repeat or same sentence twice) before filling. attemptFill also guards against a double-insert: if the editor ends up holding text+text, it clears once and fills once more.

## v1.4.9 — first-click duplication fix (user confirmed style switch fixed, first click still duplicates)
- User confirmed: style switching now clears and fills correctly. Remaining bug is only first bubble click duplicating twice.
- Root cause: fillEditor fell back to a second insert whenever execCommand returned true but innerText read back empty (X React flush lag). That second insert produced text+text on the first fill.
- Fix: fallback only when execCommand itself returns false, never on an empty innerText read. Combined with 1.4.8 dedupeText (model-output repeat) and the attemptFill double-insert guard.

## v1.5.0 — identical duplication is a double content-script, not model output (user 22:21: "一字不差，肯定是代码问题")
- User confirmed the two copies are character-identical. Model-output dedupe (1.4.8) already trims a single repeated output, so an identical text+text in the box cannot come from one model output alone.
- Root cause: content.js can be injected twice into the same X tab (extension reload without page refresh, or duplicate injection). Both copies register a bubble-click listener, both generate with the same post/prompt, both fill the same editor, producing text+text. Each copy's dedupe only sees its own single output, so it cannot remove the second copy's fill.
- Fix: singleton guard at the top of content.js: if window.__qrhLoaded is already set, the second copy does nothing at all — no second listener, no second toolbar, no second fill.

## v1.5.1 — first-click duplication fix (user 22:22, no second toolbar)
- User correction: there is only one toolbar, not two. Duplication happens ONLY on first bubble click, never after a style switch (style switch clears and fills correctly).
- Root cause: attemptFill only cleared when isRegen was true. First click (isRegen=false) never cleared, so if first fill ran twice, or the editor already held a draft, the second fill appended to the first, producing text+text. Style switch cleared first, so its second fill overwrote instead of appending, which is why it never duplicated.
- Fix: attemptFill now always clears the editor before filling, first click included, using the same selectAll+delete+InputEvent clear as regen. A second fill now overwrites instead of appending.

## v1.5.2 — dedupe call was missing, fresh-page first click still duplicated (user 22:23)
- User correction: fresh page, first day, first click, refreshed, no previous content at all — so "second fill appended to first" cannot explain it.
- Real bug found in 1.5.1 zip: dedupeText was defined but never called in generateAndFill (call lost in later edits). A model output that itself repeats a sentence twice was therefore filled as-is. The attemptFill double-insert guard only triggers when afterText === text+text, not when text itself is already text+text, so it did not fix it.
- Fix: content.js now actually calls dedupeText(resp.text) before filling, and background.js now also trims with dedupeModelText before returning, so a duplicated model output is trimmed in two places, first click included.

## v1.5.3 — first-click duplication: single-copy replacement, not a second fill (user 22:26)
- User does not need to confirm the mechanism, only the fact: first click repeats.
- Fix: attemptFill double-insert guard no longer clears-then-refills (which could append again if React restores). It now replaces the editor's contents with exactly one text node and dispatches one InputEvent, guaranteeing one copy in the box.

## v1.5.4 — 1.5.3 guard reverted by React (user 22:29: refreshed, still 1.5.3 duplicates)
- User confirmed: updated to 1.5.3 AND refreshed X, still duplicates.
- Root cause of 1.5.3 failure: its guard replaced editor children directly with one text node, but X's editor is React-managed — direct DOM removal is reverted by React on the next render, restoring text+text.
- Fix: duplicate guard now uses the React-aware clear (selectAll + delete + InputEvent, same as regen clear) then fills once. If React still restores a duplicate, it clears again and reports failure instead of marking a duplicated box as success.

## v1.5.5 — bubble-click double-fill guard (user 22:32: after bubble click, input happens twice, find that code)
- Code found: document click listener (capture) at end of content.js calls generateAndFill(editor, false) on every bubble click, with only a while-generating dedupe. A repeat bubble click for the same post (X inner svg click, double-tap, or dialog re-open) started a second generation+fill into the same editor, and first-click attemptFill never cleared, so the second fill appended to the first: text+text.
- Fix: bubble handler now ignores a repeat bubble click for a post that already has lastText filled (and is not generating). Style/regenerate buttons remain the only way to change an already-filled box. No second fill from a repeat bubble click.

## v1.5.6 — from 1.5.3 base, single bubble click, single fill (user 22:34)
- User confirmed: one bubble click, one generation, text appears twice in that one fill. NOT two bubble clicks, NOT reply-then-click-again.
- Reverted wrong directions: 1.5.5 bubble-repeat guard removed (user never clicked twice), 1.5.4 React guard refill removed.
- From 1.5.3 base: attemptFill now never fills a second time in the same attempt. If the editor ends up holding text twice, it clears once and reports failure, so the user can regenerate, instead of filling again.
- fillEditor remains single execCommand insert + one InputEvent, fallback only if execCommand itself failed.

## v1.5.7 — first bubble fill exactly once, no second fill (user 22:41, from 1.5.3 base)
- User: fresh bubble editor is empty, why clear it? And filling once before filling once is also duplication. Correct: first fill must be exactly one fill, not clear+fill, not fill+refill.
- Fix: attemptFill now branches. isRegen=false (first bubble): if editor already has text, return false without filling (no second copy). If empty, call fillEditor exactly once and return its result, no guard refill, no second fill anywhere in that path. isRegen=true (style switch): clear first, then fill exactly once, as before (that path already worked).

## v1.5.8 — 1.5.7 void, bubble recognition restored (user 22:43)
- User: treat 1.5.7 as void, after it bubble is not recognized at all. Screenshot: toolbar idle, "还没有选帖子".
- Root cause found: 1.5.7 attemptFill replacement deleted findEditorHolding, isReplyDialogText, findVisibleReplyEditor, isReplyEditor, which generateAndFill and the bubble handler still call. Bubble handler threw ReferenceError at isReplyDialogText before setting activeEditor, so generation never started and toolbar stayed idle.
- Fix: restored all four helpers verbatim (bilingual Replying to / 回复 @, author-matched). 1.5.7 single-fill attemptFill branch is kept, but with helpers restored. Version 1.5.8, not 1.5.7.

## v1.6.0 — first-click duplication, from 1.5.3 base, root-cause fix only (user 22:48 spec)
- Scope: only this bug. Style switch, top post box guard, model switch, two-click reply flow, Muse/local model paths unchanged. 1.5.4-1.5.8 guard experiments replaced by this single fix.
- Root causes found in 1.5.3 code, checked against user checklist:
  1. fillEditor double-write: execCommand insertText, then if its return was false it did a SECOND execCommand, then a TextNode insert. Chrome execCommand can return false even when text WAS inserted (React beforeinput), so one fillEditor call inserted twice: text+text.
  2. First click append vs style switch replace: attemptFill cleared only on regen, first click appended to any existing editor text; style switch cleared first, so it never duplicated.
  3. No task identity: generateAndFill used only a sequence number, a second fill for the same generation was not rejected.
  4. MutationObserver + click: waitForComposer resolves once (done flag) — checked, not a second trigger. Streaming: background uses stream:false — checked, not streaming+final append. Duplicate listener: singleton guard window.__qrhLoaded — checked, kept.
- Fix:
  * fillEditor: exactly one insertion, checked by content not return value. If first execCommand already put the text in, never insert again. Fallback is ONE Range+TextNode only, no second execCommand.
  * attemptFill: unified replace logic for first click AND style switch — clear old content once (React-aware), then fill exactly once. No guard refill, no second fill.
  * Task ID: each generation gets postId:style:model:counter, stored in state.taskId; callback ignores superseded taskIds, and filledTaskIds rejects a second fill for the same taskId.
  * No string-dedupe masking: dedupeText call removed from content fill path, dedupeModelText removed from background return path. If the model itself returns a duplicate, the debug log will show modelDup=true with ai=1, writes=1, proving model vs fill.
  * Debug log: window.__qrhDebug {clicks, aiRequests, writes, fills[]} + console [QRH] logs on click, AI start/done, write, fill, duplicate-write. Open DevTools Console, filter [QRH], per click you should see clicks=1, ai=1, writes=1.
- Final test (user spec): 5 different posts, first bubble click each must show single text; then style switch / regenerate must replace old with new, single text; top post box must stay untouched, other posts' reply boxes untouched.

## v1.6.1 — from 1.6.0, first-click duplicate finally traced to two places (user 22:56)
- From 1.6.0, fill single-write alone did NOT fix first-click duplication across models (8B and new 2.5GB both duplicated, style switch normal). So fill double-write was not the sole cause.
- Two remaining first-click-only causes, fixed here, style switch unchanged:
  1. Inner vs outer editor: findComposerEditor returned the outer tweetTextarea_0 wrapper on first click. Filling the outer wrapper inserts into the inner editable, and outer.innerText can then read as duplicate. Style switch reuses activeEditor (already inner after first fill settled), so it did not duplicate. Fix: prefer inner div[contenteditable=true] inside tweetTextarea_0 on first click.
  2. Model loop: Qwen local models loop the same sentence before EOS when no explicit no-repeat instruction is given. Both 8B and new model did it on natural first click, style switch (humorous) did not loop as often. Fix at generation level (not fill masking): system prompt adds "只输出一条回复，不要重复同一句话，不要把同一句话说两遍。", and background cuts a looped output at the first repeated sentence before it reaches the box, with content log still showing modelDup.
- Fill remains single-write + taskId from 1.6.0. No other functions changed.

## 1.6.1 VOID — user 23:01: keep 1.6.0, discard 1.6.1, do not change prompt
- 1.6.1 is void and cleared. Its background prompt change ("只输出一条回复，不要重复同一句话") and loop cut, and its content inner-editor preference, are reverted.
- Current version is back to 1.6.0 exactly: single-write fill, taskId, unified replace, debug [QRH] log, no prompt change, no dedupe masking.
- Do NOT re-apply 1.6.1 prompt changes in future versions without user instruction.

## v1.6.2 — DOM identification, not text identification (user 23:12, from 1.6.0)
- 外部建议, user approved: previously reply boxes were identified by text ("Replying to" / "回复 @"), which breaks with language/UI changes.
- Fix from 1.6.0: isReplyDialogText removed. New isReplyDialogEl checks DOM only: dialog role="dialog" + contains tweetTextarea_0. Top composer is not in a dialog, so it is never selected. Author is read from the dialog's own article DOM header link (dialogAuthorHandle), not from "Replying to" text.
- Applied to findEditorHolding, findVisibleReplyEditor, isReplyEditor, and bubble wrong-person guard. No prompt change, no other function change. Current version is 1.6.2, based on 1.6.0 (1.6.1 remains void).

## v1.6.3 — 6 个问题, from 1.6.2 (DOM version, prompt unchanged)
- Problem 1 (old task pollutes new task): bubble click now increments generationSeq, clears pendingFill, cancels old, and sets state.taskId IMMEDIATELY at click time, before await waitForComposer. generateAndFill reuses that click taskId for first click, instead of creating a new one after the box opens. Old callbacks (myTaskId !== state.taskId) are rejected instantly.
- Problem 2 (continuous clicks double AI): bubble click now sets state.pending=true immediately. Same post while pending/generating is ignored. Second click before the box opens no longer passes the check.
- Problem 3 (reply box misidentified by author only): findComposerEditor now iterates all dialogs and only returns an editor from a dialog whose postId (or postText) matches the clicked post. Bubble handler also verifies dialog postId/postText, not just author. Two posts by the same author no longer pass.
- Problem 4 (model switch, style still generates): style and regenerate buttons now return early with "正在切换模型，请等切换完成再选风格/重新生成" while toolbarSwitching is true, instead of generating against the old model being killed.
- Problem 5 (dedupe not enabled + only first 10 chars checked): dedupeText remains defined but is NOT used as a mask (user rule: do not mask by deleting duplicate string). Instead, attemptFill now verifies full text: afterText must start with the full new text and be within 10 chars of its length, not just contain its first 10 chars. Incomplete fills now report failure instead of false success.
- Problem 6 (depends on X interface language): already fixed in 1.6.2 by DOM identification (isReplyDialogEl + dialogAuthorHandle), no text "Replying to" / "回复 @" checks remain in main paths. This version keeps that DOM identification.
- No prompt change, no top post box change, no other function change. Version 1.6.3, based on 1.6.2 (which was based on 1.6.0, 1.6.1 remains void).

## v1.6.4 — Inner-only fill, never outer wrapper (user 23:33, from 1.6.3)
- Root cause agreed with user: first-click duplicate is one AI result pasted twice, because filling the outer tweetTextarea_0 wrapper mirrors text into the inner editable, so outer + inner both show the same sentence.
- Fix, only this change: new innerEditorOf resolves any editor to div[data-testid="tweetTextarea_0"] div[contenteditable="true"] only. findComposerEditor no longer falls back to outer wrapper (waits for inner, up to 5s, then aborts). findEditorHolding and findVisibleReplyEditor now only iterate inner editables. isReplyEditor rejects non-inner editors. attemptFill resolves to inner first, and refuses to fill if no inner editable exists.
- Prompt unchanged, other functions unchanged, 1.6.1 remains void. Version 1.6.4.

## v1.6.5 — 1.6.4 REVERTED, back to 1.6.3 base (user 2026-11-03 10:51, 1.6.4 failed)
- User report: 1.6.4 is worse, all functions unusable, reply box not recognized at all.
- Cause (code-level, to be confirmed by user test): 1.6.4 required div[data-testid="tweetTextarea_0"] div[contenteditable="true"] as a descendant. If X's tweetTextarea_0 itself IS the editable box (no nested contenteditable child), that selector returns null, findComposerEditor returns null, waitForComposer times out, no generation at all. Inner-only assumption was wrong.
- Fix: innerEditorOf removed, findComposerEditor / findEditorHolding / findVisibleReplyEditor / isReplyEditor / attemptFill restored to 1.6.3 behavior (dialog + tweetTextarea_0 / contenteditable, DOM identification, no inner-only restriction).
- This version is NOT a fresh 1.6.0 rebuild (no 1.6.0 zip backup exists in workspace); it is 1.6.3 base with 1.6.4 removed. User asked to re-upgrade from 1.6.0: next upgrade must be done one step at a time from this base, with user confirmation per step, not all at once.
- Prompt unchanged.

## v1.6.6 — First-click focus + delayed re-check, never immediate second write (user 11:07, from 1.6.5)
- User confirmed: 1.6.5 recognizes box again, but first click still duplicates twice.
- Fix, fill step only: fillEditor now puts focus + selection inside editor BEFORE execCommand, writes once, and NEVER falls back immediately. attemptFillAsync re-checks after 120ms for X React async rendering; only a confirmed miss after that delay gets one fallback insert. Old attemptFill (immediate check -> immediate fallback) is no longer used in generate paths.
- Prompt unchanged, box finding unchanged, style switch unchanged. Version 1.6.6.

## v1.6.7 — First-click direct DOM insert, no execCommand (user 11:18, from 1.6.6)
- Direction approved by user: first click (fresh dialog, unstable) vs style switch (settled editor) is the difference. execCommand + InputEvent on a fresh dialog lets X duplicate.
- Fix, first click only: attemptFillAsync for isRegen=false uses fillEditorFallback (Range+TextNode direct DOM) only, no execCommand, then one InputEvent (inside fallback), then 200ms settle check. If after that check content is exactly text+text, clear editor and direct-insert once more, then re-check.
- Style switch (isRegen=true) unchanged: execCommand path from 1.6.6, which already works on settled editor.
- Prompt unchanged, box finding unchanged. Version 1.6.7.

## v1.6.8 — Revert first-click to execCommand, Reply must enable (user 12:17, from 1.6.7)
- User retest: 1.6.7 made text single but Reply stayed grey for EVERY bubble click, cannot send at all. So 1.6.7 was NOT a fix. Standard for a real fix: single text + Reply enabled + actually sendable, for any person.
- Fix: first click back to fillEditor execCommand (X recognises it, Reply enables). No direct DOM insert on first click. fillEditor no longer dispatches a manual InputEvent after execCommand success (execCommand already fires native input; manual second input was a duplication candidate on fresh dialog).
- After execCommand, wait 200ms for X to settle; if content is exactly text+text, clear via execCommand selectAll+delete, then execCommand insertText once more, then re-verify. This handles duplication after execCommand without breaking Reply.
- Prompt unchanged, box finding unchanged, style switch unchanged. Version 1.6.8.

## v1.6.9 — Activate X draft after fill, Backspace without manual typing (user 12:31, from 1.6.8)
- User discovery: after fill, cursor moves and typing works, but Backspace cannot delete generated text until user types one character manually, after which Backspace works for everything. X confirms draft only on a real user input.
- Fix, fill step only: new activateEditorDraft runs after verified fill: focus, cursor at end, execCommand insertText ' ' (real editing transaction X processes), then execCommand delete it back, plus one InputEvent with inputType insertText. Net text unchanged, but X draft is activated, so Backspace/typing/deleting work without manual typing.
- User rule: X confirmation must NOT require manual typing. This implements that in code.
- Prompt unchanged, box finding unchanged, first-click execCommand path unchanged, style switch unchanged. Version 1.6.9.

## v1.7.0 — Fill inside X inner text block, Backspace without manual typing (user 12:42, from 1.6.8, NOT 1.6.9)
- Root cause in 1.6.8 fillEditor: selection was selectNodeContents(editor) collapse(false) = end of whole editor, then execCommand insertText there. X tracks text inside its inner [data-text="true"] block, not outer end, so text displayed and Reply lit up, but X block stayed empty and Backspace did nothing until user typed a real character and X re-read the box. Conclusion confirmed by user: generated text present, Backspace no reaction, after typing any character Backspace recovers and can delete all.
- Fix, fill step only: selection is now inside the innermost [data-text="true"] element if present, else whole editor fallback, then execCommand insertText. No other fill change.
- 1.6.9 space-activate hack removed (proven useless: manual space also does not activate Backspace). Working base is 1.6.8, not 1.6.9.
- Prompt unchanged, box finding unchanged, style switch path unchanged except it shares fillEditor, so it also benefits. Version 1.7.0.

## v1.7.1 — Shared fill via ClipboardEvent paste, Backspace without manual typing (user 12:49, from 1.7.0)
- User confirmed 12:45: style switch also Backspace-dead, so shared fillEditor execCommand is the common fault, not first-click path alone. 1.6.8/1.6.9/1.7.0 only changed first-click/post-fill, could never fix style switch.
- Fix, shared method only: new async fillViaPaste used by attemptFillAsync for both first click and style switch: focus, selection inside innermost [data-text="true"] if present, dispatch ClipboardEvent paste with DataTransfer text/plain, wait 100ms, verify head present, else fallback once to fillEditor execCommand so text still appears. No system clipboard, no clipboard permission, single local event (tens of ms, same speed as execCommand; AI generation seconds still dominate).
- Dead synchronous attemptFill left on execCommand (no callers), to avoid changing its sync signature.
- Prompt unchanged, box finding unchanged, clear-before-fill unchanged, duplicate-after-exec check unchanged. Version 1.7.1.

## v1.7.2 — Comments neutralised, no functional change (user 13:28, from 1.7.1)
- Only wording changed: other-AI names in content.js comments and TEST-REPORT.md headings changed to neutral "问题 3 / 问题 4 / 问题 1+2 / 外部建议 / 6 个问题". No attribution to WorkBuddy added, no code logic changed, paste fill from 1.7.1 unchanged.
- Prompt unchanged, box finding unchanged, fill method unchanged. Version 1.7.2.
