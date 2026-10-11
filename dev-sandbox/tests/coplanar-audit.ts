import * as THREE from 'three';

// Compare actual world-space triangles, not intersecting assembly bounding boxes.
// Same-facing, positive-area overlaps are candidates. Ray-test their overlap
// centroids from outside so buried joints do not count as exposed z-fighting.
type Face = { mesh: THREE.Mesh; points: THREE.Vector3[]; normal: THREE.Vector3; d: number };
const EPS = 1e-6;
function overlap(a: THREE.Vector2[], b: THREE.Vector2[]) {
  const cross = (u: THREE.Vector2, v: THREE.Vector2, p: THREE.Vector2) => (v.x-u.x)*(p.y-u.y)-(v.y-u.y)*(p.x-u.x);
  const sign = Math.sign(cross(b[0], b[1], b[2]));
  let poly = a;
  for(let i=0;i<3 && poly.length;i++) {
    const u=b[i], v=b[(i+1)%3], next: THREE.Vector2[]=[];
    for(let j=0;j<poly.length;j++) {
      const p=poly[j], q=poly[(j+1)%poly.length];
      const dp=cross(u,v,p)*sign, dq=cross(u,v,q)*sign;
      if(dp>=0) next.push(p);
      if((dp>=0)!==(dq>=0)) next.push(p.clone().lerp(q,dp/(dp-dq)));
    }
    poly=next;
  }
  if(poly.length<3) return null;
  const area=Math.abs(poly.reduce((sum,p,i)=> {const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
  if(area<1e-9) return null;
  return poly.reduce((sum,p)=>sum.add(p),new THREE.Vector2()).multiplyScalar(1/poly.length);
}
export function exposedCoplanarPairs(root: THREE.Object3D): string[] {
  root.updateWorldMatrix(true,true);
  const meshes: THREE.Mesh[]=[];
  root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  const groups=new Map<string,Face[]>();
  for(const mesh of meshes) {
    const g=mesh.geometry, pos=g.getAttribute('position'), idx=g.getIndex();
    for(let i=0;i<(idx?.count??pos.count);i+=3) {
      const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
      const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
      if(normal.lengthSq()<1e-18)continue;
      normal.normalize();const d=normal.dot(points[0]);
      const key=[normal.x,normal.y,normal.z,d].map(n=>Math.round(n*1e5)).join(',');
      const faces=groups.get(key)??[];faces.push({mesh,points,normal,d});groups.set(key,faces);
    }
  }
  const found=new Set<string>(), ray=new THREE.Raycaster();
  for(const faces of groups.values())for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++) {
    const a=faces[i],b=faces[j];if(a.mesh===b.mesh)continue;
    if(a.normal.dot(b.normal)<1-EPS || Math.abs(a.d-b.d)>EPS)continue;
    const names=[a.mesh,b.mesh].map(m=>m.name||`mesh-${meshes.indexOf(m)}`).sort().join(' / ');
    if(found.has(names))continue;
    const u=a.points[1].clone().sub(a.points[0]).normalize(),v=a.normal.clone().cross(u);
    const project=(p:THREE.Vector3)=>new THREE.Vector2(p.dot(u),p.dot(v));
    const p=overlap(a.points.map(project),b.points.map(project));if(!p)continue;
    const point=u.multiplyScalar(p.x).add(v.multiplyScalar(p.y)).add(a.normal.clone().multiplyScalar(a.d));
    ray.set(point.clone().addScaledVector(a.normal,10),a.normal.clone().negate());
    const hit=ray.intersectObjects(meshes,false)[0];
    if(hit && Math.abs(hit.distance-10)<EPS*4)found.add(names);
  }
  return [...found].sort();
}
