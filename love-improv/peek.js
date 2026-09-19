'use strict';
const managementStyle=document.createElement('link');
managementStyle.rel='stylesheet';managementStyle.href='management.css?v=20260919-pagination1';document.head.append(managementStyle);
const $=s=>document.querySelector(s);
const sections=[['tags','標籤'],['romanticGesture','浪漫舉動'],['photo','照片'],['awkwardLine','聊天／金句'],['location','地點'],['igStory','限時動態']];
let records=[],field='tags',page=1,filter='active',canManage=false,busy=false;
const PAGE_SIZE=30;
const filters=['active','ignored','archived'];
function text(selector,value){const element=$(selector);if(element)element.textContent=String(value);}
function updateCounts(){
  const counts=Object.fromEntries(filters.map(key=>[key,records.filter(r=>r.moderation===key).length]));
  text('#activeCount',counts.active);text('#ignoredCount',counts.ignored);text('#archivedCount',counts.archived);
  filters.forEach(key=>text(`[data-filter="${key}"] b`,counts[key]));
  const pending=counts.active+counts.ignored;$('#archiveAll').disabled=!canManage||busy||pending===0;
  text('#archiveAll',pending?'封存全部（'+pending+'）':'封存全部');
}
function showEmpty(title,detail=''){
  const empty=document.createElement('div');empty.className='admin-empty';
  const heading=document.createElement('strong');heading.textContent=title;empty.append(heading);
  if(detail){const note=document.createElement('span');note.textContent=detail;empty.append(note);}
  $('#answers').replaceChildren(empty);
}
const deck=ShowCore.createDeck();
function currentPool(){return records.filter(r=>r.moderation===filter&&ShowCore.valid(field,r[field]));}
function updatePagination(total){
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  page=Math.min(page,totalPages);
  text('#pageInfo','第 '+page+' / '+totalPages+' 頁');
  $('#prevPage').disabled=busy||page<=1;
  $('#nextPage').disabled=busy||page>=totalPages;
}
function render(reset=false){
  text('#answerPanelTitle',(sections.find(([key])=>key===field)||[])[1]||'答案');
  updateCounts();
  if(reset)page=1;
  if(SHOW_CONFIG.mode==='firebase'&&!canManage){updatePagination(0);showEmpty('登入後查看');return;}
  const pool=currentPool();
  updatePagination(pool.length);
  const start=(page-1)*PAGE_SIZE;
  const pageRecords=pool.slice(start,start+PAGE_SIZE);
  $('#answers').replaceChildren();
  pageRecords.forEach((r,index)=>{
    const row=document.createElement('article');row.className='answer-row'+(field==='photo'?' photo-row':'');
    const value=document.createElement('div');value.className='answer-value';
    if(field==='photo'){const img=new Image();img.src=r.photo;img.alt='觀眾投稿照片';img.loading='lazy';value.append(img);}
    else value.textContent=Array.isArray(r[field])?r[field].map(t=>'#'+t).join('　'):r[field];
    const meta=document.createElement('div');meta.className='answer-meta';
    const number=document.createElement('span');number.className='answer-number';number.textContent=String(start+index+1).padStart(2,'0');
    const source=document.createElement('span');source.textContent=(r.table||'未填桌號')+' · '+(r.nick||'未填暱稱');meta.append(number,source);
    const action=document.createElement('button');action.type='button';action.className='row-action';
    const active=filter==='active';action.setAttribute('aria-label',active?'忽略':'恢復');action.title=active?'忽略':'恢復';action.textContent=active?'×':'↺';
    action.disabled=!canManage||busy;action.onclick=()=>manage(()=>ShowStore.setIgnored(id,active));
    row.append(value,meta,action);$('#answers').append(row);
  });
  if(!pool.length)showEmpty('沒有投稿');
}
sections.forEach(([key,label])=>{const b=document.createElement('button');b.textContent=label;b.dataset.field=key;b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.onclick=()=>{field=key;document.querySelectorAll('#tabs button').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active));});render(true);};$('#tabs').append(b);});
$('#tabs button').classList.add('active');$('#tabs button').setAttribute('aria-selected','true');
document.querySelectorAll('.status-filter').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('.status-filter').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));});render(true);});
$('#prevPage').onclick=()=>{if(page>1){page-=1;render();}};
$('#nextPage').onclick=()=>{const totalPages=Math.max(1,Math.ceil(currentPool().length/PAGE_SIZE));if(page<totalPages){page+=1;render();}};
/** 管理操作保留原始 responses，只更新 moderation 標記。 */
async function manage(action){
  busy=true;render();
  try{await action();text('#manageNotice','完成');}
  catch(e){text('#manageNotice','操作失敗：'+e.message);}
  finally{busy=false;render();}
}
$('#adminLogin').onclick=async()=>{
  if(ShowStore.loggedIn()){ await ShowStore.login(); return; }
  const password=prompt('請輸入後台密碼');
  if(password===null)return;
  ShowStore.login(password).catch(e=>{$('#manageNotice').textContent='失敗';});
};
$('#archiveAll').onclick=()=>{
  const ids=records.filter(r=>r.moderation!=='archived').map(r=>r.id);
  if(!ids.length||!confirm('封存目前 '+ids.length+' 筆投稿？\n投稿不會刪除，只會退出本場抽題池。'))return;
  manage(()=>ShowStore.archive(ids));
};
ShowStore.subscribe(s=>{
  records=s.allRecords;canManage=s.canManage;
  $('#adminLogin').hidden=!s.live;$('#adminLogin').textContent=s.user?'登出管理員':'管理員登入';
  text('#status',s.status);
  text('#manageNotice',s.live?(s.canManage?'已登入':'請登入'):'試玩');
  updateCounts();render();
});
ShowStore.init();
