import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, onSnapshot, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const firebaseApp=initializeApp(firebaseConfig),auth=getAuth(firebaseApp),db=getFirestore(firebaseApp),$=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0),num=(v,d=1)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(v)||0);
const parseBR=v=>{const s=String(v??'').trim().replace(/\s/g,'');if(!s)return 0;if(s.includes(','))return Number(s.replace(/\./g,'').replace(',','.'))||0;return Number(s)||0};
const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)},icon=t=>({car:'🚗',motorcycle:'🏍️',pickup:'🛻',other:'🚘'}[t]||'🚘');
let user=null,profile=null,garage=null,member=null,state={vehicles:[],fuelings:[],maintenance:[],activeVehicleId:null,theme:localStorage.getItem('fulltank-theme')||'light'},unsubs=[];

function msg(id,text,type=''){const el=$(id);el.textContent=text;el.className='msg '+type}function show(id){$(id).classList.remove('hidden')}function hide(id){$(id).classList.add('hidden')}function openModal(id){$(id).classList.add('open')}function closeModal(id){$(id).classList.remove('open')}
function resetListeners(){unsubs.forEach(x=>x());unsubs=[]}function randomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('')}
function setTheme(){document.documentElement.dataset.theme=state.theme;$('themeBtn').textContent=state.theme==='dark'?'☀️':'🌙';localStorage.setItem('fulltank-theme',state.theme)}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===page));document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===page));window.scrollTo({top:0,behavior:'smooth'})}
function currentKm(id=state.activeVehicleId){const v=state.vehicles.find(x=>x.id===id);return Math.max(Number(v?.km)||0,...state.fuelings.filter(r=>r.vehicleId===id).map(r=>Number(r.currentKm)||0),0)}
function vehicleFuelings(id=state.activeVehicleId){return state.fuelings.filter(r=>r.vehicleId===id)}function vehicleMaintenance(id=state.activeVehicleId){return state.maintenance.filter(r=>r.vehicleId===id)}

$('showRegister').onclick=()=>{hide('loginPanel');show('registerPanel');msg('authMsg','')};$('showLogin').onclick=()=>{hide('registerPanel');show('loginPanel');msg('authMsg','')};
$('loginForm').onsubmit=async e=>{e.preventDefault();try{msg('authMsg','Entrando...');await signInWithEmailAndPassword(auth,$('loginEmail').value.trim(),$('loginPassword').value)}catch(err){msg('authMsg',authError(err),'err')}};
$('registerForm').onsubmit=async e=>{e.preventDefault();const name=$('registerName').value.trim(),pass=$('registerPassword').value;if(pass!==$('registerConfirm').value)return msg('authMsg','As senhas não são iguais.','err');try{msg('authMsg','Criando sua conta...');const cred=await createUserWithEmailAndPassword(auth,$('registerEmail').value.trim(),pass);await updateProfile(cred.user,{displayName:name});await setDoc(doc(db,'users',cred.user.uid),{name,email:cred.user.email,garageId:null,createdAt:serverTimestamp()});}catch(err){msg('authMsg',authError(err),'err')}};
$('forgotBtn').onclick=async()=>{const email=$('loginEmail').value.trim();if(!email)return msg('authMsg','Digite seu e-mail primeiro.','err');try{await sendPasswordResetEmail(auth,email);msg('authMsg','Enviamos o link de recuperação para seu e-mail.','ok')}catch(err){msg('authMsg',authError(err),'err')}};
function authError(err){return ({'auth/email-already-in-use':'Este e-mail já está cadastrado.','auth/invalid-credential':'E-mail ou senha incorretos.','auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.','auth/invalid-email':'Digite um e-mail válido.','auth/too-many-requests':'Muitas tentativas. Aguarde um pouco.'}[err.code]||'Não foi possível concluir. Tente novamente.')}

onAuthStateChanged(auth,async u=>{hide('loadingScreen');resetListeners();user=u;if(!u){hide('appView');hide('tabs');hide('onboardingView');show('authView');return}hide('authView');let snap=await getDoc(doc(db,'users',u.uid));if(!snap.exists()){await setDoc(doc(db,'users',u.uid),{name:u.displayName||u.email.split('@')[0],email:u.email,garageId:null,createdAt:serverTimestamp()});snap=await getDoc(doc(db,'users',u.uid))}profile={id:u.uid,...snap.data()};if(!profile.garageId){show('onboardingView');hide('appView');hide('tabs');return}await enterGarage(profile.garageId)});

