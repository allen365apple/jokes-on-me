'use strict';
(() => {
  const defaults = {
    table: '你坐哪桌？',
    nick: '你的暱稱？',
    tags: '請想著一位你身邊的長輩，寫下他的三個 #標籤',
    romanticGesture: '曖昧對象做什麼行為，你會直接冷掉？',
    photo: '你手機相簿裡的一張照片',
    awkwardLine: '你聽過最尷尬的一句話是？',
    location: '你最想把討厭的人送去哪裡？',
    igStory: '寫下你只敢發給摯友看的一句話',
  };
  const fields = [
    ['table', 'Q1 桌號'],
    ['nick', 'Q2 暱稱'],
    ['tags', 'Q3 標籤'],
    ['romanticGesture', 'Q4 浪漫舉動'],
    ['photo', 'Q5 照片'],
    ['awkwardLine', 'Q6 聊天／金句'],
    ['location', 'Q7 地點'],
    ['igStory', 'Q8 限時動態'],
  ];
  const storageKey = () => `${window.ShowStore?.key || 'astra-v1:local'}:questions`;
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');
      return { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
    } catch (_) { return { ...defaults }; }
  }
  function apply(values) {
    fields.forEach(([key]) => {
      const el = document.querySelector(`[data-question="${key}"]`);
      if (el) el.textContent = values[key];
    });
  }
  function save(values) {
    const next = { ...defaults, ...values };
    try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch (_) {}
    apply(next);
    return next;
  }
  function renderEditor(values) {
    const container = document.querySelector('#questionEditorFields');
    if (!container) return;
    container.replaceChildren();
    fields.forEach(([key, label]) => {
      const wrap = document.createElement('label');
      wrap.className = 'question-editor-field';
      wrap.textContent = label;
      const input = document.createElement('textarea');
      input.rows = key === 'tags' || key === 'igStory' ? 2 : 1;
      input.value = values[key];
      input.dataset.questionField = key;
      wrap.append(input);
      container.append(wrap);
    });
  }
  function init() {
    const values = read();
    apply(values);
    if (new URLSearchParams(location.search).get('edit') !== '1') return;
    const editor = document.querySelector('#questionEditor');
    if (!editor) return;
    editor.hidden = false;
    renderEditor(values);
    document.querySelector('#saveQuestions').onclick = () => {
      const next = {};
      document.querySelectorAll('[data-question-field]').forEach(input => {
        const value = input.value.trim();
        if (value) next[input.dataset.questionField] = value;
      });
      save(next);
      document.querySelector('#questionSaveStatus').textContent = '題目已儲存於這台裝置。';
      renderEditor(read());
    };
    document.querySelector('#resetQuestions').onclick = () => {
      save(defaults);
      renderEditor(defaults);
      document.querySelector('#questionSaveStatus').textContent = '已恢復預設題目。';
    };
  }
  window.ShowQuestions = { defaults, fields, read, save, init };
})();
