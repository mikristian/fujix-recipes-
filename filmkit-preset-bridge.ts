/** FujiX Sync's narrow, safety-gated FilmKit integration.
 * Third-party code from eggricesoy/filmkit (MIT, vendor/filmkit/LICENSE).
 * This browser-only module supports X100VI C1-C7 raw property backup and a
 * single verified/reversible film simulation property change. No firmware I/O.
 */
import {FujiCamera, type RawProp, type DeviceInfo} from './vendor/filmkit/src/ptp/session.ts'
import {FilmSimLabels,MONOCHROME_SIMS} from './vendor/filmkit/src/profile/enums.ts'

export const SIMULATIONS = Object.freeze(Object.entries(FilmSimLabels)
  .map(([code,label])=>({code:Number(code),label})).sort((a,b)=>a.code-b.code))

const PROP_SLOT=0xD18C
const PROP_NAME=0xD18D
const PROP_FILM=0xD192
const FIRST_PROP=0xD18E
const LAST_PROP=0xD1A5
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
const toHex=(bytes:Uint8Array)=>Array.from(bytes).map(n=>n.toString(16).padStart(2,'0')).join('')
const u16=(hex:string)=>parseInt(hex.slice(2,4)+hex.slice(0,2),16)

type SavedProp={id:number;hex:string;value:number|string}
type SavedSlot={slot:number;name:string;properties:SavedProp[]}
type Snapshot={
  format:'fujix-camera-ptp-presets'; version:1;
  capturedAt:string;
  originalSlot:number;
  camera:{model:string;firmware:string;serial:string;usbVendorId:number;usbProductId:number};
  slots:SavedSlot[];
}
type Receipt={ok:true;stored:true;verified?:boolean;id:string;sha256:string;slots:7}

function validSlot(slot:number):number{
  if(!Number.isInteger(slot)||slot<1||slot>7)throw Error('Choose C1–C7')
  return slot
}
function required(prop:RawProp|null,what:string):RawProp{
  if(!prop)throw Error('Could not read '+what+' from the real camera; nothing was changed.')
  return prop
}
function slotValue(prop:RawProp|null):number{
  const v=required(prop,'active preset selector')
  if(v.bytes.length!==2||typeof v.value!=='number'||v.value<1||v.value>7)throw Error('Camera did not return a valid C1–C7 active slot')
  return v.value
}
function compare(a:Snapshot,b:Snapshot,changedSlot?:number,changedFilm?:string):string[]{
  const issues:string[]=[]
  if(a.camera.serial!==b.camera.serial||a.camera.model!==b.camera.model||a.camera.firmware!==b.camera.firmware)issues.push('Camera identity/firmware changed')
  for(let i=0;i<7;i++){
    const before=a.slots[i],after=b.slots[i]
    if(before.name!==after.name)issues.push(`C${i+1} name changed`)
    if(before.properties.length!==after.properties.length)issues.push(`C${i+1} property count changed`)
    for(const prop of before.properties){
      const current=after.properties.find(p=>p.id===prop.id)
      const expected=changedSlot===i+1&&prop.id===PROP_FILM?changedFilm:prop.hex
      if(!current||current.hex!==expected)issues.push(`C${i+1} property 0x${prop.id.toString(16)} changed unexpectedly`)
    }
  }
  return issues
}

export class X100viPresetBridge {
  private camera:FujiCamera|null=null
  private info:DeviceInfo|null=null
  private snapshot:Snapshot|null=null
  private receipt:Receipt|null=null
  private busy=false
  onLog:(message:string)=>void

  constructor(onLog:(message:string)=>void=()=>{}){this.onLog=onLog}

  get connected(){return Boolean(this.camera?.connected&&this.info)}
  get current(){return this.snapshot}
  get backup(){return this.receipt}

  private assertConnected():FujiCamera{
    if(!this.camera?.connected||!this.info)throw Error('Connect the physical X100VI in USB RAW CONV./BACKUP RESTORE mode first.')
    const usb=this.camera.usbIdentity
    if(usb?.vendorId!==0x04cb||usb.productId!==0x0305||this.info.model.trim().toUpperCase()!=='X100VI')throw Error('Camera identity does not match X100VI (USB 04cb:0305)')
    return this.camera
  }

  private async identity():Promise<Snapshot['camera']>{
    const cam=this.assertConnected()
    const info=await cam.getDeviceInfo()
    const usb=cam.usbIdentity
    if(!usb||usb.vendorId!==0x04cb||usb.productId!==0x0305||info.model.trim().toUpperCase()!=='X100VI'||!info.serialNumber||!info.deviceVersion)throw Error('X100VI model/serial/firmware confirmation failed')
    if(!info.properties.includes(PROP_SLOT)||!info.properties.includes(PROP_FILM)||!info.operations.includes(0x1015)||!info.operations.includes(0x1016))throw Error('X100VI preset properties/operations are not available in this USB mode. Select USB RAW CONV./BACKUP RESTORE on the camera.')
    this.info=info
    return {model:'X100VI',serial:info.serialNumber,firmware:info.deviceVersion,usbVendorId:usb.vendorId,usbProductId:usb.productId}
  }