$('openCreateGarage').onclick=()=>{show('createGarageForm');hide('joinGarageForm');$('garageModalTitle').textContent='Criar garagem';openModal('garageModal')};$('openJoinGarage').onclick=()=>{hide('createGarageForm');show('joinGarageForm');$('garageModalTitle').textContent='Entrar em uma garagem';openModal('garageModal')};$('onboardingLogout').onclick=()=>signOut(auth);
$('createGarageForm').onsubmit=async e=>{e.preventDefault();try{msg('garageMsg','Criando...');let code=randomCode();while((await getDoc(doc(db,'invites',code))).exists())code=randomCode();const garageRef=doc(collection(db,'garages'));const batch=writeBatch(db);batch.set(garageRef,{name:$('garageName').value.trim(),ownerId:user.uid,inviteCode:code,createdAt:serverTimestamp()});batch.set(doc(db,'garages',garageRef.id,'members',user.uid),{uid:user.uid,name:profile.name,email:user.email,role:'admin',joinedAt:serverTimestamp()});batch.set(doc(db,'invites',code),{garageId:garageRef.id,garageName:$('garageName').value.trim(),ownerId:user.uid,active:true,createdAt:serverTimestamp()});batch.update(doc(db,'users',user.uid),{garageId:garageRef.id});await batch.commit();closeModal('garageModal');location.reload()}catch(err){console.error(err);msg('garageMsg','Não foi possível criar a garagem. Confira as regras do Firestore.','err')}};
$('joinGarageForm').onsubmit=async e=>{e.preventDefault();const code=$('inviteCode').value.trim().toUpperCase();try{const inv=await getDoc(doc(db,'invites',code));if(!inv.exists()||!inv.data().active)return msg('garageMsg','Código inválido ou desativado.','err');const {garageId}=inv.data(),batch=writeBatch(db);batch.set(doc(db,'garages',garageId,'members',user.uid),{uid:user.uid,name:profile.name,email:user.email,role:'member',joinedAt:serverTimestamp()});batch.update(doc(db,'users',user.uid),{garageId});await batch.commit();closeModal('garageModal');location.reload()}catch(err){console.error(err);msg('garageMsg','Não foi possível entrar na garagem.','err')}};

async function enterGarage(garageId){const [g,m]=await Promise.all([getDoc(doc(db,'garages',garageId)),getDoc(doc(db,'garages',garageId,'members',user.uid))]);if(!g.exists()||!m.exists()){await updateDoc(doc(db,'users',user.uid),{garageId:null});location.reload();return}garage={id:g.id,...g.data()};member=m.data();hide('onboardingView');show('appView');show('tabs');$('garageLabel').textContent=garage.name;$('profileName').textContent=profile.name;$('profileGarage').textContent=garage.name;$('profileCode').textContent=garage.inviteCode;$('profileRole').textContent=member.role==='admin'?'Administrador':'Membro';$('driver').placeholder=profile.name;listenCollections();setTheme()}
function listenCollections(){const gid=garage.id;unsubs.push(onSnapshot(query(collection(db,'garages',gid,'vehicles'),orderBy('createdAt','asc')),s=>{state.vehicles=s.docs.map(d=>({id:d.id,...d.data()}));if(!state.vehicles.some(v=>v.id===state.activeVehicleId))state.activeVehicleId=state.vehicles[0]?.id||null;renderAll()}));unsubs.push(onSnapshot(query(collection(db,'garages',gid,'fuelings'),orderBy('createdAt','asc')),s=>{state.fuelings=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));unsubs.push(onSnapshot(query(collection(db,'garages',gid,'maintenance'),orderBy('createdAt','asc')),s=>{state.maintenance=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}))}

document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>go(b.dataset.tab));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));document.querySelectorAll('.modal').forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id)});$('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';setTheme();drawChart()};$('profileBtn').onclick=()=>openModal('profileModal');$('logoutBtn').onclick=()=>signOut(auth);$('manageVehiclesBtn').onclick=()=>{closeModal('profileModal');openModal('vehiclesModal');renderVehiclesList()};$('copyCode').onclick=async()=>{await navigator.clipboard.writeText(garage.inviteCode);$('copyCode').textContent='Copiado!';setTimeout(()=>$('copyCode').textContent='Copiar',1200)};

