#!/usr/bin/env python3
"""Build spring-physics-v2.json template from p5Code."""
import json
import os

template = {
    "promptTemplate": "A 3D physics-based generative artwork with {{node_count}} nodes in a {{structure_type}} formation, shaped as {{node_shape}} primitives. Connected via {{connection_type}} topology with {{spring_style}} springs at {{spring_stiffness}} stiffness. Colored using {{color_palette}} palette with {{color_strategy}} mapping. Rendered in {{render_mode}} mode with {{lighting}} lighting, {{background_style}} background, and {{trail_mode}} trails. Post-processed with {{post_processing}} effects.",
    "variables": [
        {"name": "structure_type", "values": [
            {"text": "circle"}, {"text": "line"}, {"text": "goldenSpiral"},
            {"text": "fibonacciSphere"}, {"text": "blueNoise"},
            {"text": "platonic"}, {"text": "lorenz"}, {"text": "helix"}
        ]},
        {"name": "node_count", "values": [
            {"text": "few"}, {"text": "some"}, {"text": "moderate"},
            {"text": "many"}, {"text": "cluster"}, {"text": "swarm"}
        ]},
        {"name": "node_shape", "values": [
            {"text": "sphere"}, {"text": "box"}, {"text": "torus"},
            {"text": "cone"}, {"text": "octahedron"}, {"text": "icosahedron"}
        ]},
        {"name": "connection_type", "values": [
            {"text": "chain"}, {"text": "star"}, {"text": "kNearest"},
            {"text": "mst"}, {"text": "gabriel"}, {"text": "delaunay"}
        ]},
        {"name": "spring_style", "values": [
            {"text": "line"}, {"text": "curve"}, {"text": "ribbon"},
            {"text": "particles"}, {"text": "tube"}
        ]},
        {"name": "spring_stiffness", "values": [
            {"text": "floating"}, {"text": "loose"}, {"text": "elastic"},
            {"text": "moderate"}, {"text": "firm"}, {"text": "rigid"}
        ]},
        {"name": "color_palette", "values": [
            {"text": "Ocean Breeze"}, {"text": "Sapphire Nights"},
            {"text": "Neon Dream"}, {"text": "Cyberpunk"},
            {"text": "Autumn Leaves"}, {"text": "Aurora"},
            {"text": "Rose Gold"}, {"text": "Monochrome"}
        ]},
        {"name": "color_strategy", "values": [
            {"text": "radialGradient"}, {"text": "angularGradient"},
            {"text": "graphAware"}, {"text": "clusterColoring"}
        ]},
        {"name": "lighting", "values": [
            {"text": "none"}, {"text": "ambient"}, {"text": "directional"},
            {"text": "point"}, {"text": "spot"}, {"text": "multi"}
        ]},
        {"name": "background_style", "values": [
            {"text": "solid"}, {"text": "gradient"}, {"text": "noise"}, {"text": "stars"}
        ]},
        {"name": "trail_mode", "values": [
            {"text": "off"}, {"text": "medium"}, {"text": "full"}
        ]},
        {"name": "render_mode", "values": [
            {"text": "nodes and springs"}, {"text": "nodes only"},
            {"text": "springs only"}, {"text": "minimalist"}
        ]},
        {"name": "post_processing", "values": [
            {"text": "none"}, {"text": "bloom"}, {"text": "grain"},
            {"text": "chromatic aberration"}
        ]}
    ],
    "p5Code": ""  # Will be filled below
}

