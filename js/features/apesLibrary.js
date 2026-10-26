(() => {
  'use strict';
  const PANEL_ID = 'apes-library-panel';
  const LAUNCHER_ID = 'qol-apes-library-toggle-btn';
  const FEATURE_KEY = 'apesLibrary';
  const ICON = '<svg class="qol-feature-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5A3.5 3.5 0 0 1 6.5 2H11v18H6.5A3.5 3.5 0 0 0 3 22zM21 5.5A3.5 3.5 0 0 0 17.5 2H13v18h4.5A3.5 3.5 0 0 1 21 22z"/></svg>';
  const CATEGORIES = Object.freeze([
    { id: 'speedsettling', title: 'Speedsettling', symbol: '⚑', guides: [
      {id:'speed_x1',name:'x1 Guide',roadmapId:'x1_speedsettle'},
      {id:'speed_x2',name:'x2 Guide',roadmapId:'x2_speedsettle'},
      {id:'speed_x3',name:'x3 Guide',roadmapId:'x3_speedsettle'},
      {id:'speed_x5',name:'x5 Guide',roadmapId:'x5_speedsettle'}
    ]},
    {id:'natar',title:'Natar Defenses',symbol:'◇',guides:[
      {id:'natar_x1',name:'x1 Natar Defenses',referenceId:'natar_x1'},
      {id:'natar_x2',name:'x2 Natar Defenses',referenceId:'natar_x2'},
      {id:'natar_x3',name:'x3 Natar Defenses',referenceId:'natar_x3'},
      {id:'natar_x5',name:'x5 Natar Defenses',referenceId:'natar_x5'}
    ]},
    {id:'robber',title:'Robber',symbol:'⚔',guides:[
      {id:'robber_camps',name:'Robber Camps'},
      {id:'robber_hideouts',name:'Robber Hideouts'}
    ]},
    {id:'misc',title:'Miscellaneous',symbol:'▤',guides:[
      {id:'support_x1',name:'x1 Support Village — 500 CP/day',roadmapId:'x1_support_500cp'},
      {id:'misc_x',name:'x — Coming soon'},
      {id:'misc_y',name:'y — Coming soon'},
      {id:'misc_z',name:'z — Coming soon'}
    ]}
  ]);
  const REFERENCE_GUIDES=Object.freeze({
    natar_x1:{
      villageTypes:'There are two types of Natar villages: anti-infantry and anti-cavalry. Scout the village to identify its type. On x1, approximately 50 scouts should suffice for successful scouting. Natar villages have a Level 10 wall and a Level 20 Residence.',
      wonders:'Natar Wonders of the World (WWs) do not have anti-infantry or anti-cavalry categories. Natar WWs have a Level 20 wall and no Residence, so catapults are not needed to conquer a WW from the Natars.',
      warning:'Natar village and Natar WW defenses are not constant. Actual defenses may be slightly higher or lower than in these reports. Use the combat simulator and leave enough margin for stronger defenses.',
      reports:Object.freeze([
        {title:'Anti-Infantry Natar Village',path:'images/guides/natar-x1-anti-infantry.png',width:547,height:186},
        {title:'Anti-Cavalry Natar Village',path:'images/guides/natar-x1-anti-cavalry.png',width:580,height:182},
        {title:'Wonder of the World',path:'images/guides/natar-x1-wonder-of-the-world.png',width:582,height:198}
      ])
    },
    natar_x2:{
      villageTypes:'There are two types of Natar villages: anti-infantry and anti-cavalry. Scout the village to identify which type you are attacking. Approximately 50 scouts should suffice on x1; the required scout count on x2 has not been verified. Natar villages have a Level 10 wall and a Level 20 Residence.',
      wonders:'Natar Wonders of the World (WWs) do not have separate anti-infantry or anti-cavalry categories. Natar WWs have a Level 20 wall and no Residence, so catapults are not needed to conquer a WW from the Natars.',
      warning:'Defenses at Natar villages and Wonders of the World are not constant. Troop numbers can be slightly higher or lower than the examples shown. Use the Combat Simulator with sufficient margin to account for stronger defenses. The WW troop information is a discussion reference, not a verified x2 combat report.',
      reports:Object.freeze([
        {title:'Anti-Infantry Natar Village',path:'images/guides/natar-x2-anti-infantry.png',width:732,height:233},
        {title:'Anti-Cavalry Natar Village',path:'images/guides/natar-x2-anti-cavalry.png',width:1000,height:312},
        {title:'Wonder of the World',path:'images/guides/natar-x2-wonder-of-the-world.png',width:1344,height:298,
         note:'Ruben couldn\'t find an actual report from an x2 server, so he was only able to retrieve a screenshot of a discussion of the amount of troops from Klopp 🤮. If anyone has an actual report, I would love to have it and remove this dirty ass name from the extension.'}
      ])
    },
    natar_x3:{
      villageTypes:'There are two types of Natar villages: anti-infantry and anti-cavalry. You must scout them to identify the type. On x1, approximately 50 scouts should suffice for successful scouting; this is an x1 reference, not a verified x3 scout requirement. Natar villages have a Level 10 wall and a Level 20 Residence.',
      wonders:'Natar Wonders of the World (WWs) have no separate anti-infantry or anti-cavalry categories. They have a Level 20 wall and no Residence, so catapults are not needed to conquer a WW from the Natars.',
      warning:'Natar village and Natar WW defenses are not constant. Defenses can be slightly higher or lower than in these reports. Check the Combat Simulator and allow enough margin to clear stronger defenses.',
      reports:Object.freeze([
        {title:'x3 Anti-Infantry Natar Village',path:'images/guides/natar-x3-anti-infantry.png',width:800,height:245},
        {title:'x3 Anti-Cavalry Natar Village',path:'images/guides/natar-x3-anti-cavalry.png',width:796,height:246},
        {title:'x3 Wonder of the World',path:'images/guides/natar-x3-wonder-of-the-world.png',width:968,height:329}
      ])
    },
    natar_x5:{
      villageTypes:'There are two types of Natar villages: anti-infantry and anti-cavalry. You must scout them to identify the type. On x5, approximately 150 scouts should suffice for successful scouting. Natar villages have a Level 10 wall and a Level 20 Residence.',
      wonders:'Natar Wonders of the World (WWs) have no separate anti-infantry or anti-cavalry categories. They have a Level 20 wall and no Residence, so catapults are not needed to conquer a WW from the Natars.',
      warning:'Natar village and Natar WW defenses are not constant. Defenses can be slightly higher or lower than in these reports. Check the Combat Simulator and allow enough margin to clear stronger defenses.',
      reports:Object.freeze([
        {title:'x5 Anti-Infantry Natar Village',path:'images/guides/natar-x5-anti-infantry.png',width:866,height:291},
        {title:'x5 Anti-Cavalry Natar Village',path:'images/guides/natar-x5-anti-cavalry.png',width:948,height:340},
        {title:'x5 Wonder of the World',path:'images/guides/natar-x5-wonder-of-the-world.png',width:777,height:264}
      ])
    }
  });
  let panel=null;
  let selectedId='speed_x3';
  let libraryExpanded=true;
  const openedCategories=new Set(['speedsettling']);
  const escapeHtml=value=>String(value??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const findGuide=id=>{
    for(const category of CATEGORIES){
      const guide=category.guides.find(guide=>guide.id===id);
      if(guide)return {...guide,category:category.title};
    }
    return null;
  };
  const referenceData=guide=>guide?.referenceId?REFERENCE_GUIDES[guide.referenceId]||null:null;
  const guideData=guide=>guide?.roadmapId
    ? window.APES?.roadmaps?.getAllRoadmaps?.()?.[guide.roadmapId]||null : null;
  const isEnabled=()=>typeof window.isQolEnabled!=='function'||window.isQolEnabled(FEATURE_KEY);
  function guideStepText(step){
    if(step.type==='building')return String(step.building||'Building')+
      (step.instance?' #'+step.instance:'')+' → Level '+String(step.level);
    return String(step.text||'');
  }
  function assetUrl(path){
    try{return chrome.runtime.getURL(path);}catch(_){return '';}
  }
  function referenceArticleHtml(reference){
    const reportCards=reference.reports.map(report=>{
      const src=report.path?assetUrl(report.path):'';
      return '<figure class="apes-lib-report-card">'+
        '<figcaption>'+escapeHtml(report.title)+'</figcaption>'+
        (report.path?
          '<div class="apes-lib-report-image-scroll">'+
          (src?'<img src="'+escapeHtml(src)+'" alt="'+escapeHtml(report.title)+
            ' — Travian Kingdoms Natar defense report" loading="lazy" decoding="async" draggable="false" width="'+report.width+'" height="'+report.height+'">':
            '<p>Image unavailable. Reload the APES QoL extension.</p>')+'</div>':
          '<div class="apes-lib-report-image-pending">Wonder of the World reference image pending attachment.</div>')+
        (report.note?'<p class="apes-lib-report-note">'+escapeHtml(report.note)+'</p>':'')+
        '</figure>';
    }).join('');
    return '<div class="apes-lib-reference-article">'+
      '<div class="apes-lib-reference-notes"><h3>Natar Villages</h3><p>'+escapeHtml(reference.villageTypes)+'</p>'+
      '<h3>Natar Wonders of the World</h3><p>'+escapeHtml(reference.wonders)+'</p></div>'+
      '<div class="apes-lib-reference-warning" role="note"><strong>Important — verify with Combat Simulator</strong>'+
        '<p>'+escapeHtml(reference.warning)+'</p></div>'+
      '<div class="apes-lib-section-head"><span>Reference Reports</span><span>'+reference.reports.length+' examples</span></div>'+
      '<div class="apes-lib-report-grid">'+reportCards+'</div>'+
      '</div>';
  }
  function renderSidebar(){
    const aside=panel?.querySelector('.apes-lib-sidebar-content');
    if(!aside)return;
    aside.innerHTML='<div class="apes-lib-library-toggle" data-library-toggle aria-expanded="'+libraryExpanded+'" role="button" tabindex="0"><span>▣ &nbsp; APES LIBRARY</span><span>'+(libraryExpanded?'▾':'▸')+'</span></div>'+
      (libraryExpanded?CATEGORIES.map(category=>'<div class="apes-lib-category">'+
        '<div class="apes-lib-category-toggle" data-category="'+category.id+'" aria-expanded="'+openedCategories.has(category.id)+'" role="button" tabindex="0">'+
          '<span class="apes-lib-category-label"><span class="apes-lib-category-symbol">'+escapeHtml(category.symbol)+'</span>'+escapeHtml(category.title)+'</span>'+
          '<span>'+category.guides.length+' &nbsp; '+(openedCategories.has(category.id)?'▾':'▸')+'</span></div>'+
        (openedCategories.has(category.id)?'<div class="apes-lib-guide-list">'+category.guides.map(guide=>{
          const ready=Boolean(guideData(guide)?.steps?.length || referenceData(guide));
          return '<div class="apes-lib-guide '+(selectedId===guide.id?'is-selected':'')+
            '" data-library-guide="'+guide.id+'" aria-current="'+(selectedId===guide.id?'page':'false')+'" role="button" tabindex="0">'+
              '<span>▤ &nbsp; '+escapeHtml(guide.name)+'</span>'+
              '<span class="apes-lib-guide-state">'+(ready?(selectedId===guide.id?'✓':'›'):'·')+'</span></div>';
        }).join('')+'</div>':'')+'</div>').join(''):'');
  }
  function renderArticle(){
    const content=panel?.querySelector('.apes-lib-article');
    if(!content)return;
    const guide=findGuide(selectedId);
    const data=guideData(guide);
    const reference=referenceData(guide);
    if(!guide){content.innerHTML='<p>No guide selected.</p>';return;}
    const roadmapReady=Array.isArray(data?.steps)&&data.steps.length>0;
    const ready=roadmapReady||Boolean(reference);
    const title='<div class="apes-lib-article-head"><div><small>APES LIBRARY / '+escapeHtml(guide.category)+'</small>'+
      '<h2>'+escapeHtml(guide.name)+'</h2></div>'+
      '<div class="apes-lib-head-actions"><span class="apes-lib-pill">'+(reference?'Reference':roadmapReady?'Guide':'Coming soon')+'</span>'+
      (roadmapReady?'<div class="apes-lib-primary apes-lib-head-export" data-library-export role="button" tabindex="0">Export to Roadmaps</div>':'')+
      '</div></div>';
    if(!ready){
      content.innerHTML=title+'<div class="apes-lib-coming-soon"><span class="apes-lib-book-icon">▤</span>'+
        '<h3>Guide not published yet</h3><p>This category is ready for content. We will add the actual guide here rather than populate it with unverified instructions.</p></div>';
      return;
    }
    if(reference){content.innerHTML=title+referenceArticleHtml(reference);return;}
    const steps=data.steps;
    content.innerHTML=title+
      (data.description?'<p class="apes-lib-description">'+escapeHtml(data.description)+'</p>':'')+
      '<div class="apes-lib-section-head"><span>Guide steps</span><span>'+steps.length+' available</span></div>'+
      '<ol class="apes-lib-steps">'+steps.map(step=>
        '<li><span class="apes-lib-step-type">'+(step.type==='building'?'Building':'Instruction')+
        '</span><span>'+escapeHtml(guideStepText(step))+'</span></li>').join('')+'</ol>';
  }
  function render(){
    renderSidebar();
    renderArticle();
  }
  function notify(message){
    const target=panel?.querySelector('.apes-lib-feedback');
    if(target)target.textContent=message;
  }
  function closeExport(){
    panel?.querySelector('.apes-lib-export-layer')?.remove();
  }
  function openExport(){
    const guide=findGuide(selectedId),data=guideData(guide);
    if(!guide||!data?.steps?.length)return;
    closeExport();
    const layer=document.createElement('div');
    layer.className='apes-lib-export-layer';
    layer.setAttribute('role','dialog');
    layer.setAttribute('aria-modal','true');
    layer.setAttribute('aria-label','Export guide steps to Roadmaps');
    layer.innerHTML='<div class="apes-lib-export-dialog">'+
      '<div class="apes-lib-export-heading"><div><strong>Export to Roadmaps</strong><small>'+escapeHtml(guide.name)+'</small></div>'+
      '<div class="apes-lib-icon-button" data-library-export-close aria-label="Close export dialog" role="button" tabindex="0">×</div></div>'+
      '<p>Select the actionable steps you want to copy into a new, editable Roadmap. This creates an independent copy; future Library updates will not overwrite your tasks.</p>'+
      '<label class="apes-lib-select-all"><input type="checkbox" data-library-select-all checked> Select all ('+data.steps.length+')</label>'+
      '<div class="apes-lib-export-options">'+data.steps.map((step,index)=>
        '<label class="apes-lib-export-item"><input type="checkbox" data-library-export-step="'+index+'" checked>'+
        '<span><small>'+escapeHtml(step.type==='building'?'Building':'Instruction')+'</small>'+escapeHtml(guideStepText(step))+'</span></label>').join('')+'</div>'+
      '<div class="apes-lib-export-footer"><span data-library-export-count>'+data.steps.length+' steps selected</span>'+
      '<div class="apes-lib-secondary" data-library-export-cancel role="button" tabindex="0">Cancel</div>'+
      '<div class="apes-lib-primary" data-library-export-confirm role="button" tabindex="0">Export selected</div></div>'+
      '<div class="apes-lib-export-error" aria-live="polite"></div></div>';
    panel.appendChild(layer);
    layer.querySelector('[data-library-export-close]').focus();
  }
  function updateExportCount(){
    const layer=panel?.querySelector('.apes-lib-export-layer');
    if(!layer)return;
    const items=[...layer.querySelectorAll('[data-library-export-step]')];
    const selected=items.filter(item=>item.checked).length;
    const all=layer.querySelector('[data-library-select-all]');
    all.checked=selected===items.length;
    all.indeterminate=selected>0&&selected<items.length;
    layer.querySelector('[data-library-export-count]').textContent=selected+' steps selected';
    layer.querySelector('[data-library-export-confirm]').setAttribute('aria-disabled',String(selected===0));
  }
  function commitExport(){
    const layer=panel?.querySelector('.apes-lib-export-layer');
    const guide=findGuide(selectedId),data=guideData(guide);
    if(!layer||!guide||!data)return;
    const indices=[...layer.querySelectorAll('[data-library-export-step]:checked')]
      .map(input=>Number(input.dataset.libraryExportStep));
    if(!indices.length)return;
    const steps=indices.map(index=>data.steps[index]).filter(Boolean);
    try{
      const result=window.APES?.roadmaps?.importFromLibrary?.({
        sourceGuideId:guide.id,
        name:guide.name+' — APES Library',
        description:'Imported from APES Library / '+guide.category+' / '+guide.name+'. '+(data.description||''),
        steps
      });
      if(!result)throw new Error('Roadmaps is unavailable. Enable it in APES Settings.');
      closeExport();
      notify(result.created?'Created '+result.name+' in My Roadmaps.':'This selection is already in My Roadmaps.');
    }catch(error){
      layer.querySelector('.apes-lib-export-error').textContent=error?.message||'Could not export this guide.';
    }
  }
  function buildPanel(){
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id=PANEL_ID;
    panel.setAttribute('aria-label','APES Library');
    panel.setAttribute('aria-hidden','true');
    panel.innerHTML='<header class="apes-lib-header"><div class="apes-lib-header-title"><span class="apes-lib-logo">'+ICON+'</span>'+
      '<div><strong>APES Library</strong><small>Strategy guides · References · Roadmap exports</small></div></div>'+
      '<div class="apes-lib-close" aria-label="Close APES Library" data-library-close role="button" tabindex="0">×</div></header>'+
      '<div class="apes-lib-workspace"><aside class="apes-lib-sidebar"><div class="apes-lib-sidebar-content"></div></aside>'+
      '<main class="apes-lib-article"></main></div><div class="apes-lib-feedback" role="status" aria-live="polite"></div>';
    panel.addEventListener('click',event=>{
      const target=event.target.closest('[role="button"]');
      if(!target || !panel.contains(target) || target.getAttribute('aria-disabled')==='true')return;
      if(target.hasAttribute('data-library-close'))return close();
      if(target.hasAttribute('data-library-toggle')){libraryExpanded=!libraryExpanded;renderSidebar();return;}
      if(target.dataset.category){if(openedCategories.has(target.dataset.category))openedCategories.delete(target.dataset.category);
        else openedCategories.add(target.dataset.category);renderSidebar();return;}
      if(target.dataset.libraryGuide){selectedId=target.dataset.libraryGuide;render();panel.querySelector('.apes-lib-article').scrollTop=0;notify('');return;}
      if(target.hasAttribute('data-library-export'))return openExport();
      if(target.hasAttribute('data-library-export-close')||target.hasAttribute('data-library-export-cancel'))return closeExport();
      if(target.hasAttribute('data-library-export-confirm'))return commitExport();
    });
    // Travian styles native button elements, so every APES control uses
    // a focusable role=button surface and gets equivalent keyboard activation.
    panel.addEventListener('keydown',event=>{
      if(event.key!=='Enter' && event.key!==' ')return;
      if(event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
      const target=event.target;
      if(!target?.matches?.('[role="button"]') ||
         target.getAttribute('aria-disabled')==='true')return;
      event.preventDefault();
      event.stopPropagation();
      target.click();
    });
    panel.addEventListener('change',event=>{
      if(event.target.matches('[data-library-select-all]')){
        panel.querySelectorAll('[data-library-export-step]').forEach(input=>{input.checked=event.target.checked;});
        updateExportCount();
      }
      if(event.target.matches('[data-library-export-step]'))updateExportCount();
    });
    document.body.appendChild(panel);
    render();
    return panel;
  }
  function open(){
    if(!isEnabled())return;
    buildPanel();
    window.dispatchEvent(new CustomEvent('qol_close_others',{detail:{source:'apesLibrary'}}));
    render();
    panel.classList.add('apes-lib-open');
    panel.setAttribute('aria-hidden','false');
    panel.querySelector('.apes-lib-close')?.focus();
  }
  function close(){
    closeExport();
    panel?.classList.remove('apes-lib-open');
    panel?.setAttribute('aria-hidden','true');
  }
  function toggle(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if(panel?.classList.contains('apes-lib-open'))close();else open();
  }
  function createSource(){
    if(document.getElementById(LAUNCHER_ID))return;
    const button=document.createElement('div');
    button.setAttribute('role','button');
    button.setAttribute('tabindex','0');
    button.id=LAUNCHER_ID;
    button.className='apes-lib-toolbar-source';
    button.title='APES Library';
    button.setAttribute('aria-label','Open APES Library');
    button.innerHTML=ICON;
    button.addEventListener('click',toggle);
    button.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      event.stopPropagation();
      button.click();
    });
    document.body.appendChild(button);
    window.qolRefreshToolbar?.();
  }
  function init(){
    window.APES=window.APES||{};
    window.APES.library=Object.freeze({open,close,toggle,categories:CATEGORIES,select(id){
      const guide=findGuide(id);
      if(!guide)return false;
      selectedId=id;
      openedCategories.add(CATEGORIES.find(c=>c.guides.some(g=>g.id===id)).id);
      open();
      return true;
    }});
    createSource();
    window.APES?.actions?.register?.({
      id:'library.open',label:'APES Library',
      description:'Browse APES guides and export selected steps into Roadmaps.',
      keywords:['library','guides','speedsettling','natar','robber','reference'],
      group:'Radial menu',enabled:isEnabled,run:open
    });
    window.addEventListener('qol_close_others',event=>{
      if(event.detail?.source!=='apesLibrary')close();
    });
    window.addEventListener('qol_setting_changed',event=>{
      if(event.detail?.key===FEATURE_KEY&&!isEnabled())close();
    });
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||!panel?.classList.contains('apes-lib-open'))return;
      if(panel.querySelector('.apes-lib-export-layer'))closeExport();else close();
      event.stopImmediatePropagation();
    },true);
    // The responsive toolbar captures this source element as a proxy.
    window.setTimeout(()=>window.qolRefreshToolbar?.(),200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
