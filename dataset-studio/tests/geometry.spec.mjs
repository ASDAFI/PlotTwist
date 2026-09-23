import assert from 'node:assert/strict';
import test from 'node:test';
import {nativePoint,dragBox} from '../lib/geometry.ts';
const box={box_id:'stable',x:200.5,y:100.25,width:300.25,height:250.5,extra:null};
test('screen coordinates map to original pixels at fit and 2x zoom',()=>{
 assert.deepEqual(nativePoint({x:160,y:150},{left:10,top:50,width:500,height:250},1000,500),{x:300,y:200});
 assert.deepEqual(nativePoint({x:310,y:250},{left:10,top:50,width:1000,height:500},1000,500),{x:300,y:200});
 assert.deepEqual(nativePoint({x:-10,y:1000},{left:10,top:50,width:1000,height:500},1000,500),{x:0,y:500});
});
test('reverse drawing normalizes origin and dimensions',()=>{
 assert.deepEqual(dragBox({mode:'draw',start:{x:90,y:80},target:'solution'},{x:10,y:20},1000,500),{box_id:'preview',x:10,y:20,width:80,height:60});
});
test('moving clamps boundaries and preserves IDs, fractions, and unknown data',()=>{
 const moved=dragBox({mode:'move',start:{x:210,y:110},original:box,target:'solution'},{x:1000,y:500},1000,500);
 assert.deepEqual(moved,{...box,x:699.75,y:249.5});
});
test('each resize handle keeps the opposite corner fixed',()=>{
 for(const corner of ['nw','ne','sw','se']){
  const changed=dragBox({mode:'resize',corner,start:{x:0,y:0},original:box,target:'solution'},{x:20,y:30},1000,500);
  assert.equal(changed.box_id,'stable');assert.equal(changed.extra,null);
  assert.equal(corner.includes('w')?changed.x+changed.width:changed.x,corner.includes('w')?box.x+box.width:box.x);
  assert.equal(corner.includes('n')?changed.y+changed.height:changed.y,corner.includes('n')?box.y+box.height:box.y);
 }
});
test('resize cannot invert or extend outside the image',()=>{
 const changed=dragBox({mode:'resize',corner:'nw',start:{x:0,y:0},original:box,target:'solution'},{x:1000,y:500},1000,500);
 assert.equal(changed.width,1);assert.equal(changed.height,1);
 const big=dragBox({mode:'resize',corner:'se',start:{x:0,y:0},original:box,target:'solution'},{x:1000,y:500},1000,500);
 assert.equal(big.x+big.width,1000);assert.equal(big.y+big.height,500);
});
