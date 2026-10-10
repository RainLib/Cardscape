const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../renderer/ai-edit-geometry.js');

test('paint coordinates invert view zoom, pan and expanded-image offsets',()=>{
 const padding=[320,80,64,160],b=G.layout(740,460,1024,1536,padding,2.25,{x:-70,y:45});
 for(const [x,y] of [[0,0],[512,768],[1024,1536]]){
  const p=G.sourcePoint({x:b.sourceX+x*b.scale,y:b.sourceY+y*b.scale},b);
  assert.ok(Math.abs(p.x-x)<1e-8);assert.ok(Math.abs(p.y-y)<1e-8);
 }
 assert.equal(b.sourceX,b.x+320*b.scale);assert.equal(b.sourceY,b.y+80*b.scale);
});

test('expansion drag preserves original coordinates while editing independent sides',()=>{
 const p=[128,128,128,128];
 assert.deepEqual(G.dragPadding(p,'nw',-50,-25,.25,1024,1536),[328,228,128,128]);
 assert.deepEqual(G.dragPadding(p,'se',75,50,.25,1024,1536),[128,128,428,328]);
 assert.deepEqual(G.dragPadding(p,'w',1000,0,.25,1024,1536),[0,128,128,128]);
 assert.deepEqual(p,[128,128,128,128]);
 assert.deepEqual(G.outputSize(1024,1536,[328,228,428,328]),{width:1780,height:2092});
});

test('expansion respects integer pixels, side limits and the image-memory budget',()=>{
 for(const p of [[-1,0,0,0],[0,0,1025,0],[0,2.4,0,0],[NaN,0,0,0]])assert.throws(()=>G.outputSize(1024,1536,p),/范围/);
 assert.throws(()=>G.outputSize(4096,4096,[1,0,0,0]),/预算/);
 assert.throws(()=>G.dragPadding([0,0,0,0],'se',100,100,1,4096,4096),/预算/);
});

test('brush history clips changed tiles to original image dimensions',()=>{
 const tiles=G.tiles({x:-10,y:250,width:280,height:100},300,300);
 assert.deepEqual(tiles,[{x:0,y:128,width:128,height:128},{x:128,y:128,width:128,height:128},{x:256,y:128,width:44,height:128},{x:0,y:256,width:128,height:44},{x:128,y:256,width:128,height:44},{x:256,y:256,width:44,height:44}]);
 assert.deepEqual(G.tiles({x:310,y:0,width:20,height:20},300,300),[]);
 assert.deepEqual(G.tiles({x:0,y:-20,width:5,height:3},300,300),[]);
});
