/* Oasis Sniper MAIN-world read-only influence bridge.
 * Directly calls Travian's existing village.getVillagesWithInfluenceOnOasisForPlayer
 * action using the SAME-ORIGIN authenticated game API. No synthetic hover.
 * Never logs, stores or posts the game session outside Travian's own origin.
 */
(() => {
  'use strict';
  if (window.__APES_OASIS_SNIPER_BRIDGE__) return;
  window.__APES_OASIS_SNIPER_BRIDGE__ = true;
  const UI='APES_QOL_OASIS_SNIPER_UI';
  const BRIDGE='APES_QOL_OASIS_SNIPER_BRIDGE';
  const SELECTOR='window.modalWrapper.mapCellDetails ' +
    '.contentBoxBody.oasisDetails [tooltip-data-request^="requestInfluenceData;"]';
  const safeId=value=>/^\d{1,12}$/.test(String(value||''))?String(value):'';
  const numeric=value=>{
    if(value===undefined||value===null||value==='')return null;
    const n=Number(value);
    return Number.isFinite(n)&&n>=0?n:null;
  };
  const asObject=value=>{
    if(!value||typeof value!=='object')return null;
    if(Array.isArray(value))return null;
    return value;
  };
  function influenceFrom(result) {
    const object=asObject(result);
    if(!object)return null;
    for(const candidate of [object,object.data,object.result,object.influenceData,object.tooltipData]) {
      const data=asObject(candidate);
      if(!data)continue;
      // Deliberately reject unqualified "totalInfluence" because it
      // includes unknown troops in Travian's tooltip.
      for(const key of ['villageInfluence','influenceFromVillages',
        'totalVillageInfluence','villageInfluenceTotal','influenceFromVillagesTotal']) {
        const found=numeric(data[key]);
        if(found!==null)return found;
      }
      for(const key of ['villages','villageInfluences','villageData','villageDetails']) {
        const source=data[key];
        // Game responses may use either an array or a dictionary keyed by
        // village ID. An empty list means zero natural influence.
        const rows=Array.isArray(source)?source:
          source&&typeof source==='object'?Object.values(source):null;
        if(!rows)continue;
        if(!rows.length)return 0;
        const values=rows.map(row=>{
          if(!row||typeof row!=='object')return null;
          return numeric(row.villageInfluence??row.influenceFromVillage??
            row.influence??row.influenceValue);
        });
        if(values.every(value=>value!==null))return values.reduce((a,b)=>a+b,0);
      }
    }
    return null;
  }
  const shape=value=>{
    if(value===undefined)return 'undefined';
    if(value===null)return 'null';
    if(typeof value!=='object')return typeof value;
    if(Array.isArray(value))return 'array ('+value.length+')';
    return 'object: '+Object.keys(value).filter(x=>!x.startsWith('$')).slice(0,12).join(', ');
  };
  // A player ID and oasis ID are verified against the currently displayed
  // ranking. The isolated UI cannot issue arbitrary game API actions.
  function currentOasisId(){
    const container=document.querySelector('window.modalWrapper.mapCellDetails .contentBoxBody.oasisDetails');
    if(!container)return '';
    const heading=container.closest('.contentBox')?.querySelector('.coordinateWrapper[x][y]');
    const x=Number(heading?.getAttribute('x'));
    const y=Number(heading?.getAttribute('y'));
    if(!heading||!Number.isInteger(x)||!Number.isInteger(y)||
      Math.abs(x)>16384||Math.abs(y)>16384)return '';
    const action=heading.querySelector('[clickable*="centerId"]')?.getAttribute('clickable')||'';
    const fromLink=action.match(/centerId['"]?\s*,\s*['"](\d+)(?:_[^'"]*)?['"]/i)?.[1];
    return fromLink||String((y+16384)*32768+(x+16384));
  }
  function sessionKey(){
    // Travian's game client uses the same t5SessionKey cookie for its own
    // /api/ calls. Never expose this value to the content-script UI.
    const raw=document.cookie.split(';').map(item=>item.trim())
      .find(item=>item.startsWith('t5SessionKey='));
    if(!raw)return null;
    try{
      const value=JSON.parse(decodeURIComponent(raw.slice('t5SessionKey='.length)));
      return typeof value?.key==='string'&&value.key.length>5?value.key:null;
    }catch(_){return null;}
  }
  function responseBody(json){
    if(!json||typeof json!=='object')return null;
    if(json.error)return null;
    return json.response??json.data??json;
  }
  async function requestNativeInfluence(playerId,oasisId){
    const session=sessionKey();
    if(!session)return {status:'session-unavailable',
      diagnostic:'Game API session not accessible; no credentials were exported'};
    if(typeof window.fetch!=='function')return {status:'api-unavailable'};
    const payload={
      controller:'village',
      action:'getVillagesWithInfluenceOnOasisForPlayer',
      params:{oasisId:Number(oasisId),playerId:Number(playerId)},
      session
    };
    // Only the game world's own API receives the normal game session.
    // This is a read-only endpoint and is called at most once per player.
    let response;
    try{
      const abort=typeof AbortController==='function'?new AbortController():null;
      const limit=setTimeout(()=>abort?.abort(),5000);
      try{
        response=await window.fetch(location.origin+
          '/api/?c=village&a=getVillagesWithInfluenceOnOasisForPlayer',{
          method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload),
          ...(abort?{signal:abort.signal}:{})
        });
      }finally{clearTimeout(limit);}
      if(!response.ok)return {status:'api-http-error',
        diagnostic:'Game API returned HTTP '+response.status};
      const json=await response.json();
      if(json?.error)return {status:'api-rejected',
        diagnostic:'Travian rejected the influence request'};
      const body=responseBody(json);
      const found=influenceFrom(body);
      return found===null
        ? {status:'unrecognised-response',diagnostic:shape(body)}
        : {status:'ok',villageInfluence:found};
    }catch(error){
      return {status:'request-failed',
        diagnostic:error?.name==='AbortError'?'Influence request timed out':
          'Could not complete same-origin influence request'};
    }
  }
  async function probe(playerId,oasisId){
    const id=safeId(playerId);
    const oasis=safeId(oasisId);
    if(!id||!oasis||oasis!==currentOasisId())return {status:'oasis-changed'};
    const rows=Array.from(document.querySelectorAll(SELECTOR));
    const found=rows.some(element=>element.getAttribute('tooltip-data-request')===
      'requestInfluenceData;'+id);
    if(!found)return {status:'player-not-in-current-oasis'};
    return requestNativeInfluence(id,oasis);
  }
  let busy=false;
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin)return;
    const msg=event.data;
    if(msg?.source!==UI||msg.type!=='INFLUENCE_REQUEST')return;
    const playerId=safeId(msg.playerId);
    const oasisId=safeId(msg.oasisId);
    const requestId=String(msg.requestId||'').slice(0,90);
    if(!playerId||!oasisId||!/^[a-zA-Z0-9_-]{5,90}$/.test(requestId)||busy)return;
    busy=true;
    let result;
    try{result=await probe(playerId,oasisId);}
    finally{busy=false;}
    window.postMessage({source:BRIDGE,type:'INFLUENCE_RESULT',
      requestId,playerId,oasisId,...result},location.origin);
  });
  // Exposed for local diagnostic tests, not for game writes.
  window.APES_OASIS_SNIPER_BRIDGE=Object.freeze({
    influenceFrom,probe,currentOasisId,requestNativeInfluence
  });
})();
