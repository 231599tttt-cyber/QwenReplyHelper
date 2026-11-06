# 安装和使用说明（1.7.15，三模型）

## v1.7.15 注意：默认启动的是 8B，先下 8B 就行

1.7.15 版开始，管理器和扩展默认启动的模型改成了 **8B（Qwen3-8B，约 5.03GB，端口 18082）**，它是三个模型里参数最大、推理和编程最强的那个。
所以第一次用，先只下 8B 这一个模型文件就够了，不用三个全下。4B 那两个是备选，想换的时候再下。
注意：8B 需要约 10GB 空闲内存，正常是 16GB 内存的电脑用，生成会比 4B 慢一截。

## 1.2.4 注意（端口被旧进程占着，不要同时开两个黑窗口）

如果你双击 start-manager.bat 后看到“couldn't bind HTTP server socket”
或“端口 18080 已被旧进程占用”，**不要再双击一次 start-manager，也不要
同时点 start-qwen 单脚本**，那样只会再起一个进程跟旧进程打架。
先关掉所有管理器黑窗口；如果还报占用，就重启一次电脑，或者打开任务
管理器 → 详细信息 → 找到 llama-server.exe → 结束任务，然后**只双击一次**
start-manager.bat。新版管理器如果发现该端口已经有一个健康服务在跑，
会直接复用它，不再起第二个进程，黑窗口里会明确写“端口已有一个健康
服务在跑，直接复用，不再起第二个进程”。

## v1.2.2 注意（b12038 报错，不用手动改文件）

如果你双击 start-manager.bat 后看到“模型进程提前退出（exit=1）”，
**不要手动改 qwen-manager.py，也不要自己删脚本里的参数。**
新版管理器会自动去掉 `--reasoning off` 再起一次，黑窗口里会明确写
“已自动去掉 --reasoning off 重试，因为该版本 llama-server 不认这个参数”，
等它第二次起成功、/health 通了再用。只有手动跑单模型脚本（不用管理器）
时如果也报这个错，才需要删掉脚本里那一个 `--reasoning off` 参数再跑一次，
管理器路径不需要你动手。

## 第零步：先把文件放对

解压 `QwenReplyHelper.zip` 后得到 `QwenReplyHelper` 文件夹，放到桌面上。
模型文件、llama-server、管理器都要在**这个文件夹的同一层，不要放子文件夹**：

- QwenReplyHelper 文件夹
  - start-manager.bat / start-manager.sh（日常用，见第一步）
  - qwen-manager.py（管理器，不要删）
  - llama-server.exe（+ 同 release 文件夹里的 DLL，不要只复制 exe 一个文件）
  - Qwen3-8B-Q4_K_M.gguf（8B，约 5.03GB，默认模型，先下这一个就行；带 Qwen_ 前缀、
    Q5_K_M 约 5.85GB、Q8_0 约 8.71GB 的文件也可以，管理器按 Q4→Q5→Q8 顺序找）
  - Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf（4B，约 2.50GB，备选，想换 4B 时再下）
  - Qwen3.5-4B-Q4_K_M.gguf（旧 4B，约 3.01GB，备选，想用旧模型时再下）
  - start-qwen.bat、start-qwen-35-4b.bat、start-qwen-8b.bat 等（备用脚本）

浏览器默认下到“下载”文件夹的文件，要复制粘贴到上面这个文件夹里，不用重下。

## 一、日常启动：只双击一次管理器（先做这一步）

在你自己的电脑上操作，不需要 VPS，不需要云服务器。

1. 从 llama.cpp 官方 release 下载对应你电脑系统的 `llama-server`
   可执行文件，放到本扩展文件夹里（Windows 放 `llama-server.exe`，
   macOS/Linux 放 `llama-server` 并 `chmod +x llama-server`）。
   注意：解压出来的同文件夹里的 DLL 文件（ggml、llama 等）要一起放在它旁边，
   缺了 DLL 服务会起不来。
2. 从模型页面下载模型文件到本扩展文件夹（点文件名，再点 Download）。
   **先只下 8B 就行**，8B 是三个模型里最强的一个，默认就是它；4B 那两个是备选，想换时再下：
   - 8B 页面：https://huggingface.co/bartowski/Qwen_Qwen3-8B-GGUF/tree/main
     镜像页面：https://hf-mirror.com/bartowski/Qwen_Qwen3-8B-GGUF/tree/main
     推荐文件：Qwen3-8B-Q4_K_M.gguf，约 5.03GB（带 Qwen_ 前缀的同名文件也可以）。
     备选：Q5_K_M 约 5.85GB，Q8_0 约 8.71GB，更大、更慢；8B 需要约 10GB 空闲内存，
     正常是 16GB 内存的电脑用，生成会比 4B 慢一截。
   - 新模型页面：https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/tree/main
     镜像页面：https://hf-mirror.com/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/tree/main
     文件：Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf，约 2.50GB，
     SHA256：2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e。
   - 旧 4B 页面：https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/tree/main
     镜像页面：https://hf-mirror.com/bartowski/Qwen_Qwen3.5-4B-GGUF/tree/main
     文件：Qwen3.5-4B-Q4_K_M.gguf，约 3.01GB，
     SHA256：13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983。
   - Windows 校验：`certutil -hashfile <文件名> SHA256`
   - macOS/Linux 校验：`shasum -a 256 <文件名>`
