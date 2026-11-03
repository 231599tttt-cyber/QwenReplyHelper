#!/usr/bin/env python3
"""QwenReplyHelper local manager (standard library only, no dependencies).

Why this file exists, honestly:
  On Android, one tap switches models because the app itself owns the
  llama-server process: it kills the old one and starts the new one.
  A Chrome extension runs in a browser sandbox and CANNOT start or
  stop a process on the user's computer. So a one-tap switch in the
  toolbar needs a tiny local helper on the computer itself. That is
  this file: it owns llama-server, the extension only talks to it.

Daily use (the only black window you need):
  Windows:   double-click start-manager.bat
  Mac/Linux: sh start-manager.sh
  Then keep that window open. It auto-starts the default model (2507)
  on 127.0.0.1:8080. Clicking a model button in the X reply toolbar
  then just switches, no manual script juggling.

API (127.0.0.1:8090 only, never exposed to the network):
  GET  /status   -> {current, running, port, pid, healthy, available}
  POST /switch   -> {"modelId": "2507" | "35-4b" | "8b"}  (also accepts
                     "new" / "old4b" for the extension's internal ids)
                     Kills the current server, waits for its port to
                     free, starts the new model, waits for /health.
                     Model loading takes tens of seconds (like the
                     phone loading a model) - that is normal, not a hang.
                     On failure it returns a clear reason and the
                     previous model is NOT silently left half-started.

Fallback (manager not running): the single-model scripts
start-qwen.bat/.sh (2507, port 8080), start-qwen-35-4b.bat/.sh
(35-4b, port 8081) and start-qwen-8b.bat/.sh (8b, port 8082)
still work. The extension then tells the user exactly which one
to double-click. See README.md / INSTALL.md.

8B filename robustness (v1.2.0): the user may have downloaded the
8B file with or without the Qwen_ prefix, and may have picked Q5 or
Q8 instead of the recommended Q4_K_M. The manager therefore tries,
in order, Qwen_Qwen3-8B-Q4_K_M.gguf, Qwen3-8B-Q4_K_M.gguf,
Qwen_Qwen3-8B-Q5_K_M.gguf, Qwen3-8B-Q5_K_M.gguf,
Qwen_Qwen3-8B-Q8_0.gguf, Qwen3-8B-Q8_0.gguf, and uses the first
that exists in this folder. Q5 (~5.85GB) and Q8 (~8.71GB) are
larger/slower alternatives; Q4_K_M (~5.03GB) is the recommended
default. If none exists, /switch returns a clear error naming the
expected Q4_K_M file and the model page, instead of failing silently.

v1.2.2 --reasoning auto-fallback (real Windows bug, llama.cpp b12038):
  That build's llama-server exits exit=1 when passed
  "--reasoning off" (log: invalid argument / reasoning). The user
  must NOT edit this file by hand. start_model therefore first tries
  with --reasoning off, and if the process exits early AND its log
  mentions reasoning or an invalid argument, it automatically retries
  ONCE without --reasoning and waits for /health again, printing
  "已自动去掉 --reasoning off 重试，因为该版本 llama-server 不认这个参数".
  If the retry also fails, the reported error carries the SECOND
  attempt's log tail, not the first attempt's.
  Non-thinking behaviour after dropping the flag:
  - Qwen3-4B-Instruct-2507 is non-thinking by design, so dropping the
    flag is safe for it: it does not emit thinking output anyway.
  - Qwen3.5-4B and the hybrid Qwen3-8B may think once the flag is
    dropped. That is contained, not ignored: the extension prompts
    still say "一两句说完" / "不要思考过程", and background.js strips
    <think>...</think> blocks from the reply text as a safety net,
    removing only those blocks, never other reply text.

v1.2.3 port-in-use adopt (real user report: windows closed, yet a
new start-manager still failed with "couldn't bind HTTP server
socket, hostname: 127.0.0.1, port: 8080"):
  Closing a black window does NOT guarantee the old llama-server
  is dead: an orphan from a previous manager run, or a second
  manager instance, can still hold the port. The old code then
  blindly started a second process on the same port and failed
  with a bind error, which looked like the manager was fighting
  itself. Fix, in start_model / switch_to:
  - Before starting a new llama-server for a model, check
    health_ok(port) first. If that port is already healthy, do NOT
    start a second process: adopt it (CURRENT = that model,
    PROC = None, EXTERNAL = True), log "端口已有一个健康服务在跑，
    直接复用，不再起第二个进程", and return success.
  - stop_current only kills PROC if this manager started it. An
    adopted external process is NEVER killed by this manager:
    switching away from it just clears CURRENT/EXTERNAL and
    leaves the external process running.
  - If the port is open but NOT healthy (a dead/foreign process
    is holding it), do NOT start a second process that is
    guaranteed to fail with a bind error. Return the clear
    port-occupied message instead (restart the computer, or end
    llama-server.exe in Task Manager Details, then double-click
    start-manager ONCE; never open two manager windows, never
    also click a single-model start-qwen script while the manager
    is running).
  - A second manager instance is also handled: main() binds 8090
    BEFORE auto-starting, so if 8090 is already taken it prints
    "已有另一个管理器在跑" and exits without starting/killing
    anything, instead of autostarting a model and then crashing.
  The v1.2.2 --reasoning auto-fallback is kept unchanged.
"""
import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODELS = {
    "2507": {
        "id": "2507",
        "ext_id": "new",
        "label": "新模型 2.5GB",
        "file": "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        "alias": "Qwen3-4B-Instruct-2507",
        "port": 8080,
        "size": 2497280736,
        "sha256": "2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e",
        "script": "start-qwen.bat",
    },
    "35-4b": {
        "id": "35-4b",
        "ext_id": "old4b",
        "label": "旧 4B 3.01GB",
        "file": "Qwen_Qwen3.5-4B-Q4_K_M.gguf",
        "alias": "Qwen3.5-4B",
        "port": 8081,
        "size": 3013027808,
        "sha256": "13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983",
        "script": "start-qwen-35-4b.bat",
    },
    # 8B (v1.2.0): original Qwen/Qwen3-8B, bartowski repo
    # bartowski/Qwen_Qwen3-8B-GGUF. Qwen released no separate
    # Qwen3-8B-Instruct-2507, so this hybrid model is forced
    # --reasoning off for Chrome speed, like the other two.
    # No exact byte count / SHA is claimed here: the task only
    # verified ~5.03GB for Q4_K_M, ~5.85GB for Q5_K_M and ~8.71GB
    # for Q8_0 from the repo file table, so only those labels are used.
    "8b": {
        "id": "8b",
        "ext_id": "8b",
        "label": "8B 5.03GB",
        "file": "Qwen_Qwen3-8B-Q4_K_M.gguf",
        "alias": "Qwen3-8B",
        "port": 8082,
        "size_label": "约 5.03GB（Q4_K_M；Q5_K_M 约 5.85GB，Q8_0 约 8.71GB）",
        "page": "https://huggingface.co/bartowski/Qwen_Qwen3-8B-GGUF/tree/main",
        "mirror_page": "https://hf-mirror.com/bartowski/Qwen_Qwen3-8B-GGUF/tree/main",
        "script": "start-qwen-8b.bat",
    },
}
ALIASES = {"new": "2507", "old4b": "35-4b", "8b": "8b",
           "2507": "2507", "35-4b": "35-4b"}


