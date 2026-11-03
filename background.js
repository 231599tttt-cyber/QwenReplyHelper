// QwenReplyHelper background service worker (Manifest V3).
// Local-only: talks only to 127.0.0.1:8080 (Model A), 127.0.0.1:8081
// (Model B), 127.0.0.1:8082 (Model C, 8B) and 127.0.0.1:8090
// (qwen-manager.py). One llama-server process loads only one model,
// so one-tap switching needs the local manager (the extension sandbox
// cannot start/stop a PC process).
// Daily use: double-click start-manager.bat once; the manager owns
// llama-server. Without the manager, the toolbar falls back to telling
// the user which single-model script to double-click.
// v1.2.2: if a llama-server build rejects --reasoning off (b12038 on
// Windows, exit=1), qwen-manager.py auto-retries without it; this
// file then strips any <think>...</think> blocks as a safety net.
// No cloud AI, no remote endpoints, no Muse API.
const MANAGER_URL = 'http://127.0.0.1:8090';
const MANAGER_MODEL = { new: '2507', old4b: '35-4b', '8b': '8b' };
const FALLBACK_SCRIPT = {
  new: 'start-qwen.bat（Mac/Linux：start-qwen.sh，端口 8080）',
  old4b: 'start-qwen-35-4b.bat（Mac/Linux：start-qwen-35-4b.sh，端口 8081）',
  '8b': 'start-qwen-8b.bat（Mac/Linux：start-qwen-8b.sh，端口 8082）'
};
'use strict';

// Model A (default, main): Qwen3-4B-Instruct-2507 Q4_K_M, ~2.50GB.
// Start: start-qwen.bat / start-qwen.sh -> 127.0.0.1:8080
// Model B (old 4B): Qwen3.5-4B Q4_K_M, ~3.01GB.
// Start: start-qwen-35-4b.bat / start-qwen-35-4b.sh -> 127.0.0.1:8081
// Model C (8B, v1.2.0): Qwen3-8B Q4_K_M (recommended), ~5.03GB.
// Qwen released no separate Qwen3-8B-Instruct-2507, so this is the
// original Qwen3-8B, forced reasoning off for Chrome speed, like the
// other two. Manager tries Q4_K_M, then Q5_K_M (~5.85GB), then Q8_0
// (~8.71GB) filenames, with or without the Qwen_ prefix (see
// qwen-manager.py). Start via manager, or backup:
// start-qwen-8b.bat / start-qwen-8b.sh -> 127.0.0.1:8082
const MODELS = {
  new: {
    id: 'new',
    label: '新模型 2.5GB',
    alias: 'Qwen3-4B-Instruct-2507',
    url: 'http://127.0.0.1:8080/v1/chat/completions',
    port: 8080,
    script: 'start-qwen.bat（Mac/Linux：start-qwen.sh）',
    missing: '新模型服务未启动：请双击 start-qwen.bat（Mac/Linux：start-qwen.sh），等 8080 就绪后再生成。'
  },
  old4b: {
    id: 'old4b',
    label: '旧 4B 3.01GB',
    alias: 'Qwen3.5-4B',
    url: 'http://127.0.0.1:8081/v1/chat/completions',
    port: 8081,
    script: 'start-qwen-35-4b.bat（Mac/Linux：start-qwen-35-4b.sh）',
    missing: '旧 4B 服务未启动：请双击 start-qwen-35-4b.bat（Mac/Linux：start-qwen-35-4b.sh），等 8081 就绪后再生成。'
  },
  '8b': {
    id: '8b',
    label: '8B 5.03GB',
    alias: 'Qwen3-8B',
    url: 'http://127.0.0.1:8082/v1/chat/completions',
    port: 8082,
    script: 'start-qwen-8b.bat（Mac/Linux：start-qwen-8b.sh）',
    missing: '8B 服务未启动：请先确认管理器已起（start-manager.bat），并把 8B 模型文件（推荐 Qwen3-8B-Q4_K_M.gguf，约 5.03GB）放进 QwenReplyHelper 文件夹；或双击 start-qwen-8b.bat（Mac/Linux：start-qwen-8b.sh），等 8082 就绪后再生成。'
  }
};

const PROMPTS = {
  natural: '你正在回复别人的帖子，请先理解帖子的意思和语气，再像普通网友一样接话评论，不要把它当成向你提问来认真解答，不要阴阳怪气、不要讽刺、不要说教，口语化、有自己的态度、轻松自然，一两句说完。',
  humorous: '你正在回复别人的帖子，请先理解帖子的梗和语气，再像一个幽默风趣的网友接话，笑点要善意、轻松，不要阴阳怪气、不要嘲讽、不要刻意搞笑，机灵自然，一两句说完。',
  short: '你正在回复别人的帖子，请先理解帖子的意思，再像真人刷帖时随手回一句，直接自然、尽量简洁，不说废话，不要展开讲道理。',
  friendly: '你正在回复别人的帖子，请先理解帖子的意思和情绪，再像一个温柔友好的网友接话，语气温和、真诚、有亲和力，不要阴阳怪气、不要说教，一两句说完。'
};

