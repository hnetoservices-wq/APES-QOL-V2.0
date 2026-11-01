/* APES Oasis Sniper Checker — in-game, opt-in, hoverless influence probe.
 * Uses Travian's existing Angular request via the MAIN-world bridge.
 * All unavailable values remain unknown; no troops or ranks are invented.
 */
(() => {
  'use strict';
  const FEATURE='oasisSniperChecker';
  const UI='APES_QOL_OASIS_SNIPER_UI';
  const BRIDGE='APES_QOL_OASIS_SNIPER_BRIDGE';
  const CLASS='apes-oasis-sniper';
  const ROW='[tooltip-data-request^="requestInfluenceData;"]';
  const math=window.APES_OASIS_SNIPER_MATH;
  if(!math)return;
  let pending=new Map(), sequence=0, working=false, refreshTimer=0, currentResults=null;
  const enabled=()=>typeof window.isQolEnabled!=='function'||window.isQolEnabled(FEATURE)===true;
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const html=value=>clean(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const unique=()=> 'oes_'+Date.now().toString(36)+'_'+(++sequence).toString(36);
  function ranking(root){
    const rows=Array.from(root.querySelectorAll(ROW));
    return rows.map(row=>{
      const id=row.getAttribute('tooltip-data-request')?.match(/^requestInfluenceData;(\d+)$/)?.[1];
      const link=row.querySelector('a.playerLink[playerid]');
      if(!id||!link||link.getAttribute('playerid')!==id)return null;
      return {playerId:id,name:clean(link.textContent),villageInfluence:null,diagnostic:''};
    }).filter(Boolean);
  }
  function popup(){
    return Array.from(document.querySelectorAll('window.modalWrapper.mapCellDetails'))
      .find(root=>root.querySelector('.contentBoxBody.oasisDetails '+ROW))||null;
  }
  function elementFor(root){
    const list=root?.querySelector('.contentBoxBody.oasisDetails '+ROW)?.parentElement;
    return list||null;
  }
  function oasisId(root){
    const header=root.querySelector('.contentBoxBody.oasisDetails')?.
      closest('.contentBox')?.querySelector('.coordinateWrapper[x][y]');
    if(!header)return '';
    const click=header.querySelector('[clickable*="centerId"]')?.
      getAttribute('clickable')||'';
    const native=click.match(/centerId['"]?\s*,\s*['"](\d+)(?:_[^'"]*)?['"]/i)?.[1];
    if(native)return native;
    const x=Number(header.getAttribute('x')),y=Number(header.getAttribute('y'));
    return Number.isInteger(x)&&Number.isInteger(y)&&
      Math.abs(x)<=16384&&Math.abs(y)<=16384?
      String((y+16384)*32768+(x+16384)):'';
  }
  function message(playerId,oasisId){
    return new Promise(resolve=>{
      const requestId=unique();
      const timer=window.setTimeout(()=>{
        pending.delete(requestId);
        resolve({status:'timeout',diagnostic:'No reply from game influence bridge'});
      },5400);
      pending.set(requestId,{resolve,timer,playerId});
      window.postMessage({source:UI,type:'INFLUENCE_REQUEST',playerId,oasisId,requestId},location.origin);
    });
  }
  function resultsTable(rows){
    const calculated=math.evaluate(rows);
    return calculated.map(row=>{
      const base=row.villageInfluence===null?'—':String(row.villageInfluence);
      let diagnosis;
      if(row.status==='confirmed'){
        diagnosis='<strong class="apes-sniper-confirmed">Troops required</strong>' +
          '<small>Rank '+row.rank+' above '+html(row.witness)+' (village influence '+
          row.witnessBaseline+'); at least '+row.minimumInfluenceFromTroops+
          ' troop influence needed to match.</small>';
      }else if(row.status==='possible'){
        diagnosis='<span>Not proven</span>';
      }else{
        diagnosis='<span>Unknown</span>'+
          (row.diagnostic?'<small class="apes-sniper-diagnostic">'+html(row.diagnostic)+'</small>':'');
      }
      return '<tr><td>'+row.rank+'</td><td>'+html(row.name)+'</td><td>'+base+
        '</td><td>'+diagnosis+'</td></tr>';
    }).join('');
  }
  function render(box,rows,status){
    if(!box)return;
    const indicator=box.querySelector('.apes-sniper-status');
    if(indicator)indicator.textContent=status;
    const target=box.querySelector('.apes-sniper-results');
    if(!target)return;
    if(!rows){
      target.innerHTML='<div class="apes-sniper-empty">Check the current oasis to request village influence without hovering.</div>';
      return;
    }
    const confirmed=math.evaluate(rows).filter(r=>r.proof).length;
    target.innerHTML='<div class="apes-sniper-summary">'+confirmed+' proven troop-presence '+
      (confirmed===1?'case':'cases')+' · '+rows.filter(r=>r.villageInfluence!==null).length+
      '/'+rows.length+' village values</div>'+
      '<div class="apes-sniper-scroll"><table><thead><tr><th>#</th><th>Player</th>'+
      '<th>Village influence</th><th>Finding</th></tr></thead><tbody>'+
      resultsTable(rows)+'</tbody></table></div>';
  }
  async function scan(){
    if(working||!enabled())return false;
    const root=popup(),container=elementFor(root);
    const box=container?.querySelector('.'+CLASS);
    if(!root||!box)return false;
    const rows=ranking(root);
    const selectedOasisId=oasisId(root);
    if(!rows.length||!selectedOasisId){
      if(box)render(box,rows.length?rows:null,'Oasis coordinates not available');
      return false;
    }
    working=true;
    const current=box;
    const signature=rows.map(row=>row.playerId).join('|');
    currentResults=null;
    current.classList.add('apes-sniper-busy');
    render(current,rows,'Reading game influence data…');
    try{
      for(let i=0;i<rows.length;i++){
        // The visible map popup must still represent the same ranking.
        if(!current.isConnected || !enabled() ||
          ranking(root).map(row=>row.playerId).join('|')!==signature){
          render(current,rows,'Oasis changed — stopped');
          return false;
        }
        render(current,rows,'Checking '+(i+1)+'/'+rows.length+': '+rows[i].name);
        const result=await message(rows[i].playerId,selectedOasisId);
        if(result.status==='ok'&&Number.isFinite(result.villageInfluence)&&result.villageInfluence>=0){
          rows[i].villageInfluence=result.villageInfluence;
        }else{
          rows[i].diagnostic=result.status+(result.diagnostic?' — '+result.diagnostic:'');
        }
        render(current,rows,'Checking '+(i+1)+'/'+rows.length);
      }
      currentResults=rows.map(row=>({...row}));
      render(current,rows,'Checked '+rows.length+' players');
      return true;
    }finally{
      working=false;
      current.classList.remove('apes-sniper-busy');
    }
  }
  function mount(){
    const root=popup();
    const parent=elementFor(root);
    if(!parent)return;
    const old=parent.querySelector('.'+CLASS);
    if(!enabled()){
      old?.remove();
      return;
    }
    if(old)return;
    const div=document.createElement('div');
    div.className=CLASS;
    div.innerHTML='<div class="apes-sniper-head"><strong>Oasis Sniper Checker</strong>'+
      '<div class="apes-sniper-trigger" role="button" tabindex="0">Check influence</div></div>'+
      '<div class="apes-sniper-status">Ready</div>'+
      '<div class="apes-sniper-results"></div>';
    const trigger=div.querySelector('.apes-sniper-trigger');
    trigger.addEventListener('click',event=>{
      event.stopPropagation();
      void scan();
    });
    trigger.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      if(!event.repeat)void scan();
    });
    parent.appendChild(div);
    render(div,null,'Ready');
  }
  function refresh(){
    if(refreshTimer)return;
    refreshTimer=window.setTimeout(()=>{refreshTimer=0;mount();},150);
  }
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin)return;
    const data=event.data;
    if(data?.source!==BRIDGE||data.type!=='INFLUENCE_RESULT')return;
    const waiter=pending.get(data.requestId);
    if(!waiter||waiter.playerId!==data.playerId)return;
    pending.delete(data.requestId);
    window.clearTimeout(waiter.timer);
    waiter.resolve(data);
  });
  window.addEventListener('qol_setting_changed',event=>{
    if(event.detail?.key===FEATURE)refresh();
  });
  const init=()=>{
    new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
    mount();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.APES_OASIS_SNIPER=Object.freeze({
    scan,ranking,oasisId,calculate:math.evaluate,getLastResults:()=>currentResults?.map(row=>({...row}))||null
  });
})();