$('monthSummaryBtn').onclick=openMonthSummary;
$('monthSummaryBtn').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openMonthSummary()}};
$('summaryMonth').onchange=renderMonthSummary;

function renderAll(){if(!garage)return;renderVehicleSwitch();fillVehicleSelects();renderFuelSuggestions();renderDashboard();renderHistory();renderMaintenance();renderCareSummary();const v=state.vehicles.find(x=>x.id===state.activeVehicleId);$('prevKm').value=v?numInput(currentKm(v.id)):'';calcFuel()}
function renderVehicleSwitch(){const wrap=$('vehicleSwitch');wrap.innerHTML='';state.vehicles.forEach(v=>{const b=document.createElement('button');b.className='vehicle-pill'+(v.id===state.activeVehicleId?' active':'');b.textContent=icon(v.type)+' '+v.name;b.onclick=()=>{state.activeVehicleId=v.id;renderAll()};wrap.appendChild(b)});const add=document.createElement('button');add.className='vehicle-pill add';add.textContent='+ Adicionar veículo';add.onclick=()=>{openModal('vehiclesModal');renderVehiclesList()};wrap.appendChild(add)}
function fillVehicleSelects(){const opts=state.vehicles.map(v=>`<option value="${v.id}">${icon(v.type)} ${esc(v.name)}</option>`).join('');['fuelVehicle','historyVehicle','maintenanceVehicle'].forEach(id=>{$(id).innerHTML=opts||'<option value="">Cadastre um veículo</option>';if(state.activeVehicleId)$(id).value=state.activeVehicleId})}
function renderFuelSuggestions(){const unique=values=>[...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));const stations=unique(['Shell','Ipiranga','Petrobras',...state.fuelings.map(r=>r.station)]),drivers=unique([profile?.name,'Ana','José','Neusa',...state.fuelings.flatMap(r=>[r.driver,r.createdByName])]);$('stationSuggestions').innerHTML=stations.map(v=>`<option value="${esc(v)}"></option>`).join('');$('driverSuggestions').innerHTML=drivers.map(v=>`<option value="${esc(v)}"></option>`).join('')}
function renderDashboard(){const v=state.vehicles.find(x=>x.id===state.activeVehicleId),f=[...vehicleFuelings()].sort(sortCreated),last=f.at(-1);$('heroVehicle').textContent=v?icon(v.type)+' '+v.name:'Cadastre um veículo';$('heroAvg').textContent=last?num(last.avg,2)+' km/L':'-- km/L';$('heroFuel').textContent=last?last.fuelType:'Sem registros';const now=new Date(),month=f.filter(r=>{const d=new Date(r.date+'T12:00:00');return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}),totalAmount=sum(f,'amount'),totalKm=sum(f,'km'),totalL=sum(f,'liters');$('monthSpent').textContent=money(sum(month,'amount'));$('costKm').textContent=money(totalKm?totalAmount/totalKm:0);$('generalAvg').textContent=totalL?num(totalKm/totalL,2)+' km/L':'-- km/L';$('currentKm').textContent=currentKm()?num(currentKm(),0):'--';$('bestAvg').textContent=f.length?num(Math.max(...f.map(r=>Number(r.avg)||0)),2)+' km/L':'--';$('totalLiters').textContent=num(totalL,1)+' L';$('allSpent').textContent=money(totalAmount);const year=f.filter(r=>new Date(r.date+'T12:00:00').getFullYear()===now.getFullYear());const activeMonths=new Set(year.map(r=>r.date.slice(0,7))).size;$('yearSpent').textContent=money(sum(year,'amount'));$('monthlyAverage').textContent=money(activeMonths?sum(year,'amount')/activeMonths:0);$('yearFuelCount').textContent=String(year.length);drawChart();drawExpenseChart();renderHomeMaintenance()}
function monthKey(date=new Date()){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')}
function openMonthSummary(){$('summaryMonth').value=monthKey();renderMonthSummary();openModal('monthSummaryModal')}
function renderMonthSummary(){
  const selected=$('summaryMonth').value||monthKey();
  const list=[...vehicleFuelings()].filter(r=>String(r.date||'').slice(0,7)===selected).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const spent=sum(list,'amount'),liters=sum(list,'liters'),km=sum(list,'km');
  $('summarySpent').textContent=money(spent);
  $('summaryAvg').textContent=liters?num(km/liters,2)+' km/L':'— km/L';
  $('summaryCostKm').textContent=money(km?spent/km:0);
  $('summaryLiters').textContent=num(liters,1)+' L';
  $('summaryKm').textContent=num(km,1)+' km';
  $('summaryCount').textContent=String(list.length);
  $('monthFuelList').innerHTML=list.length?list.map(r=>'<div class="item"><div class="itemtop"><div><div class="date">'+new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR')+'</div><strong>'+money(r.amount)+'</strong></div><strong>'+num(r.avg,2)+' km/L</strong></div><div class="details"><span>'+num(r.liters,2)+' litros</span><span>'+num(r.km,1)+' km</span><span>'+esc(r.station||'Posto não informado')+'</span></div></div>').join(''):'<div class="empty">Nenhum abastecimento neste mês.</div>';
}
function sum(arr,key){return arr.reduce((s,r)=>s+(Number(r[key])||0),0)}function sortCreated(a,b){return (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)}
function drawChart(){const canvas=$('avgChart'),data=[...vehicleFuelings()].sort(sortCreated).slice(-10),empty=$('chartEmpty'),dpr=window.devicePixelRatio||1,w=canvas.clientWidth||300,h=240;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);if(data.length<2){canvas.style.display='none';empty.style.display='block';return}canvas.style.display='block';empty.style.display='none';const vals=data.map(r=>Number(r.avg)||0),min=Math.max(0,Math.min(...vals)-1),max=Math.max(...vals)+1,pad={l:38,r:12,t:20,b:35},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b,styles=getComputedStyle(document.documentElement),line=styles.getPropertyValue('--line'),muted=styles.getPropertyValue('--muted'),accent=styles.getPropertyValue('--accent');ctx.strokeStyle=line;ctx.fillStyle=muted;ctx.font='11px sans-serif';for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(num(max-(max-min)*i/3,1),2,y+4)}const pts=data.map((r,i)=>({x:pad.l+cw*i/(data.length-1),y:pad.t+ch*(max-r.avg)/(max-min)}));ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();pts.forEach((p,i)=>{ctx.fillStyle=accent;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.fillStyle=muted;ctx.fillText(new Date(data[i].date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),Math.max(0,p.x-15),h-10)})}

