'use strict';
const $=s=>document.querySelector(s);
let photo=null,processing=false,request=0;
const PHOTO_MAX_EDGE=960, PHOTO_MAX_DATA_LENGTH=400000;
const key=ShowStore.key+':submitted';
window.ShowQuestions.init();
function done(){ $('#form').hidden=true;$('#done').hidden=false; }
try{if(localStorage.getItem(key))done();}catch(_){}
$('#again').onclick=()=>{$('#form').hidden=false;$('#done').hidden=true;};
document.querySelectorAll('[data-limit]').forEach(input=>{
  const counter=document.createElement('small');input.after(counter);
  const update=()=>{if(!input.composing)input.value=[...input.value].slice(0,Number(input.dataset.limit)).join('');counter.textContent=[...input.value].length+' / '+input.dataset.limit;};
  input.addEventListener('compositionstart',()=>input.composing=true);
  input.addEventListener('compositionend',()=>{input.composing=false;update();});
  input.addEventListener('input',update);update();
});
$('#photo').onchange=async()=>{
  const token=++request;photo=null;$('#photoPreview').hidden=true;
  const file=$('#photo').files[0];if(!file)return;
  processing=true;$('#submitBtn').disabled=true;$('#error').textContent='照片處理中⋯';
  const url=URL.createObjectURL(file),img=new Image();
  try{
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
    const scale=Math.min(1,PHOTO_MAX_EDGE/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let data=canvas.toDataURL('image/jpeg',.68);
    if(data.length>PHOTO_MAX_DATA_LENGTH)data=canvas.toDataURL('image/jpeg',.48);
    if(data.length>PHOTO_MAX_DATA_LENGTH)data=canvas.toDataURL('image/jpeg',.35);
    if(!ShowCore.valid('photo',data))throw new Error('照片仍然太大，請換一張或先截圖');
    if(token!==request)return;
    photo=data;$('#photoPreview').src=data;$('#photoPreview').hidden=false;$('#error').textContent='';
  }catch(e){if(token===request)$('#error').textContent=e.message||'照片無法讀取';}
  finally{URL.revokeObjectURL(url);if(token===request){processing=false;$('#submitBtn').disabled=false;}}
};
$('#form').onsubmit=async e=>{
  e.preventDefault();if(processing)return;
  const record={table:$('#table').value.trim(),nick:$('#nick').value.trim(),tags:[1,2,3].map(i=>$('#tag'+i).value.trim().replace(/^#+/,'')),photo};
  ['romanticGesture','awkwardLine','location','igStory'].forEach(f=>record[f]=$('#'+f).value.trim());
  if(!record.table||Object.keys(record).filter(f=>f!=='table').some(f=>!ShowCore.valid(f,record[f]))){$('#error').textContent='請完整填寫，並選擇一張照片。';return;}
  $('#submitBtn').disabled=true;$('#error').textContent='';
  try{await ShowStore.submit(record);try{localStorage.setItem(key,'1');}catch(_){}done();}
  catch(e){$('#error').textContent=e.message;}
  finally{$('#submitBtn').disabled=false;}
};
// 投稿頁不顯示後台／彩排狀態文字，避免讓觀眾看到技術資訊。
if(!ShowStore.live)ShowStore.init();
