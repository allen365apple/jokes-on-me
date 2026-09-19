'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const { fields, names, valid, createDeck } = ShowCore;
let deck;
const SESSION_KEY = 'jinder-show-v1:' + (SHOW_CONFIG.room || 'default');
let session = { round: 1, status: 'choosing', history: [], pair: [] };
let editingPair = false;
let savedShow = null;
try { savedShow = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (_) {}
if (savedShow?.session && [1,2,3].includes(savedShow.session.round)) session = savedShow.session;
const decks = {
  live: createDeck(Math.random, savedShow?.decks?.live || {}, () => queueMicrotask(saveShow)),
  trial: createDeck(Math.random, savedShow?.decks?.trial || {}, () => queueMicrotask(saveShow))
};
deck = decks.live;
let cast = CAST_PROFILES.map(p => ({...p}));
try {
  const saved = JSON.parse(localStorage.getItem('astra-cast') || 'null');
  if (Array.isArray(saved)) cast = cast.map(p => {
    const prior=saved.find(s=>s.id===p.id);
    const savedImage = prior?.image;
    const keepCustomImage = savedImage && (savedImage.startsWith('data:') || savedImage === p.image);
    return prior ? {...p, name: /待設定|待確認/.test(prior.name) ? p.name : (prior.name || p.name), image: keepCustomImage ? savedImage : p.image, crop: prior.crop || p.crop} : p;
  });
} catch (_) {}
let selected = [], phase = 'selection', intro = -1, focus = 0, currentCue = 0;
let liveRecords = [], records = [], actorTags = {}, trialMode = false, toastTimer, offset = 0;
let profileImagesReady = false, profilePreloadRun = 0;
let profileImageTotal = 0, profileImageLoaded = 0, profileImageFailed = 0;
trialMode = savedShow?.trialMode === true;
deck = trialMode ? decks.trial : decks.live;
selected = session.pair.filter(id => cast.some(p => p.id === id));
actorTags = savedShow?.actorTags || {};
if (trialMode) records = window.TRIAL_RESPONSES || [];
/** 保存本場回合與兩份題庫進度；不修改投稿資料。 */
function saveShow() {
  session.pair = [...selected];
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({session, actorTags, trialMode, decks: {live: decks.live.snapshot(), trial: decks.trial.snapshot()}})); }
  catch (_) { notice('進度無法儲存，請勿重新整理頁面'); }
}
addEventListener('pagehide', saveShow);
const photos = new Map(), loading = new Set();
let submissionImageSources = new Set();
let submissionImageStates = new Map();
let sound = true;
let lastStoryStyle = -1;
const DEFAULT_CROP = { x: 50, y: 8, zoom: 1.08 };
const storyStyles = [
  {color:'#fff4b8', angle:-4}, {color:'#ffabc8', angle:3},
  {color:'#aee9ff', angle:-3}, {color:'#c6ffce', angle:4},
  {color:'#dec5ff', angle:-5}, {color:'#ffffff', angle:2}
];
const sting = new Audio('音效/換頁閃亮音效.mp3');
const bgm = new Audio('音效/開頭戀愛音樂.mp3');
const ending = new Audio('音效/結尾戀愛音樂.mp3');
const DEFAULT_AUDIO_VOLUMES = Object.freeze({sting: 1, bgm: .3, ending: .5});
const AUDIO_VOLUME_KEY = 'jinder-audio-volumes';
function clampVolume(value, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback; }
function loadAudioVolumes() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_VOLUME_KEY) || 'null');
    return {...DEFAULT_AUDIO_VOLUMES, ...Object.fromEntries(Object.keys(DEFAULT_AUDIO_VOLUMES).map(key => [key, clampVolume(saved?.[key], DEFAULT_AUDIO_VOLUMES[key])]))};
  } catch (_) { return {...DEFAULT_AUDIO_VOLUMES}; }
}
let audioVolumes = loadAudioVolumes();
const OPENING_FADE_KEY = 'jinder-opening-fade-seconds-v2';
const OPENING_FADE_DURATION = 2000;
function loadOpeningFadeSeconds() {
  const saved = localStorage.getItem(OPENING_FADE_KEY);
  if (saved === null) return 1;
  const value = Number(saved);
  return Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 1;
}
let openingFadeSeconds = loadOpeningFadeSeconds();
let openingMusicMode = 'idle', openingFadeTimer = 0, openingFadeFrame = 0;
bgm.loop = true; sting.volume = audioVolumes.sting; bgm.volume = audioVolumes.bgm; ending.volume = audioVolumes.ending;
sting.preload = 'auto'; bgm.preload = 'none'; ending.preload = 'none';
/** 將使用者提供的文字安全放入 DOM。 */
function text(selector, value) { const el = $(selector); if (el) el.textContent = value; }
function notice(message) { text('#toast', message); $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800); }
function person() { return cast.find(p => p.id === selected[focus]); }
function cropOf(p) {
  const crop = p?.crop || {};
  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    x: Math.max(0, Math.min(100, number(crop.x, DEFAULT_CROP.x))),
    y: Math.max(0, Math.min(100, number(crop.y, DEFAULT_CROP.y))),
    zoom: Math.max(1, Math.min(1.8, number(crop.zoom, DEFAULT_CROP.zoom)))
  };
}
function applyCrop(container, p) {
  if (!container) return;
  const crop = cropOf(p);
  container.style.setProperty('--crop-x', crop.x + '%');
  container.style.setProperty('--crop-y', crop.y + '%');
  container.style.setProperty('--crop-zoom', crop.zoom);
  const img = container.querySelector('img');
  if (img) {
    img.style.objectPosition = crop.x + '% ' + crop.y + '%';
    img.style.transform = 'scale(' + crop.zoom + ')';
    img.style.transformOrigin = '50% 50%';
  }
}
function avatar(container, p) {
  container.dataset.actor = p.id;
  applyCrop(container, p);
  container.textContent = p.name.slice(0,1);
  const image = selectionImageSource(p);
  if (!image) return;
  const img = new Image(); img.alt = p.name; img.decoding = 'async'; img.src = image;
  img.onload = () => { container.replaceChildren(img); applyCrop(container, p); };
}
function profileImageSource(p) { return p?.image || ''; }
function selectionImageSource(p) { return p?.image?.startsWith('data:') ? p.image : (p?.selectionImage || p?.image || ''); }
function updateLoadStatus() {
  const el = $('#loadStatus');
  if (!el) return;
  const profileDone = profileImageTotal === 0 || profileImageLoaded >= profileImageTotal;
  const profileText = profileDone && profileImageFailed ? '角色圖片：' + profileImageLoaded + ' / ' + profileImageTotal + ' 張已載入（' + profileImageFailed + ' 張失敗）' : profileDone ? '角色圖片：' + profileImageTotal + ' 張已載入' : '角色圖片：正在載入 ' + profileImageLoaded + ' / ' + profileImageTotal + ' 張';
  const sources = [...submissionImageSources];
  const loaded = sources.filter(source => submissionImageStates.get(source) === 'loaded').length;
  const failed = sources.filter(source => submissionImageStates.get(source) === 'error').length;
  const imageLabel = trialMode ? '試玩圖片' : '投稿圖片';
  let submissionText = imageLabel + '：0 張';
  if (sources.length && loaded + failed < sources.length) submissionText = imageLabel + '：正在載入 ' + loaded + ' / ' + sources.length + ' 張';
  else if (sources.length && failed) submissionText = imageLabel + '：' + loaded + ' / ' + sources.length + ' 張已載入（' + failed + ' 張失敗）';
  else if (sources.length) submissionText = imageLabel + '：' + sources.length + ' 張已載入';
  el.textContent = profileText + ' · ' + submissionText;
}
function preloadCastImages() {
  const run = ++profilePreloadRun;
  profileImagesReady = false;
  const profileSources = [...new Set(cast.map(profileImageSource).filter(Boolean))];
  const profileSourceSet = new Set(profileSources);
  profileImageTotal = profileSources.length;
  profileImageLoaded = 0;
  profileImageFailed = 0;
  updateLoadStatus();
  const sources = [...new Set(cast.flatMap(p => [profileImageSource(p), selectionImageSource(p)]).filter(Boolean))];
  const jobs = sources.map(source => new Promise(resolve => {
    let finished = false;
    const finish = state => {
      if (finished) return;
      finished = true;
      if (run === profilePreloadRun && profileSourceSet.has(source)) {
        if (state === 'error') profileImageFailed += 1;
        else profileImageLoaded += 1;
        updateLoadStatus();
      }
      resolve();
    };
    const image = new Image(); image.decoding = 'async'; image.loading = 'eager'; image.fetchPriority = 'high';
    image.onload = () => {
      if (typeof image.decode === 'function') image.decode().catch(() => {}).finally(() => finish('loaded'));
      else finish('loaded');
    };
    image.onerror = () => finish('error');
    image.src = source;
  }));
  Promise.all(jobs).then(() => {
    if (run !== profilePreloadRun) return;
    profileImagesReady = true;
    updateLoadStatus();
    renderSelection();
  });
}
function renderSelection() {
  const locked = new Set(session.history.flat());
  const playing = session.status === 'playing';
  text('.selection-heading h1', session.status === 'finished' ? '三回合完成' : ['第一','第二','第三'][session.round-1] + '回合：' + (playing && !editingPair ? '本回合主角' : '請選擇兩位主角'));
  $('#castGrid').replaceChildren();
  cast.forEach(p => {
    const button = document.createElement('button'); button.className = 'cast-card';
    const order = selected.indexOf(p.id);
    button.disabled = locked.has(p.id) || session.status === 'finished' || (playing && !editingPair);
    button.classList.toggle('played', locked.has(p.id));
    button.classList.toggle('selected', order >= 0); button.setAttribute('aria-pressed', String(order >= 0));
    const pic = document.createElement('div'); pic.className = 'cast-portrait'; avatar(pic,p);
    const name = document.createElement('strong'); name.textContent = p.name;
    button.append(pic, name);
    if (locked.has(p.id)) { const label = document.createElement('span'); label.className='played-label'; label.textContent='已登場'; button.append(label); }
    if (order >= 0) { const n = document.createElement('span'); n.className = 'order'; n.textContent = order+1; button.append(n); }
    button.onclick = () => {
      if (selected.includes(p.id)) selected = selected.filter(id => id !== p.id);
      else if (selected.length < 2) selected.push(p.id);
      else { notice('已選兩位，請先取消其中一位'); return; }
      renderSelection();
      saveShow();
    };
    $('#castGrid').append(button);
  });
  text('#selectionCount', '已選 ' + selected.length + ' / 2');
  renderPairPreview();
  $('#start').hidden = session.status === 'finished';
  $('#start').disabled = selected.length !== 2 || !profileImagesReady;
  text('#start', editingPair ? '確認人選' : playing ? '繼續本回合' : '開始 →');
  $('#nextRound').hidden = !playing || editingPair;
  text('#nextRound', session.round === 3 ? '結束本場' : '下一回合 →');
  $('#endShow').hidden = !(session.status === 'playing' || session.history.length > 0);
  $('#newShow').hidden = session.status !== 'finished';
}
function resetMemberTags() {
  $$('#memberTags button').forEach((button, index) => {
    const key = document.createElement('kbd'); key.textContent = String(index + 1);
    button.replaceChildren(key, document.createTextNode('待定'));
    button.removeAttribute('aria-label'); button.removeAttribute('title');
  });
}
/** 預覽這場選中的兩位角色，照片與名字使用同一份演員資料。 */
function renderPairPreview() {
  const preview = $('#pairPreview');
  preview.replaceChildren();
  [0,1].forEach(index => {
    const slot = document.createElement('div'); slot.className = 'pair-slot';
    const portrait = document.createElement('div'); portrait.className = 'pair-portrait';
    const label = document.createElement('strong');
    const actor = cast.find(p => p.id === selected[index]);
    if (actor) { avatar(portrait, actor); label.textContent = actor.name; slot.classList.add('filled'); }
    else { portrait.textContent = '+'; label.textContent = '主角 ' + (index+1); }
    slot.append(portrait,label); preview.append(slot);
  });
}
/** 收掉投稿 QR 頁，同時把頂端的劇名還原。 */
function hideQR() {
  $('#qrScreen').classList.remove('show');
  document.body.classList.remove('qr-open');
}
function switchScene(cue) {
  const leavingTitle = !$('#titleScreen').hidden;
  $('#selection').hidden = true; $('#standby').hidden = true; $('#stage').hidden = false;
  hideQR();$('#titleScreen').hidden=true;
  $$('.scene').forEach(el => el.classList.toggle('active', Number(el.dataset.scene) === cue));
  $$('#cueButtons button').forEach(b => b.classList.toggle('active', Number(b.dataset.cue) === cue));
  $$('#memberTags button').forEach(b => {
    const active = cue === 1 && Number(b.dataset.member) === focus;
    b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
  });
  if (leavingTitle) scheduleOpeningFade();
}

