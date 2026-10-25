(() => {
  'use strict';
  const PANEL_ID = 'apes-library-panel';
  const LAUNCHER_ID = 'qol-apes-library-toggle-btn';
  const FEATURE_KEY = 'apesLibrary';
  const ICON = '<svg class="qol-feature-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5A3.5 3.5 0 0 1 6.5 2H11v18H6.5A3.5 3.5 0 0 0 3 22zM21 5.5A3.5 3.5 0 0 0 17.5 2H13v18h4.5A3.5 3.5 0 0 1 21 22z"/></svg>';
  const CATEGORIES = Object.freeze([
    { id: 'speedsettling', title: 'Speedsettling', symbol: '⚑', guides: [
      {id:'speed_x1',name:'x1 Guide'},
      {id:'speed_x2',name:'x2 Guide'},
      {id:'speed_x3',name:'x3 Guide',roadmapId:'x3_speedsettle'},
      {id:'speed_x3_mayhem',name:'x3 Mayhem Guide'},
      {id:'speed_x5',name:'x5 Guide'}
    ]},
    {id:'natar',title:'Natar Defenses',symbol:'◇',guides:[
      {id:'natar_x1',name:'x1 Natar Defenses'},
      {id:'natar_x2',name:'x2 Natar Defenses'}
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
  const guideData=guide=>guide?.roadmapId
    ? window.APES?.roadmaps?.getAllRoadmaps?.()?.[guide.roadmapId]||null : null;
  const isEnabled=()=>typeof window.isQolEnabled!=='function'||window.isQolEnabled(FEATURE_KEY);
  function guideStepText(step){
    if(step.type==='building')return String(step.building||'Building')+
      (step.instance?' #'+step.instance:'')+' → Level '+String(step.level);
    return String(step.text||'');
  }
  function renderSidebar(){
    const aside=panel?.querySelector('.apes-lib-sidebar-content');
    if(!aside)return;
    aside.innerHTML='<button type="button" class="apes-lib-library-toggle" data-library-toggle aria-expanded="'+libraryExpanded+'"><span>▣ &nbsp; APES LIBRARY</span><span>'+(libraryExpanded?'▾':'▸')+'</span></button>'+
      (libraryExpanded?CATEGORIES.map(category=>'<div class="apes-lib-category">'+
        '<button type="button" class="apes-lib-category-toggle" data-category="'+category.id+'" aria-expanded="'+openedCategories.has(category.id)+'">'+
          '<span class="apes-lib-category-label"><span class="apes-lib-category-symbol">'+escapeHtml(category.symbol)+'</span>'+escapeHtml(category.title)+'</span>'+
          '<span>'+category.guides.length+' &nbsp; '+(openedCategories.has(category.id)?'▾':'▸')+'</span></button>'+
        (openedCategories.has(category.id)?'<div class="apes-lib-guide-list">'+category.guides.map(guide=>{
          const ready=Boolean(guideData(guide)?.steps?.length);
          return '<button type="button" class="apes-lib-guide '+(selectedId===guide.id?'is-selected':'')+
            '" data-library-guide="'+guide.id+'" aria-current="'+(selectedId===guide.id?'page':'false')+'">'+
              '<span>▤ &nbsp; '+escapeHtml(guide.name)+'</span>'+
              '<span class="apes-lib-guide-state">'+(ready?(selectedId===guide.id?'✓':'›'):'·')+'</span></button>';
        }).join('')+'</div>':'')+'</div>').join(''):'');
  }
  function renderArticle(){
    const content=panel?.querySelector('.apes-lib-article');
    if(!content)return;
    const guide=findGuide(selectedId);
    const data=guideData(guide);
    if(!guide){content.innerHTML='<p>No guide selected.</p>';return;}
    const ready=Array.isArray(data?.steps)&&data.steps.length>0;
    const title='<div class="apes-lib-article-head"><div><small>APES LIBRARY / '+escapeHtml(guide.category)+'</small>'+
      '<h2>'+escapeHtml(guide.name)+'</h2></div><span class="apes-lib-pill">'+(ready?'Guide':'Coming soon')+'</span></div>';
    if(!ready){
      content.innerHTML=title+'<div class="apes-lib-coming-soon"><span class="apes-lib-book-icon">▤</span>'+
        '<h3>Guide not published yet</h3><p>This category is ready for content. We will add the actual guide here rather than populate it with unverified instructions.</p></div>';
      return;
    }
    const steps=data.steps;
    content.innerHTML=title+
      (data.description?'<p class="apes-lib-description">'+escapeHtml(data.description)+'</p>':'')+
      '<div class="apes-lib-section-head"><span>Guide steps</span><span>'+steps.length+' available</span></div>'+
      '<ol class="apes-lib-steps">'+steps.map(step=>
        '<li><span class="apes-lib-step-type">'+(step.type==='building'?'Building':'Instruction')+
        '</span><span>'+escapeHtml(guideStepText(step))+'</span></li>').join('')+'</ol>'+
      '<div class="apes-lib-article-actions"><span>Import copies tasks. Your Roadmap remains editable and will not be overwritten by Library updates.</span>'+
      '<button type="button" class="apes-lib-primary" data-library-export>Export to Roadmaps</button></div>';
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
      '<button type="button" class="apes-lib-icon-button" data-library-export-close aria-label="Close export dialog">×</button></div>'+
      '<p>Select the actionable steps you want to copy into a new, editable Roadmap.</p>'+
      '<label class="apes-lib-select-all"><input type="checkbox" data-library-select-all checked> Select all ('+data.steps.length+')</label>'+
      '<div class="apes-lib-export-options">'+data.steps.map((step,index)=>
        '<label class="apes-lib-export-item"><input type="checkbox" data-library-export-step="'+index+'" checked>'+
        '<span><small>'+escapeHtml(step.type==='building'?'Building':'Instruction')+'</small>'+escapeHtml(guideStepText(step))+'</span></label>').join('')+'</div>'+
      '<div class="apes-lib-export-footer"><span data-library-export-count>'+data.steps.length+' steps selected</span>'+
      '<button type="button" class="apes-lib-secondary" data-library-export-cancel>Cancel</button>'+
      '<button type="button" class="apes-lib-primary" data-library-export-confirm>Export selected</button></div>'+
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
    layer.querySelector('[data-library-export-confirm]').disabled=selected===0;
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
      '<button class="apes-lib-close" type="button" aria-label="Close APES Library" data-library-close>×</button></header>'+
      '<div class="apes-lib-workspace"><aside class="apes-lib-sidebar"><div class="apes-lib-sidebar-content"></div></aside>'+
      '<main class="apes-lib-article"></main></div><div class="apes-lib-feedback" role="status" aria-live="polite"></div>';
    panel.addEventListener('click',event=>{
      const target=event.target.closest('button');
      if(!target)return;
      if(target.hasAttribute('data-library-close'))return close();
      if(target.hasAttribute('data-library-toggle')){libraryExpanded=!libraryExpanded;renderSidebar();return;}
      if(target.dataset.category){if(openedCategories.has(target.dataset.category))openedCategories.delete(target.dataset.category);
        else openedCategories.add(target.dataset.category);renderSidebar();return;}
      if(target.dataset.libraryGuide){selectedId=target.dataset.libraryGuide;render();panel.querySelector('.apes-lib-article').scrollTop=0;notify('');return;}
      if(target.hasAttribute('data-library-export'))return openExport();
      if(target.hasAttribute('data-library-export-close')||target.hasAttribute('data-library-export-cancel'))return closeExport();
      if(target.hasAttribute('data-library-export-confirm'))return commitExport();
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
    const button=document.createElement('button');
    button.type='button';
    button.id=LAUNCHER_ID;
    button.className='apes-lib-toolbar-source';
    button.title='APES Library';
    button.setAttribute('aria-label','Open APES Library');
    button.innerHTML=ICON;
    button.addEventListener('click',toggle);
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
