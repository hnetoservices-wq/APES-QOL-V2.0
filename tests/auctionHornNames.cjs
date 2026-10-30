'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/features/auctionHouseScanner.js'),'utf8');
const start=src.indexOf('  const CATEGORY_CONFIG = {');
const end=src.indexOf('  let scanToken',start);
assert.ok(start>=0 && end>start,'Auction category configuration exists');
const categories=new Function(src.slice(start,end)+'\nreturn CATEGORY_CONFIG;')();
const items=categories.leftHand.items;
const horns=['Small Horn of the Natars','Horn of the Natars','Huge Horn of the Natars'];
assert.deepEqual(items.filter(name=>/horn of the/i.test(name)),horns,'All three exact UI names match Travian');
assert.ok(!items.some(name=>/Natarian/i.test(name)),'Incorrect historical horn names removed');
const nStart=src.indexOf('  function normalizeItemName(');
const nEnd=src.indexOf('  function parseInteger(',nStart);
assert.ok(nStart>=0 && nEnd>nStart);
const normalize=new Function(src.slice(nStart,nEnd)+'\nreturn normalizeItemName;')();
for(const horn of horns) {
  assert.equal(normalize(horn),normalize(' '+horn+' '),'Canonical listing match survives whitespace');
}
assert.notEqual(normalize('Horn of the Natarian'),normalize('Horn of the Natars'),
  'Misspelt selector previously did not match the exact auction listing');
assert.match(src,/normalizeItemName\(getRowItemName\(row\)\)\s*===\s*wantedName/,
  'Scanner compares canonical names against native auction rows');
console.log('Auction House: all three Horn of the Natars names match the exact-listing search.');