function drawExpenseChart(){
  const canvas=$('expenseChart'),empty=$('expenseChartEmpty'),dpr=window.devicePixelRatio||1,w=canvas.clientWidth||300,h=240;
  const now=new Date(),months=Array.from({length:12},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-11+i,1);return{key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),value:0}});
  const byKey=new Map(months.map(m=>[m.key,m]));
  vehicleFuelings().forEach(r=>{const m=byKey.get(String(r.date||'').slice(0,7));if(m)m.value+=Number(r.amount)||0});
  const max=Math.max(...months.map(m=>m.value),0);
  canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  if(!max){canvas.style.display='none';empty.style.display='block';return}
  canvas.style.display='block';empty.style.display='none';
  const styles=getComputedStyle(document.documentElement),accent=styles.getPropertyValue('--accent'),muted=styles.getPropertyValue('--muted'),line=styles.getPropertyValue('--line'),pad={l:42,r:10,t:20,b:34},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b,slot=cw/months.length,bar=Math.max(6,slot*.58);
  ctx.font='10px sans-serif';ctx.fillStyle=muted;ctx.strokeStyle=line;
  for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(num(max-(max*i/3),0),2,y+4)}
  months.forEach((m,i)=>{const bh=ch*m.value/max,x=pad.l+i*slot+(slot-bar)/2,y=pad.t+ch-bh;ctx.fillStyle=accent;ctx.fillRect(x,y,bar,bh);ctx.fillStyle=muted;ctx.fillText(m.label,x,h-10)});
}


