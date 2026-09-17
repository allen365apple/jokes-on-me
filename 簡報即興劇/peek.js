'use strict';
const $=s=>document.querySelector(s);
const sections=[['tags','標籤'],['romanticGesture','浪漫舉動'],['photo','照片'],['awkwardLine','聊天／金句'],['location','地點'],['igStory','限時動態']];
let records=[],field='tags',revealed=false,sample=[];
const deck=ShowCore.createDeck();
function render(reset=false){
  const pool=records.filter(r=>ShowCore.valid(field,r[field]));
  if(reset)sample=[];
  sample=sample.filter(id=>pool.some(r=>r.id===id));
  const available=pool.filter(r=>!sample.includes(r.id));
  while(sample.length<Math.min(30,pool.length)&&available.length)sample.push(available.splice(Math.floor(Math.random()*available.length),1)[0].id);
  $('#answers').replaceChildren();$('#photos').hidden=field!=='photo';
  if(field==='photo'&&!revealed){$('#answers').textContent='照片已隱藏；按「顯示照片」檢視。';return;}
  sample.forEach(id=>{
    const r=pool.find(r=>r.id===id),el=document.createElement('div');el.className='row';
    if(field==='photo'){const img=new Image();img.src=r.photo;img.alt=r.nick;img.loading='lazy';el.append(img);}
    else el.textContent=Array.isArray(r[field])?r[field].map(t=>'#'+t).join('　'):r[field];
    const meta=document.createElement('small');meta.textContent=(r.table||'')+' '+r.nick;el.append(meta);$('#answers').append(el);
  });
  if(!pool.length)$('#answers').textContent='尚無答案';
}
sections.forEach(([key,label])=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{field=key;document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('active',x===b));render(true);};$('#tabs').append(b);});
$('#tabs button').classList.add('active');
$('#refresh').onclick=()=>render(true);$('#photos').onclick=()=>{revealed=!revealed;$('#photos').textContent=revealed?'隱藏照片':'顯示照片';render();};
ShowStore.subscribe(s=>{records=s.records;$('#status').textContent=s.status+' · 共 '+records.length+' 筆 · 每題最多顯示 30 筆';render();});
ShowStore.init();