p5code = r'''
var CW = 500;
var TAU = Math.PI * 2;
var PHI = (1 + Math.sqrt(5)) / 2;
var GOLDEN_ANGLE = TAU / (PHI * PHI);

// ═══ Vec3 ═══
function V3(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}
V3.prototype.set=function(x,y,z){this.x=x;this.y=y;this.z=z;return this;};
V3.prototype.copy=function(){return new V3(this.x,this.y,this.z);};
V3.prototype.add=function(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;};
V3.prototype.sub=function(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;};
V3.prototype.scale=function(s){this.x*=s;this.y*=s;this.z*=s;return this;};
V3.prototype.addScaled=function(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;};
V3.prototype.dot=function(v){return this.x*v.x+this.y*v.y+this.z*v.z;};
V3.prototype.cross=function(v){return new V3(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x);};
V3.prototype.lenSq=function(){return this.x*this.x+this.y*this.y+this.z*this.z;};
V3.prototype.len=function(){return Math.sqrt(this.lenSq());};
V3.prototype.normalize=function(){var l=this.len();if(l>1e-8){this.x/=l;this.y/=l;this.z/=l;}return this;};
V3.prototype.normalized=function(){return this.copy().normalize();};
V3.prototype.distTo=function(v){var dx=this.x-v.x,dy=this.y-v.y,dz=this.z-v.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);};
V3.prototype.distSqTo=function(v){var dx=this.x-v.x,dy=this.y-v.y,dz=this.z-v.z;return dx*dx+dy*dy+dz*dz;};
V3.prototype.lerp=function(v,t){return new V3(this.x+(v.x-this.x)*t,this.y+(v.y-this.y)*t,this.z+(v.z-this.z)*t);};
V3.prototype.rotateAxis=function(ax,ang){var c=Math.cos(ang),s=Math.sin(ang),d=this.dot(ax);var cx=ax.y*this.z-ax.z*this.y,cy=ax.z*this.x-ax.x*this.z,cz=ax.x*this.y-ax.y*this.x;this.x=this.x*c+cx*s+ax.x*d*(1-c);this.y=this.y*c+cy*s+ax.y*d*(1-c);this.z=this.z*c+cz*s+ax.z*d*(1-c);return this;};
function v3sub(a,b){return new V3(a.x-b.x,a.y-b.y,a.z-b.z);}
function v3add(a,b){return new V3(a.x+b.x,a.y+b.y,a.z+b.z);}
function v3scale(v,s){return new V3(v.x*s,v.y*s,v.z*s);}
function v3zero(){return new V3(0,0,0);}
function v3rand(sc){return new V3((Math.random()-0.5)*2*sc,(Math.random()-0.5)*2*sc,(Math.random()-0.5)*2*sc);}
function v3randUnit(){var th=Math.acos(2*Math.random()-1),ph=TAU*Math.random();return new V3(Math.sin(th)*Math.cos(ph),Math.sin(th)*Math.sin(ph),Math.cos(th));}

// ═══ Oklab Color Utils ═══
function srgb2lin(c){return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lin2srgb(c){return c<=0.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-0.055;}
function rgb2oklab(r,g,b){
  var lr=srgb2lin(r/255),lg=srgb2lin(g/255),lb=srgb2lin(b/255);
  var l_=0.4122214708*lr+0.5363325363*lg+0.0514459929*lb;
  var m_=0.2119034982*lr+0.6806995451*lg+0.1073969566*lb;
  var s_=0.0883024619*lr+0.2817188376*lg+0.6299787005*lb;
  var l=Math.cbrt(l_),m=Math.cbrt(m_),s=Math.cbrt(s_);
  return{L:0.2104542553*l+0.7936177850*m-0.0040720468*s,a:1.9779984951*l-2.4285922050*m+0.4505937099*s,b:0.0259040371*l+0.7827717662*m-0.8086757660*s};
}
function oklab2rgb(L,a,b){
  var l_=L+0.3963377774*a+0.2158037573*b,m_=L-0.1055613458*a-0.0638541728*b,s_=L-0.0894841775*a-1.2914855480*b;
  var l=l_*l_*l_,m=m_*m_*m_,s=s_*s_*s_;
  var r=4.0767416621*l-3.3077115913*m+0.2309699292*s;
  var g=-1.2684380046*l+2.6097574011*m-0.3413193965*s;
  var bl=-0.0041960863*l-0.7034186147*m+1.7076147010*s;
  return[Math.round(Math.max(0,Math.min(1,lin2srgb(r)))*255),Math.round(Math.max(0,Math.min(1,lin2srgb(g)))*255),Math.round(Math.max(0,Math.min(1,lin2srgb(bl)))*255)];
}
function lerpOklab(c1,c2,t){
  var a=rgb2oklab(c1[0],c1[1],c1[2]),b=rgb2oklab(c2[0],c2[1],c2[2]);
  return oklab2rgb(a.L+(b.L-a.L)*t,a.a+(b.a-a.a)*t,a.b+(b.b-a.b)*t);
}
function sampleGrad(colors,t){
  t=Math.max(0,Math.min(1,t));
  if(colors.length===1)return colors[0].slice();
  var sc=t*(colors.length-1),i=Math.min(Math.floor(sc),colors.length-2);
  return lerpOklab(colors[i],colors[i+1],sc-i);
}
function adjLight(rgb,f){var lab=rgb2oklab(rgb[0],rgb[1],rgb[2]);lab.L=Math.max(0,Math.min(1,lab.L*f));return oklab2rgb(lab.L,lab.a,lab.b);}
function desat(rgb,amt){var lab=rgb2oklab(rgb[0],rgb[1],rgb[2]);lab.a*=(1-amt);lab.b*=(1-amt);return oklab2rgb(lab.L,lab.a,lab.b);}
function sortByLight(colors){return colors.slice().sort(function(a,b){return rgb2oklab(a[0],a[1],a[2]).L-rgb2oklab(b[0],b[1],b[2]).L;});}

// ═══ Palettes (8 selected, sorted at init) ═══
var RAW_PALETTES={
  "Ocean Breeze":[[26,72,96],[48,132,152],[111,202,186],[175,232,221],[230,248,243]],
  "Sapphire Nights":[[15,18,40],[35,50,100],[70,90,160],[120,145,210],[175,195,255]],
  "Neon Dream":[[20,5,40],[120,0,180],[255,0,102],[0,230,230],[255,240,50]],
  "Cyberpunk":[[15,5,45],[50,15,100],[3,200,185],[225,130,175],[255,200,60]],
  "Autumn Leaves":[[60,20,5],[147,60,15],[200,110,30],[235,170,50],[250,215,120]],
  "Aurora":[[5,10,30],[20,60,90],[50,180,120],[140,230,100],[240,255,180]],
  "Rose Gold":[[140,80,70],[185,130,115],[211,167,146],[235,198,180],[255,225,212]],
  "Monochrome":[[10,10,10],[55,55,55],[110,110,110],[175,175,175],[235,235,235]]
};
var PALETTES={};
function initPalettes(){for(var k in RAW_PALETTES)PALETTES[k]=sortByLight(RAW_PALETTES[k]);}
function getPal(name){return PALETTES[name]||PALETTES["Sapphire Nights"];}
function samplePal(name,t){return sampleGrad(getPal(name),t);}
function bgFromPal(name){return adjLight(getPal(name)[0],0.35);}

// ═══ Parameter Maps ═══
var countMap={few:4,some:8,moderate:12,many:18,cluster:24,swarm:30};
var stiffMap={floating:0.05,loose:0.12,elastic:0.25,moderate:0.4,firm:0.6,rigid:0.8};
var renderMap={"nodes and springs":"both","nodes only":"nodesOnly","springs only":"springsOnly","minimalist":"minimalist"};

// ═══ Structure Generators ═══
function genCircle(count,size){
  var pos=[];for(var i=0;i<count;i++){var a=TAU*i/count;pos.push(new V3(Math.cos(a)*size,Math.sin(a)*size,(Math.random()-0.5)*size*0.15));}return pos;
}
function genLine(count,size){
  var pos=[];for(var i=0;i<count;i++){var t=count>1?i/(count-1):0.5;pos.push(new V3((t-0.5)*size*2,(Math.random()-0.5)*size*0.2,(Math.random()-0.5)*size*0.2));}return pos;
}
function genGoldenSpiral(count,size){
  var pos=[];for(var i=0;i<count;i++){var t=i/count,r=size*Math.sqrt(t),a=i*GOLDEN_ANGLE;pos.push(new V3(Math.cos(a)*r,Math.sin(a)*r,(t-0.5)*size*0.4));}return pos;
}
function genFibSphere(count,size){
  var pos=[];for(var i=0;i<count;i++){var y=1-(i/(count-1))*2,rr=Math.sqrt(1-y*y),a=i*GOLDEN_ANGLE;pos.push(new V3(Math.cos(a)*rr*size,y*size,Math.sin(a)*rr*size));}return pos;
}
function genBlueNoise(count,size){
  var minD=size*2/Math.cbrt(count),pos=[new V3(0,0,0)],att=0,maxAtt=count*30;
  while(pos.length<count&&att<maxAtt){att++;var c=v3rand(size),ok=true;
    for(var i=0;i<pos.length;i++){if(c.distSqTo(pos[i])<minD*minD){ok=false;break;}}
    if(ok)pos.push(c);}
  while(pos.length<count)pos.push(v3rand(size));
  return pos;
}
function genPlatonic(count,size){
  var solids={tetrahedron:function(s){var a=s;return[new V3(a,a,a),new V3(a,-a,-a),new V3(-a,a,-a),new V3(-a,-a,a)];},
    octahedron:function(s){return[new V3(s,0,0),new V3(-s,0,0),new V3(0,s,0),new V3(0,-s,0),new V3(0,0,s),new V3(0,0,-s)];},
    cube:function(s){var v=s*0.7,r=[];for(var x=-1;x<=1;x+=2)for(var y=-1;y<=1;y+=2)for(var z=-1;z<=1;z+=2)r.push(new V3(x*v,y*v,z*v));return r;},
    icosahedron:function(s){var t=s*0.6,q=t*PHI;return[new V3(-t,q,0),new V3(t,q,0),new V3(-t,-q,0),new V3(t,-q,0),new V3(0,-t,q),new V3(0,t,q),new V3(0,-t,-q),new V3(0,t,-q),new V3(q,0,-t),new V3(q,0,t),new V3(-q,0,-t),new V3(-q,0,t)];},
    dodecahedron:function(s){var ss=s*0.45,q=ss*PHI,ip=ss/PHI,v=[];for(var x=-1;x<=1;x+=2)for(var y=-1;y<=1;y+=2)for(var z=-1;z<=1;z+=2)v.push(new V3(x*ss,y*ss,z*ss));for(var a=-1;a<=1;a+=2)for(var b=-1;b<=1;b+=2){v.push(new V3(0,a*ip,b*q));v.push(new V3(a*ip,b*q,0));v.push(new V3(b*q,0,a*ip));}return v;}
  };
  var types=[{n:'tetrahedron',v:4},{n:'octahedron',v:6},{n:'cube',v:8},{n:'icosahedron',v:12},{n:'dodecahedron',v:20}];
  var best=types[0];for(var i=0;i<types.length;i++){if(Math.abs(types[i].v-count)<Math.abs(best.v-count))best=types[i];}
  var pos=solids[best.n](size).slice();
  while(pos.length<count){var ii=Math.floor(Math.random()*pos.length),jj=Math.floor(Math.random()*pos.length);if(ii!==jj)pos.push(pos[ii].lerp(pos[jj],0.5+(Math.random()-0.5)*0.2));}
  return pos.slice(0,count);
}
function genLorenz(count,size){
  var sigma=10,rho=28,beta=8/3,x=0.1,y=0,z=0,dt=0.005,steps=count*50,traj=[];
  for(var i=0;i<steps;i++){var dx=sigma*(y-x),dy=x*(rho-z)-y,dz=x*y-beta*z;x+=dx*dt;y+=dy*dt;z+=dz*dt;traj.push(new V3(x,y,z));}
  var step=Math.floor(traj.length/count),pos=[];
  for(var j=0;j<count;j++){var pt=traj[j*step]||traj[traj.length-1];pos.push(new V3(pt.x*size/25,pt.y*size/25,(pt.z-25)*size/25));}
  return pos;
}
function genHelix(count,size){
  var pos=[],turns=2+Math.random()*3;
  for(var i=0;i<count;i++){var t=i/(count-1),a=t*TAU*turns;pos.push(new V3(Math.cos(a)*size*0.6,(t-0.5)*size*2,Math.sin(a)*size*0.6));}
  return pos;
}
function generateStructure(type,count,size){
  switch(type){
    case'circle':return genCircle(count,size);case'line':return genLine(count,size);
    case'goldenSpiral':return genGoldenSpiral(count,size);case'fibonacciSphere':return genFibSphere(count,size);
    case'blueNoise':return genBlueNoise(count,size);case'platonic':return genPlatonic(count,size);
    case'lorenz':return genLorenz(count,size);case'helix':return genHelix(count,size);
    default:return genCircle(count,size);
  }
}

// ═══ Connection Generators ═══
function edgeKey(i,j){return i<j?i+'-'+j:j+'-'+i;}
function conChain(nodes){var e=[];for(var i=0;i<nodes.length;i++)e.push([i,(i+1)%nodes.length]);return e;}
function conStar(nodes){
  var cx=0,cy=0,cz=0;for(var i=0;i<nodes.length;i++){cx+=nodes[i].pos.x;cy+=nodes[i].pos.y;cz+=nodes[i].pos.z;}
  cx/=nodes.length;cy/=nodes.length;cz/=nodes.length;var com=new V3(cx,cy,cz);
  var ci=0,md=Infinity;for(var j=0;j<nodes.length;j++){var d=nodes[j].pos.distTo(com);if(d<md){md=d;ci=j;}}
  var e=[];for(var k=0;k<nodes.length;k++){if(k!==ci)e.push([ci,k]);}return e;
}
function conKNearest(nodes){
  var k=Math.max(2,Math.ceil(nodes.length/4)),es=new Set(),e=[];
  for(var i=0;i<nodes.length;i++){var ds=[];for(var j=0;j<nodes.length;j++){if(i===j)continue;ds.push({j:j,d:nodes[i].pos.distTo(nodes[j].pos)});}
    ds.sort(function(a,b){return a.d-b.d;});for(var n=0;n<Math.min(k,ds.length);n++){var ky=edgeKey(i,ds[n].j);if(!es.has(ky)){es.add(ky);e.push([Math.min(i,ds[n].j),Math.max(i,ds[n].j)]);}}}return e;
}
function conMST(nodes){
  if(nodes.length<2)return[];var inT=new Set([0]),e=[];
  while(inT.size<nodes.length){var bd=Infinity,bi=-1,bj=-1;
    inT.forEach(function(i){for(var j=0;j<nodes.length;j++){if(inT.has(j))continue;var d=nodes[i].pos.distTo(nodes[j].pos);if(d<bd){bd=d;bi=i;bj=j;}}});
    if(bj===-1)break;inT.add(bj);e.push([bi,bj]);}return e;
}
function conGabriel(nodes){
  var e=[];for(var i=0;i<nodes.length;i++){for(var j=i+1;j<nodes.length;j++){
    var mid=nodes[i].pos.lerp(nodes[j].pos,0.5),rSq=nodes[i].pos.distSqTo(nodes[j].pos)*0.25,ok=true;
    for(var k=0;k<nodes.length;k++){if(k===i||k===j)continue;if(nodes[k].pos.distSqTo(mid)<rSq){ok=false;break;}}
    if(ok)e.push([i,j]);}}return e;
}
function conDelaunay(nodes){
  if(nodes.length<3)return conChain(nodes);
  var pts=[];for(var i=0;i<nodes.length;i++)pts.push({x:nodes[i].pos.x,y:nodes[i].pos.y,idx:i});
  var M=10000,sup=[{x:-M,y:-M,idx:-1},{x:M*3,y:-M,idx:-2},{x:0,y:M*3,idx:-3}];
  var tris=[sup];
  function inCC(pt,tri){var ax=tri[0].x-pt.x,ay=tri[0].y-pt.y,bx=tri[1].x-pt.x,by=tri[1].y-pt.y,cx=tri[2].x-pt.x,cy=tri[2].y-pt.y;return(ax*ax+ay*ay)*(bx*cy-cx*by)-(bx*bx+by*by)*(ax*cy-cx*ay)+(cx*cx+cy*cy)*(ax*by-bx*ay)>0;}
  function hasEdge(tri,a,b){for(var i=0;i<3;i++){var ea=tri[i],eb=tri[(i+1)%3];if((ea===a&&eb===b)||(ea===b&&eb===a))return true;}return false;}
  for(var pi=0;pi<pts.length;pi++){var pt=pts[pi],bad=[],poly=[];
    for(var ti=0;ti<tris.length;ti++){if(inCC(pt,tris[ti]))bad.push(tris[ti]);}
    for(var bi=0;bi<bad.length;bi++){var tri=bad[bi];for(var ei=0;ei<3;ei++){var ea=tri[ei],eb=tri[(ei+1)%3],sh=false;for(var oi=0;oi<bad.length;oi++){if(bad[oi]===tri)continue;if(hasEdge(bad[oi],ea,eb)){sh=true;break;}}if(!sh)poly.push([ea,eb]);}}
    tris=tris.filter(function(t){return bad.indexOf(t)===-1;});
    for(var ppi=0;ppi<poly.length;ppi++)tris.push([poly[ppi][0],poly[ppi][1],pt]);}
  var es=new Set(),e=[];
  for(var fi=0;fi<tris.length;fi++){var tr=tris[fi];for(var ei2=0;ei2<3;ei2++){var a=tr[ei2],b=tr[(ei2+1)%3];if(a.idx<0||b.idx<0)continue;var ky=edgeKey(a.idx,b.idx);if(!es.has(ky)){es.add(ky);e.push([Math.min(a.idx,b.idx),Math.max(a.idx,b.idx)]);}}}
  return e;
}
function generateConnections(type,nodes){
  switch(type){
    case'chain':return conChain(nodes);case'star':return conStar(nodes);
    case'kNearest':return conKNearest(nodes);case'mst':return conMST(nodes);
    case'gabriel':return conGabriel(nodes);case'delaunay':return conDelaunay(nodes);
    default:return conChain(nodes);
  }
}

// ═══ Physics ═══
var SUBSTEPS=4;
function makeNode(pos,id){return{id:id,pos:pos.copy(),prevPos:pos.copy(),acc:v3zero(),radius:15,mass:1,pinned:false,degree:0,centrality:0,depth:0,color:[255,255,255],colorSecondary:[200,200,200],displayRadius:1,depthScale:1,focalScale:1};}
function makeSpring(nA,nB,rl,stiff){return{nodeA:nA,nodeB:nB,restLength:rl!==undefined?rl:nA.pos.distTo(nB.pos),stiffness:stiff||0.5,damping:0.02,color:[255,255,255],colorSecondary:[200,200,200],stress:0};}
function nodeVel(n){return v3sub(n.pos,n.prevPos);}
function nodeSpeed(n){return nodeVel(n).len();}
function nodeIntegrate(n,dt,friction){
  if(n.pinned)return;var vel=v3sub(n.pos,n.prevPos);
  n.prevPos.set(n.pos.x,n.pos.y,n.pos.z);
  n.pos.addScaled(vel,friction);n.pos.addScaled(n.acc,dt*dt);n.acc.set(0,0,0);
}
function nodeBound(n,bounds,bounce){
  if(n.pinned)return;var d=n.pos.len();
  if(d>bounds){var nm=n.pos.normalized();n.pos.set(nm.x*bounds,nm.y*bounds,nm.z*bounds);
    var vel=v3sub(n.pos,n.prevPos),vn=vel.dot(nm);
    if(vn>0)n.prevPos.set(n.pos.x+(vel.x-2*vn*nm.x)*bounce,n.pos.y+(vel.y-2*vn*nm.y)*bounce,n.pos.z+(vel.z-2*vn*nm.z)*bounce);}
}
function springConstraint(s){
  var delta=v3sub(s.nodeB.pos,s.nodeA.pos),d=delta.len();if(d<1e-8)return;
  var diff=(d-s.restLength)/d;s.stress=Math.abs(d-s.restLength)/s.restLength;
  var corr=diff*s.stiffness*0.5;
  if(!s.nodeA.pinned)s.nodeA.pos.addScaled(delta,corr);
  if(!s.nodeB.pinned)s.nodeB.pos.addScaled(delta,-corr);
}
function springForce(s){
  var delta=v3sub(s.nodeB.pos,s.nodeA.pos),d=delta.len();if(d<1e-8)return;
  var disp=d-s.restLength;s.stress=Math.abs(disp)/s.restLength;
  var ax=v3scale(delta,1/d),rv=v3sub(nodeVel(s.nodeB),nodeVel(s.nodeA));
  var total=disp*s.stiffness+rv.dot(ax)*s.damping;
  var fA=v3scale(ax,total),fB=v3scale(ax,-total);
  s.nodeA.acc.addScaled(fA,1/s.nodeA.mass);s.nodeB.acc.addScaled(fB,1/s.nodeB.mass);
}
function worldStep(nodes,springs,friction,bounds,bounce){
  for(var i=0;i<springs.length;i++)springForce(springs[i]);
  for(var i=0;i<nodes.length;i++)nodeIntegrate(nodes[i],1/60,friction);
  for(var sub=0;sub<SUBSTEPS;sub++){for(var i=0;i<springs.length;i++)springConstraint(springs[i]);}
  // O(n^2) collisions
  var sep=20;
  for(var i=0;i<nodes.length;i++){for(var j=i+1;j<nodes.length;j++){
    var dl=v3sub(nodes[j].pos,nodes[i].pos),dSq=dl.lenSq(),minD=(nodes[i].radius+nodes[j].radius)*0.5+sep;
    if(dSq<minD*minD&&dSq>1e-8){var dd=Math.sqrt(dSq),ov=minD-dd,nm=dl.copy().scale(1/dd);
      if(!nodes[i].pinned)nodes[i].pos.addScaled(nm,-ov*0.25);if(!nodes[j].pinned)nodes[j].pos.addScaled(nm,ov*0.25);}}}
  for(var i=0;i<nodes.length;i++)nodeBound(nodes[i],bounds,bounce);
}
function computeCentrality(nodes){
  var mx=0;for(var i=0;i<nodes.length;i++)mx=Math.max(mx,nodes[i].degree);if(mx===0)mx=1;
  for(var i=0;i<nodes.length;i++)nodes[i].centrality=nodes[i].degree/mx;
}
function computeDepth(nodes){
  var minZ=Infinity,maxZ=-Infinity;
  for(var i=0;i<nodes.length;i++){minZ=Math.min(minZ,nodes[i].pos.z);maxZ=Math.max(maxZ,nodes[i].pos.z);}
  var range=maxZ-minZ||1;for(var i=0;i<nodes.length;i++)nodes[i].depth=(nodes[i].pos.z-minZ)/range;
}
function centerOfMass(nodes){
  var c=v3zero();for(var i=0;i<nodes.length;i++)c.add(nodes[i].pos);
  if(nodes.length>0)c.scale(1/nodes.length);return c;
}

// ═══ Color Strategies ═══
function colorRadial(nodes,springs,palName){
  var pal=getPal(palName),com=centerOfMass(nodes),mx=0;
  for(var i=0;i<nodes.length;i++)mx=Math.max(mx,nodes[i].pos.distTo(com));if(mx<1)mx=1;
  for(var i=0;i<nodes.length;i++){var t=nodes[i].pos.distTo(com)/mx;nodes[i].color=sampleGrad(pal,t);nodes[i].colorSecondary=sampleGrad(pal,Math.min(1,t+0.15));}
  colorSprings(springs);
}
function colorAngular(nodes,springs,palName){
  var pal=getPal(palName);
  for(var i=0;i<nodes.length;i++){var a=Math.atan2(nodes[i].pos.y,nodes[i].pos.x),t=(a+Math.PI)/TAU;nodes[i].color=sampleGrad(pal,t);nodes[i].colorSecondary=sampleGrad(pal,(t+0.1)%1);}
  colorSprings(springs);
}
function colorGraphAware(nodes,springs,palName){
  var pal=getPal(palName);computeCentrality(nodes);
  for(var i=0;i<nodes.length;i++){var t=nodes[i].centrality;nodes[i].color=sampleGrad(pal,0.2+t*0.8);nodes[i].colorSecondary=sampleGrad(pal,Math.max(0,0.2+t*0.8-0.15));}
  colorSprings(springs);
}
function colorCluster(nodes,springs,palName){
  var pal=getPal(palName),visited=new Set(),clusters=[],adj=new Map();
  for(var i=0;i<nodes.length;i++)adj.set(nodes[i].id,[]);
  for(var i=0;i<springs.length;i++){adj.get(springs[i].nodeA.id).push(springs[i].nodeB.id);adj.get(springs[i].nodeB.id).push(springs[i].nodeA.id);}
  for(var i=0;i<nodes.length;i++){if(visited.has(nodes[i].id))continue;var cl=[],q=[nodes[i].id];
    while(q.length>0){var cur=q.pop();if(visited.has(cur))continue;visited.add(cur);cl.push(cur);var nb=adj.get(cur)||[];for(var j=0;j<nb.length;j++){if(!visited.has(nb[j]))q.push(nb[j]);}}clusters.push(cl);}
  for(var ci=0;ci<clusters.length;ci++){var ct=clusters.length>1?ci/(clusters.length-1):0.5,bc=sampleGrad(pal,ct);
    for(var ni=0;ni<clusters[ci].length;ni++){var nd=nodes[clusters[ci][ni]];if(!nd)continue;nd.color=bc;var v=clusters[ci].length>1?ni/(clusters[ci].length-1):0.5;nd.colorSecondary=sampleGrad(pal,Math.max(0,Math.min(1,ct+(v-0.5)*0.2)));}}
  colorSprings(springs);
}
function colorSprings(springs){
  for(var i=0;i<springs.length;i++){springs[i].color=lerpOklab(springs[i].nodeA.color,springs[i].nodeB.color,0.5);springs[i].colorSecondary=lerpOklab(springs[i].nodeA.colorSecondary,springs[i].nodeB.colorSecondary,0.5);}
}
function applyDepthFx(nodes,fade){
  computeDepth(nodes);
  for(var i=0;i<nodes.length;i++){var f=nodes[i].depth*fade;nodes[i].color=desat(nodes[i].color,f*0.6);nodes[i].color=adjLight(nodes[i].color,1-f*0.3);nodes[i].depthScale=1-nodes[i].depth*0.3;}
}
function applyFocal(nodes,springs,str){
  computeCentrality(nodes);var fi=0,mc=0;
  for(var i=0;i<nodes.length;i++){if(nodes[i].centrality>mc){mc=nodes[i].centrality;fi=i;}}
  nodes[fi].color=adjLight(nodes[fi].color,1+str);nodes[fi].focalScale=1+str*0.5;
  for(var i=0;i<springs.length;i++){var nb=null;if(springs[i].nodeA.id===nodes[fi].id)nb=springs[i].nodeB;else if(springs[i].nodeB.id===nodes[fi].id)nb=springs[i].nodeA;
    if(nb){nb.color=adjLight(nb.color,1+str*0.4);nb.focalScale=1+str*0.2;}}
}
function applyColors(nodes,springs,palName,strategy){
  switch(strategy){
    case'angularGradient':colorAngular(nodes,springs,palName);break;
    case'graphAware':colorGraphAware(nodes,springs,palName);break;
    case'clusterColoring':colorCluster(nodes,springs,palName);break;
    default:colorRadial(nodes,springs,palName);break;
  }
  applyDepthFx(nodes,0.35);applyFocal(nodes,springs,0.3);
}
function breathColor(node){var sp=nodeSpeed(node),bf=Math.min(1,sp*0.15);return lerpOklab(node.color,node.colorSecondary,bf);}
function springBreathColor(spring){var sf=Math.min(1,spring.stress*2);return lerpOklab(spring.color,spring.colorSecondary,sf);}

// ═══ Rendering Helpers ═══
function perpVec(v){var ax=Math.abs(v.x),ay=Math.abs(v.y),az=Math.abs(v.z);var oth;if(ax<=ay&&ax<=az)oth=new V3(1,0,0);else if(ay<=az)oth=new V3(0,1,0);else oth=new V3(0,0,1);return v.cross(oth).normalize();}

// ═══ State ═══
var nodes=[],springs=[];
var tick=0;
var prevStructure='',prevCount='',prevConn='';
var bgDrawn=false,bgImg=null;
var needsColorRefresh=false;

p.setup=function(){
  p.createCanvas(CW,CW,p.WEBGL);
  p.pixelDensity(1);
  p.setAttributes({alpha:true,antialias:true});
  initPalettes();
  resetSystem();
};

function resetSystem(){
  var st=p.getSynthVar('structure_type');
  var nc=countMap[p.getSynthVar('node_count')]||12;
  var ct=p.getSynthVar('connection_type');
  var stiff=stiffMap[p.getSynthVar('spring_stiffness')]||0.4;
  var palName=p.getSynthVar('color_palette');
  var strategy=p.getSynthVar('color_strategy');

  nodes=[];springs=[];tick=0;
  var size=200;
  var positions=generateStructure(st,nc,size);
  for(var i=0;i<positions.length;i++){var n=makeNode(positions[i],i);n.radius=Math.max(5,Math.min(40,250/nc));nodes.push(n);}
  var edges=generateConnections(ct,nodes);
  for(var i=0;i<edges.length;i++){var ei=edges[i];if(ei[0]<nodes.length&&ei[1]<nodes.length){var s=makeSpring(nodes[ei[0]],nodes[ei[1]],undefined,stiff);s.damping=0.02;nodes[ei[0]].degree++;nodes[ei[1]].degree++;springs.push(s);}}
  computeCentrality(nodes);computeDepth(nodes);
  applyColors(nodes,springs,palName,strategy);
  for(var i=0;i<nodes.length;i++){var imp=v3randUnit().scale(2+Math.random()*3);nodes[i].prevPos.sub(imp);}
  bgDrawn=false;
  prevStructure=st;prevCount=p.getSynthVar('node_count');prevConn=ct;
}

p.draw=function(){
  var st=p.getSynthVar('structure_type');
  var nc=p.getSynthVar('node_count');
  var ct=p.getSynthVar('connection_type');
  var shape=p.getSynthVar('node_shape');
  var spStyle=p.getSynthVar('spring_style');
  var stiff=stiffMap[p.getSynthVar('spring_stiffness')]||0.4;
  var palName=p.getSynthVar('color_palette');
  var strategy=p.getSynthVar('color_strategy');
  var lightType=p.getSynthVar('lighting');
  var bgStyle=p.getSynthVar('background_style');
  var trailMode=p.getSynthVar('trail_mode');
  var rm=renderMap[p.getSynthVar('render_mode')]||'both';
  var pp=p.getSynthVar('post_processing');

  // Reinit on structural change
  if(st!==prevStructure||nc!==prevCount||ct!==prevConn){resetSystem();return;}

  // Update stiffness live
  for(var i=0;i<springs.length;i++)springs[i].stiffness=stiff;

  // Physics
  tick++;
  worldStep(nodes,springs,0.985,350,0.75);
  computeDepth(nodes);

  // Recolor every 60 frames
  if(tick%60===0)applyColors(nodes,springs,palName,strategy);

  // Background/trails
  var bgCol=bgFromPal(palName);
  if(trailMode==='off'||!bgDrawn){
    p.background(bgCol[0],bgCol[1],bgCol[2]);
    drawBg(bgStyle,palName);
    bgDrawn=true;
  } else if(trailMode==='medium'){
    p.push();p.noStroke();p.fill(bgCol[0],bgCol[1],bgCol[2],12);
    p.translate(0,0,-500);p.plane(CW*3,CW*3);p.pop();
  }
  // 'full' = do nothing

  // Camera
  var camZ=(CW/2)/Math.tan(Math.PI*30/180);
  p.camera(0,0,camZ*1.6,0,0,0,0,1,0);

  // Lighting
  var pal=getPal(palName);
  var useLit=lightType&&lightType!=='none';
  p.noLights();
  if(useLit){
    p.ambientLight(50,50,50);
    var c0=pal[Math.min(2,pal.length-1)],c1=pal[Math.min(3,pal.length-1)];
    switch(lightType){
      case'ambient':p.ambientLight(c0[0]*0.5,c0[1]*0.5,c0[2]*0.5);break;
      case'directional':p.directionalLight(c0[0]*0.8,c0[1]*0.8,c0[2]*0.8,0.5,0.5,-1);p.directionalLight(c1[0]*0.3,c1[1]*0.3,c1[2]*0.3,-0.5,-0.3,-0.8);break;
      case'point':{var a=tick*0.02,r=(CW)*0.15;p.ambientLight(70,70,70);p.pointLight(c0[0],c0[1],c0[2],Math.cos(a)*r,Math.sin(a)*r,150);p.pointLight(c1[0]*0.6,c1[1]*0.6,c1[2]*0.6,-Math.cos(a)*r*0.6,-Math.sin(a)*r*0.6,100);break;}
      case'spot':{var sx=Math.cos(tick*0.01)*CW*0.3,sy=Math.sin(tick*0.013)*CW*0.3;p.ambientLight(60,60,60);p.spotLight(c0[0],c0[1],c0[2],sx,sy,300,-sx/300,-sy/300,-1,Math.PI/4,5);break;}
      case'multi':{var t=tick*0.015,r1=CW*0.12;p.ambientLight(55,55,55);p.pointLight(c0[0],c0[1],c0[2],Math.cos(t*1.5)*r1,Math.sin(t*1.5)*r1,120);p.directionalLight(c1[0]*0.4,c1[1]*0.4,c1[2]*0.4,-0.6,-0.4,-0.7);var pulse=(Math.sin(t*3)*0.5+0.7);p.spotLight(c0[0]*pulse,c0[1]*pulse,c0[2]*pulse,Math.cos(t*2)*r1*0.8,Math.sin(t*2.6)*r1*0.8,200,0,0,-1,Math.PI/5,8);break;}
    }
  }

  // Depth-sort
  var sortedN=nodes.slice().sort(function(a,b){return a.pos.z-b.pos.z;});
  var sortedS=springs.slice().sort(function(a,b){return(a.nodeA.pos.z+a.nodeB.pos.z)-(b.nodeA.pos.z+b.nodeB.pos.z);});

  // Draw springs
  if(rm!=='nodesOnly'){
    for(var i=0;i<sortedS.length;i++){
      var s=sortedS[i];var bc=springBreathColor(s);var aa=s.nodeA.pos,bb=s.nodeB.pos;
      var alpha=120+Math.min(135,s.stress*300);
      if(rm==='minimalist'){p.stroke(255,150);p.strokeWeight(0.5);p.line(aa.x,aa.y,aa.z,bb.x,bb.y,bb.z);continue;}
      if(useLit)p.ambientMaterial(bc[0],bc[1],bc[2]);
      switch(spStyle){
        case'line':p.stroke(bc[0],bc[1],bc[2],alpha);p.strokeWeight(2);p.noFill();p.line(aa.x,aa.y,aa.z,bb.x,bb.y,bb.z);break;
        case'curve':{var mid=aa.lerp(bb,0.5),dir=v3sub(bb,aa),pv=perpVec(dir).scale(6*(0.5+s.stress));var cp=v3add(mid,pv);p.stroke(bc[0],bc[1],bc[2],alpha);p.strokeWeight(2);p.noFill();p.bezier(aa.x,aa.y,aa.z,cp.x,cp.y,cp.z,cp.x,cp.y,cp.z,bb.x,bb.y,bb.z);break;}
        case'ribbon':{var dir=v3sub(bb,aa).normalize(),pv=perpVec(dir);p.noStroke();p.fill(bc[0],bc[1],bc[2],alpha);p.beginShape(p.TRIANGLE_STRIP);for(var si=0;si<=8;si++){var t=si/8,pt=aa.lerp(bb,t),w=Math.sin(t*Math.PI)*2+0.5;var off=v3scale(pv,w);p.vertex(pt.x+off.x,pt.y+off.y,pt.z+off.z);p.vertex(pt.x-off.x,pt.y-off.y,pt.z-off.z);}p.endShape();break;}
        case'particles':{var dist=aa.distTo(bb),cnt=Math.max(3,Math.floor(dist/8));p.noStroke();for(var pi=0;pi<=cnt;pi++){var t=pi/cnt,pt=aa.lerp(bb,t),sz=(Math.sin(t*Math.PI)*0.8+0.4)*2;p.fill(bc[0],bc[1],bc[2],alpha);p.push();p.translate(pt.x,pt.y,pt.z);p.sphere(sz,6,4);p.pop();}break;}
        case'tube':{var mid=aa.lerp(bb,0.5),dir=v3sub(bb,aa),ln=dir.len(),d=dir.normalized(),up=new V3(0,1,0),ax=up.cross(d),ang=Math.acos(Math.max(-1,Math.min(1,up.dot(d))));p.noStroke();p.fill(bc[0],bc[1],bc[2],alpha);p.push();p.translate(mid.x,mid.y,mid.z);if(ax.lenSq()>1e-8)p.rotate(ang,[ax.x,ax.y,ax.z]);p.cylinder(1.5,ln,8,1);p.pop();break;}
        default:p.stroke(bc[0],bc[1],bc[2],alpha);p.strokeWeight(2);p.line(aa.x,aa.y,aa.z,bb.x,bb.y,bb.z);
      }
    }
  }

  // Draw nodes
  if(rm!=='springsOnly'){
    var baseR=Math.max(5,Math.min(40,250/nodes.length));
    for(var i=0;i<sortedN.length;i++){
      var n=sortedN[i];var bc=breathColor(n);var r=baseR*(n.depthScale||1)*(n.focalScale||1);
      if(rm==='minimalist'){p.stroke(255,150);p.strokeWeight(2);p.point(n.pos.x,n.pos.y,n.pos.z);continue;}
      p.push();p.translate(n.pos.x,n.pos.y,n.pos.z);
      if(useLit){p.ambientMaterial(bc[0],bc[1],bc[2]);p.specularMaterial(50);}else{p.fill(bc[0],bc[1],bc[2]);}
      p.noStroke();
      switch(shape){
        case'sphere':p.sphere(r,16,12);break;
        case'box':p.box(r*1.5);break;
        case'torus':p.torus(r*0.8,r*0.3,16,10);break;
        case'cone':p.cone(r*0.8,r*2,12,1);break;
        case'octahedron':drawOcta(r);break;
        case'icosahedron':drawIcosa(r);break;
        default:p.sphere(r,16,12);
      }
      p.pop();
    }
  }

  // Vignette
  p.push();p.noFill();p.stroke(0,30);p.strokeWeight(CW*0.15);p.rectMode(p.CENTER);p.rect(0,0,CW+CW*0.15,CW+CW*0.15);p.pop();
};

function drawOcta(r){
  var v=[[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]];
  var f=[[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,4,2],[1,3,4],[1,5,3],[1,2,5]];
  p.beginShape(p.TRIANGLES);for(var i=0;i<f.length;i++){for(var j=0;j<3;j++)p.vertex(v[f[i][j]][0],v[f[i][j]][1],v[f[i][j]][2]);}p.endShape();
}
function drawIcosa(r){
  var s=r/Math.sqrt(1+PHI*PHI),q=s*PHI;
  var v=[[-s,q,0],[s,q,0],[-s,-q,0],[s,-q,0],[0,-s,q],[0,s,q],[0,-s,-q],[0,s,-q],[q,0,-s],[q,0,s],[-q,0,-s],[-q,0,s]];
  var f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  p.beginShape(p.TRIANGLES);for(var i=0;i<f.length;i++){for(var j=0;j<3;j++)p.vertex(v[f[i][j]][0],v[f[i][j]][1],v[f[i][j]][2]);}p.endShape();
}

function drawBg(style,palName){
  var pal=getPal(palName),bgCol=bgFromPal(palName);
  if(style==='gradient'){
    p.push();p.noStroke();
    for(var i=30;i>=0;i--){var t=i/30,r=t*CW*0.8;var c=lerpOklab(adjLight(pal[0],0.5),adjLight(pal[0],0.15),t);p.fill(c[0],c[1],c[2]);p.translate(0,0,-600);p.ellipse(0,0,r*2,r*2);p.translate(0,0,600);}
    p.pop();
  } else if(style==='noise'){
    p.push();p.noStroke();p.translate(0,0,-500);
    for(var i=0;i<400;i++){var x=(Math.random()-0.5)*CW*2,y=(Math.random()-0.5)*CW*2;var nv=p.noise(x*0.005,y*0.005);
      if(nv>0.5){var al=(nv-0.5)*80;var c=adjLight(pal[1],0.4);p.fill(c[0],c[1],c[2],al);p.ellipse(x,y,2+nv*3,2+nv*3);}}
    p.pop();
  } else if(style==='stars'){
    p.push();p.noStroke();p.translate(0,0,-500);
    for(var i=0;i<300;i++){var x=(Math.random()-0.5)*CW*2,y=(Math.random()-0.5)*CW*2;var br=120+Math.random()*135,sz=0.5+Math.random()*2;
      p.fill(br,br,br*0.95,180);p.ellipse(x,y,sz,sz);
      if(Math.random()<0.05){p.fill(br,br,br*0.9,30);p.ellipse(x,y,sz*8,sz*8);}}
    p.pop();
  }
}
'''

template["p5Code"] = p5code.strip()

out_path = os.path.join(os.path.dirname(__file__), "spring-physics-v2.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(template, f, indent=2, ensure_ascii=False)

print(f"Written to {out_path}")
print(f"p5Code length: {len(template['p5Code'])} chars")