def resolve_model_file(model):
    """Return the first existing GGUF for this model, or None.

    For each model this tries its files list in order (original name first, X name as fallback). For 8b it
    tries the Q4 -> Q5 -> Q8 order, with and without the Qwen_
    prefix, so a prefix difference or a Q5/Q8 pick does not fail
    the switch on its own.
    """
    candidates = model.get("files") or [model["file"]]
    for name in candidates:
        path = os.path.join(BASE_DIR, name)
        if os.path.isfile(path):
            return path, name
    return None, None

LOCK = threading.Lock()
PROC = None          # subprocess.Popen or None, only if this manager started it
CURRENT = None       # model id or None
EXTERNAL = False     # True iff CURRENT was adopted from a healthy port (PROC is None, never kill it)
LAST_ERROR = None


def server_binary():
    # Windows release ships llama-server.exe next to its DLLs; keep the
    # same folder, do not copy the exe alone. Unix ships llama-server.
    for name in ("llama-server.exe", "llama-server"):
        p = os.path.join(BASE_DIR, name)
        if os.path.isfile(p):
            return p
    return "llama-server"  # fall back to PATH


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def health_ok(port, timeout=1.0):
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:%d/health" % port, timeout=timeout
        ) as r:
            return r.status == 200
    except Exception:
        return False


