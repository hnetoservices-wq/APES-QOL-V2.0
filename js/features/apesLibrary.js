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
      {id:'robber_camps',name:'Robber Camps',referenceId:'robber_camps'},
      {id:'robber_hideouts',name:'Robber Hideouts',referenceId:'robber_hideouts'}
    ]},
    {id:'misc',title:'Miscellaneous',symbol:'▤',guides:[
      {id:'support_x1',name:'x1 Support Village — 500 CP/day',roadmapId:'x1_support_500cp'},
      {id:'misc_x',name:'x — Coming soon'},
      {id:'misc_y',name:'y — Coming soon'},
      {id:'misc_z',name:'z — Coming soon'}
    ]}
  ]);
  const REFERENCE_GUIDES=Object.freeze({
    robber_camps:{
      kind:'robber_camps',
      mechanism:[
        'Robber camps appear on wilderness tiles around treasuries. They are PvE events shared by the kingdom.',
        'Camps reward participating players with resources and stolen goods.',
        'Camps are announced visually on the map two hours before they activate.',
        'On x3 servers, players have 40 minutes after activation to fill the camps. See the Guidelines section for how to clear a camp.',
        'If not all camps are cleared, Last Chance Mode begins, giving the kingdom another 40 minutes to clear the remaining camps.',
        'Participating in robber camps does not cost troops or grant hero XP.'
      ],
      guidelines:[
        'Use your brain. Robber camps are a team effort and require common sense, which can at times be a big ask for a TK player.',
        'Every camp needs at least five participants to run. Prioritise bringing camps to five participants before sending extra troops to already-filled camps.',
        'A camp needs 100% on its strength bar to grant its full rewards, but only five participants to run. Rewards scale with the completed strength percentage and do not increase meaningfully above 100%. A 20% strength camp with five participants awards approximately one fifth of the shown rewards; a camp at 200% does not award double.',
        'If the kingdom cannot fully fill every camp in the first round, it can be better to leave some for Last Chance Mode. Allowing a camp to run at 20% in the first round loses stolen goods that could otherwise be earned.',
        'If few players are online, avoid sending alone to an empty camp. Join one that is likely to run, coordinate through kingdom chat, and check back after sending so you can relocate if fewer than five players join.',
        'Hero strength, the relevant hero bonus, hero weapon, Natar Horn, Brewery (Wolf camps only), and smithy upgrades affect your contribution to camp strength and therefore your rewards. The Roman Horse Drinking Trough does not reduce crop costs for camps: Equites Legati count as 2 crop, Equites Imperatoris as 3, and Equites Caesaris as 4.',
        'See the troop-efficiency comparisons below for what to send to each camp. Their base figures exclude smithy, Natar Horn, Brewery, and other bonuses.',
        'Do not hoard stolen goods. Sell them to the kingdom: the kingdom needs them to grow its victory points and win the server.'
      ],
      spawn:'The reported spawn interval is approximately 48–96 hours on x1 and 34–69 hours on x3. These are player-observed estimates, not confirmed game mechanics.',
      strengthOverview:'Camp level, strength, and rewards depend on game-world age and kingdom strength. The following x3 figures show the reported minimum and maximum number of troops per camp and approximate total rewards.',
      levels:[
        {level:1,other:'18–90',wolf:'36–181',rewards:'~20k of each resource',sg:80},
        {level:2,other:'112–564',wolf:'224–1,128',rewards:'~41k of each resource',sg:90},
        {level:3,other:'270–1,350',wolf:'540–2,700',rewards:'~62.5k of each resource',sg:100},
        {level:4,other:'489–2,448',wolf:'979–4,896',rewards:'~83k of each resource',sg:110},
        {level:5,other:'771–3,859',wolf:'1,543–7,718',rewards:'~104k of each resource',sg:120},
        {level:6,other:'1,116–5,582',wolf:'2,233–11,165',rewards:'~125k resources',sg:130},
        {level:7,other:'1,523–7,618',wolf:'3,047–15,237',rewards:'~146k resources',sg:140},
        {level:8,other:'1,993–9,967',wolf:'3,986–19,934',rewards:'~167k resources',sg:150},
        {level:9,other:'Unknown–12,628',wolf:'Unknown–25,256',rewards:'~188k resources',sg:160},
        {level:10,other:'3,120–15,601',wolf:'6,240–31,203',rewards:'~208k resources',sg:170}
      ],
      beforeCredit:'Original creator unknown. Please get in touch to receive proper credit. These values predate the Summer Mayhem and HaHu 2026 troop rebalance and exclude smithy, Natar Horn, Brewery, and other bonuses.',
      afterCredit:'Credit: ShinyPink. Updated for the troop rebalance announced during Summer Mayhem and HaHu 2026. Smithy, Natar Horn, Brewery, and other bonuses are not included.',
      before:[
        {camp:'Wolf',focus:'Attack',units:[['Roman','Imperians',70,1,70],['Gaul','Swordsmen',65,1,65],['Teuton','Axemen',60,1,60],['Teuton','Teutonic Knights',150,3,50]]},
        {camp:'Snake',focus:'Infantry defence',units:[['Roman','Praetorians',65,1,65],['Gaul','Druidriders',115,2,57.5],['Teuton','Paladins',100,2,50],['Gaul','Phalanxes',40,1,40]]},
        {camp:'Bear',focus:'Cavalry defence',units:[['Teuton','Spearmen',60,1,60],['Gaul','Haeduans',165,3,55],['Gaul','Phalanxes',50,1,50],['Roman','Legionnaires',50,1,50]]}
      ],
      after:[
        {camp:'Wolf',focus:'Attack',units:[['Roman','Imperians',75,1,75],['Gaul','Swordsmen',65,1,65],['Teuton','Axemen',60,1,60],['Teuton','Teutonic Knights',180,3,60]]},
        {camp:'Snake',focus:'Attack',units:[['Roman','Praetorians',70,1,70],['Gaul','Druidriders',120,2,60],['Teuton','Paladins',105,2,52.5],['Gaul','Phalanxes',40,1,40]]},
        {camp:'Bear',focus:'Attack',units:[['Roman','Legionnaires',65,1,65],['Teuton','Spearmen',60,1,60],['Gaul','Haeduans',180,3,60],['Gaul','Phalanxes',50,1,50]]}
      ]
    },
    robber_hideouts:{
      kind:'robber_hideouts',
      mechanism:[
        'Robber hideouts appear on wilderness tiles around your capital. They are PvE events visible only to the individual player.',
        'Each player has two hideouts, each running its own spawn timer.',
        'Hideouts hold resources and stolen goods that can be collected through successful raids, attacks, or sieges.',
        'The robber troops shown in a hideout defend against your army. Send enough offensive strength to win.',
        'Every robber troop defeated rewards you with half its original offensive points. If your hero participates in the battle, your hero receives the full corresponding XP for the defeated troops, including bonuses from fealty and XP boots.',
        'After every resource has been removed, the hideout disappears and its timer starts for the next spawn.'
      ],
      guidelines:[
        'Clear hideouts as quickly as you can. Their rewards help your personal progression, and stolen goods contribute to the kingdom’s treasures and victory points.',
        'Do not hoard stolen goods. Sell them to the kingdom: they are needed to increase the kingdom’s victory points and help win the server.',
        'Some hideouts are considerably stronger against infantry than cavalry, or the other way around. Use the Combat Simulator to minimise losses.',
        'When possible, siege with more than 1,000 troops of decent offensive strength and at least one ram. The siege combat bonus can reduce casualties; defensive players can also benefit.',
        'Consider buying a Natar Horn at auction for an additional combat bonus against robbers, Natars, and nature units.',
        'Early in the game, your hero can be a major asset. Use a Book of Wisdom to shift skill points toward fighting strength when needed.',
        'Use bandages strategically to recover expensive troops. For example, if a cavalry-only siege minimises losses, equip bandages to save some of those costly horses.'
      ],
      spawnOverview:'The first 12 hideouts spawn more frequently than later ones. You begin the game with two hideouts already on the map. Your third and fourth hideouts spawn a fixed time after you fully clear the first and second respectively; each hideout has its own timer.',
      fixedSpawn:[
        {speed:'x1',time:'2h'},
        {speed:'x2',time:'1h 40m'},
        {speed:'x3',time:'1h 27m'},
        {speed:'x5',time:'1h 15m'}
      ],
      variableOverview:'Hideouts 5–12 use a growing spawn-time interval rather than a fixed delay. Earlier spawns fall near the lower end; the 12th hideout can take up to the higher end.',
      variableSpawn:[
        {speed:'x1',time:'4–15h',note:'Around 4–5h for the 5th and 6th; up to 15h for the 12th'},
        {speed:'x2',time:'3.2–12.2h'},
        {speed:'x3',time:'2.9–10.8h'},
        {speed:'x5',time:'2.5–9.3h'}
      ],
      laterOverview:'After the first 12, the timer gradually grows with server age. Assuming each hideout is cleared immediately, the estimated average number of spawns per day on x3 is:',
      x3Daily:[
        {age:'Days 1–14',rate:'3.3/day'},
        {age:'Days 15–49',rate:'2.1/day'},
        {age:'Day 50 onward',rate:'1.4/day'}
      ],
      x1Daily:'For x1, the reported averages are 2.4, 1.5, and 1.0 hideouts per day across three successive phases. The exact server-day boundaries for these phases are unconfirmed because the original knowledge-base information is no longer available.',
      strength:'Hideout strength appears to depend on the combined offensive power of your troops and possibly your population.',
      rewards:'Resource rewards appear to depend on your resource production and possibly your population. Based on player experience, crop production does not seem to count, while wood, clay, and iron production in the capital may carry greater weight.',
      uncertainty:'The exact strength and reward formulas are unknown. Population effects, crop exclusion, and capital-production weighting are observations, not verified mechanics.'
    },
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
  function robberHideoutArticleHtml(reference){
    const bulletList=(items,emphasize)=>'<ul class="apes-lib-robber-list">'+items.map((item,index)=>
      '<li'+(index===emphasize?' class="apes-lib-robber-priority"':'')+'>'+
      (index===emphasize?'<strong>'+escapeHtml(item)+'</strong>':escapeHtml(item))+'</li>'
    ).join('')+'</ul>';
    const table=(headers,rows)=>'<div class="apes-lib-robber-table-scroll"><table class="apes-lib-robber-table">'+
      '<thead><tr>'+headers.map(h=>'<th scope="col">'+escapeHtml(h)+'</th>').join('')+'</tr></thead>'+
      '<tbody>'+rows.map(row=>'<tr>'+row.map((cell,i)=>
        (i===0?'<th scope="row">':'<td>')+escapeHtml(cell)+(i===0?'</th>':'</td>')).join('')+'</tr>').join('')+
      '</tbody></table></div>';
    return '<div class="apes-lib-reference-article apes-lib-robber-reference">'+
      '<section class="apes-lib-robber-section"><h3>Mechanism</h3>'+bulletList(reference.mechanism,-1)+'</section>'+
      '<section class="apes-lib-robber-section"><h3>Guidelines</h3>'+bulletList(reference.guidelines,1)+'</section>'+
      '<section class="apes-lib-robber-section"><h3>Spawn Rate</h3>'+
        '<p>'+escapeHtml(reference.spawnOverview)+'</p>'+
        '<h4>Hideouts 3 &amp; 4 — fixed delay</h4>'+
        table(['Server speed','Time after clearing'],reference.fixedSpawn.map(r=>[r.speed,r.time]))+
        '<h4>Hideouts 5–12 — increasing interval</h4>'+
        '<p>'+escapeHtml(reference.variableOverview)+'</p>'+
        table(['Server speed','Spawn interval','Additional detail'],reference.variableSpawn.map(r=>[r.speed,r.time,r.note||'—']))+
        '<h4>After the first 12 — average spawns</h4>'+
        '<p>'+escapeHtml(reference.laterOverview)+'</p>'+
        table(['x3 server age','Average hideouts'],reference.x3Daily.map(r=>[r.age,r.rate]))+
        '<p class="apes-lib-robber-footnote">'+escapeHtml(reference.x1Daily)+'</p>'+
      '</section>'+
      '<section class="apes-lib-robber-section"><h3>Hideout Strength &amp; Rewards</h3>'+
        '<p><strong>Strength:</strong> '+escapeHtml(reference.strength)+'</p>'+
        '<p><strong>Rewards:</strong> '+escapeHtml(reference.rewards)+'</p>'+
        '<div class="apes-lib-reference-warning" role="note"><strong>Estimates — formulas not confirmed</strong>'+
          '<p>'+escapeHtml(reference.uncertainty)+'</p></div>'+
      '</section></div>';
  }
  function robberCampArticleHtml(reference){
    const list=(items,highlightLast)=>'<ul class="apes-lib-robber-list">'+items.map((item,index)=>
      '<li'+(highlightLast&&index===items.length-1?' class="apes-lib-robber-priority"':'')+'>'+
      escapeHtml(item)+'</li>').join('')+'</ul>';
    const table=(headers,rows)=>'<div class="apes-lib-robber-table-scroll"><table class="apes-lib-robber-table">'+
      '<thead><tr>'+headers.map(h=>'<th scope="col">'+escapeHtml(h)+'</th>').join('')+'</tr></thead>'+
      '<tbody>'+rows.map(row=>'<tr>'+row.map((cell,i)=>
        (i===0?'<th scope="row">':'<td>')+escapeHtml(cell)+(i===0?'</th>':'</td>')).join('')+'</tr>').join('')+
      '</tbody></table></div>';
    const comparison=groups=>groups.map(group=>
      '<div class="apes-lib-camp-unit-group"><h4>'+escapeHtml(group.camp)+' <span>· '+escapeHtml(group.focus)+'</span></h4>'+
      table(['Tribe','Unit','Strength','Crop','Strength / crop'],group.units)+'</div>'
    ).join('');
    const cycleSrc=assetUrl('images/guides/robber-camps-cycle.svg');
    const cycle='<figure class="apes-lib-camp-cycle">'+
      '<img src="'+escapeHtml(cycleSrc)+'" width="1120" height="280" alt="Robber camp map lifecycle: default tile, burning preparation, active camp, regrowth, and return to default tile" loading="lazy" decoding="async" draggable="false">'+
      '<figcaption>Camp lifecycle: default tile → burning ramp-up → spawned camp → regrowth → default tile.</figcaption></figure>';
    return '<div class="apes-lib-reference-article apes-lib-robber-reference apes-lib-camp-reference">'+
      '<section class="apes-lib-robber-section"><h3>Mechanism</h3>'+list(reference.mechanism,false)+'</section>'+
      '<section class="apes-lib-robber-section"><h3>Guidelines</h3>'+list(reference.guidelines,true)+'</section>'+
      '<section class="apes-lib-robber-section"><h3>Spawn Rate</h3><p>'+escapeHtml(reference.spawn)+'</p></section>'+
      '<section class="apes-lib-robber-section"><h3>Camp Strengths &amp; Rewards</h3>'+
        '<p>'+escapeHtml(reference.strengthOverview)+'</p>'+cycle+
        '<h4>Camp strengths and rewards per level — x3</h4>'+
        table(['Level','Bear / Snake troops','Wolf troops','Resource rewards','Stolen goods'],
          reference.levels.map(row=>[row.level,row.other,row.wolf,row.rewards,row.sg+' SG']))+
        '<p class="apes-lib-robber-footnote">Level 9 minimum troop counts are not available; figures and rewards are approximate.</p>'+
      '</section>'+
      '<section class="apes-lib-robber-section"><h3>Most Efficient Troops — Before 2026 Rebalance</h3>'+
        '<p class="apes-lib-robber-footnote">'+escapeHtml(reference.beforeCredit)+'</p>'+comparison(reference.before)+'</section>'+
      '<section class="apes-lib-robber-section"><h3>Most Efficient Troops — After 2026 Rebalance</h3>'+
        '<p class="apes-lib-robber-footnote">'+escapeHtml(reference.afterCredit)+'</p>'+comparison(reference.after)+'</section>'+
      '</div>';
  }
  function referenceArticleHtml(reference){
    if(reference.kind==='robber_camps')return robberCampArticleHtml(reference);
    if(reference.kind==='robber_hideouts')return robberHideoutArticleHtml(reference);
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
