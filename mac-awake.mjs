/** Explicit, expiring macOS wake lock for long FujiX USB capture sessions.
 * NOT a camera-side AUTO POWER OFF setting and never overrides thermal safety.
 */
import {spawn} from 'node:child_process';
export class MacAwake {
  constructor({spawnFn=spawn,now=()=>Date.now(),ttlMs=70000}={}){
    this.spawnFn=spawnFn;this.now=now;this.ttlMs=ttlMs;this.child=null;this.lastBeat=0;
  }
  status(){return {active:!!this.child,expiresInMs:this.child?Math.max(0,this.ttlMs-(this.now()-this.lastBeat)):0,note:'Only prevents Mac sleep while heartbeat is active. Set the camera AUTO POWER OFF to OFF on the X100VI.'}}
  start(){
    if(this.child){this.lastBeat=this.now();return this.status()}
    const child=this.spawnFn('/usr/bin/caffeinate',['-dimsu'],{stdio:'ignore'});
    this.child=child;this.lastBeat=this.now();
    child.on?.('error',()=>{if(this.child===child)this.child=null});
    child.on?.('exit',()=>{if(this.child===child)this.child=null});
    return this.status();
  }
  stop(){
    const child=this.child;this.child=null;this.lastBeat=0;
    if(child){try{child.kill('SIGTERM')}catch{}}
    return this.status();
  }
  heartbeat(){if(this.child)this.lastBeat=this.now();return this.status()}
  expire(){if(this.child&&this.now()-this.lastBeat>this.ttlMs)this.stop();return this.status()}
}