def port_occupied_msg(port):
    return ("端口 %d 已被旧进程占用：请重启电脑，或在任务管理器详细信息里结束 "
            "llama-server.exe 后再双击 start-manager；不要同时开两个管理器黑窗口，"
            "也不要同时点 start-qwen 单脚本。" % port)


def _is_bind_error(tail):
    lowered = (tail or "").lower()
    return any(k in lowered for k in (
        "couldn't bind", "could not bind", "failed to bind",
        "bind", "address already in use", "already in use",
        "http server error"))


def stop_current():
    """Stop the current server, if this manager owns it.

    An adopted external process (EXTERNAL, PROC is None) is NEVER
    killed here: switching away just clears CURRENT/EXTERNAL and
    leaves the external process running on its port.
    """
    global PROC, CURRENT, EXTERNAL
    proc = PROC
    model = MODELS.get(CURRENT) if CURRENT else None
    was_external = EXTERNAL
    PROC = None
    CURRENT = None
    EXTERNAL = False
    if proc is None:
        # Adopted external, or nothing running: nothing to kill, and
        # crucially do NOT wait for the external port to free.
        return
    _ = was_external
    try:
        proc.terminate()
    except Exception:
        pass
    try:
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
        try:
            proc.wait(timeout=5)
        except Exception:
            pass
    if model:
        deadline = time.time() + 10
        while time.time() < deadline and port_open(model["port"]):
            time.sleep(0.2)


def log_tail(log_path, limit=1500):
    """Last `limit` chars of a log file, or '' if unreadable."""
    try:
        with open(log_path, "rb") as f:
            data = f.read()
        text = data.decode("utf-8", errors="replace")
        return text[-limit:] if len(text) > limit else text
    except OSError:
        return ""


def _attempt_start(model, path, binary, use_reasoning, log_path):
    """One llama-server attempt. Returns (status, exit_code, tail).

    status: "ok" (health passed), "early-exit" (process died while
    waiting), or "timeout" (still alive after 180s, left running).
    Caller (start_model) owns PROC/CURRENT cleanup on failure.
    """
    global PROC, CURRENT, EXTERNAL
    EXTERNAL = False
    args = [binary, "-m", path, "--alias", model["alias"],
            "--host", "127.0.0.1", "--port", str(model["port"]),
            "-c", "1024", "-t", "4"]
    if use_reasoning:
        args += ["--reasoning", "off"]
    log_file = None
    try:
        log_file = open(log_path, "ab")
    except OSError:
        log_file = None
    try:
        proc = subprocess.Popen(
            args, cwd=BASE_DIR,
            stdout=log_file if log_file is not None else subprocess.DEVNULL,
            stderr=subprocess.STDOUT)
    except FileNotFoundError:
        return "missing-binary", None, ""
    except OSError as e:
        return "os-error:%s" % e, None, ""
    PROC = proc
    CURRENT = model["id"]
    # Model loading takes tens of seconds; wait for /health, and watch
    # for an early exit (e.g. --reasoning off rejected by this build).
    deadline = time.time() + 180
    while time.time() < deadline:
        if proc.poll() is not None:
            if log_file is not None:
                try:
                    log_file.close()
                except Exception:
                    pass
            PROC = None
            CURRENT = None
            return "early-exit", proc.returncode, log_tail(log_path)
        if health_ok(model["port"]):
            return "ok", None, ""
        time.sleep(1)
    # Timed out but process alive: leave it running, report honestly.
    return "timeout", None, log_tail(log_path)


