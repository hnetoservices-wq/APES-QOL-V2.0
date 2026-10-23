(function installCpVillageSource(){
  'use strict';
  const REQUEST_SOURCE='APES_CP_SOURCE_REQUEST',RESPONSE_SOURCE='APES_CP_SOURCE_RESPONSE';
  const modelData=(cache,key)=>cache?.[key]?.data??cache?.[key]??null;
  const isId=v=>/^\d+$/.test(String(v??''));
  const id=v=>isId(v)?String(v):'';
  const isTrue=v=>v===true||v===1||v==='1';
  function collectionIds(cache){
    const result=new Set(),seen=new WeakSet();
    const raw=modelData(cache,'Collection:Village:own');
    function walk(value,depth=0){
      if(value==null||depth>4)return;
      if(typeof value==='string'||typeof value==='number'){
        const match=String(value).match(/Village:(\d+)/i);
        if(match)result.add(match[1]);
        else if(/^\d{6,}$/.test(String(value)))result.add(String(value));
        return;
      }
      if(typeof value!=='object'||seen.has(value))return;
      seen.add(value);
      const direct=id(value.villageId??value.locationId??value.id??value?.data?.villageId??value?.data?.locationId);
      if(direct)result.add(direct);
      const ref=String(value.name??value.key??value.cacheKey??'').match(/Village:(\d+)/i);
      if(ref)result.add(ref[1]);
      for(const nested of Object.values(value))walk(nested,depth+1);
    }
    walk(raw);
    return [...result].filter(candidate=>!!modelData(cache,'Village:'+candidate));
  }
  function townHallPresent(cache,villageId){
    const raw=modelData(cache,'Collection:Building:'+villageId);
    if(!raw)return null;
    const entries=Array.isArray(raw)?raw:Object.values(raw);
    for(const entry of entries){
      const data=entry?.data??entry;
      let building=data;
      if(typeof data!=='object'||data==null||!('buildingType' in data)){
        const bid=id(typeof data==='object'?
          data?.buildingId??data?.id??String(data.name??data.key??'').match(/Building:(\d+)/)?.[1]:
          String(data).match(/Building:(\d+)/)?.[1]??data);
        building=bid?modelData(cache,'Building:'+bid):null;
      }
      if(Number(building?.buildingType)===24&&Number(building?.lvl)>0)return true;
    }
    return null;
  }
  function ownSnapshot(){
    const cache=window.Cache?.c??{};
    const activeId=(window.location.hash||'').match(/(?:^|\/)villId:(\d+)/)?.[1]||'';
    const active=modelData(cache,'Village:'+activeId);
    let player=Number(active?.playerId);
    if(!Number.isFinite(player)||player<=0)player=null;
    let collection=collectionIds(cache);
    if(player==null&&collection.length){
      const n=Number(modelData(cache,'Village:'+collection[0])?.playerId);
      if(Number.isFinite(n)&&n>0)player=n;
    }
    const ids=new Set();
    for(const villageId of collection){
      const v=modelData(cache,'Village:'+villageId);
      if(player!==null&&Number(v?.playerId)!==player)continue;
      ids.add(villageId);
    }
    if(player!==null){
      for(const [key,model] of Object.entries(cache)){
        const match=key.match(/^Village:(\d+)$/);
        if(match&&Number(model?.data?.playerId??model?.playerId)===player)ids.add(match[1]);
      }
    }
    const villages=[...ids].map(villageId=>{
      const village=modelData(cache,'Village:'+villageId);
      return {
        id:villageId,
        name:String(village?.name??'').trim(),
        isTown:isTrue(village?.isTown),
        isActive:isTrue(village?.isActive),
        playerId:player,
        hasTownHall:townHallPresent(cache,villageId)
      };
    }).filter(v=>v.name).sort((a,b)=>
      Number(b.isActive)-Number(a.isActive)||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})
    );
    const activeFromModel=villages.filter(v=>v.isActive);
    return {villages,playerId:player,
      activeId:activeFromModel.length===1?activeFromModel[0].id:'',
      fromOwnCollection:collection.length>0
    };
  }
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==window.location.origin||
       event.data?.source!=='APES_CP_SOURCE_REQUEST'||event.data?.type!=='READ_OWNED')return;
    const requestId=event.data.requestId;
    if(typeof requestId!=='number'||!Number.isSafeInteger(requestId))return;
    let result;
    try{result=ownSnapshot();}
    catch(error){result={villages:[],error:String(error?.message??error)};}
    window.postMessage({source:RESPONSE_SOURCE,type:'OWNED_RESULT',requestId,...result},window.location.origin);
  });
})();
