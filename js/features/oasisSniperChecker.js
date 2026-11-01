/* APES Oasis Sniper Checker — in-game, opt-in, hoverless influence probe.
 * Uses Travian's existing same-origin influence API via the MAIN-world bridge.
 * All unavailable values remain unknown; no troops or ranks are invented.
 */
(() => {
  'use strict';
  const FEATURE='oasisSniperChecker';
  const UI='APES_QOL_OASIS_SNIPER_UI';
  const BRIDGE='APES_QOL_OASIS_SNIPER_BRIDGE';
  const CLASS='apes-oasis-sniper';
  const VIEW_KEY='apes_oasis_sniper_view_v1';
  const readPreference=()=>{try{return window.localStorage.getItem(VIEW_KEY)==='sniper'?'sniper':'production';}catch(_){return 'production';}};
  const savePreference=view=>{try{window.localStorage.setItem(VIEW_KEY,view);}catch(_){}};
  let selectedView=readPreference();
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
    const right=root?.querySelector('.contentBox.rightBox');
    return right?.querySelector('.contentBoxBody.oasisProduction')?right:null;
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
    return math.evaluate(rows).map(row=>{
      // Display village influence as a whole number, rounded upwards.
      // Proof calculations retain the unrounded server values.
      const base=row.villageInfluence===null?'—':
        Math.ceil(row.villageInfluence).toLocaleString('en-US');
      // 'Unproven' deliberately also covers missing readings: it does not
      // claim that the oasis is empty or troops are absent.
      const finding=row.proof
        ? '<strong class="apes-sniper-confirmed">'+
          row.strictOvertake.toLocaleString('en-US')+' units minimum</strong>'
        : '<span class="apes-sniper-unproven">Unproven</span>';
      return '<tr><td>'+row.rank+'</td><td>'+html(row.name)+'</td><td>'+base+
        '</td><td>'+finding+'</td></tr>';
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
  function applyView(right){
    if(!right)return;
    right.classList.toggle('apes-sniper-view-active',selectedView==='sniper');
    const select=right.querySelector('.apes-sniper-view-select');
    if(select&&select.value!==selectedView)select.value=selectedView;
  }
  function setView(view){
    if(view!=='production'&&view!=='sniper')return;
    selectedView=view;
    savePreference(view);
    const root=popup();
    applyView(elementFor(root));
  }
  function mount(){
    const root=popup();
    const right=elementFor(root);
    if(!right)return;
    if(!enabled()){
      right.classList.remove('apes-sniper-enhanced','apes-sniper-view-active');
      right.querySelector('.apes-sniper-selector')?.remove();
      right.querySelector('.'+CLASS)?.remove();
      return;
    }
    const production=right.querySelector('.contentBoxBody.oasisProduction');
    const header=right.querySelector('.villageDetails.contentBoxHeader h6');
    if(!production||!header)return;

    // Keep Travian's Angular-rendered Production content untouched.
    // Only hide it when the saved Oasis Sniper view is selected.
    if(!right.querySelector('.apes-sniper-selector')){
      const selector=document.createElement('span');
      selector.className='apes-sniper-selector';
      selector.innerHTML='<select class="apes-sniper-view-select" '+
        'aria-label="Oasis information view">'+
        '<option value="production">Production</option>'+
        '<option value="sniper">Oasis Sniper</option></select>';
      const dropdown=selector.querySelector('select');
      dropdown.value=selectedView;
      dropdown.addEventListener('click',event=>event.stopPropagation());
      dropdown.addEventListener('change',event=>{
        event.stopPropagation();
        setView(dropdown.value);
      });
      header.appendChild(selector);
    }

    if(!right.querySelector('.'+CLASS)){
      const div=document.createElement('div');
      div.className='contentBoxBody '+CLASS;
      div.innerHTML='<div class="apes-sniper-head"><strong>Oasis Sniper</strong>'+
        '<span class="apes-sniper-trigger" role="button" tabindex="0">Check influence</span></div>'+
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
      production.insertAdjacentElement('afterend',div);
      render(div,null,'Ready');
    }
    right.classList.add('apes-sniper-enhanced');
    applyView(right);
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
    scan,ranking,oasisId,setView,getView:()=>selectedView,
    calculate:math.evaluate,getLastResults:()=>currentResults?.map(row=>({...row}))||null
  });
})();
