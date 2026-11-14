// Synthetic gallery fixture only. Does not represent a real X100VI session.
const [, , mode, handle] = process.argv;
if (mode === '--list') {
  process.stderr.write('PHOTO_VERIFIED\n');
  process.stdout.write(JSON.stringify({verified:true,total:2,items:[{handle:4,name:'DSCF1001.JPG',bytes:512,width:7728,height:5152,format:14337},{handle:5,name:'DSCF1001.RAF',bytes:1024,width:7728,height:5152,format:0xb103}]})+'\n');
} else if(mode === '--download' && handle === '4') {
  process.stderr.write('PHOTO_VERIFIED\n');
  process.stdout.write(Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(508,1),Buffer.from([0xff,0xd9])]));
  process.stderr.write('PHOTO_COMPLETE size=512\n');
} else {
  process.stderr.write('PHOTO_GALLERY_MODE_UNAVAILABLE\n');
  process.exitCode=2;
}
