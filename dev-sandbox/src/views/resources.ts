import * as THREE from 'three';
/** Every generated group owns its resources; deduplicate shared meshes within that group. */
export function disposeGroup(group: THREE.Group): void {
 const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
 group.traverse(o=>{
  if(o instanceof THREE.Mesh){
   geometries.add(o.geometry);
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    materials.add(m);
    for(const value of Object.values(m)) if(value instanceof THREE.Texture) textures.add(value);
   }
  }
 });
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());group.clear();
}