// v1.2.2 safety net: if a build drops --reasoning off (see
// qwen-manager.py auto-fallback), a hybrid model such as Qwen3-8B
// may return <think>...</think> before the answer. Strip only those
// closed think blocks (and stray think tags), never other text, so
// the reply box only ever receives the actual reply.
function dedupeModelText(text) {
  const s = String(text || '').trim();
  if (!s) return s;
  if (s.length % 2 === 0) {
    const half = s.slice(0, s.length / 2);
    if (half && s.slice(s.length / 2) === half) return half;
  }
  const parts = s.split(/(?<=[。！？!?.])\s*/).filter(Boolean);
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
  return s;
}
function stripThinkBlocks(text) {
  let out = String(text || '');
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<\/?think\s*>/gi, '');
  return out;
}

let currentController = null;

function abortCurrent() {
  if (currentController) {
    try { currentController.abort(); } catch (e) { /* ignore */ }
    currentController = null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  if (msg.type === 'cancel') {
    abortCurrent();
    sendResponse({ ok: true, cancelled: true });
    return false;
  }

  if (msg.type === 'switch-model') {
    // One-tap switch via the local manager. Loading takes tens of
    // seconds; wait for the manager's /health-gated reply (up to 190s).
    const target = MODELS[msg.model] ? msg.model : 'new';
    const managerId = MANAGER_MODEL[target];
    const controller = new AbortController();
    const timer = setTimeout(() => { try { controller.abort(); } catch (e) {} }, 190000);
    fetch(MANAGER_URL + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: managerId }),
      signal: controller.signal
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        clearTimeout(timer);
        if (res.ok && data.ok) {
          sendResponse({ ok: true, model: target, manager: true, message: data.message || '' });
        } else {
          sendResponse({ ok: false, manager: true, model: target,
            error: (data && data.message) || '管理器切换失败，请看管理器黑窗口 / qwen-manager 日志。' });
        }
      })
      .catch((err) => {
        clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          sendResponse({ ok: false, manager: true, model: target,
            error: '切换模型超时（190 秒还没等到新模型就绪），请看管理器黑窗口是否还在加载，加载完点重新生成。' });
        } else {
          // Manager not running (8090 unreachable): fallback path.
          // Do NOT pretend the switch happened; tell the user the
          // exact backup script, and the content script will keep
          // the new selection so a manual start + regenerate works.
          sendResponse({ ok: false, manager: false, model: target,
            error: '管理器没在跑（127.0.0.1:8090 不通）：这是备用路径，请先双击 start-manager.bat（只双击一次，以后一点就切）；'
              + '或者先关掉当前黑窗口、再双击 ' + FALLBACK_SCRIPT[target]
              + '，等对应端口就绪后再点重新生成。' });
        }
      });
    return true;
  }

  if (msg.type !== 'generate') return false;

  const model = MODELS[msg.model] || MODELS.new;
  const style = PROMPTS[msg.style] ? msg.style : 'natural';
  const postText = String(msg.postText || '').trim();
  if (!postText) {
    sendResponse({ ok: false, error: '帖子正文为空，未发送生成请求。' });
    return false;
  }

  // Single-flight: a new generation cancels the previous one.
  abortCurrent();
  const controller = new AbortController();
  currentController = controller;

  const maxTokens = style === 'short' ? 80 : 180;
  // 1.6.1 from 1.6.0: model loop prevention, NOT fill dedupe.
  // Qwen local models loop the same sentence when no stop is set:
  // they emit sentence, then emit it again before EOS. Tell the
  // model explicitly, and also set a stop for a second identical
  // sentence via the API's stop list where supported (llama-server
  // accepts stop strings). The content fill remains single-write.
  fetch(model.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.alias,
      messages: [
        { role: 'system', content: PROMPTS[style] },
        { role: 'user', content: postText }
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: false
    }),
    signal: controller.signal
  })
    .then(async (res) => {
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(model.missing + '（本地服务返回 HTTP ' + res.status + (t ? ': ' + t.slice(0, 200) : '') + '）');
      }
      return res.json();
    })
    .then((data) => {
      const text = (data && data.choices && data.choices[0] &&
        data.choices[0].message && data.choices[0].message.content) || '';
      const cleaned = stripThinkBlocks(text).trim();
      if (!cleaned) throw new Error('本地模型返回了空回复。');
      sendResponse({ ok: true, text: cleaned, model: model.id });
    })
    .catch((err) => {
      if (err && err.name === 'AbortError') {
        sendResponse({ ok: false, cancelled: true, error: '已取消生成。' });
      } else if (err && (err.name === 'TypeError' || /Failed to fetch|NetworkError/i.test(String(err.message || '')))) {
        // Service not reachable at all: name the exact model service + script.
        sendResponse({ ok: false, error: model.missing });
      } else {
        sendResponse({ ok: false, error: (err && err.message) || model.missing });
      }
    })
    .finally(() => {
      if (currentController === controller) currentController = null;
    });

  return true; // keep sendResponse alive for async fetch
});