3. 日常启动：
   - Windows：双击 `start-manager.bat`，保持黑窗口开着。
   - macOS/Linux：`sh start-manager.sh`，保持终端开着。
   管理器会自动先起默认模型 8B（18082）。以后不用再管两个脚本。
4. 验证：
   - 管理器：浏览器打开 http://127.0.0.1:8090/status ，能看到 current 是 8b 就是起来了。
   - 8B：打开 http://127.0.0.1:18082/health ，能返回内容即为已启动。
   - 新模型（切过去之后）：打开 http://127.0.0.1:18080/health 。
   - 旧模型（切过去之后）：打开 http://127.0.0.1:18081/health 。
   若扩展提示“管理器没在跑”，先检查这一步，不要先重装扩展。

## 二、备用启动（管理器没跑时才用）

- 只起新模型：Windows 双击 `start-qwen.bat`，Mac/Linux 跑 `sh start-qwen.sh`（18080）。
- 只起旧 4B：Windows 双击 `start-qwen-35-4b.bat`，Mac/Linux 跑 `sh start-qwen-35-4b.sh`（18081）。
- 只起 8B：Windows 双击 `start-qwen-8b.bat`，Mac/Linux 跑 `sh start-qwen-8b.sh`（18082）。
- 备用时要手动换模型：先关掉当前黑窗口，再双击另一个脚本，等对应端口就绪后，
  回工具条点“重新生成”。日常不要这样轮换，太麻烦，用第一步的管理器。

## 三、导入 Chrome 扩展

1. 打开 Chrome，地址栏输入 `chrome://extensions`。
2. 右上角打开「开发者模式」（Developer mode）。
3. 点「加载已解压的扩展程序」（Load unpacked）。
4. 选择本文件夹 `QwenReplyHelper`（不是 zip 文件本身，是解压后的文件夹）。
5. 确认扩展列表里出现 QwenReplyHelper 1.7.15，且没有报错。

## 四、使用方法

1. 确认管理器黑窗口还开着（见第一步）。
2. 在 Chrome 打开 X（x.com），进入 For You 时间线或帖子详情页。
   v1.2.7 起，紫色工具条一打开 X 就在右下角出现（待命状态，状态写着
   “点某条帖子的评论图标开始生成”），不用等点了气泡才出现；不拖它它就
   一直在右下角，只有按住标题行拖动才会动，拖过的位置下次打开 X 还会记住。
3. **第一次点击**：点击某条帖子的原生评论图标。
   扩展自动读取该条主帖、调用本地模型生成、填入 X 原生回复框，
   同一个右下角工具条原地开始生成，不会跳到顶部中间：模型行（8B 5.03GB /
   新模型 2.5GB / 旧 4B 3.01GB，默认 8B）+ 自然（默认）/ 幽默 / 简短 / 友好
   + 重新生成 + 状态。
4. **切模型**：直接点工具条里的模型按钮，不用关黑窗口、不用再双击脚本。
   状态会显示“正在切换模型，请稍等…”，模型加载要十几秒到几十秒，
   等它切好会自动用新模型重新生成一次；切换失败会明确提示并回落到原模型。
   切模型期间全部按钮都会变灰、不可点，不要连点风格或重新生成，
   等切好、按钮恢复后再点（v1.2.1 已修掉切模型时风格点击会向旧端口抢发一通的口子）。
5. 检查填入的文字，手动修改（需要的话），或点工具栏切换风格 / 重新生成。
6. **第二次点击**：点击 X 原生 Reply 按钮，完成发布。
   扩展不会替你点 Reply，不会自动发送。

## 五、常见问题

- 工具栏提示“管理器没在跑”：先按第一步第 4 条检查 127.0.0.1:8090/status，
  管理器没起时请双击 start-manager.bat；这是备用路径提示，不是扩展坏了。
- 切模型时提示“模型文件不存在”：对应那个 .gguf 没放进 QwenReplyHelper 文件夹，
  按第零步放好再切，不要重下扩展。
- 点评论图标后 5 秒仍未填入：状态栏会提示未找到回复框，关闭回复框重开一次；
  若反复出现，可能是 X 改了 DOM，见 README.md 的限制说明。
- 点另一条帖子：上一通生成会被取消，不会把旧帖子的回复填到新帖子里。
- 关闭回复框：生成会被取消，但工具条不再消失，它会回到待命状态、仍在
  原位置（右下角或你上次拖到的位置），等下一次点评论图标。
- 内存：同时跑两个模型服务会占很多内存，日常用管理器时同一时间只跑一个，
  不要再手动另开一个单模型脚本一起跑。