function credit(r) { text('#credit', r ? '感謝 ' + (r.table || '') + ' ' + r.nick + ' 提供答案' : '今晚的主角 · ' + person().name); }
function drawTags() { return deck.draw('tags', records, r => valid('tags',r.tags)); }
function renderProfile() {
  switchScene(1); currentCue = 1;
  const p = person(); text('#actorName',p.name); text('#actorFallback',p.name.slice(0,1));
  $('#actorPhoto').hidden = true; $('#actorFallback').hidden = false;
  if (p.image) {
    const img = $('#actorPhoto'); img.onload = () => { img.hidden=false; $('#actorFallback').hidden=true; };
    img.onerror = () => { img.hidden=true; $('#actorFallback').hidden=false; }; img.src=p.image;
    applyCrop($('.portrait-panel'), p);
  }
  const r = actorTags[p.id]; $('#tags').replaceChildren();
  (r ? r.tags : ['等待觀眾投稿']).forEach(tag => { const span=document.createElement('span'); span.textContent='#'+tag.replace(/^#+/,''); $('#tags').append(span); });
  credit(r); fit();
}
function begin() {
  if (selected.length !== 2) return;
  if (session.status === 'finished') return;
  if (session.status === 'playing') {
    editingPair=false; phase='free'; focus=0;
    selected.forEach(id => { if (!actorTags[id]) actorTags[id]=drawTags(); });
    syncMemberButtons(); saveShow(); showTitle();
    $('#selection').hidden=true;
    return;
  }
  session.status='playing';
  document.activeElement?.blur();
  phase='intro'; intro=-1; focus=0; currentCue=0; actorTags={};
  selected.forEach(id => { actorTags[id] = drawTags(); });
  $$('#memberTags button').forEach((b,i)=>{
    const name=cast.find(p=>p.id===selected[i]).name;
    const key=document.createElement('kbd');key.textContent=i+1;
    b.replaceChildren(key,document.createTextNode(name));
    b.setAttribute('aria-label',name+' 的標籤');
    b.title='切換此成員的標籤；同頁再按一次重新抽取';
  });
  $('#selection').hidden=true; $('#standby').hidden=false; $('#stage').hidden=true;
  text('#standbyNames',selected.map(id=>cast.find(p=>p.id===id).name).join(' × '));
  showTitle();
  startOpeningMusic();
  text('#credit','按 1／2 選擇主角，或 Space 依序登場');
  saveShow();
}
/** 同步底部兩位主角按鈕。 */
function syncMemberButtons() {
  $$('#memberTags button').forEach((b,i) => {
    const key=document.createElement('kbd'); key.textContent=i+1;
    b.replaceChildren(key,document.createTextNode(cast.find(p=>p.id===selected[i])?.name || '待定'));
  });
}
/** 明確結束本回合，才鎖定人選並進入下一回合。 */
function nextRound() {
  if (session.status !== 'playing' || editingPair) return;
  session.history.push([...selected]); selected=[]; actorTags={};
  if (session.round === 3) session.status='finished';
  else { session.round++; session.status='choosing'; }
  saveShow(); goHome();
}
/** 新一場只重設演出進度，保留觀眾投稿。 */
function newShow(message='開始新一場？將重設角色與抽題進度，觀眾投稿保留。') {
  if (!confirm(message)) return;
  session={round:1,status:'choosing',history:[],pair:[]}; selected=[]; actorTags={}; editingPair=false;
  decks.live.reset(); decks.trial.reset(); saveShow(); goHome();
}
function advance() {
  document.activeElement?.blur();
  if (phase === 'selection') return;
  if (phase === 'intro') {
    intro++; focus=Math.min(intro,1); renderProfile();
    if (intro>=1) { phase='free'; notice('兩位主角登場完成，1、2 切主角，3–8 切 Cue'); }
    else notice('再按 Space / Enter，第二位主角登場');
  }
}
function focusActor(next) { memberTag(next); }
/** 每次切換 Cue 都從目前來源抽一筆尚未使用的答案。 */
function drawCue(cue) {
  if (phase==='selection') { notice('請先選擇兩位主角並開始'); return; }
  phase='free';
  $('#toast').classList.remove('visible');
  const field=fields[cue]; let r;
  if (cue===1) { r=drawTags(); if(r) actorTags[person().id]=r; renderProfile(); if(!r) notice('尚無標籤答案'); else playSting(); return; }
  r=deck.draw(field,records,x=>valid(field,x[field])&&(field!=='photo'||trialMode||photos.has(x.photo)));
  if (!r) { notice(field==='photo'?'尚無就緒照片，請先投稿或等待載入':'這一題還沒有答案'); return; }
  currentCue=cue; switchScene(cue);
  if (field==='photo') { const img=$('#albumImage'); img.src=r.photo;
    const dimensions=photos.get(r.photo); img.classList.toggle('portrait',Boolean(dimensions && dimensions.h>=dimensions.w)); }
  else text('[data-answer="'+cue+'"]',r[field]);
  if(cue===5) styleStory();
  credit(r); fit(); playSting();
}
/** 指定成員：先展示既有標籤；同頁再按才重抽，不影響另一位。 */
function memberTag(index) {
  if(phase==='selection'){notice('請先選擇兩位主角並開始');return;}
  phase='free';
  if(focus===index && currentCue===1 && !$('#qrScreen').classList.contains('show') && $('#titleScreen').hidden) drawCue(1);
  else {playSting();focus=index;renderProfile();}
}
function playSting() {
  if(!sound)return;
  sting.pause(); sting.currentTime=0;
  sting.play().catch(()=>notice('音效無法播放'));
}
function clearOpeningFade() {
  clearTimeout(openingFadeTimer); openingFadeTimer = 0;
  cancelAnimationFrame(openingFadeFrame); openingFadeFrame = 0;
}
function startOpeningMusic() {
  clearOpeningFade(); openingMusicMode = 'auto';
  bgm.currentTime = 0; bgm.volume = audioVolumes.bgm;
  bgm.play().catch(()=>notice('開頭音樂無法自動播放，請按 O 播放'));
}
function scheduleOpeningFade() {
  if (openingMusicMode !== 'auto' || openingFadeTimer || openingFadeFrame) return;
  openingFadeTimer = setTimeout(() => {
    openingFadeTimer = 0;
    const startedAt = performance.now(), startVolume = bgm.volume;
    if (bgm.paused) { openingMusicMode = 'idle'; return; }
    const fade = now => {
      const progress = Math.min(1, (now - startedAt) / OPENING_FADE_DURATION);
      bgm.volume = Math.max(0, startVolume * (1 - progress));
      if (progress < 1) openingFadeFrame = requestAnimationFrame(fade);
      else { openingFadeFrame = 0; bgm.pause(); bgm.currentTime = 0; bgm.volume = audioVolumes.bgm; openingMusicMode = 'idle'; }
    };
    openingFadeFrame = requestAnimationFrame(fade);
  }, openingFadeSeconds * 1000);
}
function stopOpeningMusic() {
  clearOpeningFade(); openingMusicMode = 'idle'; bgm.pause(); bgm.currentTime = 0; bgm.volume = audioVolumes.bgm;
}
function styleStory() {
  const choices=storyStyles.map((s,i)=>i).filter(i=>i!==lastStoryStyle);
  lastStoryStyle=choices[Math.floor(Math.random()*choices.length)];
  const style=storyStyles[lastStoryStyle], el=$('.story-answer');
  el.style.color=style.color;el.style.setProperty('--story-angle',style.angle+'deg');
}
/** 收到圖片後先解碼；未成功載入的照片不進入抽選池。 */
function preload(records) {
  submissionImageSources = new Set(records.filter(r => valid('photo', r.photo)).map(r => r.photo));
  records.forEach(r => {
    if (!valid('photo',r.photo)||photos.has(r.photo)||loading.has(r.photo)) return;
    if (submissionImageStates.get(r.photo) === 'error') return;
    loading.add(r.photo); submissionImageStates.set(r.photo, 'loading');
    const img=new Image();
    const finish = state => {
      if (state === 'loaded') photos.set(r.photo,{w:img.naturalWidth,h:img.naturalHeight});
      submissionImageStates.set(r.photo, state);
      loading.delete(r.photo);
      updateLoadStatus();
    };
    img.onload=()=>finish('loaded');
    img.onerror=()=>finish('error'); img.src=r.photo;
  });
  updateLoadStatus();
}
/** 在過長答案時縮字，保留一般答案的大字尺寸。 */
function fit() {
  requestAnimationFrame(()=>{
    if ($('.profile-scene.active')) {
      const tags = $$('#tags span');
      tags.forEach(el=>el.style.fontSize='');
      let size = tags[0] ? parseFloat(getComputedStyle(tags[0]).fontSize) : 30;
      const layout = $('.profile-layout');
      const available = layout.clientHeight - parseFloat(getComputedStyle(layout).paddingTop) - parseFloat(getComputedStyle(layout).paddingBottom);
      while(size>22 && $('.profile-copy').scrollHeight>available) {
        size-=2; tags.forEach(el=>el.style.fontSize=size+'px');
      }
    }
    $$('.scene.active .answer').forEach(el=>{
      el.style.fontSize='';
      const scene=el.closest('.scene');
      let size=parseFloat(getComputedStyle(el).fontSize);
      while(size>30 && (el.scrollWidth>el.clientWidth+2 || el.getBoundingClientRect().bottom>scene.getBoundingClientRect().bottom-70)) {
        size-=2; el.style.fontSize=size+'px';
      }
    });
  });
}
function playback(audio, otherAudio) {
  if (audio === bgm) { clearOpeningFade(); openingMusicMode = 'manual'; bgm.volume = audioVolumes.bgm; }
  if (otherAudio === bgm) { clearOpeningFade(); openingMusicMode = 'idle'; }
  otherAudio.pause();
  if(!audio.paused) { audio.pause(); notice('音樂已暫停'); }
  else audio.play().then(()=>notice(audio===bgm?'開頭音樂播放中':'結尾音樂播放中')).catch(()=>notice('音樂載入失敗'));
}
function fullscreen() { if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(()=>notice('請用瀏覽器全螢幕')); }
/** 顯示開場標題，不清除已選主角或抽題狀態。 */
function showTitle() {
  renderTitlePair();
  $('#titleScreen').hidden=false;hideQR();
  $('#controlPanel').classList.remove('open');$('#toast').classList.remove('visible');
}
/** 開場只展示已選兩人的照片；重建節點重播動畫，不鎖住舞台操作。 */
function renderTitlePair() {
  let pair = $('#titlePair');
  if (!pair) {
    pair = document.createElement('div'); pair.id = 'titlePair';
    $('#titleScreen').append(pair);
  }
  pair.replaceChildren();
  $('#titleScreen').classList.toggle('has-pair', selected.length === 2);
  if (selected.length !== 2) return;
  selected.forEach(id => {
    const actor = cast.find(p => p.id === id);
    const card = document.createElement('div');
    card.className = 'title-pair-card'; card.dataset.actor = id;
    const portrait = document.createElement('div'); portrait.className = 'cast-portrait';
    portrait.dataset.actor = id;
    const image = selectionImageSource(actor);
    if (image) {
      const img = new Image(); img.alt = actor.name; img.decoding = 'async'; img.loading = 'eager'; img.fetchPriority = 'high'; img.src = image;
      img.onerror = () => { img.hidden = true; portrait.classList.add('photo-unavailable'); };
      portrait.append(img); applyCrop(portrait, actor);
    } else portrait.classList.add('photo-unavailable');
    card.append(portrait); pair.append(card);
  });
}
/** 本機產生 QR；正式投稿網址由設定檔指定，不呼叫外部 QR API。 */
function showQR() {
  $('#titleScreen').hidden=true;$('#qrScreen').classList.add('show');
  document.body.classList.add('qr-open'); // 掃碼時不能讓觀眾看到劇名
  $('#controlPanel').classList.remove('open');
  const configured=SHOW_CONFIG.submitUrl;
  const url=configured || new URL('submit.html',location.href).href;
  $('#submitLink').href=url;
  // 投影上不寫劇名（開場要讓觀眾以為只是普通問卷），只在沒設定正式網址時留一行提醒
  text('#qrStatus',configured ? '' : '本機彩排 QR · 尚未開放觀眾手機投稿');
  const qr=qrcode(0,'M');qr.addData(url);qr.make();
  const src=SHOW_CONFIG.qrImage || qr.createDataURL(8,32);
  $$('.qr-code').forEach(img => { img.src=src; img.hidden=false; });
}

$('#start').onclick=begin;
$('#nextIntro').onclick=advance;
$('#consoleBtn').onclick=()=>$('#controlPanel').classList.toggle('open');
$('#closePanel').onclick=()=>$('#controlPanel').classList.remove('open');
/** 回到選角首頁，保留投稿與演員素材，重新選擇兩位主角。 */
function goHome() {
  $('#titleScreen').hidden=true;
  phase='selection';intro=-1;focus=0;currentCue=0;
  syncMemberButtons();
  $('#stage').hidden=true;$('#standby').hidden=true;$('#selection').hidden=false;
  hideQR();
  $('#controlPanel').classList.remove('open');$('#toast').classList.remove('visible');
  $$('.scene.active, #cueBar button.active').forEach(el=>el.classList.remove('active'));
  sting.pause(); stopOpeningMusic(); ending.pause();
  text('#credit','');renderSelection();saveShow();
}
$('#nextRound').onclick=nextRound;
$('#endShow').onclick=()=>newShow('結束本場並重新開始？將重設角色與抽題進度，觀眾投稿保留。');
$('#newShow').onclick=newShow;
$('#correctPair').onclick=()=>{
  if(session.status!=='playing'){notice('請先開始本回合');return;}
  editingPair=true;goHome();
};
$('#profileBtn').onclick=goHome;
$('#homeBtn').onclick=showTitle;
$('#qrNavBtn').onclick=showQR;
$$('#memberTags button').forEach(b=>b.onclick=()=>memberTag(Number(b.dataset.member)));
/** 切換現場答案與獨立試玩題庫，不改寫現場投稿。 */
function setPool(useTrial) {
  trialMode=useTrial;
  records=trialMode ? (Array.isArray(window.TRIAL_RESPONSES) ? window.TRIAL_RESPONSES : []) : liveRecords;
  deck=trialMode ? decks.trial : decks.live;
  actorTags={};
  if (session.status === 'playing') selected.forEach(id => { actorTags[id]=drawTags(); });
  photos.clear();loading.clear();submissionImageStates = new Map();preload(records);
  text('#poolToggle',trialMode?'試玩題庫 T':'現場題庫 T');
  text('#panelPoolToggle',trialMode?'切到現場':'切到試玩');
  $('#poolToggle').setAttribute('aria-pressed',String(trialMode));
  $('#poolToggle').title=trialMode?'切回現場題庫':'切換至試玩題庫';
  $('#controlPanel').classList.toggle('trial-mode',trialMode);
  text('#poolStatus',trialMode ? '試玩題庫 · '+records.length+' 筆' : '現場題庫 · '+liveRecords.length+' 筆');
  saveShow();notice(trialMode ? '試玩題庫 · 保留抽題進度' : '現場題庫 · 保留抽題進度');
}
$('#poolToggle').onclick=()=>setPool(!trialMode);
$('#panelPoolToggle').onclick=()=>setPool(!trialMode);
$('#adminLogin').onclick=async()=>{
  if(ShowStore.loggedIn()){ await ShowStore.login(); return; }
  const password=prompt('請輸入後台密碼');
  if(password===null)return;
  ShowStore.login(password).catch(e=>notice(e.message));
};
$('#resetDeck').onclick=newShow;
$('#toggleOpen').onclick=()=>ShowStore.toggle().catch(e=>notice(e.message));
$('#soundBtn').onclick=()=>{sound=!sound;text('#soundBtn','抽題：'+(sound?'開':'關'));};
$('#bgmBtn').onclick=()=>playback(bgm,ending); $('#endingBtn').onclick=()=>playback(ending,bgm);
/** 音樂事件同步按鈕，包含快捷鍵播放與更換角色時的暫停。 */
function updateAudioControls() {
  text('#bgmBtn',(bgm.paused?'播放':'暫停')+'開頭 · O');
  text('#endingBtn',(ending.paused?'播放':'暫停')+'結尾 · E');
}
[bgm,ending].forEach(audio=>['play','pause','ended'].forEach(event=>audio.addEventListener(event,updateAudioControls)));
function saveAudioVolumes() { localStorage.setItem(AUDIO_VOLUME_KEY, JSON.stringify(audioVolumes)); }
function bindVolumeControl(id, key, audio) {
  const input = $('#'+id), output = $('#'+id+'Value');
  if (!input || !output) return;
  const render = () => { const percent = Math.round(audioVolumes[key] * 100); input.value = percent; output.textContent = percent+'%'; };
  input.oninput = () => { audioVolumes[key] = Number(input.value) / 100; audio.volume = audioVolumes[key]; saveAudioVolumes(); render(); };
  render();
}
bindVolumeControl('stingVolume','sting',sting);
bindVolumeControl('bgmVolume','bgm',bgm);
bindVolumeControl('endingVolume','ending',ending);
function formatSeconds(value) { return Number.isInteger(value) ? value+' 秒' : value.toFixed(1)+' 秒'; }
function bindOpeningFadeControl() {
  const input = $('#openingFadeDelay'), output = $('#openingFadeDelayValue');
  if (!input || !output) return;
  const render = () => { input.value = openingFadeSeconds; output.textContent = formatSeconds(openingFadeSeconds); };
  input.oninput = () => { openingFadeSeconds = Number(input.value); localStorage.setItem(OPENING_FADE_KEY, String(openingFadeSeconds)); render(); };
  render();
}
bindOpeningFadeControl();
$('#fontScale').oninput=e=>{document.documentElement.style.setProperty('--font-scale',e.target.value/100);text('#fontScaleValue',e.target.value+'%');fit();};
for(let i=2;i<=7;i++){const b=document.createElement('button');b.dataset.cue=i;const k=document.createElement('kbd');k.textContent=i+1;b.append(k,document.createTextNode(names[i]));b.onclick=()=>drawCue(i);$('#cueButtons').append(b);}
addEventListener('keydown',e=>{
  if($('#castDialog').open || e.target.matches('input,textarea,select,button,a') || e.repeat) return;
  if(e.code==='Enter' && phase==='selection'){e.preventDefault();begin();return;}
  const key=e.key.toLowerCase();
  if(e.code==='Space'||key==='enter'){e.preventDefault();advance();}
  else if(e.shiftKey&&e.code==='Digit0'){offset=0;document.documentElement.style.setProperty('--yoff','0vh');}
  else if(key==='1'||key==='2')memberTag(Number(key)-1);
  else if(/^[3-8]$/.test(key))drawCue(Number(key)-1);
  else if(key==='[')focusActor(0);else if(key===']')focusActor(1);
  else if(key==='c')$('#controlPanel').classList.toggle('open');
  else if(key==='t')setPool(!trialMode);
  else if(key==='s')goHome();
  else if(key==='h')showTitle();
  else if(key==='f')fullscreen();else if(key==='q')showQR();
  else if(key==='r')$('#resetDeck').click();
  else if(key==='o')playback(bgm,ending);else if(key==='e')playback(ending,bgm);
  else if(key==='escape'){$('#controlPanel').classList.remove('open');hideQR();}
  else if(key==='arrowup'||key==='arrowdown'){e.preventDefault();offset=Math.max(-30,Math.min(30,offset+(key==='arrowup'?-1:1)*(e.shiftKey?5:1)));document.documentElement.style.setProperty('--yoff',offset+'vh');}
});
addEventListener('resize',fit);
// 滑鼠按鈕操作後交還鍵盤給舞台，避免空白鍵再次觸發剛才的按鈕。
document.addEventListener('click', e => {
  if (!e.target.closest('#controlPanel, #consoleBtn')) $('#controlPanel').classList.remove('open');
  if(e.detail>0 && !$('#castDialog').open) e.target.closest('button')?.blur();
});
let pendingCast=[];
$('#editCast').onclick=()=>{
  pendingCast=cast.map(p=>({...p})); $('#castEditor').replaceChildren();
  pendingCast.forEach((p,i)=>{
    const row=document.createElement('div'),name=document.createElement('input'),file=document.createElement('input');
    row.className='cast-edit-row';
    name.className='cast-edit-name'; file.className='cast-edit-file';
    name.value=p.name;name.maxLength=16;name.setAttribute('aria-label','演員 '+(i+1)+' 姓名');name.oninput=()=>p.name=name.value;
    file.type='file';file.accept='image/*';file.setAttribute('aria-label','演員 '+(i+1)+' 照片');
    file.onchange=async()=>{
      if(!file.files[0])return;
      $('#saveCast').disabled=true;
      try{p.image=await compressImage(file.files[0],900);text('#castSaveStatus',p.name+' 照片已選取');applyCrop(preview,p);}
      catch(_){text('#castSaveStatus','照片無法讀取，請選 JPEG / PNG');}
      finally{$('#saveCast').disabled=false;}
    };
    const preview=document.createElement('div'); preview.className='cast-edit-preview';
    if(p.image){const img=new Image();img.alt=p.name;img.src=p.image;preview.append(img);}
    else preview.textContent=p.name.slice(0,1);
    applyCrop(preview,p);
    const controls=document.createElement('div'); controls.className='crop-controls';
    [['左右','x',0,100,1,'%'],['上下','y',0,100,1,'%'],['大小','zoom',100,180,1,'%']].forEach(([label,key,min,max,step,suffix])=>{
      const group=document.createElement('label'); group.className='crop-control';
      const heading=document.createElement('span'); const output=document.createElement('output');
      const slider=document.createElement('input'); slider.type='range'; slider.min=min;slider.max=max;slider.step=step;
      const crop=cropOf(p); slider.value=key==='zoom'?Math.round(crop.zoom*100):crop[key];
      heading.textContent=label; output.textContent=slider.value+suffix; group.append(heading,slider,output);
      slider.oninput=()=>{p.crop={...cropOf(p),[key]:key==='zoom'?Number(slider.value)/100:Number(slider.value)};output.textContent=slider.value+suffix;applyCrop(preview,p);};
      controls.append(group);
    });
    row.append(name,file,preview,controls);$('#castEditor').append(row);
  });$('#castDialog').showModal();
};
$('#saveCast').onclick=()=>{
  if(pendingCast.some(p=>!p.name.trim())){text('#castSaveStatus','請填寫每位演員姓名');return;}
  try{localStorage.setItem('astra-cast',JSON.stringify(pendingCast));cast=pendingCast;preloadCastImages();renderSelection();$('#castDialog').close();}
  catch(_){text('#castSaveStatus','儲存空間不足，請縮小照片，或使用 cast-config.js 設定照片路徑');}
};
/** 壓縮本機選取照片，不傳送至外部服務。 */
async function compressImage(file,max=1280){
  const url=URL.createObjectURL(file),img=new Image();
  try{
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
    const scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.72);
  }finally{URL.revokeObjectURL(url);}
}
/** 純文字 Demo，照片使用本地製作的範例字卡，避免下載人物素材。 */
function demo(){
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1100;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#203641';ctx.fillRect(0,0,900,1100);ctx.fillStyle='#e6ebdf';ctx.font='bold 110px sans-serif';ctx.textAlign='center';ctx.fillText('今晚公休',450,530);ctx.font='36px sans-serif';ctx.fillText('示範照片・等你換上自己的畫面',450,620);
  const photo=canvas.toDataURL('image/jpeg',.8);
  return [
    ['阿晴',['很會省錢','每天早起','熱愛碎念'],'已讀不回三天','你跟照片不太一樣','南極','今天不想當大人'],
    ['小宇',['不吃香菜','修理萬物','愛講冷笑話'],'一直聊前任','我是來借充電器的','月球背面','其實我還在等'],
    ['米糕',['交友廣闊','路見不平','晚上八點睡'],'幫每道菜算熱量','你媽媽有來嗎','便利商店','我先睡了，騙你的'],
    ['小白',['什麼都留','刀子嘴','豆腐心'],'第一次見面就查戶口','我們是不是見過','冰島','明天一定會更好吧'],
  ].map((a,i)=>({id:'demo-'+i,table:'B'+(i+1),nick:a[0],tags:a[1],romanticGesture:a[2],awkwardLine:a[3],location:a[4],igStory:a[5],photo,ts:Date.now()}));
}
ShowStore.subscribe(s=>{
  liveRecords=s.records;
  if(!trialMode) {
    records=liveRecords; preload(records);
    const activeIds=new Set(records.map(r=>r.id));
    Object.keys(actorTags).forEach(id=>{if(actorTags[id]&&!activeIds.has(actorTags[id].id))delete actorTags[id];});
  }
  text('#status',s.status);
  text('#poolStatus',trialMode ? '試玩題庫 · '+records.length+' 筆' : '現場題庫 · '+liveRecords.length+' 筆');
  text('#panelPoolToggle',trialMode?'切到現場':'切到試玩');
  text('#submissionStatus',s.open?'投稿開放':'投稿截止');
  text('#submissionLabel',s.open?'觀眾投稿：開放':'觀眾投稿：截止');
  text('#toggleOpen',s.open?'截止投稿':'開放投稿');
  $('#toggleOpen').disabled=!s.canManage;
  $('#adminLogin').hidden=!s.live;
  text('#adminLogin',s.user?'登出管理員':'管理員登入');
});
preloadCastImages();
renderSelection();
syncMemberButtons();
text('#poolToggle',trialMode?'試玩題庫 T':'現場題庫 T');
$('#poolToggle').setAttribute('aria-pressed',String(trialMode));
$('#controlPanel').classList.toggle('trial-mode',trialMode);
ShowStore.init().then(()=>{if(!ShowStore.live && !liveRecords.length)ShowStore.seed(demo());});

// 本地 SVG 介面圖示，不下載圖示字型或外部套件。
const iconPaths = {
  person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-3a8 8 0 0 1 16 0v3Z',
  flame: 'M13 2c1 5-3 6-3 9-2-1-3-3-3-4-4 4-6 8-3 12 3 5 12 5 16-1 3-5 0-11-7-16Z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3ZM16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  torch: 'M7 2h10v5l-3 4v11h-4V11L7 7ZM7 7h10',
  message: 'M21 11c0 5-4 8-9 8l-6 3 1-5c-3-2-4-4-4-6 0-5 4-8 9-8s9 3 9 8Z',
};
function icon(name, fill=false) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[name]);
  path.setAttribute('fill',fill?'currentColor':'none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linejoin','round');
  svg.append(path);return svg;
}
$$('.tinder-logo').forEach(el=>el.replaceChildren(icon('flame',true),document.createTextNode('jinder')));
$$('.anonymous-avatar').forEach(el=>el.replaceChildren(icon('person',true)));
