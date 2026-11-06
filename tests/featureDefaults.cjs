const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'js/ui/menu.js'),'utf8');
const saved=new Map(),ctx={window:{},localStorage:{getItem:k=>saved.has(k)?saved.get(k):null},setTimeout(){}};
const config=vm.runInNewContext(source.slice(0,source.indexOf('let autoDismissActive'))+'\n({basic:BASIC_FEATURES,expert:ADVANCED_FEATURES,kingdom:KINGDOM_MANAGEMENT_FEATURES,cosmetic:COSMETIC_FEATURES,keys:KEYBINDS})',ctx);
for(const f of [...config.basic,...config.keys.filter(f=>f.key)])assert.equal(ctx.window.isQolEnabled(f.key),true,f.key);
for(const f of [...config.expert,...config.kingdom,...config.cosmetic,{key:'roadmaps'}])assert.equal(ctx.window.isQolEnabled(f.key),false,f.key);
assert.ok(config.basic.some(f=>f.key==='dailyReminders'));assert.ok(!config.expert.some(f=>f.key==='dailyReminders'));
for(const key of ['npcCalculator','barracks24hPlanner']){assert.ok(config.expert.some(f=>f.key===key));assert.ok(!config.basic.some(f=>f.key===key));}
assert.equal(config.expert.find(f=>f.key==='barracks24hPlanner').name,'24h Training Planner');
for(const f of [...config.basic,...config.expert,...config.kingdom,...config.cosmetic]){saved.set('qol_'+f.key,'true');assert.equal(ctx.window.isQolEnabled(f.key),true);saved.set('qol_'+f.key,'false');assert.equal(ctx.window.isQolEnabled(f.key),false);saved.delete('qol_'+f.key);}
for(const [file,name] of [['js/modules/barracksTraining/dayPlanner.js','enabled'],['js/modules/royalTributes/liveCountdown.js','isEnabled'],['js/ui/roadmapsExpertPlacement.js','isEnabled']]){
 const text=fs.readFileSync(path.join(root,file),'utf8');const start=text.indexOf('  function '+name+'() {'),end=text.indexOf('\n  }',start)+4;
 const storage=new Map(),localStorage={getItem:k=>storage.get(k)??null};const context={window:{localStorage},localStorage,STORAGE_KEY:'test'};
 const enabled=vm.runInNewContext(text.slice(start,end)+'\n'+name,context);assert.equal(enabled(),false,file);storage.set('test','true');assert.equal(enabled(),true,file);storage.set('test','false');assert.equal(enabled(),false,file);
}
console.log('Feature groups, all default states, saved preferences and independent runtime defaults passed.');