  /** Browser user gesture required: invokes navigator.usb.requestDevice(). */
  async connect():Promise<Snapshot['camera']>{
    if(this.busy)throw Error('A camera operation is already running')
    if(this.camera)await this.disconnect()
    this.busy=true
    try{
      const cam=new FujiCamera(msg=>this.onLog(msg))
      this.camera=cam
      const result=await cam.connect()
      if(!result.ok)throw Error(`Could not claim X100VI USB device (${result.error}). Close Image Capture/X RAW STUDIO or switch camera USB mode and try again.`)
      this.info=await cam.getDeviceInfo()
      const identity=await this.identity()
      this.snapshot=null;this.receipt=null
      this.onLog(`Connected ${identity.model} firmware ${identity.firmware}, USB 04cb:0305`)
      return identity
    }catch(error){
      try{await this.camera?.disconnect()}catch{}
      this.camera=null;this.info=null;this.snapshot=null;this.receipt=null
      throw error
    }finally{this.busy=false}
  }

  async disconnect():Promise<void>{
    if(this.busy)throw Error('Wait for the camera operation to finish before disconnecting.')
    const cam=this.camera
    this.camera=null;this.info=null;this.snapshot=null;this.receipt=null
    await cam?.disconnect()
  }

  /** NOTE: this is not purely read-only; Fuji uses D18C SetDevicePropValue
   * to select a slot before reading its D18D-D1A5 values. We restore the
   * original selector in a finally block and verify the restoration. */
  private async capture():Promise<Snapshot>{
    const cam=this.assertConnected()
    const camera=await this.identity()
    const originalSlot=slotValue(await cam.readProp(PROP_SLOT))
    const slots:SavedSlot[]=[]
    let restoreFailure:unknown=null
    let readFailure:unknown=null
    let result:Snapshot|null=null
    try{
      for(let slot=1;slot<=7;slot++){
        this.onLog(`Reading physical C${slot}/C7 preset properties…`)
        if(!await cam.writePropU16(PROP_SLOT,slot))throw Error(`Camera refused selection of C${slot}`)
        await sleep(100)
        if(slotValue(await cam.readProp(PROP_SLOT))!==slot)throw Error(`C${slot} selection did not read back correctly`)
        const nameProp=required(await cam.readProp(PROP_NAME),`C${slot} name`)
        if(typeof nameProp.value!=='string'||!nameProp.value.trim())throw Error(`C${slot} name was not decoded`)
        const properties:SavedProp[]=[]
        for(let pid=FIRST_PROP;pid<=LAST_PROP;pid++){
          const raw=await cam.readProp(pid)
          if(raw)properties.push({id:pid,hex:toHex(raw.bytes),value:raw.value})
        }
        if(properties.length<18||!properties.some(p=>p.id===PROP_FILM&&p.hex.length===4))throw Error(`C${slot} read incomplete (${properties.length} properties); no backup certified`)
        slots.push({slot,name:nameProp.value,properties})
      }
      result={format:'fujix-camera-ptp-presets',version:1,capturedAt:new Date().toISOString(),originalSlot,camera,slots}
    }catch(error){
      readFailure=error
    }finally{
      try{
        const restored=await cam.writePropU16(PROP_SLOT,originalSlot)
        const confirmed=restored&&slotValue(await cam.readProp(PROP_SLOT))===originalSlot
        if(!confirmed)restoreFailure=Error(`Could not verify original C${originalSlot} selection was restored`)
      }catch(error){restoreFailure=error}
    }
    if(restoreFailure)throw Error('The camera preset selector could not be restored: '+String(restoreFailure)+(readFailure?'; scan also failed: '+String(readFailure):''))
    if(readFailure)throw readFailure
    if(!result)throw Error('Camera scan did not return a complete backup')
    return result
  }