$('fuelDate').value=today();function numInput(v){return String(Number(v)||'').replace('.',',')}function calcFuel(){const p=parseBR($('prevKm').value),c=parseBR($('newKm').value),l=parseBR($('liters').value),priceLiter=parseBR($('priceLiter').value),a=l*priceLiter,km=c>p?c-p:0,avg=l>0?km/l:0,costKm=km>0?a/km:0;$('kmPreview').textContent=num(km,1)+' km';$('avgPreview').textContent=num(avg,2)+' km/L';$('costPreview').textContent=money(costKm);$('amount').value=a?money(a):'';return{p,c,l,a,km,avg,priceLiter,costKm}}
['prevKm','newKm','liters','priceLiter'].forEach(id=>$(id).addEventListener('input',calcFuel));$('lastKmBtn').onclick=()=>{$('prevKm').value=numInput(currentKm($('fuelVehicle').value));calcFuel()};$('fuelVehicle').onchange=()=>{$('prevKm').value=numInput(currentKm($('fuelVehicle').value));calcFuel()};

// Foto da nota: compatível com celular e reduzida para caber no Firestore.
$('receiptPhoto').addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  if(!file){$('receiptPreview').src='';hide('receiptPreview');return}
  if(!file.type.startsWith('image/')){msg('fuelMsg','Escolha uma imagem válida.','err');e.target.value='';return}
  msg('fuelMsg','Preparando a foto...');
  try{
    const dataUrl=await compressReceipt(file);
    $('receiptPreview').src=dataUrl;
    show('receiptPreview');
    msg('fuelMsg','Foto pronta para ser salva.','ok');
  }catch(err){
    console.error(err);
    $('receiptPreview').src='';hide('receiptPreview');e.target.value='';
    msg('fuelMsg','Não consegui abrir essa foto. Tente tirar outra foto ou escolher uma imagem JPG/PNG.','err');
  }
});

