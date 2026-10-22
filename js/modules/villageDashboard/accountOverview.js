(function accountOverview(){
  'use strict';
  const ROOT='apes-v2-village-overlay',KEY='apes_qol_account_population_history_v1',SOURCE='APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const TRAINING={19:'Barracks',20:'Stable',21:'Workshop',29:'Great Barracks',30:'Great Stable'};
  let snapshot=null,lastPopulation='',lastRender='',armyBusy=false;
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v===''||v==null?null:Number.isFinite(Number(v))?Number(v):null;
  const fmt=v=>Math.round(Number(v)||0).toLocaleString();
  const compact=v=>{const n=Number(v)||0;return Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'m':Math.abs(n)>=1e3?(n/1e3).toFixed(1)+'k':fmt(n);};
  const ts=v=>{const n=num(v);return n!=null&&n>0?(n<1e11?n*1000:n):null;};
  const day=timestamp=>{const d=new Date(timestamp);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const dateLabel=d=>String(d).slice(8,10)+'/'+String(d).slice(5,7);
  const storageKey=p=>`${KEY}:${location.host}:${p}`;
  function popHistory(player){
    try{const data=JSON.parse(localStorage.getItem(storageKey(player))||'[]');return Array.isArray(data)?data.filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v?.day)&&num(v.population)!=null).sort((a,b)=>a.day.localeCompare(b.day)).slice(-365):[];}catch(_){return [];}
  }
  function recordPopulation(payload){
    const villages=payload?.villages,player=String(payload?.playerId||'');
    if(!/^\d+$/.test(player)||!Array.isArray(villages)||!villages.length||villages.some(v=>!v?.villageId||num(v.population)==null||Number(v.population)<0))return;
    const ids=villages.map(v=>String(v.villageId));
    if(new Set(ids).size!==ids.length)return;
    const population=villages.reduce((n,v)=>n+Number(v.population),0),today=day(Date.now()),signature=player+'|'+today+'|'+population+'|'+ids.sort().join(',');
    if(signature===lastPopulation)return;
    const records=popHistory(player),i=records.findIndex(r=>r.day===today);
    if(i>=0&&records[i].population===population&&records[i].villages===villages.length){lastPopulation=signature;return;}
    const next={day:today,population,villages:villages.length,timestamp:Date.now()};
    if(i>=0)records[i]=next;else records.push(next);
    try{localStorage.setItem(storageKey(player),JSON.stringify(records.slice(-365)));lastPopulation=signature;}
    catch(error){console.warn('[APES Account Overview] Population history storage failed:',error);}
  }
  function armyHistory(payload){
    const villages=payload?.villages||[],api=window.APES?.villageDashboardIntel;
    if(!villages.length||!api?.historyForVillage||!api?.powerForCounts)return [];
    const perVillage=villages.map(v=>({v,rows:api.historyForVillage(v.villageId)}));
    if(perVillage.some(x=>!x.rows.length))return [];
    const dates=new Map();
    for(const {v,rows} of perVillage)for(const scan of rows){
      const date=scan.day||day(scan.timestamp);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      if(!dates.has(date))dates.set(date,new Map());
      const group=dates.get(date),id=String(v.villageId),current=group.get(id);
      if(!current||Number(scan.timestamp)>Number(current.timestamp))group.set(id,scan);
    }
    return [...dates].filter(([_,group])=>group.size===villages.length).map(([date,group])=>{
      let troops=0,attack=0,defense=0;
      for(const {v} of perVillage){
        const entry=group.get(String(v.villageId)),counts=entry?.counts;
        if(!Array.isArray(counts)||counts.length<10||counts.some(c=>num(c)==null||Number(c)<0))return null;
        troops+=counts.reduce((a,b)=>a+Number(b),0);
        const p=api.powerForCounts(entry.tribeId||v.tribeId,counts);
        attack+=p.attack;defense+=(p.defInf+p.defCav)/2;
      }
      return {day:date,troops,attack,defense};
    }).filter(Boolean).sort((a,b)=>a.day.localeCompare(b.day)).slice(-365);
  }
  function activeQueues(villages){
    let total=0;const rows=[];
    for(const v of villages){
      let count=0;const summary=[];
      for(const [type,label] of Object.entries(TRAINING)){
        const items=v.unitQueue?.buildingTypes?.[type];
        if(!Array.isArray(items))continue;
        const amount=items.reduce((sum,item)=>sum+Math.max(0,num(item?.count)||0),0);
        if(amount){count+=amount;summary.push(label+': '+fmt(amount));}
      }
      total+=count;if(count)rows.push({id:String(v.villageId),name:String(v.name||'Village'),count,details:summary.join(' · ')});
    }
    rows.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
    return {total,rows};
  }
  function celebrationCounts(villages){
    const active=[],idle=[];
    for(const v of villages){
      const end=ts(v.celebrationEnd),type=Number(v.celebrationType);
      const row={id:String(v.villageId),name:String(v.name||'Village'),end,
        label:type===2?'Great celebration':type===1?'Small celebration':'Celebration'};
      (end&&end>Date.now()?active:idle).push(row);
    }
    active.sort((a,b)=>a.end-b.end);idle.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    return {active,idle};
  }
  function graph(title,subtitle,records,lines,empty){
    const last=records.at(-1),header=`<div class="apes-ao-chart-head"><div><strong>${safe(title)}</strong><small>${safe(subtitle)}</small></div>${last?`<b>${safe(compact(lines[0].values.at(-1)))}</b>`:''}</div>`;
    if(!records.length)return `<section class="apes-ao-chart">${header}<div class="apes-ao-empty">${safe(empty)}</div></section>`;
    const W=400,H=190,L=46,R=10,T=12,B=30,PW=W-L-R,PH=H-T-B;
    const value=Math.max(1,...lines.flatMap(l=>l.values)),base=Math.pow(10,Math.floor(Math.log10(value))),ratio=value/base,max=base*(ratio<=1?1:ratio<=2?2:ratio<=5?5:10);
    const x=i=>records.length<=1?L+PW/2:L+PW*i/(records.length-1),y=v=>T+PH*(1-Math.max(0,v)/max);
    const grid=[0,.25,.5,.75,1].map(f=>`<line class="apes-ao-gridline" x1="${L}" x2="${W-R}" y1="${y(max*f)}" y2="${y(max*f)}"/><text class="apes-ao-axis" x="${L-7}" y="${y(max*f)+3}" text-anchor="end">${safe(compact(max*f))}</text>`).join('');
    const paths=lines.map(line=>{
      const points=line.values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const path=records.length>1?`<polyline points="${points}" fill="none" stroke="${line.color}" stroke-width="2.5" stroke-linejoin="round"/>`:'';
      return path+line.values.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${line.color}"><title>${safe(line.name)} · ${safe(fmt(v))} · ${safe(records[i].day)}</title></circle>`).join('');
    }).join('');
    const labels=[...new Set([0,Math.floor((records.length-1)/2),records.length-1])].map(i=>`<text class="apes-ao-axis" x="${x(i).toFixed(1)}" y="${H-8}" text-anchor="${i===0?'start':i===records.length-1?'end':'middle'}">${safe(dateLabel(records[i].day))}</text>`).join('');
    const legend=lines.length>1?`<div class="apes-ao-legend">${lines.map(l=>`<span><i style="background:${l.color}"></i>${safe(l.name)} <b>${safe(compact(l.values.at(-1)))}</b></span>`).join('')}</div>`:'';
    return `<section class="apes-ao-chart">${header}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${safe(title)} graph">${grid}${paths}${labels}</svg>${legend}<small class="apes-ao-chart-foot">${records.length} recorded day${records.length===1?' · More scans will build the trend':'s'}</small></section>`;
  }
  function villageRow(row,info,details=''){
    return `<div class="apes-ao-village-link" data-apes-ao-village="${safe(row.id)}" role="button" tabindex="0" title="Open ${safe(row.name)}"><span>${safe(row.name)}</span><em>${info}</em>${details}</div>`;
  }
  function render(data=snapshot){
    if(data)snapshot=data;
    const root=document.querySelector(`#${ROOT} .apes-v2-village-dashboard`),panel=root?.querySelector('.apes-vd-account-overview');
    if(!root?.classList.contains('apes-vd-account-mode')||!panel||!Array.isArray(snapshot?.villages))return;
    const villages=snapshot.villages;
    const pop=popHistory(snapshot.playerId).slice(-30),army=armyHistory(snapshot).slice(-30),last=army.at(-1);
    const c=celebrationCounts(villages),q=activeQueues(villages);
    const population=villages.reduce((a,v)=>a+Math.max(0,num(v.population)||0),0);
    const signature=JSON.stringify({population,pop,army,c,q,busy:armyBusy,player:snapshot.playerId});
    if(signature===lastRender)return;
    lastRender=signature;
    const stats=[['Villages',fmt(villages.length),'Owned villages'],['Population',fmt(population),'Combined population'],
      ['Own troops',last?fmt(last.troops):'—',last?'Last army scan · '+dateLabel(last.day):'Run Scan Army'],
      ['Training',fmt(q.total),'Troops in training queues'],['Celebrations',fmt(c.active.length),fmt(c.idle.length)+' villages idle']]
      .map(([title,value,note])=>`<div class="apes-ao-stat"><span>${safe(title)}</span><strong>${safe(value)}</strong><small>${safe(note)}</small></div>`).join('');
    const charts=[
      graph('Population Development','Daily account population',pop,[{name:'Population',color:'#a5d76b',values:pop.map(x=>Number(x.population))}],'Population tracking starts with your first dashboard snapshot.'),
      graph('Army Development','Own troops · complete daily scans',army,[{name:'Troops',color:'#bd9feb',values:army.map(x=>x.troops)}],'No complete account-wide troop history yet. Use Scan Army.'),
      graph('Power Development','Offensive power and average defensive power',army,[
        {name:'Attack',color:'#df886a',values:army.map(x=>x.attack)},
        {name:'Defense',color:'#73b3db',values:army.map(x=>x.defense)}
      ],'Scan Army to create a complete account power snapshot.')
    ].join('');
    const celebrating=c.active.map(v=>villageRow(v,`${safe(v.label)} · <span class="apes-vd-countdown" data-finish-ms="${v.end}">—</span>`)).join('');
    const idle=c.idle.map(v=>villageRow(v,'Idle')).join('');
    const training=q.rows.map(v=>villageRow(v,fmt(v.count)+' queued',`<small>${safe(v.details)}</small>`)).join('');
    panel.innerHTML=`
      <div class="apes-ao-topline"><div><strong>Account at a glance</strong><small>Latest village cache · Scan Now refreshes villages</small></div>
        <div class="apes-ao-scan-army" role="button" tabindex="0" aria-disabled="${armyBusy}">${armyBusy?'Scanning Army…':'Scan Army'}</div></div>
      <div class="apes-ao-stats">${stats}</div><div class="apes-ao-charts">${charts}</div>
      <div class="apes-ao-management">
        <section class="apes-ao-manager"><div class="apes-ao-manager-head"><strong>Celebration Manager</strong><small>${fmt(c.active.length)} active · ${fmt(c.idle.length)} idle villages</small></div>
          <div class="apes-ao-counters"><span>Celebrating <b>${fmt(c.active.length)}</b></span><span>Idle <b>${fmt(c.idle.length)}</b></span></div>
          <div class="apes-ao-manager-split"><div><h4>Active celebrations</h4>${celebrating||'<p class="apes-ao-empty-list">No active celebrations</p>'}</div>
            <div><h4>Idle villages</h4>${idle||'<p class="apes-ao-empty-list">All villages celebrating</p>'}</div></div></section>
        <section class="apes-ao-manager"><div class="apes-ao-manager-head"><strong>Training Overview</strong><small>${fmt(q.total)} troops queued in ${fmt(q.rows.length)} villages</small></div>
          <div class="apes-ao-counters"><span>Total queued <b>${fmt(q.total)}</b></span><span>Active villages <b>${fmt(q.rows.length)}</b></span></div>
          <div class="apes-ao-training-list">${training||'<p class="apes-ao-empty-list">No active training found</p>'}</div>
          <small class="apes-ao-caveat">Barracks, Stable, Workshop and Great variants. Healing excluded.</small></section>
      </div>`;
  }
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-apes-ao-village],.apes-ao-scan-army');
    if(!target?.closest?.('.apes-vd-account-overview'))return;
    event.preventDefault();event.stopPropagation();
    if(target.hasAttribute('data-apes-ao-village')){
      const id=String(target.dataset.apesAoVillage);
      if(!/^\d+$/.test(id))return;
      window.APES_VILLAGE_PALETTE?.close?.();location.hash='#/page:village/villId:'+id;return;
    }
    if(armyBusy||!window.APES?.villageDashboardIntel?.refreshTroops)return;
    armyBusy=true;lastRender='';render();
    Promise.resolve(window.APES.villageDashboardIntel.refreshTroops()).catch(error=>console.warn('[APES Account Overview] Army scan failed',error))
      .finally(()=>{armyBusy=false;lastRender='';render();});
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const target=event.target?.closest?.('[data-apes-ao-village],.apes-ao-scan-army');
    if(!target)return;
    event.preventDefault();target.click();
  },true);
  window.addEventListener('message',event=>{
    if(event.source!==window||event.data?.source!==SOURCE||event.data?.type!=='VILLAGE_SNAPSHOT'||!Array.isArray(event.data?.payload?.villages))return;
    snapshot=event.data.payload;recordPopulation(snapshot);render();
  });
  window.addEventListener('apes_vd_army_history_updated',()=>{lastRender='';render();});
  window.APES_ACCOUNT_OVERVIEW=Object.freeze({render});
})();
