/* APES Oasis Sniper Checker — in-game, opt-in, hoverless influence probe.
 * Uses Travian's existing same-origin influence API via the MAIN-world bridge.
 * All unavailable values remain unknown; no troops or ranks are invented.
 */
(() => {
  'use strict';
const apesHtml_oasisSniperChecker = window.APES?.i18n?.html || ((s, ...v) => String.raw({ raw: s }, ...v));

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
  let scheduledScan=null, refreshAfterScan=null;
  const RANKING_SETTLE_MS=600;
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
      const name=clean(link.getAttribute('playername')||link.textContent);
      // Travian populates names asynchronously; empty names are not usable.
      if(!name)return null;
      return {playerId:id,name,villageInfluence:null,diagnostic:''};
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
        ? apesHtml_oasisSniperChecker`<strong class="apes-sniper-confirmed">`+
          row.strictOvertake.toLocaleString('en-US')+apesHtml_oasisSniperChecker` units minimum</strong>`
        : apesHtml_oasisSniperChecker`<span class="apes-sniper-unproven">Unproven</span>`;
      return apesHtml_oasisSniperChecker`<tr><td>`+row.rank+apesHtml_oasisSniperChecker`</td><td>`+html(row.name)+apesHtml_oasisSniperChecker`</td><td>`+base+
        apesHtml_oasisSniperChecker`</td><td>`+finding+'</td></tr>';
    }).join('');
  }
  // No extra headings, status lines or summaries: the native title dropdown
  // already identifies the view, and each row carries the complete finding.
  function render(box,rows){
    const target=box?.querySelector('.apes-sniper-results');
    if(!target)return;
    if(!rows){
      target.innerHTML='';
      return;
    }
    target.innerHTML=apesHtml_oasisSniperChecker`<div class="apes-sniper-scroll"><table class="apes-sniper-table"><thead><tr>`+
      apesHtml_oasisSniperChecker`<th>#</th><th>Player</th><th>Village influence</th>`+
      apesHtml_oasisSniperChecker`<th>Finding</th></tr></thead><tbody>`+resultsTable(rows)+
      '</tbody></table></div>';
  }
  // The first frame of an oasis may contain all the influence rows but not
  // their Angular player names yet. Never scan or cache that partial snapshot.
  function readyRanking(root){
    const all=Array.from(root?.querySelectorAll(ROW)||[]);
    const rows=ranking(root);
    const id=root?oasisId(root):'';
    if(!id||!all.length||rows.length!==all.length)return null;
    return {rows,signature:id+'|'+rows.map(row=>row.playerId+':'+row.name).join('|')};
  }
  function cancelScheduledScan(){
    if(!scheduledScan)return;
    window.clearTimeout(scheduledScan.timer);
    scheduledScan=null;
  }
  // Debounce *changes in the ranking*, not every DOM mutation. This keeps
  // APES' own results-table updates from causing more server requests.
  function autoScan(root,right){
    if(!enabled())return;
    const box=right?.querySelector('.'+CLASS);
    if(!box)return;
    const ready=readyRanking(root);
    if(!ready){
      cancelScheduledScan();
      return;
    }
    if(box.dataset.apesSniperScanKey===ready.signature||working)return;
    if(scheduledScan?.box===box&&scheduledScan.signature===ready.signature)return;
    cancelScheduledScan();
    const candidate={box,signature:ready.signature,timer:0};
    scheduledScan=candidate;
    candidate.timer=window.setTimeout(()=>{
      if(scheduledScan!==candidate)return;
      scheduledScan=null;
      if(!box.isConnected||popup()!==root||!enabled()||working)return;
      const latest=readyRanking(root);
      if(!latest||latest.signature!==candidate.signature){
        refresh();
        return;
      }
      if(box.dataset.apesSniperScanKey===latest.signature)return;
      // Mark only after the list is complete and stable.
      box.dataset.apesSniperScanKey=latest.signature;
      void scan();
    },RANKING_SETTLE_MS);
  }
  // User-initiated refresh bypasses the one-scan-per-ranking cache. If a
  // request is active, queue exactly one replacement scan after it finishes.
  function requestRefresh(){
    const root=popup(),right=elementFor(root);
    const box=right?.querySelector('.'+CLASS);
    if(!box||!enabled())return false;
    cancelScheduledScan();
    box.dataset.apesSniperScanKey='';
    if(working){
      refreshAfterScan=box;
    }else{
      render(box,null);
      autoScan(root,right);
    }
    return true;
  }
  async function scan(){
    if(working||!enabled())return false;
    const root=popup(),container=elementFor(root);
    const box=container?.querySelector('.'+CLASS);
    if(!root||!box)return false;
    const ready=readyRanking(root);
    if(!ready)return false;
    const rows=ready.rows;
    const selectedOasisId=oasisId(root);
    working=true;
    const current=box;
    const signature=ready.signature;
    current.dataset.apesSniperScanKey=signature;
    container.querySelector('.apes-sniper-refresh')?.classList.add('is-refreshing');
    currentResults=null;
    current.classList.add('apes-sniper-busy');
    current.setAttribute('aria-busy','true');
    render(current,rows);
    try{
      for(let i=0;i<rows.length;i++){
        // The visible map popup must still represent the same ranking.
        if(!current.isConnected || !enabled() || popup()!==root ||
          readyRanking(root)?.signature!==signature)
          return false;
        const result=await message(rows[i].playerId,selectedOasisId);
        // The native modal can reuse its DOM for a different oasis while a
        // read is in flight; don't let old responses repaint the new oasis.
        if(!current.isConnected || popup()!==root ||
          readyRanking(root)?.signature!==signature)
          return false;
        if(result.status==='ok'&&Number.isFinite(result.villageInfluence)&&result.villageInfluence>=0){
          rows[i].villageInfluence=result.villageInfluence;
        }else{
          rows[i].diagnostic=result.status+(result.diagnostic?' — '+result.diagnostic:'');
        }
        render(current,rows);
      }
      currentResults=rows.map(row=>({...row}));
      render(current,rows);
      return true;
    }finally{
      working=false;
      current.classList.remove('apes-sniper-busy');
      current.removeAttribute('aria-busy');
      container.querySelector('.apes-sniper-refresh')?.classList.remove('is-refreshing');
      if(refreshAfterScan===current){
        refreshAfterScan=null;
        current.dataset.apesSniperScanKey='';
        render(current,null);
      }
      // Also handles a new or newly completed ranking that arrived while
      // an older oasis scan was still in flight.
      refresh();
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
    mount();
  }
  function mount(){
    const root=popup();
    const right=elementFor(root);
    if(!right)return;
    if(!enabled()){
      cancelScheduledScan();
      right.classList.remove('apes-sniper-enhanced','apes-sniper-view-active');
      right.querySelector('.apes-sniper-selector')?.remove();
      right.querySelector('.apes-sniper-refresh')?.remove();
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
        apesHtml_oasisSniperChecker`<option value="production">Production</option>`+
        apesHtml_oasisSniperChecker`<option value="sniper">Oasis Sniper</option></select>`;
      const dropdown=selector.querySelector('select');
      dropdown.value=selectedView;
      dropdown.addEventListener('click',event=>event.stopPropagation());
      dropdown.addEventListener('change',event=>{
        event.stopPropagation();
        setView(dropdown.value);
      });
      header.appendChild(selector);
    }
    if(!header.querySelector('.apes-sniper-refresh')){
      const button=document.createElement('span');
      button.className='apes-sniper-refresh';
      button.setAttribute('role','button');
      button.setAttribute('tabindex','0');
      button.setAttribute('aria-label','Refresh Oasis Sniper');
      button.title='Refresh Oasis Sniper';
      button.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" '+
        'aria-hidden="true" fill="none" stroke="currentColor" '+
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
        '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/>'+
        '<path d="M5.7 9A7 7 0 0 1 18 6l2 1"/>'+
        '<path d="M18.3 15A7 7 0 0 1 6 18l-2-1"/>'+
        '</svg>';
      button.addEventListener('click',event=>{
        event.stopPropagation();
        requestRefresh();
      });
      button.addEventListener('keydown',event=>{
        if(event.key!=='Enter'&&event.key!==' ')return;
        event.preventDefault();
        if(!event.repeat)requestRefresh();
      });
      header.appendChild(button);
    }

    if(!right.querySelector('.'+CLASS)){
      const div=document.createElement('div');
      div.className='contentBoxBody '+CLASS;
      div.innerHTML=apesHtml_oasisSniperChecker`<div class="apes-sniper-results"></div>`;
      production.insertAdjacentElement('afterend',div);
    }
    right.classList.add('apes-sniper-enhanced');
    applyView(right);
    autoScan(root,right);
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
    new MutationObserver(refresh).observe(document.body,{
      childList:true,subtree:true,characterData:true,attributes:true,
      attributeFilter:['playerid','playername','tooltip-data-request']
    });
    mount();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.APES_OASIS_SNIPER=Object.freeze({
    scan,requestRefresh,ranking,oasisId,setView,getView:()=>selectedView,
    calculate:math.evaluate,getLastResults:()=>currentResults?.map(row=>({...row}))||null
  });
})();