  async scanAndBackup():Promise<{snapshot:Snapshot;receipt:Receipt}>{
    if(this.busy)throw Error('Camera operation already in progress')
    this.busy=true;this.snapshot=null;this.receipt=null
    try{
      const snapshot=await this.capture()
      const r=await fetch('/api/studio/camera-presets/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot})})
      const saved=await r.json()
      if(!r.ok||saved.ok!==true||saved.stored!==true||saved.slots!==7)throw Error('Saving camera backup failed: '+(saved.error||'no verified receipt'))
      const check=await fetch('/api/studio/camera-presets/backup/verify?id='+encodeURIComponent(saved.id)+'&sha256='+encodeURIComponent(saved.sha256))
      const verified=await check.json()
      if(!check.ok||verified.verified!==true||verified.sha256!==saved.sha256)throw Error('Camera backup is not verifiably stored; writing is disabled')
      this.snapshot=snapshot
      this.receipt=saved as Receipt
      this.onLog('All seven X100VI presets read and backed up with verified disk SHA-256')
      return {snapshot,receipt:saved}
    }finally{this.busy=false}
  }

  /** Write exactly one known two-byte FilmSimulation value to one C slot.
   * All other properties must match the pre-write backup. On any failure after
   * attempted write, send original bytes back and report rollback result. */
  async testOneSimulation(slot:number,newCode:number):Promise<{ok:true;slot:number;from:string;to:string;verified:true}>{
    validSlot(slot)
    if(!SIMULATIONS.some(s=>s.code===newCode))throw Error('Unsupported film simulation code')
    if(this.busy)throw Error('A camera operation is already running')
    if(!this.snapshot||!this.receipt)throw Error('Read and verify all seven camera slots first')
    this.busy=true
    let attempted=false
    let oldFilmHex=''
    let previousSlot:number|null=null
    let restoredSelector=true
    let rolledBack='not-needed'
    try{
      const snapshot=this.snapshot,receipt=this.receipt
      const check=await fetch('/api/studio/camera-presets/backup/verify?id='+encodeURIComponent(receipt.id)+'&sha256='+encodeURIComponent(receipt.sha256))
      if(!check.ok||(await check.json()).verified!==true)throw Error('Stored backup failed integrity verification. Camera write blocked.')
      const before=await this.capture()
      const differences=compare(snapshot,before)
      if(differences.length)throw Error('Camera settings changed since backup; refresh backup before writing: '+differences.slice(0,3).join('; '))
      const prop=snapshot.slots[slot-1].properties.find(p=>p.id===PROP_FILM)
      if(!prop||prop.hex.length!==4)throw Error('Film simulation property missing from verified backup')
      oldFilmHex=prop.hex
      const oldCode=u16(oldFilmHex)
      if(newCode===oldCode)throw Error('Choose a different film simulation for the one-slot test')
      if(!FilmSimLabels[oldCode]||MONOCHROME_SIMS.has(oldCode)||MONOCHROME_SIMS.has(newCode))throw Error('First hardware write test is restricted to two recognized color simulations, to avoid monochrome-dependent setting changes.')
      const cam=this.assertConnected()
      previousSlot=slotValue(await cam.readProp(PROP_SLOT))
      try{
        if(!await cam.writePropU16(PROP_SLOT,slot))throw Error('Could not select target slot')
        await sleep(100)
        if(slotValue(await cam.readProp(PROP_SLOT))!==slot)throw Error('Target slot not confirmed')
        const current=required(await cam.readProp(PROP_FILM),'original film simulation')
        if(toHex(current.bytes)!==oldFilmHex)throw Error('Target slot changed since backup')
        attempted=true
        if(!await cam.writePropU16(PROP_FILM,newCode))throw Error('Camera rejected film simulation write')
        const verify=required(await cam.readProp(PROP_FILM),'written film simulation')
        const newHex=newCode.toString(16).padStart(4,'0').match(/../g)!.reverse().join('')
        if(toHex(verify.bytes)!==newHex)throw Error('Camera film simulation readback did not match written value')
        const after=await this.capture()
        const changed=compare(snapshot,after,slot,newHex)
        if(changed.length)throw Error('Post-write verification detected changes beyond the requested field: '+changed.slice(0,4).join('; '))
        this.snapshot=null;this.receipt=null // Require fresh seven-slot backup for next write.
        this.onLog(`Verified C${slot} film simulation ${FilmSimLabels[oldCode]} → ${FilmSimLabels[newCode]}; original backup preserved`)
        return {ok:true,slot,from:FilmSimLabels[oldCode]??String(oldCode),to:FilmSimLabels[newCode],verified:true}
      }catch(error){
        if(attempted){
          try{
            const selected=await cam.writePropU16(PROP_SLOT,slot)
            if(!selected)throw Error('Cannot select slot for rollback')
            await sleep(100)
            const original=new Uint8Array(oldFilmHex.match(/../g)!.map(byte=>parseInt(byte,16)))
            if(!await cam.writePropRaw(PROP_FILM,original))throw Error('Camera rejected original film simulation bytes')
            const rb=required(await cam.readProp(PROP_FILM),'rollback verification')
            if(toHex(rb.bytes)!==oldFilmHex)throw Error('Rollback property did not match original bytes')
            rolledBack='verified single-property restore'
          }catch(rollbackError){rolledBack='FAILED/UNVERIFIED: '+String(rollbackError)}
          // Do not permit another write with a stale pre-change backup even
          // when the attempted single-property rollback appears successful.
          this.snapshot=null;this.receipt=null
        }
        throw Error(String(error)+'; rollback: '+rolledBack)
      }finally{
        try{
          const ok=await cam.writePropU16(PROP_SLOT,previousSlot!)
          if(!ok||slotValue(await cam.readProp(PROP_SLOT))!==previousSlot)restoredSelector=false
        }catch{restoredSelector=false}
        if(!restoredSelector){
          this.onLog('WARNING: Original active C-slot selection could not be verified as restored. Inspect camera directly.')
          throw Error('Original active camera C-slot could not be verified as restored; inspect the camera directly. Do not continue writing.')
        }
      }
    }finally{this.busy=false}
  }
}