async function compressReceipt(file){
  const source=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{
      const el=new Image();
      el.onload=()=>resolve(el);
      el.onerror=()=>reject(new Error('Imagem não suportada'));
      el.src=source;
    });
    let width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;
    const maxSide=1280;
    if(Math.max(width,height)>maxSide){const scale=maxSide/Math.max(width,height);width=Math.round(width*scale);height=Math.round(height*scale)}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
    let quality=.74,data=canvas.toDataURL('image/jpeg',quality);
    // Firestore limita cada documento a ~1 MiB; mantemos a foto abaixo de ~520 KB.
    while(data.length>700000&&quality>.38){quality-=.08;data=canvas.toDataURL('image/jpeg',quality)}
    if(data.length>850000){
      const scale=.72,w=Math.max(480,Math.round(width*scale)),h=Math.max(480,Math.round(height*scale));
      const small=document.createElement('canvas');small.width=w;small.height=h;
      const c=small.getContext('2d',{alpha:false});c.fillStyle='#fff';c.fillRect(0,0,w,h);c.drawImage(canvas,0,0,w,h);
      data=small.toDataURL('image/jpeg',.55);
    }
    if(data.length>900000)throw new Error('Imagem ainda muito grande');
    return data;
  }finally{URL.revokeObjectURL(source)}
}
$('fuelForm').onsubmit=async e=>{
  e.preventDefault();

  const vehicleId=$('fuelVehicle').value;
  const x=calcFuel();
  const editId=$('fuelForm').dataset.editId;

  if(!vehicleId)return alert('Cadastre um veículo primeiro.');
  if(x.c<=x.p)return msg('fuelMsg','O KM atual precisa ser maior que o anterior.','err');
  if(x.l<=0||x.priceLiter<=0)return msg('fuelMsg','Informe os litros e o preço por litro.','err');

  const submitBtn=$('fuelSubmitBtn');
  if(submitBtn.disabled)return;
  submitBtn.disabled=true;
  submitBtn.textContent=editId?'Atualizando...':'Salvando...';

  try{
    const receiptImage=$('receiptPreview').src?.startsWith('data:image')
      ?$('receiptPreview').src
      :'';

    const data={
      vehicleId,
      date:$('fuelDate').value,
      prevKm:x.p,
      currentKm:x.c,
      liters:x.l,
      amount:x.a,
      km:x.km,
      avg:x.avg,
      priceLiter:x.priceLiter,
      costKm:x.costKm,
      station:$('station').value.trim(),
      fuelType:$('fuelType').value,
      driver:$('driver').value.trim()||profile.name,
      fullTank:$('fullTank').checked,
      paymentMethod:$('paymentMethod').value,
      notes:$('fuelNotes').value.trim(),
      receiptImage
    };

    if(editId){
      await updateDoc(
        doc(db,'garages',garage.id,'fuelings',editId),
        {
          ...data,
          updatedAt:serverTimestamp()
        }
      );

      delete $('fuelForm').dataset.editId;

      msg('fuelMsg','Abastecimento atualizado com sucesso.','ok');
    }else{
      const batch=writeBatch(db);

      batch.set(
        doc(collection(db,'garages',garage.id,'fuelings')),
        {
          ...data,
          createdBy:user.uid,
          createdByName:profile.name,
          createdAt:serverTimestamp()
        }
      );

      batch.update(
        doc(db,'garages',garage.id,'vehicles',vehicleId),
        {
          km:x.c,
          updatedAt:serverTimestamp()
        }
      );

      await batch.commit();

      msg('fuelMsg','Abastecimento salvo e sincronizado.','ok');
    }

    e.target.reset();
    $('fuelDate').value=today();
    $('fullTank').checked=true;
    $('receiptPreview').src='';
    hide('receiptPreview');

    setTimeout(()=>go('history'),400);

  }catch(err){
    console.error(err);
    msg('fuelMsg','Não foi possível salvar.','err');
  }finally{
    submitBtn.disabled=false;
    submitBtn.textContent='Salvar abastecimento';
  }
};
function renderHistory(){
  const vehicleId=$('historyVehicle').value||state.activeVehicleId;
  const q=$('searchHistory').value.toLowerCase();

  const list=[...vehicleFuelings(vehicleId)]
    .sort((a,b)=>-sortCreated(a,b))
    .filter(r=>!q||[r.station,r.fuelType,r.driver,r.notes,r.createdByName]
    .join(' ').toLowerCase().includes(q));

  $('historyList').innerHTML=list.length?'':'<div class="empty">Nenhum abastecimento encontrado.</div>';

  list.forEach(r=>{
    const el=document.createElement('div');
    el.className='item';

    el.innerHTML=`
      <div class="itemtop">
        <div>
          <div class="date">
            ${new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR')}
            • por ${esc(r.createdByName||r.driver||'usuário')}
          </div>
          <strong>${num(r.avg,2)} km/L</strong>
        </div>

        ${canDelete(r)?`
          <div class="actions">
            <button class="link edit-fueling">Editar</button>
            <button class="link del">Excluir</button>
          </div>
        `:''}
      </div>

      <div class="details">
        <span>${num(r.km,1)} km rodados</span>
        <span>${num(r.liters,2)} litros</span>
        <span>${money(r.amount)}</span>
        <span>${money(r.priceLiter)}/L</span>
        <span>${esc(r.station||'Posto não informado')}</span>
        <span>${esc(r.driver||'Motorista não informado')}</span>
        <span>${esc(r.paymentMethod||'Pagamento não informado')}</span>
      </div>

      <div class="chips">
        <span class="chip">${esc(r.fuelType)}</span>
        ${r.fullTank?'<span class="chip">Tanque cheio</span>':''}
      </div>

      ${r.notes?`<div class="date" style="margin-top:9px">${esc(r.notes)}</div>`:''}

      ${r.receiptImage?`
        <button class="receipt-open secondary">📷 Ver nota fiscal</button>
        <img class="history-receipt hidden" src="${r.receiptImage}" alt="Nota fiscal">
      `:''}
    `;

    el.querySelector('.receipt-open')?.addEventListener('click',()=>{
      el.querySelector('.history-receipt').classList.toggle('hidden');
    });

    el.querySelector('.edit-fueling')?.addEventListener('click',()=>{
      editFueling(r);
    });

    el.querySelector('.del')?.addEventListener('click',async()=>{
      if(confirm('Tem certeza que deseja excluir este abastecimento?')){
        await deleteDoc(doc(db,'garages',garage.id,'fuelings',r.id));
      }
    });

    $('historyList').appendChild(el);
  });
}
function editFueling(r){
  $('fuelVehicle').value=r.vehicleId;
  $('fuelDate').value=r.date||today();
  $('prevKm').value=numInput(r.prevKm);
  $('newKm').value=numInput(r.currentKm);
  $('liters').value=numInput(r.liters);
  $('priceLiter').value=numInput(r.priceLiter||(Number(r.amount)/Number(r.liters)));
  $('station').value=r.station||'';
  $('fuelType').value=r.fuelType||'Gasolina';
  $('driver').value=r.driver||profile.name;
  $('fullTank').checked=!!r.fullTank;
  $('paymentMethod').value=r.paymentMethod||'';
  $('fuelNotes').value=r.notes||'';

  if(r.receiptImage){
    $('receiptPreview').src=r.receiptImage;
    show('receiptPreview');
  }else{
    $('receiptPreview').src='';
    hide('receiptPreview');
  }

  $('fuelForm').dataset.editId=r.id;

  calcFuel();
  msg('fuelMsg','Editando abastecimento. Altere os dados e salve.','ok');
  go('fuel');
}

