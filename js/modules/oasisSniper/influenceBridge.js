/* Oasis Sniper MAIN-world bridge: attempts Travian's existing tooltip
 * requestInfluenceData handler WITHOUT synthesising mouse events.
 * It never submits troops or changes ranking/game state. Fail closed.
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
        if(!Array.isArray(data[key])||!data[key].length)continue;
        const values=data[key].map(row=>{
          if(!row||typeof row!=='object')return null;
          return numeric(row.villageInfluence??row.influenceFromVillage??row.influence);
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
  function findScopeHandler(element) {
    if(!window.angular?.element)return null;
    let scope;
    try {
      const e=window.angular.element(element);
      scope=e.scope?.()||e.isolateScope?.();
    }catch(_){return null;}
    for(let depth=0;scope&&depth<16;depth++,scope=scope.$parent){
      if(typeof scope.requestInfluenceData==='function')
        return {scope,handler:scope.requestInfluenceData};
    }
    return null;
  }
  function correlatedData(scope,id) {
    for(let node=scope,depth=0;node&&depth<10;depth++,node=node.$parent){
      for(const key of ['influenceData','oasisInfluenceData','tooltipData']) {
        const value=node[key];
        // Scope values may belong to a previously hovered player. Do not
        // read one without a matching identity attached to the data.
        if(safeId(value?.playerId??value?.player?.playerId)===id)
          return influenceFrom(value);
      }
    }
    return null;
  }
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function probe(playerId) {
    const id=safeId(playerId);
    const rows=Array.from(document.querySelectorAll(SELECTOR));
    const row=rows.find(element=>element.getAttribute('tooltip-data-request')===
      'requestInfluenceData;'+id);
    if(!row)return {status:'player-not-in-current-oasis'};
    const target=findScopeHandler(row);
    if(!target)return {status:'handler-not-exposed',
      diagnostic:'Angular tooltip request is not available on the ranking scope'};
    try {
      let value=target.handler.call(target.scope,Number(id));
      if(value&&typeof value.then==='function')
        value=await Promise.race([Promise.resolve(value),delay(3500).then(()=>{throw Error('timeout');})]);
      let found=influenceFrom(value);
      // Some Angular handlers publish the response to a scope rather than
      // returning it. Only accept data correlated to this exact player ID.
      if(found===null){
        for(let i=0;i<7;i++){
          found=correlatedData(target.scope,id);
          if(found!==null)break;
          await delay(180);
        }
      }
      return found===null
        ? {status:'unrecognised-response',diagnostic:shape(value)}
        : {status:'ok',villageInfluence:found,diagnostic:shape(value)};
    }catch(error){
      return {status:'request-failed',diagnostic:String(error?.message||error).slice(0,120)};
    }
  }
  let busy=false;
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin)return;
    const msg=event.data;
    if(msg?.source!==UI||msg.type!=='INFLUENCE_REQUEST')return;
    const playerId=safeId(msg.playerId);
    const requestId=String(msg.requestId||'').slice(0,90);
    if(!playerId||!/^[a-zA-Z0-9_-]{5,90}$/.test(requestId)||busy)return;
    busy=true;
    let result;
    try{result=await probe(playerId);}
    finally{busy=false;}
    window.postMessage({source:BRIDGE,type:'INFLUENCE_RESULT',requestId,playerId,...result},location.origin);
  });
  // Exposed for local diagnostic tests, not for game writes.
  window.APES_OASIS_SNIPER_BRIDGE=Object.freeze({influenceFrom,probe});
})();
