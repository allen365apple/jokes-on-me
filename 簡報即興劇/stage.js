'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const { fields, names, valid, createDeck } = ShowCore;
let deck = createDeck();
let cast = CAST_PROFILES.map(p => ({...p}));
try {
  const saved = JSON.parse(localStorage.getItem('astra-cast') || 'null');
  if (Array.isArray(saved)) cast = cast.map(p => {
    const prior=saved.find(s=>s.id===p.id);
    return prior ? {...p, name: /待設定|待確認/.test(prior.name) ? p.name : (prior.name || p.name), image: prior.image || p.image} : p;
  });
} catch (_) {}
let selected = [], phase = 'selection', intro = -1, focus = 0, currentCue = 0;
let liveRecords = [], records = [], actorTags = {}, trialMode = false, toastTimer, offset = 0;
const photos = new Map(), loading = new Set();
let sound = true;
let lastStoryStyle = -1;
const storyStyles = [
  {color:'#fff4b8', angle:-4}, {color:'#ffabc8', angle:3},
  {color:'#aee9ff', angle:-3}, {color:'#c6ffce', angle:4},
  {color:'#dec5ff', angle:-5}, {color:'#ffffff', angle:2}
];
const sting = new Audio('音效/威嚇音效.mp3');
const bgm = new Audio('音效/企劃懸疑背景.m4a');
const ending = new Audio('音效/企劃結尾音樂.mp3');
bgm.loop = true; bgm.volume = .3; ending.volume = .5;
[sting,bgm,ending].forEach(a => a.preload = 'none');
/** 將使用者提供的文字安全放入 DOM。 */
function text(selector, value) { const el = $(selector); if (el) el.textContent = value; }
function notice(message) { text('#toast', message); $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800); }
function person() { return cast.find(p => p.id === selected[focus]); }
function avatar(container, p) {
  container.dataset.actor = p.id;
  container.textContent = p.name.slice(0,1);
  if (!p.image) return;
  const img = new Image(); img.alt = p.name; img.src = p.image;
  img.onload = () => container.replaceChildren(img);
}
function renderSelection() {
  $('#castGrid').replaceChildren();
  cast.forEach(p => {
    const button = document.createElement('button'); button.className = 'cast-card';
    const order = selected.indexOf(p.id);
    button.classList.toggle('selected', order >= 0); button.setAttribute('aria-pressed', String(order >= 0));
    const pic = document.createElement('div'); pic.className = 'cast-portrait'; avatar(pic,p);
    const name = document.createElement('strong'); name.textContent = p.name;
    button.append(pic, name);
    if (order >= 0) { const n = document.createElement('span'); n.className = 'order'; n.textContent = order+1; button.append(n); }
    button.onclick = () => {
      if (selected.includes(p.id)) selected = selected.filter(id => id !== p.id);
      else if (selected.length < 2) selected.push(p.id);
      else { notice('已選兩位，請先取消其中一位'); return; }
      renderSelection();
    };
    $('#castGrid').append(button);
  });
  text('#selectionCount', '已選 ' + selected.length + ' / 2');
  renderPairPreview();
  $('#start').disabled = selected.length !== 2;
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
  $('#selection').hidden = true; $('#standby').hidden = true; $('#stage').hidden = false;
  hideQR();$('#titleScreen').hidden=true;
  $$('.scene').forEach(el => el.classList.toggle('active', Number(el.dataset.scene) === cue));
  $$('#cueButtons button').forEach(b => b.classList.toggle('active', Number(b.dataset.cue) === cue));
  $$('#memberTags button').forEach(b => {
    const active = cue === 1 && Number(b.dataset.member) === focus;
    b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
  });
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
  }
  const r = actorTags[p.id]; $('#tags').replaceChildren();
  (r ? r.tags : ['等待觀眾投稿']).forEach(tag => { const span=document.createElement('span'); span.textContent='#'+tag.replace(/^#+/,''); $('#tags').append(span); });
  credit(r); fit();
}
function begin() {
  if (selected.length !== 2) return;
  document.activeElement?.blur();
  phase='intro'; intro=-1; focus=0; currentCue=0; actorTags={};
  selected.forEach(id => { actorTags[id] = drawTags(); });
  $('#memberTags').hidden=false;
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
  text('#credit','按 1／2 選擇主角，或 Space 依序登場');
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
  else {focus=index;renderProfile();playSting();}
}
function playSting() {
  if(sound){sting.currentTime=0;sting.play().catch(()=>notice('音效無法播放'));}
}
function styleStory() {
  const choices=storyStyles.map((s,i)=>i).filter(i=>i!==lastStoryStyle);
  lastStoryStyle=choices[Math.floor(Math.random()*choices.length)];
  const style=storyStyles[lastStoryStyle], el=$('.story-answer');
  el.style.color=style.color;el.style.setProperty('--story-angle',style.angle+'deg');
}
/** 收到圖片後先解碼；未成功載入的照片不進入抽選池。 */
function preload(records) {
  records.forEach(r => {
    if (!valid('photo',r.photo)||photos.has(r.photo)||loading.has(r.photo)) return;
    loading.add(r.photo); const img=new Image();
    img.onload=()=>{ photos.set(r.photo,{w:img.naturalWidth,h:img.naturalHeight}); loading.delete(r.photo); };
    img.onerror=()=>loading.delete(r.photo); img.src=r.photo;
  });
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
  otherAudio.pause();
  if(!audio.paused) { audio.pause(); notice('音樂已暫停'); }
  else audio.play().then(()=>notice(audio===bgm?'懸疑襯底播放中':'結尾音樂播放中')).catch(()=>notice('音樂載入失敗'));
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
    if (actor.image) {
      const img = new Image(); img.alt = actor.name; img.src = actor.image;
      img.onerror = () => { img.hidden = true; portrait.classList.add('photo-unavailable'); };
      portrait.append(img);
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
  phase='selection';selected=[];intro=-1;focus=0;currentCue=0;actorTags={};
  $('#stage').hidden=true;$('#standby').hidden=true;$('#selection').hidden=false;
  $('#memberTags').hidden=true;hideQR();
  $('#controlPanel').classList.remove('open');$('#toast').classList.remove('visible');
  $$('.scene.active, #cueBar button.active').forEach(el=>el.classList.remove('active'));
  [sting,bgm,ending].forEach(audio=>audio.pause());
  text('#credit','選擇今天的兩位主角');renderSelection();
}
$('#profileBtn').onclick=goHome;
$('#homeBtn').onclick=showTitle;
$('#qrNavBtn').onclick=showQR;
$$('#memberTags button').forEach(b=>b.onclick=()=>memberTag(Number(b.dataset.member)));
/** 切換現場答案與獨立試玩題庫，不改寫現場投稿。 */
function setPool(useTrial) {
  trialMode=useTrial;
  records=trialMode ? (Array.isArray(window.TRIAL_RESPONSES) ? window.TRIAL_RESPONSES : []) : liveRecords;
  deck=createDeck();
  actorTags={};
  selected.forEach(id => { actorTags[id]=drawTags(); });
  photos.clear();loading.clear();preload(records);
  text('#poolToggle',trialMode?'試玩題庫 T':'現場題庫 T');
  $('#poolToggle').setAttribute('aria-pressed',String(trialMode));
  $('#poolToggle').title=trialMode?'切回現場題庫':'切換至試玩題庫';
  $('#controlPanel').classList.toggle('trial-mode',trialMode);
  text('#poolStatus',trialMode ? '目前：試玩題庫 · 30 筆' : '目前：現場題庫 · '+liveRecords.length+' 筆');
  notice(trialMode ? '已切換試玩題庫，抽選進度已重設' : '已切回現場題庫，抽選進度已重設');
}
$('#poolToggle').onclick=()=>setPool(!trialMode);
$('#adminLogin').onclick=async()=>{
  if(ShowStore.loggedIn()){ await ShowStore.login(); return; }
  const password=prompt('請輸入後台密碼');
  if(password===null)return;
  ShowStore.login(password).catch(e=>notice(e.message));
};
$('#resetDeck').onclick=()=>{deck.reset();notice('已重設目前題庫的抽選進度');};
$('#toggleOpen').onclick=()=>ShowStore.toggle().catch(e=>notice(e.message));
$('#soundBtn').onclick=()=>{sound=!sound;text('#soundBtn','抽題音效：'+(sound?'開':'關'));};
$('#bgmBtn').onclick=()=>playback(bgm,ending); $('#endingBtn').onclick=()=>playback(ending,bgm);
/** 音樂事件同步按鈕，包含快捷鍵播放與更換角色時的暫停。 */
function updateAudioControls() {
  text('#bgmBtn',(bgm.paused?'播放':'暫停')+'懸疑音樂 · B');
  text('#endingBtn',(ending.paused?'播放':'暫停')+'結尾音樂 · E');
}
[bgm,ending].forEach(audio=>['play','pause','ended'].forEach(event=>audio.addEventListener(event,updateAudioControls)));
$('#fontScale').oninput=e=>{document.documentElement.style.setProperty('--font-scale',e.target.value/100);text('#fontScaleValue',e.target.value+'%');fit();};
for(let i=2;i<=7;i++){const b=document.createElement('button');b.dataset.cue=i;const k=document.createElement('kbd');k.textContent=i+1;b.append(k,document.createTextNode(names[i]));b.onclick=()=>drawCue(i);$('#cueButtons').append(b);}
addEventListener('keydown',e=>{
  if(e.code==='Enter' && phase==='selection'){e.preventDefault();begin();return;}
  if($('#castDialog').open || e.target.matches('input,textarea,select,button,a') || e.repeat) return;
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
  else if(key==='b')playback(bgm,ending);else if(key==='e')playback(ending,bgm);
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
    name.value=p.name;name.maxLength=16;name.setAttribute('aria-label','演員 '+(i+1)+' 姓名');name.oninput=()=>p.name=name.value;
    file.type='file';file.accept='image/*';file.setAttribute('aria-label','演員 '+(i+1)+' 照片');
    file.onchange=async()=>{
      if(!file.files[0])return;
      $('#saveCast').disabled=true;
      try{p.image=await compressImage(file.files[0],900);text('#castSaveStatus',p.name+' 照片已選取');}
      catch(_){text('#castSaveStatus','照片無法讀取，請選 JPEG / PNG');}
      finally{$('#saveCast').disabled=false;}
    };
    row.append(name,file);$('#castEditor').append(row);
  });$('#castDialog').showModal();
};
$('#saveCast').onclick=()=>{
  if(pendingCast.some(p=>!p.name.trim())){text('#castSaveStatus','請填寫每位演員姓名');return;}
  try{localStorage.setItem('astra-cast',JSON.stringify(pendingCast));cast=pendingCast;renderSelection();$('#castDialog').close();}
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
  text('#status',s.status+' · '+(trialMode ? records.length+' 筆試玩答案' : liveRecords.length+' 筆投稿'));
  text('#poolStatus',trialMode ? '目前：試玩題庫 · '+records.length+' 筆' : '目前：現場題庫 · '+liveRecords.length+' 筆');
  text('#submissionStatus',s.open?'觀眾投稿：開放中':'觀眾投稿：已截止');
  text('#toggleOpen',s.open?'截止投稿':'開放投稿');
  $('#toggleOpen').disabled=!s.canManage;
  $('#adminLogin').hidden=!s.live;
  text('#adminLogin',s.user?'登出管理員':'管理員登入');
});
renderSelection();
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