function canDelete(r){return member.role==='admin'||r.createdBy===user.uid}$('searchHistory').oninput=renderHistory;$('historyVehicle').onchange=renderHistory;

$('maintenanceForm').onsubmit=async e=>{e.preventDefault();const vehicleId=$('maintenanceVehicle').value;if(!vehicleId)return alert('Cadastre um veículo primeiro.');try{await addDoc(collection(db,'garages',garage.id,'maintenance'),{vehicleId,type:$('maintenanceType').value,desc:$('maintenanceDesc').value.trim(),doneDate:$('maintenanceDoneDate').value||today(),place:$('maintenancePlace').value.trim(),lastKm:parseBR($('maintenanceLastKm').value),nextKm:parseBR($('maintenanceNextKm').value),nextDate:$('maintenanceDate').value,cost:parseBR($('maintenanceCost').value),notes:$('maintenanceNotes').value.trim(),createdBy:user.uid,createdByName:profile.name,createdAt:serverTimestamp()});e.target.reset();msg('maintenanceMsg','Manutenção salva e sincronizada.','ok')}catch(err){console.error(err);msg('maintenanceMsg','Não foi possível salvar.','err')}};
function maintenanceClass(r){const km=currentKm(r.vehicleId),todayDate=new Date();todayDate.setHours(0,0,0,0);const date=r.nextDate?new Date(r.nextDate+'T12:00:00'):null;if((r.nextKm&&km>=r.nextKm)||(date&&date<todayDate))return'maintenance-late';if((r.nextKm&&r.nextKm-km<=1000)||(date&&(date-todayDate)/86400000<=30))return'maintenance-due';return''}
function maintenanceHTML(r,home=false){const v=state.vehicles.find(x=>x.id===r.vehicleId);return `<div class="item ${maintenanceClass(r)}"><div class="itemtop"><div><div class="date">${v?icon(v.type)+' '+esc(v.name):''} • por ${esc(r.createdByName||'usuário')}</div><strong>${esc(r.type)}</strong><div>${esc(r.desc)}</div></div>${!home&&canDelete(r)?'<button class="link del">Excluir</button>':''}</div><div class="details"><span>Realizado em: ${r.doneDate?new Date(r.doneDate+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</span><span>Local: ${esc(r.place||'—')}</span><span>Próximo KM: ${r.nextKm?num(r.nextKm,0):'—'}</span><span>Próxima data: ${r.nextDate?new Date(r.nextDate+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</span><span>Valor: ${money(r.cost)}</span><span>${esc(r.notes||'')}</span></div></div>`}
function renderMaintenance(){const list=[...state.maintenance].sort((a,b)=>-sortCreated(a,b));$('maintenanceList').innerHTML=list.length?'':'<div class="empty">Nenhuma manutenção cadastrada.</div>';list.forEach(r=>{const w=document.createElement('div');w.innerHTML=maintenanceHTML(r);const el=w.firstElementChild;el.querySelector('.receipt-open')?.addEventListener('click',()=>el.querySelector('.history-receipt').classList.toggle('hidden'));el.querySelector('.del')?.addEventListener('click',async()=>{if(confirm('Excluir esta manutenção?'))await deleteDoc(doc(db,'garages',garage.id,'maintenance',r.id))});$('maintenanceList').appendChild(el)})}
function renderHomeMaintenance(){const list=vehicleMaintenance().filter(r=>maintenanceClass(r)).slice(0,3);$('homeMaintenance').innerHTML=list.length?list.map(r=>maintenanceHTML(r,true)).join(''):'<div class="empty">Nenhuma manutenção próxima ou atrasada.</div>'}


