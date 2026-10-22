import { canEnterVr, type XrProbe } from '../xr/interaction';
/** Capability probe is completed before showing the gesture-driven entry control. */
export class VrCameraEntry {
 available=false;
 pending=false;
 private generation=0;
 async probe(probe:XrProbe):Promise<void> {
  const generation=++this.generation;this.available=false;
  let supported=false;try {supported=await canEnterVr(probe);}catch {/* unavailable */}
  if(generation===this.generation)this.available=supported;
 }
 async enter(prime:()=>void,request:()=>Promise<void>):Promise<void> {
  if(!this.available||this.pending)return;
  this.pending=true;
  try { prime();await request(); } finally {this.pending=false;}
 }
}
