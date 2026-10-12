import type { Finish } from '../core/surface-looks';

/** Small, deterministic local canvases; no network, animation, or extra room geometry. */
export function paintFinish(c: CanvasRenderingContext2D, finish: Finish, sky: boolean): void {
 const {pattern,colors} = finish;
 const w=c.canvas.width, h=c.canvas.height;
 let seed=2166136261;
 for(const char of finish.id) seed=Math.imul(seed^char.charCodeAt(0),16777619);
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const rect=(color:string,x=0,y=0,width=w,height=h)=>{c.fillStyle=color;c.fillRect(x,y,width,height);};
 const stroke=(color:string,width:number,points:number[])=>{
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(points[0],points[1]);
  for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.stroke();
 };
 rect(colors[0]);
 if(sky) {
  const gradient=c.createLinearGradient(0,0,0,h);
  gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);c.fillStyle=gradient;c.fillRect(0,0,w,h);
  if(pattern==='clouds' || pattern==='sunset') {
   if(pattern==='sunset') {
    const glow=c.createRadialGradient(w*.68,h*.63,0,w*.68,h*.63,w*.32);
    glow.addColorStop(0,colors[2]);glow.addColorStop(1,'transparent');c.fillStyle=glow;c.fillRect(0,0,w,h);
    c.fillStyle=colors[2];c.beginPath();c.arc(w*.68,h*.63,w*.055,0,Math.PI*2);c.fill();
   }
   // Overlapping soft ellipses form cloud banks instead of a flat two-stop sky.
   for(let band=0;band<9;band++) {
    const y=h*(.15+random()*.7),x=random()*w;
    for(let puff=0;puff<8;puff++) {
     c.save();c.translate(x+(puff-4)*w*.055,y+random()*h*.035);c.scale(3.6,1);
     const cloud=c.createRadialGradient(0,0,0,0,0,h*.045);
     cloud.addColorStop(0,colors[2]);cloud.addColorStop(1,'transparent');
     c.globalAlpha=pattern==='sunset'?.16:.24;c.fillStyle=cloud;c.fillRect(-h*.05,-h*.05,h*.1,h*.1);c.restore();
    }
   }
  } else if(pattern==='haze') {
   // Layered distant ridgelines, deliberately below the clear upper atmosphere.
   for(let layer=0;layer<5;layer++) {
    c.globalAlpha=.1+layer*.07;c.fillStyle=colors[2];c.beginPath();c.moveTo(0,h);
    for(let x=0;x<=w;x+=4)c.lineTo(x,h*(.53+layer*.085)+Math.sin(x/w*Math.PI*3+layer)*h*.035+Math.sin(x/w*Math.PI*7+layer*.8)*h*.012);
    c.lineTo(w,h);c.closePath();c.fill();
   }c.globalAlpha=1;
  } else {
   if(pattern==='aurora') for(let band=0;band<5;band++) {
    const points:number[]=[];
    for(let x=0;x<=w;x+=4)points.push(x,h*(.33+band*.04)+Math.sin(x/w*7+band*.3)*h*.1);
    c.globalAlpha=.07;stroke(colors[2],28,points);c.globalAlpha=.18;stroke(colors[2],3,points);
   }
   for(let i=0;i<160;i++) {
    c.globalAlpha=.25+random()*.65;
    const radius=random()<.94?.5+random()*.5:1.4;
    c.fillStyle=colors[2];c.beginPath();c.arc(random()*w,random()*h*.85,radius,0,Math.PI*2);c.fill();
   }c.globalAlpha=1;
  }
 } else {
  // Multi-scale periodic mottling gives plaster, stone and cloth a tactile base.
  const image=c.getImageData(0,0,w,h);
  const secondary=[1,3,5].map(i=>parseInt(colors[1].slice(i,i+2),16));
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
   const i=(y*w+x)*4;
   const broad=Math.sin(x/w*Math.PI*4+Math.sin(y/h*Math.PI*4))*Math.cos(y/h*Math.PI*6);
   const blend=(broad+1)*.25;
   const n=(random()-.5)*10;
   for(let k=0;k<3;k++)image.data[i+k]=image.data[i+k]*(1-blend)+secondary[k]*blend+n;
  }c.putImageData(image,0,0);
  if(pattern==='woodgrain') {
   for(let row=0;row<4;row++) {
    c.globalAlpha=row%2?.2:.07;rect(colors[1],0,row*h/4,w,h/4);c.globalAlpha=1;
    stroke(colors[2],2,[0,row*h/4,w,row*h/4]);
    stroke(colors[2],2,[(row%2?.68:.3)*w,row*h/4,(row%2?.68:.3)*w,(row+1)*h/4]);
    for(let line=0;line<36;line++) {
     const points:number[]=[];
     for(let x=0;x<=w;x+=4)points.push(x,row*h/4+line*h/144+Math.sin(x/w*Math.PI*4+line*.3)*2+Math.sin(x/w*Math.PI*2)*2);
     c.globalAlpha=.1+random()*.16;stroke(colors[2],.5+random(),points);
    }
   }c.globalAlpha=1;
  } else if(['limestone','slate','brickwork'].includes(pattern)) {
   const rows=pattern==='brickwork'?8:4,cols=pattern==='brickwork'?4:2;
   for(let row=0;row<rows;row++)for(let col=-1;col<cols;col++) {
    const x=(col+(row%2)*.5)*w/cols,y=row*h/rows;
    c.globalAlpha=.08+random()*.16;rect(colors[1],x+2,y+2,w/cols-4,h/rows-4);c.globalAlpha=1;
    stroke(colors[2],pattern==='brickwork'?3:1.5,[x,y,x+w/cols,y,x+w/cols,y+h/rows]);
    for(let i=0;i<12;i++) {
     c.globalAlpha=.15;const yy=y+random()*h/rows,xx=x+random()*w/cols;
     stroke(colors[1],1,[xx,yy,xx+w/cols*.3,yy-2]);
    }
   }c.globalAlpha=1;
  } else if(pattern==='terrazzo') {
   for(let i=0;i<950;i++) {
    const x=random()*w,y=random()*h,r=1+random()*4;
    c.fillStyle=i%3===0?colors[2]:colors[1];c.globalAlpha=.4+random()*.5;
    c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r*.5,y-r);c.lineTo(x+r,y+r*.6);c.lineTo(x-r*.6,y+r);c.closePath();c.fill();
   }c.globalAlpha=1;
  } else if(pattern==='marble') {
   for(let vein=0;vein<9;vein++) {
    const points:number[]=[];
    for(let x=-w;x<=w*2;x+=3)points.push(x,vein*h/6+x*.24+Math.sin(x/w*Math.PI*4+vein)*15+Math.sin(x/w*Math.PI*12)*3);
    c.globalAlpha=.1;stroke(colors[1],10,points);c.globalAlpha=.4;stroke(colors[2],.8,points);
   }c.globalAlpha=1;
  } else if(pattern==='linen') {
   c.globalAlpha=.25;
   for(let i=0;i<w;i+=3) {stroke(colors[1],1,[i,0,i,h]);stroke(colors[2],.6,[0,i,w,i]);}
   c.globalAlpha=1;
  } else if(pattern==='fluted') {
   for(let x=0;x<w;x+=32) {
    const g=c.createLinearGradient(x,0,x+32,0);g.addColorStop(0,colors[2]);g.addColorStop(.3,colors[0]);g.addColorStop(.7,colors[1]);g.addColorStop(1,colors[2]);
    c.fillStyle=g;c.fillRect(x,0,32,h);
   }
  } else if(pattern==='circuit') {
   for(let x=0;x<w;x+=128)for(let y=0;y<h;y+=128) {
    stroke(colors[1],2,[x,y,x+128,y,x+128,y+128]);
    c.globalAlpha=.65;stroke(colors[2],1,[x+16,y,x+16,y+40,x+48,y+72,x+48,y+112,x+128,y+112]);
    c.fillStyle=colors[2];c.beginPath();c.arc(x+48,y+72,3,0,Math.PI*2);c.fill();c.globalAlpha=1;
   }
  }
 }
 // Fine, seeded dither prevents sky banding and breaks up mechanically perfect edges.
 const pixels=c.getImageData(0,0,w,h);
 for(let i=0;i<pixels.data.length;i+=4) {
  const n=(random()-.5)*(sky?4:6);
  for(let k=0;k<3;k++)pixels.data[i+k]+=n;
 }
 c.putImageData(pixels,0,0);
}
