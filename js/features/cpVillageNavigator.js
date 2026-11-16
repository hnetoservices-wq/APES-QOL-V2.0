(function installCPVillageNavigator() {
  'use strict';
  let requestCounter=0;
  async function gameOwnedSnapshot(){
    const requestId=++requestCounter;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        window.removeEventListener('message',onMessage);
        reject(new Error('Travian village-data reader did not respond.'));
      },1100);
      function onMessage(event){
        if(event.source!==window||event.origin!==window.location.origin||
           event.data?.source!=='APES_CP_SOURCE_RESPONSE'||
           event.data?.type!=='OWNED_RESULT'||
           event.data?.requestId!==requestId)return;
        clearTimeout(timeout);
        window.removeEventListener('message',onMessage);
        resolve(event.data);
      }
      window.addEventListener('message',onMessage);
      window.postMessage({
        source:'APES_CP_SOURCE_REQUEST',type:'READ_OWNED',requestId
      },window.location.origin);
    });
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normal = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const validId = id => /^\d+$/.test(String(id || ''));
  const currentId = () => (window.location.hash || '').match(/(?:^|\/)villId:(\d+)/)?.[1] || '';
  const selectedName = () => {
    const selectors = [
      '#villageList .currentVillageName .selectedItem .villageEntry',
      '#villageList .currentVillageName .selectedItem',
      '#villageList .currentVillageName .dropdownHead .villageEntry'
    ];
    for (const selector of selectors) {
      const name = document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
      if (name) return name;
    }
    return '';
  };
  const viewReady = () => Boolean(document.querySelector('#villageView building-location'));
  function normalizeOwned(snapshot){
    const unique=new Map();
    for(const v of Array.isArray(snapshot?.villages)?snapshot.villages:[]){
      const id=String(v?.id??'');
      const name=String(v?.name??'').trim();
      if(!validId(id)||!name||unique.has(id))continue;
      unique.set(id,Object.freeze({
        id,name,isTown:v.isTown===true,isActive:v.isActive===true,
        playerId:v.playerId,hasTownHall:v.hasTownHall===true
      }));
    }
    return [...unique.values()];
  }
  async function getOwnedVillages(timeout=8000){
    const deadline=Date.now()+timeout;
    let lastFailure='';
    while(Date.now()<deadline){
      try{
        const snapshot=await gameOwnedSnapshot();
        const villages=normalizeOwned(snapshot);
        if(villages.length)return villages;
        lastFailure=snapshot.error||'Travian has not populated its own village records yet';
      }catch(error){lastFailure=error?.message||String(error);}
      await sleep(250);
    }
    throw new Error(
      'CP Manager could not read the owned-village list directly from Travian. '+lastFailure
    );
  }
  async function selectedMatches(target,owned){
    const actual=normal(selectedName());
    if(!actual||normal(target.name)!==actual)return false;
    const siblings=owned.filter(v=>normal(v.name)===actual);
    if(siblings.length<=1)return true;
    // If names collide, require Travian's native isActive model to
    // distinguish villages. The URL is not proof of active controller state.
    const snapshot=await gameOwnedSnapshot().catch(()=>null);
    return snapshot?.activeId===target.id;
  }
  async function waitForVillage(target,owned,timeout=7500){
    const deadline=Date.now()+timeout;
    let confirmed=0;
    while(Date.now()<deadline){
      const matches=currentId()===target.id &&
        /(?:^|\/)page:village(?:\/|$)/i.test(window.location.hash||'') &&
        viewReady()&&await selectedMatches(target,owned);
      confirmed=matches?confirmed+1:0;
      if(confirmed>=2)return true;
      await sleep(120);
    }
    return false;
  }
  async function routeTo(target, owned) {
    window.location.hash = `#/page:village/villId:${target.id}`;
    return waitForVillage(target, owned, 7500);
  }
  function nextButton() {
    return document.querySelector('#villageList .currentVillageName a.navigation.next.clickable') ||
      document.querySelector('#villageList .navigation.next') ||
      document.querySelector('.currentVillageName.dropdown a.navigation.next.clickable');
  }
  async function nativeNext(owned) {
    const before = currentId();
    const beforeName = normal(selectedName());
    const button = nextButton();
    if (!button) return false;
    button.dispatchEvent(new MouseEvent('click', {
      view: window, bubbles: true, cancelable: true, composed: true, button: 0
    }));
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const id = currentId();
      const landed = owned.find(village => village.id === id);
      // A failed URL-only route may already point to this ID while Travian
      // still shows the previous village. Confirm the selected-name change too.
      if (id && landed && (id !== before || normal(selectedName()) !== beforeName) &&
          await waitForVillage(landed, owned, 1000)) return true;
      await sleep(100);
    }
    return false;
  }
  async function navigate(target, owned, options = {}) {
    if (!target || !validId(target.id) || !owned.some(village => village.id === target.id))
      throw new Error('CP scan attempted to open an unknown village.');
    const errors = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (await routeTo(target, owned)) return { id: target.id, method: 'verified-route' };
      errors.push(`route attempt ${attempt}: game village header did not match`);
    }
    // Last resort: let Travian invoke its own village controller.
    // Never treat a URL-only change as a verified village transition.
    for (let step = 0; step < Math.min(owned.length, 100); step++) {
      if (!await nativeNext(owned)) { errors.push('native next-village navigation unavailable'); break; }
      if (currentId() === target.id && await waitForVillage(target, owned, 1500))
        return { id: target.id, method: 'verified-native' };
    }
    const name = target.name || target.id;
    throw new Error(`Could not verify village "${name}" (${target.id}). ${errors.join('; ')}.`);
  }
  window.APES_CP_VILLAGE_NAVIGATOR = Object.freeze({
    getOwnedVillages, currentId, selectedName, waitForVillage, navigate
  });
})();
