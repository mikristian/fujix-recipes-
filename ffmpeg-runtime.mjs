/** Read-only FFmpeg discovery for Intel and Apple Silicon macOS.
 * Never downloads software, executes a command, or installs dependencies.
 * Only real, executable local files are returned to the render engine.
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

export async function discoverLocalFfmpeg({
 explicit=process.env.FUJIX_FFMPEG_PATH,
 home=os.homedir(),
 arch=process.arch,
 platform=process.platform,
 candidates
}={}){
 const filename=arch==='arm64'?'ffmpeg-macos-aarch64-v7.1':'ffmpeg-macos-x86_64-v7.1';
 const paths=explicit!==undefined
  ? [explicit]
  : (candidates||[
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    path.join(home,'Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries',filename),
  ]);
 if(platform!=='darwin')return {available:false,path:null,reason:'The FujiX native movie renderer is configured for macOS.'};
 for(const candidate of paths){
  if(typeof candidate!=='string'||!path.isAbsolute(candidate))continue;
  try{
   const canonical=await fs.realpath(candidate); // Homebrew entry points may be symlinks.
   const info=await fs.lstat(canonical);
   if(!info.isFile()||(info.mode&0o111)===0)continue;
   return {available:true,path:canonical,reason:null};
  }catch{/* Missing or untrusted candidate; try the next known location. */}
 }
 return {available:false,path:null,reason:explicit!==undefined
  ? 'FUJIX_FFMPEG_PATH is not an executable local macOS file.'
  : 'FFmpeg is not installed in a supported local location. Install a native macOS FFmpeg binary or set FUJIX_FFMPEG_PATH to its absolute path.'};
}