def start_model(model_id):
    """Start one model. Returns (ok, message). Caller holds LOCK.

    v1.2.2: first try with --reasoning off. If that attempt exits
    early and its log mentions reasoning or an invalid argument
    (llama.cpp b12038 on Windows does exactly this, exit=1), retry
    ONCE without --reasoning, automatically, with no manual file
    edit. A second failure reports the second attempt's log tail.
    """
    global PROC, CURRENT, EXTERNAL, LAST_ERROR
    model = MODELS[model_id]
    # v1.2.3: never start a second process on a healthy port. If the
    # target port already answers /health, adopt it, whatever started
    # it (orphan from a previous run, a manual start-qwen script, or
    # an earlier manager whose window was closed). This must run
    # BEFORE the model-file check, so adoption also works when the
    # file is not in this folder but a healthy service already runs.
    if health_ok(model["port"]):
        if PROC is not None and PROC.poll() is None:
            prev = MODELS.get(CURRENT) if CURRENT else None
            if prev is not None and prev["port"] == model["port"]:
                # The healthy process IS the one we already own; just
                # relabel it, do not kill it and do not start another.
                CURRENT = model_id
                EXTERNAL = False
                LAST_ERROR = None
                return True, "端口已有一个健康服务在跑，直接复用，不再起第二个进程：已切换到%s（%s，端口 %d），可以生成了。" % (
                    model["label"], model["alias"], model["port"])
            # We own a different-port process: stop it (free memory)
            # before adopting; stop_current never kills an adopted one.
            stop_current()
        elif PROC is not None:
            PROC = None
            CURRENT = None
            EXTERNAL = False
        PROC = None
        CURRENT = model_id
        EXTERNAL = True
        LAST_ERROR = None
        msg = "端口已有一个健康服务在跑，直接复用，不再起第二个进程：已切换到%s（%s，端口 %d），可以生成了。" % (
            model["label"], model["alias"], model["port"])
        print(msg, flush=True)
        return True, msg
    # Port open but NOT healthy: a dead/foreign process holds it.
    # Starting a second process here is guaranteed to fail with a
    # bind error, so report the cleanup step instead of trying.
    if port_open(model["port"]):
        msg = port_occupied_msg(model["port"])
        LAST_ERROR = msg
        return False, msg
    path, found_name = resolve_model_file(model)
    if not path:
        if model_id == "8b":
            msg = ("8B 模型文件不存在：请先从模型页面下载推荐文件 "
                   "Qwen_Qwen3-8B-Q4_K_M.gguf（约 5.03GB）放进 QwenReplyHelper 文件夹，"
                   "页面：%s（镜像：%s）。" % (
                       model["page"], model["mirror_page"]))
        else:
            msg = "模型文件不存在：%s（约 %.2fGB）。请先把该文件放进 QwenReplyHelper 文件夹，再切换。" % (
                model["file"], model["size"] / 1e9)
        LAST_ERROR = msg
        return False, msg
    # Log which actual file was picked, so a Q5/Q8 pick is visible
    # instead of silently running an unexpected quant.
    if found_name != model["file"]:
        print("8B: using %s (not the default %s)" % (found_name, model["file"]), flush=True)
    binary = server_binary()
    log_path = os.path.join(BASE_DIR, "qwen-manager-%s.log" % model_id)
    status, exit_code, tail = _attempt_start(
        model, path, binary, True, log_path)
    if status == "ok":
        LAST_ERROR = None
        return True, "已切换到%s（%s，端口 %d），可以生成了。" % (
            model["label"], model["alias"], model["port"])
    if status == "missing-binary":
        msg = "找不到 llama-server（%s）。请把 llama-server.exe / llama-server 放进 QwenReplyHelper 文件夹。" % binary
        LAST_ERROR = msg
        return False, msg
    if status.startswith("os-error:"):
        msg = "启动 llama-server 失败：%s" % status[len("os-error:"):]
        LAST_ERROR = msg
        return False, msg
    if status == "timeout":
        msg = "等了 180 秒，%s 的 /health 还没通（进程还在）。请看 %s 尾部，或等一会儿再点重新生成。" % (
            model["label"], log_path)
        LAST_ERROR = msg
        return False, msg
    # status == "early-exit": a bind failure is a port fight, not a
    # reasoning problem. Report the cleanup step, do not retry with
    # a second process that would fail the same way.
    if _is_bind_error(tail):
        msg = port_occupied_msg(model["port"])
        LAST_ERROR = msg
        return False, msg
    # status == "early-exit": only auto-retry when the log actually
    # blames --reasoning / an invalid argument. Other early exits
    # (missing DLL, bad model file) must NOT be masked
    # by a retry that would fail the same way.
    lowered = tail.lower()
    if "reasoning" not in lowered and "invalid argument" not in lowered:
        msg = ("模型进程提前退出（exit=%s）。日志尾部：%s" % (
            exit_code, tail.strip() or "（日志为空，见 %s）" % log_path))
        LAST_ERROR = msg
        return False, msg
    fallback_msg = "已自动去掉 --reasoning off 重试，因为该版本 llama-server 不认这个参数"
    print(fallback_msg + "（首次尝试 exit=%s）。" % exit_code, flush=True)
    status2, exit_code2, tail2 = _attempt_start(
        model, path, binary, False, log_path)
    if status2 == "ok":
        LAST_ERROR = None
        note = ""
        if model_id == "8b":
            note = "（8B 是混合思考模型，去掉该参数后它可能输出思考内容，扩展会去掉 <think> 块，只填正文。）"
        return True, "%s。已切换到%s（%s，端口 %d），可以生成了。%s" % (
            fallback_msg, model["label"], model["alias"], model["port"], note)
    if status2 == "timeout":
        msg = "%s，但第二次尝试等了 180 秒，%s 的 /health 还没通（进程还在）。请看 %s 尾部，或等一会儿再点重新生成。" % (
            fallback_msg, model["label"], log_path)
        LAST_ERROR = msg
        return False, msg
    if status2 == "missing-binary":
        msg = "%s，但第二次尝试找不到 llama-server（%s）。" % (fallback_msg, binary)
        LAST_ERROR = msg
        return False, msg
    if _is_bind_error(tail2):
        msg = port_occupied_msg(model["port"])
        LAST_ERROR = msg
        return False, msg
    # Second failure: report the SECOND log tail, not the first.
    msg = "%s，但第二次尝试也提前退出（exit=%s）。第二次日志尾部：%s" % (
        fallback_msg, exit_code2, tail2.strip() or "（日志为空，见 %s）" % log_path)
    LAST_ERROR = msg
    return False, msg


