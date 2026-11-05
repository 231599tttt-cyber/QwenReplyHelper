if (window.__qrhLoaded) { /* duplicate content-script injection: do nothing */ } else {
window.__qrhLoaded = true;
// QwenReplyHelper content script.
// Flow: 1st click = X native reply icon -> read ONLY that article's
// tweetText -> local Qwen generates -> fill X native reply box.
// 2nd click = user clicks X's own Reply button to publish (we never
// click Reply, never send anything ourselves).
// Lightweight: one capture click listener + MutationObserver only.
// No polling loops.
'use strict';

(function () {
  const STYLES = [
    { id: 'natural', label: '自然' },
    { id: 'humorous', label: '幽默' },
    { id: 'short', label: '简短' },
    { id: 'friendly', label: '友好' }
  ];

  // Three models (v1.2.0 adds 8B). One llama-server loads only one
  // model, so one-tap switching goes through qwen-manager.py on
  // 127.0.0.1:8090 (daily: start-manager.bat once). The toolbar alone
  // cannot start a PC process - that is a browser-sandbox limit, not
  // a missing button. Without the manager, the fallback is the
  // single-model scripts (see README/INSTALL).
  const MODELS = [
    { id: 'new', label: '新模型 2.5GB', port: 18080, script: 'start-qwen.bat' },
    { id: 'old4b', label: '旧 4B 3.01GB', port: 18081, script: 'start-qwen-35-4b.bat' },
    { id: '8b', label: '8B 5.03GB', port: 18082, script: 'start-qwen-8b.bat' }
  ];
  let currentModel = '8b'; // default: 8B model (1.7.15)
  let currentStyle = 'natural'; // default style, kept across posts
  let toolbarSwitching = false; // model switch in progress (toolbar-wide, not per-post)
  let activeEditor = null; // X composer editor for the currently selected post, or null when idle
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['qrhModel'], (r) => {
        if (r && (r.qrhModel === 'new' || r.qrhModel === 'old4b' || r.qrhModel === '8b')) {
          currentModel = r.qrhModel;
          if (typeof refreshToolbarActive === 'function') refreshToolbarActive();
        }
      });
    }
  } catch (e) { /* storage unavailable: keep default */ }

  function modelLabel(id) {
    const m = MODELS.find((x) => x.id === id);
    return m ? m.label : '新模型 2.5GB';
  }

  // State for the currently open composer.
  let state = null; // {postId, postText, style, model, generating, generationId}
  let generationSeq = 0;
  let taskCounter = 0;
  const filledTaskIds = new Set();
  // Debug log (user 22:48 spec): counts per click, to prove whether
  // duplication is duplicate AI requests or duplicate writes.
  // Open DevTools Console and filter [QRH] to see:
  // click -> AI request -> write, each with its taskId.
  window.__qrhDebug = window.__qrhDebug || { clicks: 0, aiRequests: 0, writes: 0, fills: [] };
  function qrhLog(kind, taskId, detail) {
    try {
      const d = window.__qrhDebug;
      if (kind === 'click') d.clicks++;
      if (kind === 'ai') d.aiRequests++;
      if (kind === 'write') d.writes++;
      if (kind === 'fill') d.fills.push({ taskId: taskId, detail: detail, at: Date.now() });
      console.log('[QRH]', kind, taskId || '-', detail || '', 'clicks=' + d.clicks, 'ai=' + d.aiRequests, 'writes=' + d.writes);
    } catch (e) {}
  }
  // v1.2.5 drag-while-generating fix: drag state is kept strictly
  // separate from generation state. Drag code never cancels, supersedes
  // or resets a generation (no sendCancel, no generationSeq change,
  // no state change); it only moves the card. A fill that completes
  // mid-drag is deferred to mouseup via pendingFill (see below).
  let dragInProgress = false;
  let pendingFill = null;
  let toolbarEl = null;
  let statusEl = null;
  let composerObserver = null;

  function setStatus(text, busy) {
    if (!statusEl) return;
    const textEl = statusEl.querySelector('.qrh-status-text');
    if (textEl) textEl.textContent = text;
    else statusEl.textContent = text;
    // busy defaults from the message: generating / switching shows the spinner.
    const isBusy = (busy !== undefined) ? !!busy : /生成中|切换/.test(text || '');
    statusEl.classList.toggle('qrh-busy', isBusy);
    if (toolbarEl) toolbarEl.classList.toggle('qrh-busy', isBusy);
  }

  // v1.2.1: visibly disable every toolbar button while switching models.
  // The old code only returned early in the model handler, so style /
  // regenerate clicks during a switch could still start a generation
  // against the old port while the manager was killing it. Disabled
  // buttons do not fire clicks, and the guards below still return early
  // even if a click somehow arrives (e.g. in a test harness).
  function setToolbarButtonsDisabled(disabled) {
    if (!toolbarEl) return;
    toolbarEl.querySelectorAll('.qrh-btn').forEach((b) => {
      b.disabled = !!disabled;
      b.classList.toggle('qrh-disabled', !!disabled);
    });
    toolbarEl.classList.toggle('qrh-switching', !!disabled);
  }
  // Model switch only disables model buttons. Style/regenerate
  // buttons stay usable, and an in-flight generation is never
  // cancelled by a model switch (user rule 21:21).
  function setModelButtonsDisabled(disabled) {
    if (!toolbarEl) return;
    toolbarEl.querySelectorAll('.qrh-model-btn').forEach((b) => {
      b.disabled = !!disabled;
      b.classList.toggle('qrh-disabled', !!disabled);
    });
  }

  function sendCancel() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'cancel' });
      }
    } catch (e) { /* extension context may be gone */ }
  }

  // v1.2.5: the toolbar is persistent. Closing a composer no longer
  // removes it: it cancels any in-flight generation and returns to
  // the idle state, in exactly the same position, ready for the next
  // reply click. Only an X page unload removes it (with the page).
  function cleanupComposer() {
    if (state && state.generating) {
      state.generating = false;
      sendCancel();
    }
    // User spec: closing the reply UI must also clear the generated
    // text itself, not just the toolbar state, so nothing leaks into
    // the next reply. If the editor node is still in the page (X
    // hides it instead of removing it), empty it explicitly.
    try {
      if (activeEditor && document.contains(activeEditor)) {
        while (activeEditor.firstChild) activeEditor.removeChild(activeEditor.firstChild);
        activeEditor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
    } catch (e) { /* editor already gone: nothing to clear */ }
    // A fill deferred to drag-end belongs to this composer only; if
    // the composer is gone, it must never land in a later composer.
    pendingFill = null;
    state = null;
    activeEditor = null;
    if (composerObserver) { composerObserver.disconnect(); composerObserver = null; }
    setStatus('点某条帖子的评论图标开始生成', false);
  }

  function refreshToolbarActive() {
    if (!toolbarEl) return;
    toolbarEl.querySelectorAll('.qrh-model-btn').forEach((x) => {
      x.classList.toggle('qrh-active', x.dataset.qrhModel === currentModel);
    });
    toolbarEl.querySelectorAll('.qrh-btn').forEach((x) => {
      if (x.dataset.qrhStyle) x.classList.toggle('qrh-active', x.dataset.qrhStyle === currentStyle);
    });
  }

  function ensureToolbar() {
    if (toolbarEl) { refreshToolbarActive(); return toolbarEl; }
    return buildPersistentToolbar();
  }

  function extractStatusId(article) {
    if (!article) return '';
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return '';
    const m = String(link.getAttribute('href') || '').match(/\/status\/(\d+)/);
    return m ? m[1] : '';
  }

  function extractPostText(article) {
    if (!article) return '';
    // Only this article's own tweetText. Never comments below it,
    // never the whole page, never other articles.
    const textEl = article.querySelector('div[data-testid="tweetText"]');
    if (!textEl) return '';
    return (textEl.innerText || textEl.textContent || '').trim();
  }

  function dialogPostId(dialog) {
    if (!dialog) return '';
    const art = dialog.querySelector('article[data-testid="tweet"]');
    if (!art) return '';
    const link = art.querySelector('a[href*="/status/"]');
    if (!link) return '';
    const m = String(link.getAttribute('href') || '').match(/\/status\/(\d+)/);
    return m ? m[1] : '';
  }
  function dialogPostText(dialog) {
    if (!dialog) return '';
    const art = dialog.querySelector('article[data-testid="tweet"]');
    if (!art) return '';
    const el = art.querySelector('div[data-testid="tweetText"]');
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }

  function findComposerEditor() {
    // 问题 3 (from 1.6.2): previously returned the FIRST
    // dialog in the page, without confirming it belongs to the
    // clicked post. Author-only check passes when two posts share
    // an author. Now: if a post is pending, only return an editor
    // from a dialog whose postId (or postText) matches that post.
    // Otherwise return null and keep waiting, never the first dialog.
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const dialog of dialogs) {
      if (!isReplyDialogEl(dialog)) continue;
      if (state && state.postId) {
        const dId = dialogPostId(dialog);
        if (dId && dId !== state.postId) continue;
        if (!dId && state.postText) {
          const dText = dialogPostText(dialog);
          if (dText && dText !== state.postText) continue;
        }
      }
      const inner = dialog.querySelector('div[data-testid="tweetTextarea_0"] div[contenteditable="true"]');
      if (inner) return inner;
      const el = dialog.querySelector('div[data-testid="tweetTextarea_0"], div[contenteditable="true"]');
      if (el) return el;
    }
    return null;
  }

  function waitForComposer(timeoutMs) {
    return new Promise((resolve) => {
      const found = findComposerEditor();
      if (found) { resolve(found); return; }
      let done = false;
      const observer = new MutationObserver(() => {
        const el = findComposerEditor();
        if (el && !done) {
          done = true;
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        if (!done) { done = true; observer.disconnect(); resolve(null); }
      }, timeoutMs || 5000);
    });
  }

  function fillEditor(editor, text) {
    // 1.6.6 (user 11:07, from 1.6.5): first-click duplicate root
    // hypothesis: on a freshly opened dialog the cursor/selection
    // is NOT yet inside the editable, and X's React editor renders
    // the first insert asynchronously. The old code checked content
    // immediately after execCommand; if that synchronous read missed
    // the text, it inserted a SECOND copy via Range+TextNode, so
    // one AI result appeared twice. Style switch does not hit this
    // because the editor already has text and a selection inside.
    // Fix, fill step only: (a) put focus + selection inside the
    // editor BEFORE execCommand, (b) after execCommand, if the
    // immediate read misses, do NOT fallback immediately — the
    // caller (attemptFillAsync) re-checks after 120ms and only then
    // falls back once. This function itself now NEVER writes twice.
    const head = text.slice(0, 10);
    try { editor.focus(); } catch (e) {}
    // 1.7.0 (user 12:42, from 1.6.8): 1.6.8 put the selection at the
    // END OF THE WHOLE EDITOR (selectNodeContents(editor)), then
    // execCommand inserted text there. X's editor tracks text inside
    // its inner text block ([data-text="true"] span), not at the
    // outer end, so the text displayed and Reply lit up, but X's
    // block stayed empty and Backspace did nothing until the user
    // typed a real character and X re-read the box. Fix: put the
    // selection INSIDE the innermost text block first, so
    // execCommand inserts into the block X actually tracks.
    // 1.6.9 space-activate hack is removed (proven useless: a space,
    // manual or coded, does not activate Backspace).
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      const textEls = editor.querySelectorAll('[data-text="true"]');
      const inner = textEls.length ? textEls[textEls.length - 1] : null;
      if (inner) {
        range.selectNodeContents(inner);
      } else {
        range.selectNodeContents(editor);
      }
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch (e) { inserted = false; }
    const afterFirst = (editor.innerText || editor.textContent || '');
    if (afterFirst.includes(head)) {
      // 1.6.8: NO manual InputEvent here. execCommand insertText
      // already fires a native input event; a second manual one
      // on a fresh dialog was a candidate for X duplicating the
      // text, while still being needed to enable Reply in the
      // direct-DOM path (which is now gone on first click).
      return true;
    }
    // Do NOT fallback here. Return false and let attemptFillAsync
    // re-check after a short delay; only a confirmed miss gets one
    // fallback insert, never an immediate second write.
    return false;
  }
  function fillEditorFallback(editor, text) {
    const head = text.slice(0, 10);
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
    try { editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch (e) {}
    return (editor.innerText || editor.textContent || '').includes(head);
  }

  // 1.7.1 (user 12:49, shared fill method): execCommand insertText
  // left X's block unadopted for BOTH first click and style switch
  // (user 12:45: style switch also Backspace-dead), so changing only
  // first-click path (1.6.8/1.6.9/1.7.0) could never fix it. Shared
  // method now: dispatch a synthetic ClipboardEvent paste with a
  // DataTransfer carrying the text, directly to the editor. X's
  // paste handler treats this as user-pasted text and adopts it
  // into its own editor model, so Backspace should work without
  // manual typing. No system clipboard use, no clipboard permission,
  // no extra copy step: paste dispatch is a single local event,
  // tens of ms, same speed as execCommand; AI generation time
  // (seconds) still dominates. If paste dispatch inserts nothing
  // within 100ms, fall back once to fillEditor execCommand so text
  // still appears (with the old Backspace limitation, not blank).
  async function fillViaPaste(editor, text) {
    const head = text.slice(0, 10);
    try { editor.focus(); } catch (e) {}
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      const textEls = editor.querySelectorAll('[data-text="true"]');
      const inner = textEls.length ? textEls[textEls.length - 1] : null;
      if (inner) range.selectNodeContents(inner); else range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      editor.dispatchEvent(ev);
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
    if ((editor.innerText || editor.textContent || '').includes(head)) return true;
    return fillEditor(editor, text);
  }
  async function attemptFillAsync(editor, text, isRegen, taskId) {
    const existing = (editor.innerText || editor.textContent || '').trim();
    // Grok method test, from 1.7.3 only, style-switch only.
    // First click keeps the 1.7.3 paste path (it works).
    // Style switch does NOT clear-then-paste and does NOT use
    // direct DOM write. It uses Grok's method 3 in one sequence:
    // focus, put selection inside the inner text block at the end,
    // execCommand insertText ' ' to wake the editor with a real
    // native input, execCommand selectAll, execCommand insertText
    // target text to replace the selection, then move the cursor
    // to the end. No DOM removal, no manual InputEvent, no paste,
    // no fallback. If the result is not exactly the target text,
    // return false (empty/failure is honest, no dead text).
    if (isRegen && existing) {
      const setInnerEnd = () => {
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          const textEls = editor.querySelectorAll('[data-text="true"]');
          const inner = textEls.length ? textEls[textEls.length - 1] : null;
          if (inner) range.selectNodeContents(inner); else range.selectNodeContents(editor);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (e) {}
      };
      try { editor.focus(); } catch (e) {}
      setInnerEnd();
      try { document.execCommand('insertText', false, ' '); } catch (e) {}
      await new Promise(r => setTimeout(r, 100));
      try { document.execCommand('selectAll', false, null); } catch (e) {}
      try { document.execCommand('insertText', false, text); } catch (e) {}
      await new Promise(r => setTimeout(r, 100));
      setInnerEnd();
      const afterGrok = (editor.innerText || editor.textContent || '').trim();
      qrhLog('fill', taskId, 'GROK_SPACE_WAKE afterLen=' + afterGrok.length + ' textLen=' + text.trim().length);
      return afterGrok === text.trim();
    }
    if (existing) {
      try { editor.focus(); } catch (e) {}
      try { document.execCommand('selectAll', false, null); } catch (e) {}
      try { document.execCommand('delete', false, null); } catch (e) {}
      try { editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch (e) {}
      const afterClear = (editor.innerText || editor.textContent || '').trim();
      if (afterClear) {
        while (editor.firstChild) editor.removeChild(editor.firstChild);
        try { editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch (e) {}
      }
    }
    qrhLog('write', taskId, 'attemptFillAsync isRegen=' + isRegen + ' existingLen=' + existing.length);
    let filled;
    if (!isRegen) {
      // 1.6.8 (user 12:17, standard: single text + Reply enabled +
      // actually sendable): 1.6.7 direct DOM insert made text single
      // but X never enabled Reply, so it was NOT a fix. Revert first
      // click to execCommand, which X recognises and which enables
      // Reply. Duplication is then handled AFTER execCommand, not
      // by avoiding execCommand: wait 200ms for X to settle, if
      // content is exactly text+text, clear via execCommand
      // selectAll+delete, then execCommand insertText ONCE more.
      // No direct DOM insert on first click, no manual InputEvent
      // after a direct insert, so Reply stays enabled.
      filled = await fillViaPaste(editor, text);
      await new Promise(r => setTimeout(r, 200));
      let afterExec = (editor.innerText || editor.textContent || '').trim();
      if (afterExec === (text.trim() + text.trim())) {
        qrhLog('fill', taskId, 'FIRST_CLICK_DUP_AFTER_EXEC, clearing and execCommand once more');
        try { editor.focus(); } catch (e) {}
        try { document.execCommand('selectAll', false, null); } catch (e) {}
        try { document.execCommand('delete', false, null); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
        filled = await fillViaPaste(editor, text);
        await new Promise(r => setTimeout(r, 200));
      }
    } else {
      filled = await fillViaPaste(editor, text);
      if (!filled) {
        await new Promise(r => setTimeout(r, 120));
        const afterWait = (editor.innerText || editor.textContent || '');
        if (afterWait.includes(text.slice(0, 10))) {
          filled = true;
          try { editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch (e) {}
        } else {
          filled = fillEditorFallback(editor, text);
        }
      }
    }
    const afterText = (editor.innerText || editor.textContent || '').trim();
    qrhLog('fill', taskId, 'filled=' + filled + ' afterLen=' + afterText.length + ' textLen=' + text.trim().length);
    if (!filled || !afterText.startsWith(text.trim()) || afterText.length > text.trim().length + 10) { qrhLog('fill', taskId, 'FULL_TEXT_MISMATCH afterLen=' + afterText.length + ' textLen=' + text.trim().length); return false; }
    if (afterText === (text.trim() + text.trim())) {
      qrhLog('fill', taskId, 'DUPLICATE_WRITE afterText==text+text, not refilling');
      return false;
    }
    return true;
  }


  // v1.2.4: drag the floating toolbar by its header row only.
  // mousedown on the header starts a drag; mousemove moves the card
  // by delta and clamps it inside the viewport; mouseup ends it.
  // A press that moves <=3px is treated as an ordinary click (the
  // header has no click action, and buttons live outside the header,
  // so button clicks are never suppressed by a drag).
  // v1.2.5 drag-while-generating fix (must-fix, not nice-to-have).
  // User report: dragging the toolbar while the status shows "生成中"
  // made the generated text never reach the reply box.
  // Likely mechanism: the toolbar lives outside X's composer dialog,
  // so a header mousedown/mouseup was treated by X as a click outside
  // the composer / a focus loss, and the fill path then ran against
  // a blurred or closing editor.
  // Fix, in three parts:
  // (1) Header mousedown/mousemove/mouseup stopPropagation AND
  //     preventDefault, so X does not treat the drag as an outside
  //     click and does not close the composer or steal editor focus.
  //     The header listener is registered in capture phase, so its
  //     stopPropagation runs before bubble listeners on ancestors.
  //     A click that follows a real drag is suppressed once (capture,
  //     toolbar targets only), so X never sees a drag-end click as
  //     an outside click. Buttons live outside the header, so their
  //     clicks are never suppressed by this.
  // (2) Drag code NEVER cancels, supersedes or resets a generation:
  //     no sendCancel, no generationSeq change, no state change, no
  //     setStatus except the pending-fill flush in onUp (which only
  //     reports a fill that already completed).
  // (3) If generation completes mid-drag, the fill is deferred, not
  //     dropped: generateAndFill stores it in pendingFill and the
  //     status says so; onUp flushes it once (verified, same as a
  //     normal fill) if the editor is still present, otherwise it
  //     is discarded. The status then reflects the verified result,
  //     never a false success.
  function flushPendingFill() {
    if (!pendingFill) return;
    const fn = pendingFill;
    pendingFill = null;
    fn();
  }

  function makeDraggable(card, handle) {
    handle.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.target && ev.target.closest && ev.target.closest('button')) return;
      // (1) Keep this drag invisible to X: do not let it bubble to
      // X's outside-click handling, and do not let the mousedown
      // steal focus/selection from X's composer editor.
      ev.stopPropagation();
      if (ev.cancelable) ev.preventDefault();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startLeft = parseInt(card.style.left || '0', 10) || 0;
      const startTop = parseInt(card.style.top || '0', 10) || 0;
      let moved = false;
      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
        moved = true;
        dragInProgress = true;
        e.stopPropagation();
        card.classList.add('qrh-dragging');
        const w = card.offsetWidth || 520;
        const h = card.offsetHeight || 200;
        const left = Math.max(0, Math.min(startLeft + dx, window.innerWidth - w));
        const top = Math.max(0, Math.min(startTop + dy, window.innerHeight - 40));
        card.style.left = left + 'px';
        card.style.top = top + 'px';
        card.style.transform = 'none';
      }
      function onUp(e) {
        if (e) e.stopPropagation();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        card.classList.remove('qrh-dragging');
        // (3) Drag ends: the drag is over, so a fill that completed
        // mid-drag can now run against a focused, still-present editor.
        dragInProgress = false;
        flushPendingFill();
        // (1) Suppress the click X would otherwise see after a drag.
        if (moved) {
          const suppress = (ce) => {
            if (ce.target && ce.target.closest && ce.target.closest('.qrh-toolbar')) {
              ce.stopPropagation();
              if (ce.cancelable) ce.preventDefault();
            }
            document.removeEventListener('click', suppress, true);
          };
          document.addEventListener('click', suppress, true);
        }
        // A drag is the ONLY thing that moves the card. Remember
        // the dragged position so the next X load restores it; a card
        // that was never dragged always returns to bottom-right.
        if (moved) {
          try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ qrhToolbarPos: {
                left: parseInt(card.style.left || '0', 10) || 0,
                top: parseInt(card.style.top || '0', 10) || 0
              } });
            }
          } catch (e2) { /* storage unavailable: position just won't persist */ }
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }, true);
  }

  // v1.2.5: persistent toolbar, built ONCE when X loads, never
  // recreated per reply click. Default position is fixed at
  // bottom-right, slightly lower (right 20px, bottom 20px, computed
  // as left/top in px so dragging works without a transform jump).
  // It appears on X load in an idle state, stays in exactly the
  // same place when a reply is clicked (only a header drag moves
  // it), and returns to idle — it does NOT disappear — when the
  // composer closes. Purple theme and title "本地回复" unchanged.
  function buildPersistentToolbar() {
    if (toolbarEl) { refreshToolbarActive(); return toolbarEl; }
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'qrh-toolbar';
    toolbarEl.setAttribute('data-qrh', 'toolbar');

    // Header row: title + local-only badge. This row is also the
    // drag handle (title attribute tells the user so).
    const header = document.createElement('div');
    header.className = 'qrh-header';
    header.title = '按住这里拖动工具条到任意位置';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'qrh-title';
    headerTitle.textContent = '本地回复';
    const headerBadge = document.createElement('span');
    headerBadge.className = 'qrh-badge';
    headerBadge.textContent = '本地模型 · 不上云';
    header.appendChild(headerTitle);
    header.appendChild(headerBadge);

    // Model switch row. Works in idle too: switching the model
    // only changes the selection (and, if a post is active, regenerates
    // once with the new model). It never generates with no post.
    const modelRow = document.createElement('div');
    modelRow.className = 'qrh-model-row';
    const modelTitle = document.createElement('span');
    modelTitle.className = 'qrh-row-label';
    modelTitle.textContent = '模型';
    modelRow.appendChild(modelTitle);
    MODELS.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qrh-btn qrh-model-btn' + (currentModel === m.id ? ' qrh-active' : '');
      b.textContent = m.label;
      b.dataset.qrhModel = m.id;
      b.title = '一点就切：管理器会自动停旧模型、起' + m.label + '（' + m.port + ' 端口）。日常只要 start-manager.bat 的黑窗口开着就行。';
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (toolbarSwitching || currentModel === m.id) return;
        // User rule (21:21): model buttons switch ONLY, never
        // regenerate. The 5 buttons below (4 styles + regenerate)
        // are the ones that clear, regenerate and fill.
        const prevModel = currentModel;
        // Model switch (21:25 fix): stop any generation that is
        // already running, but do NOT start a new one and do NOT
        // touch the composer text. A switch must not produce new
        // content on its own; the next style/regenerate click will
        // use the new model.
        if (state && state.generating) sendCancel();
        if (state) state.generating = false;
        pendingFill = null;
        toolbarSwitching = true;
        setModelButtonsDisabled(true);
        setStatus('正在切换模型，请稍等…（模型加载要十几秒到几十秒，跟手机加载模型一样，不是卡住了）', true);
        modelRow.querySelectorAll('.qrh-model-btn').forEach((x) => {
          x.classList.toggle('qrh-active', x.dataset.qrhModel === m.id);
        });
        try {
          chrome.runtime.sendMessage({ type: 'switch-model', model: m.id }, (resp) => {
            toolbarSwitching = false;
            setModelButtonsDisabled(false);
            if (resp && resp.ok) {
              currentModel = m.id;
              try {
                if (chrome.storage && chrome.storage.local) chrome.storage.local.set({ qrhModel: m.id });
              } catch (e) {}
              refreshToolbarActive();
              if (state) state.model = m.id;
              setStatus('已切换到' + m.label + '，点风格或重新生成才会重新生成。', false);
            } else if (resp && resp.manager === false) {
              // Manager not running: BACKUP path, not a silent switch.
              // Keep the new selection (so a manual start + regenerate
              // works) but do NOT auto-generate against a dead port.
              currentModel = m.id;
              try {
                if (chrome.storage && chrome.storage.local) chrome.storage.local.set({ qrhModel: m.id });
              } catch (e) {}
              refreshToolbarActive();
              setStatus(resp.error || '管理器没在跑，请先双击 start-manager.bat。');
            } else {
              // Manager ran but the switch failed: roll back highlight.
              currentModel = prevModel;
              refreshToolbarActive();
              setStatus(resp && resp.error ? resp.error : '切换模型失败，已回落到原模型，请看管理器黑窗口。');
            }
          });
        } catch (e) {
          toolbarSwitching = false;
          setModelButtonsDisabled(false);
          currentModel = prevModel;
          refreshToolbarActive();
          setStatus('切换模型失败（扩展消息发送失败），已回落到原模型。');
        }
      });
      modelRow.appendChild(b);
    });
    const modelNote = document.createElement('span');
    modelNote.className = 'qrh-model-note';
    modelNote.textContent = '一点就切：日常只开 start-manager.bat 的黑窗口就行，加载要十几秒到几十秒，不是卡住了。';
    modelRow.appendChild(modelNote);

    const buttons = document.createElement('div');
    buttons.className = 'qrh-buttons qrh-style-row';
    const styleLabel = document.createElement('span');
    styleLabel.className = 'qrh-row-label';
    styleLabel.textContent = '风格';
    buttons.appendChild(styleLabel);
    STYLES.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qrh-btn' + (currentStyle === s.id ? ' qrh-active' : '');
      b.textContent = s.label;
      b.dataset.qrhStyle = s.id;
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        // 问题 4: during model switch, style clicks must
        // NOT generate against the old (being killed) model.
        if (toolbarSwitching) { setStatus('正在切换模型，请等切换完成再选风格。', false); return; }
        currentStyle = s.id;
        buttons.querySelectorAll('.qrh-btn').forEach((x) => {
          if (x.dataset.qrhStyle) x.classList.toggle('qrh-active', x.dataset.qrhStyle === s.id);
        });
        // v1.2.5 idle guard: with no selected post, a style click only
        // changes the selection and shows a hint. It must not generate
        // with no post, and must not error.
        if (!state || !activeEditor) {
          setStatus('还没有选帖子：先点某条帖子的评论图标，再选风格。', false);
          return;
        }
        state.style = s.id;
        generateAndFill(activeEditor, true);
      });
      buttons.appendChild(b);
    });

    const regen = document.createElement('button');
    regen.type = 'button';
    regen.className = 'qrh-btn qrh-regen';
    regen.textContent = '重新生成';
    regen.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (toolbarSwitching) { setStatus('正在切换模型，请等切换完成再点重新生成。', false); return; }
      if (!state || !activeEditor) {
        setStatus('还没有选帖子：先点某条帖子的评论图标，再点重新生成。', false);
        return;
      }
      generateAndFill(activeEditor, true);
    });
    buttons.appendChild(regen);

    statusEl = document.createElement('div');
    statusEl.className = 'qrh-status';
    const statusDot = document.createElement('span');
    statusDot.className = 'qrh-status-dot';
    statusDot.setAttribute('aria-hidden', 'true');
    const statusText = document.createElement('span');
    statusText.className = 'qrh-status-text';
    statusText.textContent = '点某条帖子的评论图标开始生成';
    statusEl.appendChild(statusDot);
    statusEl.appendChild(statusText);

    toolbarEl.appendChild(header);
    toolbarEl.appendChild(modelRow);
    toolbarEl.appendChild(buttons);
    toolbarEl.appendChild(statusEl);

    document.body.appendChild(toolbarEl);
    // Default: bottom-right, slightly lower — right 20px, bottom 20px,
    // expressed as left/top in px (drag code works in left/top).
    const cardWidth = toolbarEl.offsetWidth || 520;
    const cardHeight = toolbarEl.offsetHeight || 220;
    toolbarEl.style.left = Math.max(0, window.innerWidth - cardWidth - 20) + 'px';
    toolbarEl.style.top = Math.max(0, window.innerHeight - cardHeight - 20) + 'px';
    toolbarEl.style.right = 'auto';
    toolbarEl.style.bottom = 'auto';
    toolbarEl.style.transform = 'none';
    // Restore a dragged position if the user ever dragged it; if never
    // dragged, the bottom-right default above stands, every time.
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['qrhToolbarPos'], (r) => {
          const pos = r && r.qrhToolbarPos;
          if (pos && typeof pos.left === 'number' && typeof pos.top === 'number' && toolbarEl) {
            const w = toolbarEl.offsetWidth || 520;
            const h = toolbarEl.offsetHeight || 220;
            toolbarEl.style.left = Math.max(0, Math.min(pos.left, window.innerWidth - w)) + 'px';
            toolbarEl.style.top = Math.max(0, Math.min(pos.top, window.innerHeight - 40)) + 'px';
          }
        });
      }
    } catch (e) { /* keep bottom-right default */ }
    makeDraggable(toolbarEl, header);
    return toolbarEl;
  }

  function isComposerOpen(editor) {
    if (!editor || !document.contains(editor)) return false;
    try {
      const rects = editor.getClientRects();
      if (!rects || rects.length === 0) return false;
      if (editor.offsetParent === null && editor.offsetWidth === 0) return false;
    } catch (e) { return false; }
    return true;
  }
  function watchComposerClose(editor) {
    if (composerObserver) composerObserver.disconnect();
    composerObserver = new MutationObserver(() => {
      // X does not always remove the editor node when you exit a
      // reply: it can hide the dialog instead, leaving the node in
      // the DOM with stale state. In that case a later model switch
      // would regenerate the previous post. Treat a hidden editor
      // as closed, not just a removed one.
      if (!isComposerOpen(editor)) {
        cleanupComposer();
      }
    });
    composerObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  // Fill helper shared by the immediate and the drag-deferred paths.
  // Returns true only if the editor verifiably contains the NEW text
  // (and, on regenerate, no longer contains the OLD text). Callers
  // must set the status from this return value, never assume success.
  function attemptFill(editor, text, isRegen, taskId) {
    // Unified replace logic (user 22:48 spec items 4-5):
    // first click and style switch BOTH clear old content first,
    // then fill exactly once. Previously first click appended
    // (no clear) while style switch replaced (clear first) —
    // that is why first click duplicated and style switch did not.
    // Clearing is not a fill; it is one clear + one fill, total.
    const existing = (editor.innerText || editor.textContent || '').trim();
    if (existing) {
      try { editor.focus(); } catch (e) {}
      try { document.execCommand('selectAll', false, null); } catch (e) {}
      try { document.execCommand('delete', false, null); } catch (e) {}
      try { editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch (e) {}
      const afterClear = (editor.innerText || editor.textContent || '').trim();
      if (afterClear) {
        while (editor.firstChild) editor.removeChild(editor.firstChild);
        try { editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch (e) {}
      }
    }
    qrhLog('write', taskId, 'attemptFill isRegen=' + isRegen + ' existingLen=' + existing.length);
    const filled = fillEditor(editor, text);
    const afterText = (editor.innerText || editor.textContent || '').trim();
    qrhLog('fill', taskId, 'filled=' + filled + ' afterLen=' + afterText.length + ' textLen=' + text.trim().length);
    if (!filled || !afterText.startsWith(text.trim()) || afterText.length > text.trim().length + 10) { qrhLog('fill', taskId, 'FULL_TEXT_MISMATCH afterLen=' + afterText.length + ' textLen=' + text.trim().length); return false; }
    // If afterText is exactly text+text, that is a duplicate write
    // that must be reported, NOT masked by deleting a copy and
    // refilling. Return false so the caller does not mark it success.
    if (afterText === (text.trim() + text.trim())) {
      qrhLog('fill', taskId, 'DUPLICATE_WRITE afterText==text+text, not refilling');
      return false;
    }
    return true;
  }


  // DOM identification (user 23:12, from 1.6.0):
  // Do NOT identify a reply box by its text ("Replying to" / "回复 @").
  // Text changes with language/UI. Identify by DOM structure only:
  // a reply box lives inside div[role="dialog"] that contains a
  // tweetTextarea_0 editor, while the top new-tweet composer does
  // not live in a dialog at all. Author is read from the dialog's
  // own article DOM (its header link), not from "Replying to" text.
  function isReplyDialogEl(dialog) {
    if (!dialog || dialog.getAttribute('role') !== 'dialog') return false;
    return !!dialog.querySelector('div[data-testid="tweetTextarea_0"]');
  }
  function dialogAuthorHandle(dialog) {
    if (!dialog) return '';
    const art = dialog.querySelector('article[data-testid="tweet"]');
    if (!art) return '';
    const links = art.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/([A-Za-z0-9_]+)$/);
      if (m) return '@' + m[1];
    }
    return '';
  }
  function findEditorHolding(text) {
    if (!text) return null;
    const head = text.slice(0, 10);
    const editors = document.querySelectorAll('div[contenteditable="true"]');
    for (const el of editors) {
      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt || !txt.includes(head)) continue;
      const dialog = el.closest('div[role="dialog"]');
      if (!isReplyDialogEl(dialog)) continue;
      if (state && state.postAuthor) {
        const da = dialogAuthorHandle(dialog);
        if (da && da !== state.postAuthor) continue;
      }
      return el;
    }
    return null;
  }
  function findVisibleReplyEditor() {
    const editors = document.querySelectorAll('div[data-testid="tweetTextarea_0"], div[contenteditable="true"]');
    for (const el of editors) {
      if (!document.contains(el)) continue;
      const rect = el.getClientRects && el.getClientRects()[0];
      if (!rect || rect.width === 0) continue;
      const dialog = el.closest('div[role="dialog"]');
      if (!isReplyDialogEl(dialog)) continue;
      if (state && state.postAuthor) {
        const da = dialogAuthorHandle(dialog);
        if (da && da !== state.postAuthor) continue;
      }
      return el;
    }
    return null;
  }
  function isReplyEditor(editor) {
    if (!editor || !document.contains(editor)) return false;
    const dialog = editor.closest('div[role="dialog"]');
    if (!isReplyDialogEl(dialog)) return false;
    if (state && state.postAuthor) {
      const da = dialogAuthorHandle(dialog);
      if (da && da !== state.postAuthor) return false;
    }
    return true;
  }
  function dedupeText(text) {
    if (!text) return text;
    const s = text.trim();
    // Exact half-repeat: first half == second half
    if (s.length % 2 === 0) {
      const half = s.slice(0, s.length / 2);
      if (half && s.slice(s.length / 2) === half) return half;
    }
    // Sentence-repeat: split by Chinese/English sentence enders,
    // drop a second consecutive identical sentence run.
    const parts = s.split(/(?<=[。！？!?.])\s*/).filter(Boolean);
    if (parts.length >= 2) {
      const out = [];
      for (const part of parts) {
        if (out.length && out[out.length - 1] === part) continue;
        // If the whole output is just the same sentence twice
        if (out.length === 1 && parts.length === 2 && parts[0] === parts[1]) break;
        out.push(part);
        if (out.join('') === s.slice(0, out.join('').length) && parts.slice(out.length).join('') === out.join('')) break;
      }
      const joined = out.join('');
      if (joined && s.startsWith(joined) && s.slice(joined.length).trim() === joined.trim()) return joined;
      if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
    }
    return s;
  }
  function generateAndFill(editor, isRegen) {
    if (!state) return;
    if (isRegen && !isComposerOpen(editor)) {
      cleanupComposer();
      setStatus('回复框已经关了：先点某条帖子的评论图标，再选风格。', false);
      return;
    }
    // Single-flight: cancel the previous fetch first, and discard
    // any unflushed drag-deferred fill from an older generation —
    // a superseded fill must never land in a newer composer.
    pendingFill = null;
    if (isRegen && !isReplyEditor(editor)) {
      // Retargeting below may still pick the top composer; do not
      // let it proceed. The visible-dialog search runs next.
    }
    if (isRegen) {
      // User confirmed 22:04: second click must change the reply
      // box, never the top post box. Retargeting to "first visible"
      // or "holder of previous text" is what moved the fill to the
      // top post box, because the top box is first in DOM order and
      // also holds the previous text. So: use the original editor
      // from the bubble click, and nothing else, unless that editor
      // is gone from the page. No retargeting, no holder search.
      if (!editor || !document.contains(editor)) {
        // Original editor gone: only then try the reply dialog for
        // the same person, never the top post box.
        const visible = findVisibleReplyEditor();
        if (visible) { editor = visible; activeEditor = visible; }
      }
    }
    if (isRegen && !isReplyEditor(editor)) {
      cleanupComposer();
      setStatus('找不到正在回复的那个人的回复框，已停下来没填，请关掉顶部发帖框、重新点气泡再试。', false);
      return;
    }
    if (state.generating) sendCancel();
    const mySeq = generationSeq;
    // Reuse the taskId set at click time if present (problem 1).
    // Creating a new taskId here would let an old callback pass
    // the check while the new state had no taskId yet.
    const myTaskId = (state.taskId && !isRegen) ? state.taskId : ((state.postId || 'post') + ':' + (state.style || 'natural') + ':' + (state.model || 'new') + ':' + (++taskCounter));
    state.taskId = myTaskId;
    if (state) state.pending = false;
    state.generating = true;
    qrhLog('ai', myTaskId, 'generate start isRegen=' + isRegen);
    setStatus('本地生成中…');
    const postText = state.postText;
    const style = state.style;
    const model = state.model || 'new';
    try {
      chrome.runtime.sendMessage(
        { type: 'generate', postText: postText, style: style, model: model },
        async (resp) => {
          if (!state || mySeq !== generationSeq || (state.taskId && state.taskId !== myTaskId)) return; // superseded
          if (filledTaskIds.has(myTaskId)) { qrhLog('fill', myTaskId, 'IGNORED second fill for same taskId'); return; }
          state.generating = false;
          if (resp && resp.ok && resp.text) {
            // Do NOT delete a duplicate string here to mask the bug
            // (user 22:48 spec item 7). Log if the model itself
            // returned a duplicate, so the log proves model vs fill.
            const raw = resp.text.trim();
            const isModelDup = raw.length % 2 === 0 && raw.slice(0, raw.length / 2) === raw.slice(raw.length / 2);
            qrhLog('ai', myTaskId, 'generate done len=' + raw.length + ' modelDup=' + isModelDup);
            if (isModelDup) qrhLog('ai', myTaskId, 'MODEL returned duplicate text, fill will still be single-write');
            // (3) If a drag is in progress, do NOT fill against an
            // editor whose focus/selection the drag is holding, and
            // do NOT drop the result either: defer it to mouseup.
            // flushPendingFill (onUp) runs it once, verified, if the
            // editor is still present; if the composer closed in the
            // meantime, cleanupComposer already cleared pendingFill.
            if (dragInProgress && document.contains(editor)) {
              const pendingText = resp.text;
              const pendingRegen = isRegen;
              pendingFill = async () => {
                if (!state || !document.contains(editor)) return;
                const verified = await attemptFillAsync(editor, pendingText, pendingRegen, myTaskId);
                if (verified) filledTaskIds.add(myTaskId);
                if (verified && state) state.lastText = pendingText;
                setStatus(verified ? '已填入，可修改后点 Reply' : '填入失败，请再点一次重新生成');
              };
              setStatus('生成完成，松开鼠标后填入…', true);
            } else if (!document.contains(editor)) {
              setStatus('填入失败，请再点一次重新生成');
            } else {
              const verified = await attemptFillAsync(editor, resp.text, isRegen, myTaskId);
              if (verified) filledTaskIds.add(myTaskId);
              if (verified && state) state.lastText = resp.text;
              setStatus(verified ? '已填入，可修改后点 Reply' : '填入失败，请再点一次重新生成');
            }
          } else if (resp && resp.cancelled) {
            setStatus('已取消生成。');
          } else {
            // Background already names the exact model service + script
            // (e.g. 旧 4B 服务未启动：请双击 start-qwen-35-4b.bat…).
            // Show it verbatim instead of a generic "service not started".
            setStatus(resp && resp.error ? resp.error : '本地服务未启动：请先启动电脑本地服务');
          }
        }
      );
    } catch (e) {
      state.generating = false;
      setStatus('本地服务未启动：请先启动电脑本地服务');
    }
  }

  function extractAuthorHandle(article) {
    if (!article) return '';
    const link = article.querySelector('a[href^="/"]');
    // Author handle is the first /<handle> link in the article header
    const links = article.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/([A-Za-z0-9_]+)$/);
      if (m) return '@' + m[1];
    }
    return '';
  }
  document.addEventListener('click', async (event) => {
    const replyBtn = event.target && event.target.closest
      ? event.target.closest('button[data-testid="reply"]')
      : null;
    if (!replyBtn) return;

    const article = replyBtn.closest('article[data-testid="tweet"]');
    if (!article) return;

    const postText = extractPostText(article);
    const postId = extractStatusId(article);
    if (!postText) return;

    // v1.2.5: the SAME persistent toolbar is reused for every post.
    // It is not recreated, not moved, and not repositioned here.
    ensureToolbar();
    const style = currentStyle || 'natural';
    const model = currentModel || 'new';

    qrhLog('click', null, 'bubble postId=' + postId + ' style=' + style + ' model=' + model);
    // 问题 1+2 (from 1.6.2): previously the old task was
    // only invalidated AFTER waitForComposer (up to 5s later), and
    // generating=true was only set after the box opened. So a second
    // click before the box opened, or an old task returning before
    // the new task started, could both pass the check and both call
    // AI, filling the same box twice.
    // Fix: invalidate + lock IMMEDIATELY at click time, before await.
    // Same post while pending/generating = ignore. Different post =
    // cancel old, set new pending taskId right now, so any old
    // callback (myTaskId !== state.taskId) is rejected instantly.
    if (state && (state.pending || state.generating) && state.postId === postId && state.style === style && state.model === model) {
      return;
    }
    generationSeq++;
    pendingFill = null;
    if (state && (state.pending || state.generating)) sendCancel();
    const clickTaskId = postId + ':' + style + ':' + model + ':' + (++taskCounter);
    state = { postId: postId, postText: postText, postAuthor: extractAuthorHandle(article), style: style, model: model, generating: false, pending: true, taskId: clickTaskId };

    // X opens its native composer asynchronously; wait for it (max 5s).
    const editor = await waitForComposer(5000);
    if (!state || state.postId !== postId) return; // user moved on meanwhile
    if (!editor) {
      setStatus('未找到 X 回复框，请重试。');
      state = null;
      activeEditor = null;
      return;
    }

    // Post-match guard (问题 3): author alone is not
    // enough — two posts by the same author share an author.
    // The dialog's own postId/postText must match the clicked post.
    const clickedAuthor = extractAuthorHandle(article);
    const dialog = editor.closest('div[role="dialog"]');
    if (dialog) {
      const da = dialogAuthorHandle(dialog);
      if (da && clickedAuthor && da !== clickedAuthor) {
        state = null; activeEditor = null;
        setStatus('请先关掉上一个回复框，再点这条帖子的气泡，不然会发给上一个人。', false);
        return;
      }
      const dId = dialogPostId(dialog);
      if (dId && postId && dId !== postId) {
        state = null; activeEditor = null;
        setStatus('请先关掉上一个回复框，再点这条帖子的气泡，不然会发给上一个人。', false);
        return;
      }
      if (!dId && postText) {
        const dText = dialogPostText(dialog);
        if (dText && dText !== postText) {
          state = null; activeEditor = null;
          setStatus('请先关掉上一个回复框，再点这条帖子的气泡，不然会发给上一个人。', false);
          return;
        }
      }
    }
    if (state) state.pending = false;
    activeEditor = editor;
    watchComposerClose(editor);
    generateAndFill(editor, false);
  }, true);

  // v1.2.5: show the toolbar as soon as X loads, in idle state —
  // before any reply click. It stays at bottom-right (or the user's
  // dragged position) and only starts generating after a reply click.
  if (document.body) {
    ensureToolbar();
  } else {
    document.addEventListener('DOMContentLoaded', ensureToolbar, { once: true });
  }
})();

}
