/* Fuel Queue MN 2.0 — self-contained mobile interface. No CDN dependencies. */
(() => {
'use strict';
const cfg=window.FQM_CONFIG, root=document.getElementById('fqm-root');
const paths={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',ticket:'M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6z M9 8h6 M9 12h6 M9 16h4',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',arrow:'M4 12h16m-6-6 6 6-6 6',back:'M20 12H4m6-6-6 6 6 6',pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',fuel:'M4 21V4h10v17 M2 21h14 M6 7h6v5H6z M14 14h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9l-4-4 M19 6v5h3',check:'M5 12l4 4L19 6',clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',plus:'M12 4v16 M4 12h16',copy:'M8 8h13v13H8z M16 8V3H3v13h5',settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',list:'M9 5h12 M9 12h12 M9 19h12 M3 5h1 M3 12h1 M3 19h1',logout:'M9 4H3v16h6 M8 12h13m-4-4 4 4-4 4',shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',refresh:'M20 8a8 8 0 1 0 0 8 M20 3v5h-5',help:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01',car:'M3 12l2-7h14l2 7v7H3z M3 12h18 M6 16h2 M16 16h2 M5 19v2 M19 19v2',pause:'M8 4v16 M16 4v16',close:'m6 6 12 12 M6 18 18 6'};
const icon=n=>`<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[n]||paths.ticket}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0)?Number(v).toLocaleString('en-US')+'₮':'Лимитгүй';
const date=v=>{if(!v)return '';const a=v.split('-');return `${a[1]}.${a[2]}`;};
const datestr=v=>v===state.boot?.today?'Өнөөдөр · '+date(v):date(v);
const labels={waiting:'Хүлээж байна',served:'Үйлчлүүлсэн',missed:'Ирээгүй',cancelled:'Цуцалсан',open:'Нээлттэй',paused:'Түр зогссон',closed:'Хаалттай'};
const state={boot:null,screen:'home',filter:'Бүгд',batches:[],mine:[],ws:null,station:0,batch:0,busy:false,polling:false,viewId:0,undo:null};
let nonce='',toastTimer,modal=null;
async function api(op,data={}) {
 const body=new URLSearchParams({action:'fqm_api',op,nonce});
 Object.entries(data).forEach(([k,v])=>Array.isArray(v)?v.forEach(x=>body.append(k+'[]',x)):body.append(k,String(v??'')));
 let res;try{res=await fetch(cfg.api,{method:'POST',credentials:'same-origin',body,cache:'no-store'});}catch(e){throw new Error('Сүлжээ тасарсан байна. Холболтоо шалгаад дахин оролдоно уу.');}
 let json;try{json=await res.json();}catch(e){throw new Error('Серверээс буруу хариу ирлээ. Хуудсаа шинэчлээд үзнэ үү.');}
 if(!json.success)throw new Error(json.data?.message||'Хүсэлтийг гүйцэтгэж чадсангүй.');
 return json.data;
}
function toast(text,error=false,undo=0){
 root.querySelector('.toast')?.remove();clearTimeout(toastTimer);
 const el=document.createElement('div');el.className='toast'+(error?' error':'');el.setAttribute('role',error?'alert':'status');el.innerHTML=`${icon(error?'help':'check')}<span>${esc(text)}</span>${undo?`<button data-action="undo" data-id="${Number(undo)}">Буцаах</button>`:''}`;root.append(el);
 toastTimer=setTimeout(()=>el.remove(),undo?30000:7000);
}
const notice=(text,kind='')=>`<div class="notice ${kind}">${icon(kind==='error'?'help':'shield')}<span>${esc(text)}</span></div>`;
const empty=(title,text)=>`<div class="empty">${icon('ticket')}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
const field=(title,name,value='',type='text',extra='')=>`<label class="field">${esc(title)}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
const select=(title,name,options,value)=>`<label class="field">${esc(title)}<select name="${name}">${options.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const btn=(text,action,kind='',id='')=>`<button class="btn ${kind}" type="button" data-action="${action}" ${id!==''?`data-id="${esc(id)}"`:''}>${text}</button>`;
const navItem=(screen,text,ic)=>`<button class="nav-btn ${state.screen===screen?'active':''}" data-nav="${screen}" ${state.screen===screen?'aria-current="page"':''}>${icon(ic)}${text}</button>`;
function chrome(content){
 const staff=state.boot.role!=='guest',panel=cfg.adminPanel;
 const staffView=['work','team','rules','batchForm','userForm','stationForm','stations','logs','queue'].includes(state.screen);
 root.innerHTML=`<div class="app-shell"><header class="topbar"><button class="brand" data-nav="${panel?'stations':'home'}" aria-label="Ээлж нүүр"><span class="brand-mark">Э</span><span><span class="brand-name">Ээлж</span><span class="brand-caption">ШАТАХУУНЫ ООЧИР</span></span></button><button class="employee" data-nav="${staff?'account':'login'}">${icon('user')}<span>${staff?'Миний эрх':'Ажилтан<br>нэвтрэх'}</span></button></header><main id="main-content" tabindex="-1">${content}</main><nav class="bottom-nav" aria-label="Үндсэн цэс">${panel?navItem('stations','ШТС','fuel')+navItem('team','Ажилтан','user')+navItem('rules','Тохиргоо','settings'):staffView?navItem('work','Оочир','list')+(state.boot.role==='operator'?'':navItem('team','Түгээгч','user'))+navItem('home','Нүүр','home'):navItem('home','Оочир авах','fuel')+navItem('mine','Миний оочир','ticket')+navItem(staff?'work':'help',staff?'Миний ажил':'Тусламж',staff?'list':'help')}</nav></div>`;
}
function title(h,p=''){return `<div class="page-title"><h1>${esc(h)}</h1>${p?`<p>${esc(p)}</p>`:''}</div>`;}
const back=(to='home')=>`<button class="back" data-nav="${to}">${icon('back')}Буцах</button>`;
function stationCard(b){
 const can=b.available&&b.left>0;
 const status=b.status==='paused'?'Түр зогссон':!b.left?'Дүүрсэн':!b.available?'Бүртгэл хаалттай':'Нээлттэй';
 return `<article class="station-card"><div class="status-line"><span class="badge ${can?'':b.status==='paused'?'warn':'gray'}"><span class="dot"></span>${status}</span><span class="date">${esc(datestr(b.service_date))}</span></div><div class="station-top"><div class="station-logo">${icon('fuel')}</div><div class="station-meta"><h3>${esc(b.station_name)}</h3><div class="address">${icon('pin')}${esc(b.address||'Хаяг оруулаагүй')}</div></div></div><div class="numbers"><div><span class="label">Шатахуун · ${esc(b.fuel)}</span><strong>${money(b.amount_limit)} <small>${Number(b.amount_limit)?'хүртэл':''}</small></strong></div><div><span class="label">Үлдсэн эрх</span><strong>${Number(b.left)} <small>/ ${Number(b.capacity)} машин</small></strong></div></div>${b.note?notice(b.note,b.status==='paused'?'warning':''):''}${!b.available&&b.open_at?`<p class="hint">Бүртгэл: ${esc(b.open_at.slice(0,16))}${b.close_at?' – '+esc(b.close_at.slice(0,16)):''}</p>`:''}<button class="btn ${can?'':'secondary'}" data-action="book-form" data-id="${Number(b.id)}" ${can?'':'disabled'}>${can?'Оочир авах':status}${icon('arrow')}</button></article>`;
}
function home(){
 const list=state.batches.filter(b=>state.filter==='Бүгд'||b.fuel===state.filter);
 chrome(`<section class="intro"><div class="eyebrow"><span class="dot"></span>Цагаа өөртөө үлдээ</div><h1>Оочроо цахимаар.<br>Өдрөө өөртөө.</h1><p>ШТС-аа сонгоод, ээлжээ аваарай.</p></section><section class="feature"><div class="art">${icon('fuel')}</div><h2>Урт дараалалд<br>зогсох хэрэггүй.</h2><p>Таны ээлж ойртоход<br>эндээс харах боломжтой.</p><div class="feature-footer">${icon('shield')}Үнэгүй · Бүртгэл үүсгэхгүй</div></section><div class="section-heading"><h2>ШТС сонгох</h2><span class="count">${list.length} оочир</span></div><div class="filters" aria-label="Шатахууны төрөл">${['Бүгд','АИ-92','АИ-95','Дизель','Газ',...(state.batches.some(b=>b.fuel==='АИ-98')?['АИ-98']:[])].map(f=>`<button class="chip ${state.filter===f?'selected':''}" data-filter="${f}" aria-pressed="${state.filter===f}">${f}</button>`).join('')}</div><div id="station-list">${list.map(stationCard).join('')||empty('Нээлттэй оочир алга','Эрхлэгч оочир нээмэгц энд харагдана. Дараа дахин шалгаарай.')}</div><button class="text-btn" data-action="refresh">${icon('refresh')}Жагсаалт шинэчлэх</button><p class="footer-note">Ээлж • Таны цаг үнэ цэнтэй.</p>`);
}
function bookForm(id){
 const b=state.batches.find(x=>Number(x.id)===Number(id));if(!b)return go('home');
 state.screen='book';state.batch=Number(id);
 chrome(`${back()}${title('Оочир захиалах','Ердөө хоёр мэдээлэл оруулаад ээлжээ аваарай.')}<div class="steps"><span>1</span>ШТС сонгох<b></b><span>2</span>Захиалах<b></b><span>3</span>Бэлэн</div><div class="card"><h3>${esc(b.station_name)}</h3><div class="summary-row"><span>Үйлчлэх өдөр</span><strong>${esc(b.service_date)}</strong></div><div class="summary-row"><span>Шатахуун</span><strong>${esc(b.fuel)} · ${money(b.amount_limit)}</strong></div></div><form class="form" data-form="book"><input type="hidden" name="batch_id" value="${Number(b.id)}"><input type="hidden" name="request_key" value="${newKey()}">${field('Машины улсын дугаар','plate','','text','placeholder="1234 ЗАН" maxlength="12" autocomplete="off" autocapitalize="characters" required')}<p class="hint">4 тоо, 3 кирилл үсэг. Жишээ: 1234 ЗАН</p>${field('Утасны дугаар','phone','','tel','placeholder="99112233" inputmode="numeric" maxlength="8" pattern="[0-9]{8}" autocomplete="tel-national" required')}<div class="notice">${icon('shield')}<span>Таны утсыг зөвхөн үйлчилгээ хариуцсан ажилтан харна. Захиалгаа энэ хөтөч дээрээс удирдана.</span></div><div class="form-error" role="alert"></div><button class="btn" type="submit">Оочир захиалах ${icon('arrow')}</button></form>`);
 window.scrollTo(0,0);
}
function newKey(){const a=new Uint8Array(16);if(window.crypto?.getRandomValues){window.crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');}return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)+'_'+Math.random().toString(36).slice(2);}
function ticketCard(t){
 const waiting=t.status==='waiting',active=waiting&&t.service_date>=state.boot.today;
 return `<article><div class="ticket"><div class="ticket-top"><div class="status-line"><span class="badge">${icon(waiting?'clock':'check')}${esc(labels[t.status])}</span><span>${esc(datestr(t.service_date))}</span></div><div class="ticket-number"><span class="label">Таны оочрын дугаар</span><strong><span>№</span>${Number(t.queue_no)}</strong><div class="plate-pill">${esc(t.plate)}</div></div></div><div class="ticket-station"><h3>${esc(t.station_name)}</h3><div class="address">${icon('pin')}${esc(t.address)}</div></div><div class="ticket-footer"><span>${esc(t.fuel)}</span><strong>${money(t.amount_limit)}</strong></div></div>${waiting?`<div class="progress-pair"><div class="metric"><span class="label">Таны өмнө</span><strong>${Number(t.ahead)} <small>машин</small></strong></div><div class="metric"><span class="label">Одоогийн ээлж</span><strong>№${Number(t.current_no)||'—'}</strong></div></div>${t.batch_status!=='open'?notice(t.note||'Оочир одоогоор '+(labels[t.batch_status]||''),'warning'):t.service_date<state.boot.today?notice('Үйлчлэх өдөр өнгөрсөн байна. ШТС-тай холбогдоно уу.','warning'):t.service_date===state.boot.today&&Number(t.ahead)<=2?notice('Таны ээлж ойртлоо. ШТС дээр очиход бэлдэнэ үү.','warning'):notice('Ээлжээ энэ дэлгэцээс хянаарай.')}<button class="text-btn" data-action="cancel" data-id="${Number(t.id)}">Захиалгаа цуцлах</button>`:''}</article>`;
}
function mine(){chrome(`${title('Миний оочир','Энэ хөтөч дээр авсан таны захиалгууд.')}<div class="live"><span class="dot"></span>10 секунд тутам шинэчлэгдэнэ</div><div id="my-tickets">${state.mine.map(ticketCard).join('')||empty('Та оочир аваагүй байна','ШТС-аа сонгоод утас, машины дугаараа оруулж захиалаарай.')}</div>${state.mine.length?'':btn('ШТС сонгох '+icon('arrow'),'home')}<p class="hint">Захиалгаа харахын тулд энэ төхөөрөмж, хөтчөө ашиглана уу. Хөтчийн cookie-г устгавал захиалгын хандалт алдагдана. Утасны дугаараар бусдын захиалгыг хайх боломжгүй.</p>`);}
function login(){chrome(`${back()}${title('Тавтай морил','Эрхлэгч, түгээгчийн нэвтрэх хэсэг.')}<form class="card form" data-form="login">${field('Нэвтрэх нэр','login','','text','autocomplete="username" required')}${field('Нууц үг','password','','password','autocomplete="current-password" required')}<div class="form-error" role="alert"></div><button class="btn" type="submit">Нэвтрэх ${icon('arrow')}</button><p class="hint">Эрхлэгчийн эрхийг админ, түгээгчийн эрхийг админ эсвэл эрхлэгч үүсгэнэ. Нууц үгээ мартсан бол тэдэнтэй холбогдоорой.</p></form>`);}
function help(){chrome(`${back()}${title('Хэрхэн ашиглах вэ?')}<div class="card stack"><h3>1. ШТС-аа сонгоно</h3><p>Үйлчлэх өдөр, шатахууны төрөл, лимитийг шалгаарай.</p><h3>2. Оочроо авна</h3><p>Машины улсын дугаар, 8 оронтой утсаа оруулаад захиална.</p><h3>3. Ээлжээ харна</h3><p>«Миний оочир» хэсэгт өмнө тань хэдэн машин байгааг харуулна. Ээлж ойртоход ШТС-д очоорой.</p></div>${notice('SMS мэдэгдэл илгээхгүй. Ээлжээ энэ хуудсаар шалгана уу.')}<div class="card"><h3>Очих боломжгүй бол?</h3><p>«Миний оочир» хэсгээс захиалгаа цуцалж, эрхээ бусдад нээгээрэй.</p></div>`);}
function account(){chrome(`${back()}${title(state.boot.name||'Миний эрх',({admin:'Үндсэн админ',manager:'ШТС-ын эрхлэгч',operator:'ШТС-ын түгээгч',guest:'Зочин'})[state.boot.role])}<div class="stack">${state.boot.role!=='guest'?btn('Миний ажил '+icon('arrow'),'work'):btn('Ажилтнаар нэвтрэх','login')}${state.boot.role==='manager'?btn('Захиалгын дүрэм','rules','secondary')+btn('Үйлдлийн түүх','logs','secondary'):''}${state.boot.role==='admin'?`<a class="btn secondary" href="${esc(state.boot.adminUrl)}">Админ самбар ${icon('settings')}</a>`:''}${state.boot.role!=='guest'?btn('Гарах '+icon('logout'),'logout','outline'):''}</div>`);}
const stationOptions=()=>state.ws.stations.map(s=>[s.id,s.name]);
function pickStation(){
 if(!state.ws.stations.some(s=>Number(s.id)===state.station))state.station=Number(state.ws.stations[0]?.id||0);
 return `<div class="station-picker">${select(state.boot.role==='operator'?'Өнөөдөр ажиллах ШТС':'Хариуцаж буй ШТС','station_pick',stationOptions(),state.station)}</div>`;
}
function work(){
 const picker=pickStation(),batches=state.ws.batches.filter(b=>Number(b.station_id)===state.station),manager=state.boot.role!=='operator';
 chrome(`${title(state.boot.role==='operator'?'Өнөөдрийн ээлж':'Миний салбарууд',state.boot.name+' · '+state.boot.today)}${state.ws.stations.length?picker:empty('ШТС оноогоогүй байна','Админ эсвэл эрхлэгчтэйгээ холбогдож хариуцах ШТС-аа оноолгуулна уу.')}${manager&&state.station?btn(icon('plus')+' Шинэ оочир','new-batch'):''}<div class="section-heading"><h2>Оочрын жагсаалт</h2><span class="count">${batches.length}</span></div>${batches.map(b=>`<article class="card"><div class="status-line"><span class="badge ${b.status==='open'?'':b.status==='paused'?'warn':'gray'}">${labels[b.status]}</span><span class="date">${esc(datestr(b.service_date))}</span></div><h3>${esc(b.fuel)} · ${money(b.amount_limit)}</h3><div class="numbers"><div><span class="label">Бүртгэл</span><strong>${b.used} <small>/ ${b.capacity}</small></strong></div><div><span class="label">Хүлээж буй</span><strong>${b.waiting} <small>машин</small></strong></div></div>${btn('Дараалал нээх '+icon('arrow'),'queue','',b.id)}${manager?`<div class="action-row"><button class="text-btn" data-action="copy-batch" data-id="${b.id}">${icon('copy')}Хуулж үүсгэх</button><button class="text-btn" data-action="edit-batch" data-id="${b.id}">${icon('settings')}Засах</button></div>`:''}</article>`).join('')||empty('Оочир үүсээгүй','Энэ салбарын шинэ оочрыг эрхлэгч үүсгэнэ.')}`);
}
function queue(){
 const b=state.ws.batches.find(x=>Number(x.id)===state.batch);if(!b){return work();}
 const next=state.ws.tickets.find(t=>t.status==='waiting'), manager=state.boot.role!=='operator', can=b.status==='open'&&b.service_date===state.boot.today;
 chrome(`${back('work')}${title(b.station_name,b.service_date+' · '+b.fuel)}<div class="progress-pair"><div class="metric"><span class="label">Үйлчилсэн</span><strong>${b.served}</strong></div><div class="metric"><span class="label">Хүлээж байгаа</span><strong>${b.waiting}</strong></div></div>${b.status!=='open'?notice(b.note||labels[b.status],'warning'):''}${b.service_date!==state.boot.today?notice('Үйлчлэх өдөр: '+b.service_date,'warning'):''}${next?`<section class="operator-current"><span class="label">Одоо үйлчлэх машин</span><div class="big">№${Number(next.queue_no)}</div><div class="car">${esc(next.plate)}</div><p>${esc(next.phone)} · ${money(b.amount_limit)}</p><button class="btn" data-action="served" data-id="${next.id}" ${can?'':'disabled'}>${icon('check')}Үйлчилсэн</button><button class="btn secondary" data-action="missed" data-id="${next.id}" ${can?'':'disabled'}>${icon('clock')}Ирээгүй</button></section>`:empty('Хүлээж байгаа машин алга','Шинэ захиалга орвол энд автоматаар харагдана.')}<div class="live"><span class="dot"></span>10 секунд тутам шинэчлэгдэнэ</div>${manager?`<div class="card stack"><h3>Оочир удирдах</h3>${b.status==='open'?btn(icon('pause')+' Түр зогсоох','pause-batch','secondary',b.id):btn('Оочир нээх','open-batch','secondary',b.id)}${b.status!=='closed'?btn('Оочир хаах','close-batch','outline',b.id):''}${btn(icon('copy')+' Хуулж шинэ оочир үүсгэх','copy-batch','outline',b.id)}</div>`:''}<div class="section-heading"><h2>Бүртгэл</h2><span class="count">${state.ws.tickets.length}</span></div><div class="card">${state.ws.tickets.map(t=>`<div class="list-row"><span class="num">${Number(t.queue_no)}</span><div class="grow"><strong>${esc(t.plate)}</strong><small>${esc(t.phone)}</small></div><span class="badge ${t.status==='waiting'?'':'gray'}">${labels[t.status]}</span></div>`).join('')||'<p>Бүртгэл алга.</p>'}</div>`);
}
function tomorrow(value){const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function batchForm(id=0,copy=false){
 const old=state.ws.batches.find(x=>Number(x.id)===Number(id));
 const b=old?{...old}:{station_id:state.station,service_date:tomorrow(state.boot.today),fuel:'АИ-92',capacity:70,amount_limit:50000,open_at:'',close_at:'',note:''};
 if(copy){const newDate=tomorrow(b.service_date<state.boot.today?state.boot.today:b.service_date);const delta=Math.round((new Date(newDate+'T12:00:00')-new Date(b.service_date+'T12:00:00'))/86400000);for(const k of ['open_at','close_at']){if(b[k]){const d=new Date(b[k].slice(0,10)+'T12:00:00');d.setDate(d.getDate()+delta);b[k]=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+b[k].slice(10);}}b.service_date=newDate;b.note='';}
 state.screen='batchForm';
 chrome(`${back('work')}${title(copy?'Хуулж шинэ оочир үүсгэх':id?'Оочир засах':'Шинэ оочир',copy?'Тохиргоо хуулэгдсэн. Өмнөх хүмүүс хуулэгдэхгүй.':'Хадгалмагц оочир нээгдэнэ. Бүртгэлийн цагийг доор тохируулна.')}<form class="form" data-form="save_batch"><input type="hidden" name="id" value="${copy?0:Number(id)}">${select('ШТС','station_id',stationOptions(),b.station_id)}${field('Үйлчлэх өдөр','service_date',b.service_date,'date',`min="${state.boot.today}" required`)}${select('Шатахууны төрөл','fuel',['АИ-92','АИ-95','АИ-98','Дизель','Газ'].map(x=>[x,x]),b.fuel)}${field('Нийт машины тоо','capacity',b.capacity,'number','min="1" max="10000" required')}${field('Нэг машинд олгох лимит ₮','amount_limit',b.amount_limit,'number','min="0" max="10000000" step="1000" required')}<p class="hint">0 гэж оруулбал мөнгөн лимитгүй.</p>${field('Бүртгэл нээх цаг','open_at',b.open_at?.slice(0,16).replace(' ','T')||'','datetime-local')}${field('Бүртгэл хаах цаг','close_at',b.close_at?.slice(0,16).replace(' ','T')||'','datetime-local')}<p class="hint">Хоосон бол шууд захиалга авч, үйлчлэх өдрийн төгсгөлд зогсоно. WordPress-ийн цагийн бүсийг зөв тохируулсан байна.</p><label class="field">Жолоочид харагдах тайлбар<textarea name="note" maxlength="500">${esc(b.note)}</textarea></label><div class="form-error" role="alert"></div><button class="btn" type="submit">${id&&!copy?'Өөрчлөлт хадгалах':'Оочир үүсгэх'} ${icon('check')}</button></form>`);window.scrollTo(0,0);
}
function team(){
 const users=state.ws.users;
 chrome(`${title(cfg.adminPanel?'Ажилтны удирдлага':'Миний түгээгчид','Нэвтрэх эрх, хариуцах салбарыг энд тохируулна.')}<div class="stack">${cfg.adminPanel?btn(icon('plus')+' Эрхлэгч нэмэх','new-manager','secondary'):''}${btn(icon('plus')+' Түгээгч нэмэх','new-operator')}</div><div class="section-heading"><h2>Ажилтнууд</h2><span class="count">${users.length}</span></div>${users.map(u=>`<div class="card"><div class="station-top"><div class="station-logo">${icon('user')}</div><div class="station-meta"><h3>${esc(u.name)}</h3><span class="hint">${u.role==='manager'?'Эрхлэгч':'Түгээгч'} · ${esc(u.login)}</span></div></div><p class="hint">${esc(u.role==='manager'?state.ws.stations.filter(s=>Number(s.manager_id)===Number(u.id)).map(s=>s.name).join(', '):state.ws.stations.filter(s=>u.stations.includes(Number(s.id))).map(s=>s.name).join(', '))||'ШТС оноогоогүй'}</p><button class="text-btn" data-action="edit-user" data-id="${u.id}">${icon('settings')}Эрх, мэдээлэл засах</button></div>`).join('')||empty('Ажилтан бүртгээгүй','Түгээгч нэмэх товчийг дарж эхлээрэй.')}`);
}
function userForm(id=0,role='operator'){
 const u=state.ws.users.find(x=>Number(x.id)===Number(id))||{role,name:'',login:'',manager_id:state.boot.role==='manager'?state.ws.uid:state.ws.users.find(x=>x.role==='manager')?.id||0,stations:[]};
 state.screen='userForm';
 chrome(`${back('team')}${title(id?'Ажилтан засах':u.role==='manager'?'Эрхлэгч нэмэх':'Түгээгч нэмэх')}<form class="form" data-form="save_user"><input type="hidden" name="id" value="${id}"><input type="hidden" name="role" value="${u.role}">${field('Овог, нэр','name',u.name,'text','required maxlength="100"')}${field('Нэвтрэх нэр','login',u.login,'text',`${id?'readonly':'required'} pattern="[a-zA-Z0-9._-]{3,60}" autocomplete="off"`)}${field(id?'Шинэ нууц үг (солих бол)':'Нууц үг','password','','password',`minlength="10" autocomplete="new-password" ${id?'':'required'}`)}<p class="hint">10-аас доошгүй тэмдэгт. Нууц үгийг ажилтанд хувийн сувгаар өгнө үү.</p>${u.role==='operator'?(cfg.adminPanel?select('Хариуцах эрхлэгч','manager_id',state.ws.users.filter(x=>x.role==='manager').map(x=>[x.id,x.name]),u.manager_id):`<input type="hidden" name="manager_id" value="${state.ws.uid}">`)+`<fieldset style="border:0;padding:0;margin:0"><legend>Ажиллах ШТС-ууд</legend><div id="station-checks">${stationChecks(u.manager_id,u.stations)}</div><p class="hint">Ажиллах эрхийг зогсоох бол бүх ШТС-ын сонголтыг арилгана.</p></fieldset>`:''}<div class="form-error" role="alert"></div><button class="btn" type="submit">Хадгалах ${icon('check')}</button></form>`);window.scrollTo(0,0);
}
function stationChecks(manager,selected=[]){return state.ws.stations.filter(s=>Number(s.manager_id)===Number(manager)).map(s=>`<label class="check"><input type="checkbox" name="stations" value="${s.id}" ${selected.includes(Number(s.id))?'checked':''}>${esc(s.name)}</label>`).join('')||'<p class="hint">Энэ эрхлэгчид ШТС оноогоогүй байна.</p>';}
function stations(){chrome(`${title('ШТС-ын удирдлага','Салбар бүрд хариуцах эрхлэгч онооно.')}${btn(icon('plus')+' ШТС нэмэх','new-station')}<div class="section-heading"><h2>Бүх салбар</h2><span class="count">${state.ws.stations.length}</span></div>${state.ws.stations.map(s=>`<div class="card"><div class="station-top"><span class="station-logo">${icon('fuel')}</span><div class="station-meta"><h3>${esc(s.name)}</h3><p class="hint">${esc(s.address)}</p></div></div><p>Эрхлэгч: <strong>${esc(state.ws.users.find(u=>Number(u.id)===Number(s.manager_id))?.name||'—')}</strong></p><span class="badge ${Number(s.active)?'':'gray'}">${Number(s.active)?'Идэвхтэй':'Идэвхгүй'}</span><div class="action-row"><button class="text-btn" data-action="edit-station" data-id="${s.id}">Засах</button><button class="text-btn" data-action="station-work" data-id="${s.id}">Оочрууд ${icon('arrow')}</button></div></div>`).join('')||empty('Эхний ШТС-аа бүртгээрэй','Эхлээд «Ажилтан» хэсгээс эрхлэгч нэмээд, ШТС-аа түүнд онооно уу.')}`);}
function stationForm(id=0){
 const s=state.ws.stations.find(s=>Number(s.id)===Number(id))||{name:'',address:'',manager_id:0,active:1};state.screen='stationForm';
 chrome(`${back('stations')}${title(id?'ШТС засах':'ШТС нэмэх')}<form class="form" data-form="save_station"><input type="hidden" name="id" value="${id}">${field('ШТС-ын нэр','name',s.name,'text','required maxlength="190"')}${field('Байршил, хаяг','address',s.address,'text','required maxlength="255"')}${select('Хариуцах эрхлэгч','manager_id',[[0,'Эрхлэгч сонгох'],...state.ws.users.filter(u=>u.role==='manager').map(u=>[u.id,u.name])],s.manager_id)}${select('Төлөв','active',[[1,'Идэвхтэй'],[0,'Идэвхгүй']],s.active)}<div class="form-error" role="alert"></div><button class="btn" type="submit">Хадгалах ${icon('check')}</button></form>`);
}
function rules(){chrome(`${back(cfg.adminPanel?'stations':'account')}${title('Захиалгын дүрэм','Нэг машин өдөрт хэдэн оочир авахыг тохируулна.')}<form class="card form" data-form="policy">${cfg.adminPanel?select('Бүх ШТС-д мөрдөх дүрэм','global_one',[[0,'Эрхлэгч өөрийн дүрмийг тогтооно'],[1,'Бүх ШТС нийлээд өдөрт нэг оочир']],state.ws.global_one?1:0):`${state.ws.global_one?notice('Админ бүх ШТС-д өдөрт нэг оочир гэсэн дүрэм идэвхжүүлсэн. Энэ нь доорх тохиргооноос давуу үйлчилнэ.','warning'):''}${select('Миний хариуцдаг ШТС-ууд','policy',[['one','Өдөрт нэг оочир'],['per_station','ШТС бүрд нэг оочир']],state.ws.policy)}`}<p class="hint">Өөрчлөлт шинэ захиалгад үйлчилнэ. Өмнөх захиалгыг автоматаар цуцлахгүй. Үйлчлүүлсэн, ирээгүй бүртгэл тухайн өдрийн хязгаарт тооцогдоно.</p><div class="form-error" role="alert"></div><button class="btn" type="submit">Дүрэм хадгалах</button></form>${btn('Үйлдлийн түүх','logs','secondary')}`);}
function logs(){const names={book:'Захиалга авсан',cancel:'Захиалга цуцалсан',served:'Үйлчилсэн',missed:'Ирээгүй',undo:'Үйлдэл буцаасан',create_batch:'Оочир үүсгэсэн',edit_batch:'Оочир зассан',batch_open:'Оочир нээсэн',batch_closed:'Оочир хаасан',batch_paused:'Түр зогсоосон',save_station:'ШТС хадгалсан',save_manager:'Эрхлэгч хадгалсан',save_operator:'Түгээгч хадгалсан',policy:'Дүрэм өөрчилсөн'};chrome(`${back('rules')}${title('Үйлдлийн түүх','Сүүлийн 60 үйлдэл')}<div class="card">${state.ws.logs.map(l=>`<div class="list-row"><div class="grow"><strong>${esc(names[l.event]||l.event)}</strong><small>${esc(l.detail)}</small><small>${esc(l.actor||'Жолооч')} · ${esc(l.created_at)}</small></div></div>`).join('')||'<p>Үйлдлийн түүх алга.</p>'}</div>`);}
async function go(screen){
 if(state.busy)return;
 const request=++state.viewId;state.screen=screen;
 try{
  if(screen==='home'){state.batches=await api('public');if(request!==state.viewId)return;home();}
  else if(screen==='mine'){state.mine=await api('mine');if(request!==state.viewId)return;mine();}
  else if(['work','queue','team','stations','rules','logs'].includes(screen)){
   if(state.boot.role==='guest'){state.screen='login';login();return;}
   if(!cfg.adminPanel&&state.boot.role==='operator'&&['team','rules','logs','stations'].includes(screen)){state.screen='work';screen='work';}
   state.ws=await api('workspace',{batch_id:screen==='queue'?state.batch:0});if(request!==state.viewId)return;
   ({work,queue,team,stations,rules,logs})[screen]();
  }else ({login,help,account})[screen]?.();
  window.scrollTo(0,0);root.querySelector('main')?.focus({preventScroll:true});
 }catch(e){toast(e.message,true);}
}
function formValues(form){const f=new FormData(form),d={};for(const[k,v]of f.entries())d[k]=v;d.stations=f.getAll('stations');return d;}
function confirmDialog(heading,text,action,{input=false,label='Баталгаажуулах',danger=false}={}){
 if(modal)return;const last=document.activeElement;
 const backdrop=document.createElement('div');backdrop.className='modal-backdrop';
 backdrop.innerHTML=`<dialog open aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${esc(heading)}</h2><p>${esc(text)}</p>${input?'<label class="field">Тайлбар<textarea id="dialog-note" maxlength="500" required placeholder="Жишээ: Шатахуун буухыг хүлээж байна."></textarea></label>':''}<div class="form-error" role="alert"></div><button class="btn ${danger?'danger':''}" data-confirm>${esc(label)}</button><button class="btn outline" data-dismiss>Буцах</button></dialog>`;
 root.append(backdrop);modal=backdrop;
 const shell=root.querySelector('.app-shell');shell.inert=true;
 const close=()=>{shell.inert=false;backdrop.remove();modal=null;last?.focus();};
 backdrop.querySelector('[data-dismiss]').onclick=close;
 backdrop.querySelector('[data-confirm]').onclick=async()=>{const n=backdrop.querySelector('textarea');if(n&&!n.reportValidity())return;const button=backdrop.querySelector('[data-confirm]');button.disabled=true;try{await action(n?.value||'');close();}catch(e){backdrop.querySelector('.form-error').innerHTML=notice(e.message,'error');button.disabled=false;}};
 backdrop.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const f=[...backdrop.querySelectorAll('button:not(:disabled),textarea')];if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus();}}};
 (backdrop.querySelector('textarea')||backdrop.querySelector('[data-dismiss]')).focus();
}
root.addEventListener('submit',async e=>{
 const form=e.target.closest('form[data-form]');if(!form)return;e.preventDefault();if(state.busy)return;
 const kind=form.dataset.form,data=formValues(form);
 if(kind==='book'){data.plate=data.plate.toUpperCase().replace(/[\s-]/g,'');if(!/^\d{4}[А-ЯӨҮЁ]{3}$/u.test(data.plate)){form.querySelector('.form-error').innerHTML=notice('Машины дугаарыг 1234ЗАН хэлбэрээр, кирилл үсгээр оруулна уу.','error');return;}}
 state.busy=true;const submit=form.querySelector('[type=submit]'),text=submit.innerHTML;submit.disabled=true;submit.textContent='Түр хүлээнэ үү…';form.querySelector('.form-error').innerHTML='';
 try{
  const result=await api(kind,data);state.busy=false;
  if(kind==='login'){await boot();return;}
  if(kind==='book'){await go('mine');toast('Таны захиалга баталгаажлаа. №'+result.queue_no);}
  else if(kind==='save_batch'){state.station=Number(data.station_id);await go('work');toast('Оочир хадгалагдлаа.');}
  else if(kind==='save_user'){await go('team');toast('Ажилтан хадгалагдлаа.');}
  else if(kind==='save_station'){await go('stations');toast('ШТС хадгалагдлаа.');}
  else if(kind==='policy'){await go('rules');toast('Дүрэм хадгалагдлаа.');}
 }catch(err){form.querySelector('.form-error').innerHTML=notice(err.message,'error');form.querySelector('.form-error').scrollIntoView({block:'center',behavior:'auto'});}
 finally{state.busy=false;submit.disabled=false;submit.innerHTML=text;}
});
root.addEventListener('change',e=>{
 if(e.target.name==='station_pick'){state.station=Number(e.target.value);work();}
 if(e.target.name==='manager_id'&&state.screen==='userForm'){root.querySelector('#station-checks').innerHTML=stationChecks(e.target.value);}
});
root.addEventListener('click',async e=>{
 const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;home();return;}
 const nav=e.target.closest('[data-nav]');if(nav){go(nav.dataset.nav);return;}
 const el=e.target.closest('[data-action]');if(!el||el.disabled||state.busy)return;
 const a=el.dataset.action,id=Number(el.dataset.id||0);
 try{
  if(['home','work','login','rules','logs'].includes(a))return go(a);
  if(a==='book-form')return bookForm(id);
  if(a==='refresh')return go(state.screen);
  if(a==='queue'){state.batch=id;return go('queue');}
  if(a==='station-work'){state.station=id;return go('work');}
  if(a==='new-batch')return batchForm();
  if(a==='copy-batch')return batchForm(id,true);
  if(a==='edit-batch')return batchForm(id);
  if(a==='new-manager')return userForm(0,'manager');
  if(a==='new-operator')return userForm();
  if(a==='edit-user')return userForm(id);
  if(a==='new-station')return stationForm();
  if(a==='edit-station')return stationForm(id);
  if(a==='logout'){await api('logout');await boot();return;}
  if(a==='cancel'){return confirmDialog('Оочроо цуцлах уу?','Таны эрх бусдад нээгдэнэ. Дахин захиалбал шинэ дугаар авна.',async()=>{await api('cancel',{id});await go('mine');toast('Захиалга цуцлагдлаа.');},{label:'Тийм, цуцлах',danger:true});}
  if(a==='pause-batch'||a==='close-batch'||a==='open-batch')return confirmDialog(a==='pause-batch'?'Оочрыг түр зогсоох уу?':a==='close-batch'?'Оочрыг хаах уу?':'Оочрыг нээх үү?',a==='close-batch'?'Шинэ захиалга болон үйлчилгээ зогсоно. Бүртгэл хадгалагдана.':'Өөрчлөлт жолоочийн дэлгэцэд харагдана.',async note=>{await api('batch_state',{id,status:a==='pause-batch'?'paused':a==='close-batch'?'closed':'open',note});await go('queue');toast('Оочрын төлөв шинэчлэгдлээ.');},{input:a==='pause-batch'});
  if(a==='served'||a==='missed'){
   el.disabled=true;state.busy=true;const r=await api('serve',{id,status:a});state.busy=false;await go('queue');toast(a==='served'?'Үйлчилсэн гэж тэмдэглэлээ.':'Ирээгүй гэж тэмдэглэлээ.',false,r.undo_id);return;
  }
  if(a==='undo'){el.disabled=true;await api('undo',{id});await go('queue');toast('Үйлдлийг буцаалаа.');}
 }catch(err){toast(err.message,true);}finally{state.busy=false;el.disabled=false;}
});
async function boot(){
 try{state.boot=await api('boot');nonce=state.boot.nonce;await go(cfg.adminPanel?'stations':state.boot.role==='guest'?'home':'work');}
 catch(e){root.innerHTML=`<div class="app-shell"><main>${title('Холболт амжилтгүй')}${notice(e.message,'error')}<button class="btn" data-retry>Дахин оролдох</button></main></div>`;root.querySelector('[data-retry]').onclick=boot;}
}
setInterval(async()=>{
 if(state.busy||state.polling||modal||document.hidden||!['mine','queue'].includes(state.screen))return;
 state.polling=true;const screen=state.screen,version=state.viewId;
 try{
  if(screen==='mine'){const next=await api('mine');if(state.screen!==screen||version!==state.viewId||state.busy||modal)return;if(JSON.stringify(next)!==JSON.stringify(state.mine)){state.mine=next;const y=window.scrollY;mine();window.scrollTo(0,y);}}
  if(screen==='queue'){const next=await api('workspace',{batch_id:state.batch});if(state.screen!==screen||version!==state.viewId||state.busy||modal)return;if(JSON.stringify(next)!==JSON.stringify(state.ws)){state.ws=next;const y=window.scrollY;queue();window.scrollTo(0,y);}}
 }catch(e){toast(e.message,true);}finally{state.polling=false;}
},10000);
boot();
})();