function renderCareSummary(){
  const fuel=[...vehicleFuelings()].sort(sortCreated).at(-1);
  const washes=vehicleMaintenance().filter(r=>['Lavagem','Higienização'].includes(r.type)).sort(sortCreated);
  const wash=washes.at(-1);
  const care=[...vehicleMaintenance()].filter(r=>maintenanceClass(r)).sort((a,b)=>{
    const ak=a.nextKm?Math.max(a.nextKm-currentKm(a.vehicleId),0):999999999;
    const bk=b.nextKm?Math.max(b.nextKm-currentKm(b.vehicleId),0):999999999;
    return ak-bk;
  })[0];
  $('lastFuelSummary').textContent=fuel?`${new Date(fuel.date+'T12:00:00').toLocaleDateString('pt-BR')} • ${money(fuel.amount)}`:'Nenhum ainda';
  $('lastWashSummary').textContent=wash?`${new Date((wash.doneDate||today())+'T12:00:00').toLocaleDateString('pt-BR')} • ${money(wash.cost)}`:'Nenhuma ainda';
  $('nextCareSummary').textContent=care?`${care.type}${care.nextKm?' • '+num(Math.max(care.nextKm-currentKm(care.vehicleId),0),0)+' km':''}`:'Tudo em dia';
}
function renderVehiclesList(){const wrap=$('vehiclesList');wrap.innerHTML=state.vehicles.length?'':'<div class="empty">Cadastre o primeiro veículo da garagem.</div>';state.vehicles.forEach(v=>{const el=document.createElement('div');el.className='item vehicle-card';el.innerHTML=`<div style="display:flex;gap:12px;align-items:center"><div class="type-icon">${icon(v.type)}</div><div><strong>${esc(v.name)}</strong><div class="date">${[v.model,v.year,v.plate].filter(Boolean).map(esc).join(' • ')||'Sem detalhes'}</div><div class="date">KM atual: ${num(currentKm(v.id),0)}</div></div></div><div class="actions"><button class="secondary edit">Editar</button>${member.role==='admin'?'<button class="danger del">Excluir</button>':''}</div>`;el.querySelector('.edit').onclick=()=>{$('vehicleEditId').value=v.id;$('vehicleType').value=v.type;$('vehicleName').value=v.name;$('vehicleModel').value=v.model||'';$('vehicleYear').value=v.year||'';$('vehiclePlate').value=v.plate||'';$('vehicleKm').value=numInput(v.km||0);$('vehicleName').focus()};el.querySelector('.receipt-open')?.addEventListener('click',()=>el.querySelector('.history-receipt').classList.toggle('hidden'));el.querySelector('.del')?.addEventListener('click',async()=>{if(confirm('Excluir o veículo? Os registros continuarão no histórico.'))await deleteDoc(doc(db,'garages',garage.id,'vehicles',v.id))});wrap.appendChild(el)})}
$('vehicleForm').onsubmit=async e=>{e.preventDefault();const id=$('vehicleEditId').value,data={type:$('vehicleType').value,name:$('vehicleName').value.trim(),model:$('vehicleModel').value.trim(),year:$('vehicleYear').value.trim(),plate:$('vehiclePlate').value.trim().toUpperCase(),km:parseBR($('vehicleKm').value),updatedAt:serverTimestamp()};try{if(id)await updateDoc(doc(db,'garages',garage.id,'vehicles',id),data);else await addDoc(collection(db,'garages',garage.id,'vehicles'),{...data,createdBy:user.uid,createdByName:profile.name,createdAt:serverTimestamp()});e.target.reset();$('vehicleEditId').value='';msg('maintenanceMsg','');renderVehiclesList()}catch(err){console.error(err);alert('Não foi possível salvar o veículo.')}};
$('csvBtn').onclick=()=>{const rows=[['Veículo','Data','KM anterior','KM atual','KM rodados','Litros','Valor','Preço/L','Km/L','Posto','Combustível','Pagamento','Motorista','Cadastrado por']];state.fuelings.forEach(r=>{const v=state.vehicles.find(x=>x.id===r.vehicleId);rows.push([v?.name||'',r.date,r.prevKm,r.currentKm,r.km,r.liters,r.amount,r.priceLiter,r.avg,r.station,r.fuelType,r.paymentMethod,r.driver,r.createdByName])});const csv='\ufeff'+rows.map(row=>row.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='fulltank-abastecimentos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}window.addEventListener('resize',()=>{drawChart();drawExpenseChart()});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