def switch_to(model_id):
    with LOCK:
        if model_id not in MODELS:
            return False, "未知模型：%s（只能是 2507、35-4b 或 8b）。" % model_id
        if CURRENT == model_id and health_ok(MODELS[model_id]["port"]):
            return True, "已经是%s，无需切换。" % MODELS[model_id]["label"]
        # v1.2.3: if the target port is already healthy, start_model
        # adopts it (and stops an owned different-port process first).
        # Do NOT stop_current() blindly here: for an adopted current
        # model stop_current only clears the label, which is fine,
        # but for a healthy target we must not kill anything on the
        # target port. start_model handles adoption, so delegate.
        if health_ok(MODELS[model_id]["port"]):
            return start_model(model_id)
        stop_current()
        return start_model(model_id)


def status_dict():
    model = MODELS.get(CURRENT) if CURRENT else None
    alive = PROC is not None and PROC.poll() is None
    return {
        "current": CURRENT,
        "currentLabel": model["label"] if model else None,
        "running": bool(alive or EXTERNAL),
        "external": bool(EXTERNAL),
        "port": model["port"] if model else None,
        "pid": PROC.pid if alive else None,
        "healthy": health_ok(model["port"]) if model else False,
        "available": {k: (resolve_model_file(v)[0] is not None)
                      for k, v in MODELS.items()},
        "lastError": LAST_ERROR,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass  # keep the black window readable

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/").endswith("/status"):
            self._json(200, status_dict())
        else:
            self._json(404, {"ok": False, "error": "未知接口，只支持 /status 和 /switch。"})

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/switch"):
            self._json(404, {"ok": False, "error": "未知接口，只支持 /status 和 /switch。"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self._json(400, {"ok": False, "error": "请求不是合法 JSON。"})
            return
        model_id = ALIASES.get(str(data.get("modelId") or ""))
        if not model_id:
            self._json(400, {"ok": False, "error": "modelId 只能是 2507、35-4b 或 8b。"})
            return
        ok, msg = switch_to(model_id)
        self._json(200 if ok else 500, {
            "ok": ok, "modelId": model_id, "message": msg,
            "status": status_dict(),
        })


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--model", default="2507")
    ap.add_argument("--no-autostart", action="store_true")
    args = ap.parse_args()
    print("QwenReplyHelper manager: http://127.0.0.1:%d (only local)" % args.port, flush=True)
    print("Models folder: %s" % BASE_DIR, flush=True)
    # v1.2.3: bind 8090 BEFORE auto-starting, so a second manager
    # instance fails fast here with a clear message instead of
    # autostarting a model and then crashing on the bind.
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as e:
        print("已有另一个管理器在跑（127.0.0.1:%d 已被占用）：请不要同时开两个 "
              "start-manager 黑窗口，关掉多余的窗口，只留一个。没有启动或杀掉任何模型。"
              % args.port, flush=True)
        print("（技术原因：%s）" % e, flush=True)
        return
    if not args.no_autostart:
        mid = ALIASES.get(args.model, "2507")
        print("Auto-starting default model %s ..." % MODELS[mid]["label"], flush=True)
        ok, msg = switch_to(mid)
        print(msg, flush=True)
    else:
        print("Autostart disabled; use POST /switch to start a model.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        with LOCK:
            stop_current()


if __name__ == "__main__":
    main()
