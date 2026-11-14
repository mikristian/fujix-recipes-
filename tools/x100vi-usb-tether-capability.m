/*
 * One-shot USB-C PTP tether-capability inspection for a physical X100VI.
 *
 * Strict allowlist, read-only: GetDeviceInfo 0x1001, GetDevicePropValue
 * 0x1015(D16E), GetStorageIDs 0x1004, GetStorageInfo 0x1005.
 * No shutter/firmware/write/reset, no file or object reads, no opcodes scan.
 * Requires exact USB vendor/product 04cb:0305.
 */
#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>
#import <stdlib.h>

static uint16_t u16(const uint8_t*d,NSUInteger n,NSUInteger i) {
  return i+2<=n ? (uint16_t)(d[i]|d[i+1]<<8) : 0;
}
static uint32_t u32(const uint8_t*d,NSUInteger n,NSUInteger i) {
  return i+4<=n ? (uint32_t)d[i]|(uint32_t)d[i+1]<<8|(uint32_t)d[i+2]<<16|(uint32_t)d[i+3]<<24 : 0;
}
static uint64_t u64(const uint8_t*d,NSUInteger n,NSUInteger i) {
  return (uint64_t)u32(d,n,i)|((uint64_t)u32(d,n,i+4)<<32);
}
static BOOL skipPTPString(const uint8_t *d,NSUInteger n,NSUInteger *p) {
  if(*p>=n)return NO;
  NSUInteger count=d[(*p)++];
  if(count>(n-*p)/2)return NO;
  *p+=count*2;return YES;
}
static BOOL supportsOp(NSData *info,uint16_t opcode) {
  if(info.length<16)return NO;
  const uint8_t *d=info.bytes;NSUInteger n=info.length,p=8;
  if(!skipPTPString(d,n,&p)||p+6>n)return NO;
  p+=2;uint32_t count=u32(d,n,p);p+=4;
  if(count>2048||count>(n-p)/2)return NO;
  for(NSUInteger i=0;i<count;i++)if(u16(d,n,p+i*2)==opcode)return YES;
  return NO;
}
static NSString *safeStorageDescription(const uint8_t*d,NSUInteger n,NSUInteger *p) {
  if(*p>=n)return @"[not-provided]";
  uint8_t count=d[(*p)++];
  if(count>(n-*p)/2)return @"[invalid]";
  NSMutableString *v=[NSMutableString new];
  for(NSUInteger i=0;i<count;i++){
    uint16_t ch=u16(d,n,*p+i*2);
    if(ch==0)break;
    if(ch<32||ch>126)return @"[redacted]";
    [v appendFormat:@"%c",(char)ch];
  }
  *p+=(NSUInteger)count*2;
  // Never expose unrecognized volume names, card labels or identifiers.
  if([v isEqualToString:@"Still"]||[v isEqualToString:@"Live"])return v;
  return @"[other storage]";
}

@interface TetherProbe:NSObject<ICDeviceBrowserDelegate,ICDeviceDelegate>
@property(nonatomic,strong)ICDeviceBrowser *browser;
@property(nonatomic,strong)ICCameraDevice *camera;
@property(nonatomic,strong)NSData *deviceInfo;
@property(nonatomic,strong)NSArray<NSNumber*> *storageIDs;
@property(nonatomic,assign)NSUInteger storageIndex;
@property(nonatomic,assign)uint32_t tid;
@property(nonatomic,assign)int exitCode;
@end
@implementation TetherProbe
-(void)finish {
  if(self.camera)[self.camera requestCloseSession];
  int code=self.exitCode;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(0.6*NSEC_PER_SEC)),dispatch_get_main_queue(),^{exit(code);});
}
-(void)fail:(NSString*)message {
  printf("STOP: %s\n",message.UTF8String);
  self.exitCode=2;[self finish];
}
-(void)send:(uint16_t)opcode param:(uint32_t)param hasParam:(BOOL)hasParam
      completion:(void(^)(NSData *payload, uint16_t response))completion {
  NSUInteger len=hasParam?16:12;
  uint8_t command[16]={0};
  command[0]=(uint8_t)len;command[4]=1;
  command[6]=(uint8_t)opcode;command[7]=(uint8_t)(opcode>>8);
  uint32_t tid=++self.tid;
  for(int i=0;i<4;i++)command[8+i]=(uint8_t)(tid>>(8*i));
  if(hasParam)for(int i=0;i<4;i++)command[12+i]=(uint8_t)(param>>(8*i));
  NSData *packet=[NSData dataWithBytes:command length:len];
  __weak typeof(self) weakSelf=self;
  [self.camera requestSendPTPCommand:packet outData:nil
     completion:^(NSData*payload,NSData*reply,NSError*error){
    if(error||reply.length<8) {
      [weakSelf fail:@"PTP transaction or transport failed (no additional commands sent)"];
      return;
    }
    uint16_t response=u16(reply.bytes,reply.length,6);
    printf("PTP 0x%04X -> 0x%04X (%lu data bytes)\n",opcode,response,(unsigned long)payload.length);
    if(response!=0x2001){
      [weakSelf fail:[NSString stringWithFormat:@"Read-only PTP 0x%04X returned non-success 0x%04X",opcode,response]];
      return;
    }
    completion(payload,response);
  }];
}
-(void)nextStorage {
  if(self.storageIndex>=self.storageIDs.count){
    puts("STORAGE_ENUM_COMPLETE: yes");
    puts("TETHER_CAPTURE_VERIFIED: no");
    puts("No photographic or write command was sent.");
    [self finish];return;
  }
  uint32_t sid=self.storageIDs[self.storageIndex++].unsignedIntValue;
  __weak typeof(self) weakSelf=self;
  [self send:0x1005 param:sid hasParam:YES completion:^(NSData*payload,uint16_t code) {
    (void)code;
    const uint8_t *d=payload.bytes;NSUInteger n=payload.length;
    if(n<26){[weakSelf fail:@"StorageInfo response too short"];return;}
    uint16_t type=u16(d,n,0),fileSystem=u16(d,n,2),access=u16(d,n,4);
    uint64_t maximum=u64(d,n,6),freeBytes=u64(d,n,14);
    uint32_t freeImages=u32(d,n,22);
    NSUInteger pos=26;
    NSString *desc=safeStorageDescription(d,n,&pos);
    printf("STORAGE_INFO: id=0x%08X type=%u filesystem=%u access=%u max=%llu free=%llu freeImages=%u category=%s\n",
      sid,type,fileSystem,access,maximum,freeBytes,freeImages,desc.UTF8String);
    // Media type 3 = fixed RAM. The presence of any RAM-labelled store alone
    // cannot establish actual SD-card still-original tether delivery.
    dispatch_async(dispatch_get_main_queue(),^{[weakSelf nextStorage];});
  }];
}
-(void)readStorageIDs {
  __weak typeof(self) weakSelf=self;
  [self send:0x1004 param:0 hasParam:NO completion:^(NSData*payload,uint16_t code) {
    (void)code;
    const uint8_t*d=payload.bytes;NSUInteger n=payload.length;
    if(n<4){[weakSelf fail:@"StorageIDs response truncated"];return;}
    uint32_t count=u32(d,n,0);
    if(count>16||count>(n-4)/4){[weakSelf fail:@"StorageIDs count invalid"];return;}
    NSMutableArray *ids=[NSMutableArray new];
    for(NSUInteger i=0;i<count;i++)[ids addObject:@(u32(d,n,4+i*4))];
    weakSelf.storageIDs=ids;
    printf("STORAGE_IDS_COUNT: %u\n",count);
    [weakSelf nextStorage];
  }];
}
-(void)readMode {
  __weak typeof(self) weakSelf=self;
  [self send:0x1015 param:0xD16E hasParam:YES completion:^(NSData*payload,uint16_t code) {
    (void)code;
    if(payload.length!=2){[weakSelf fail:@"USBMode response was not a 16-bit value"];return;}
    uint16_t mode=u16(payload.bytes,payload.length,0);
    printf("USB_MODE_D16E: %u\n",mode);
    printf("USB_TETHER_MODE_ACTIVE: %s\n",mode==5?"yes (capture still not verified)":"no");
    [weakSelf readStorageIDs];
  }];
}
-(void)deviceBrowser:(ICDeviceBrowser*)browser didAddDevice:(ICDevice*)device moreComing:(BOOL)more {
  if(device.usbVendorID!=0x04cb||device.usbProductID!=0x0305)return;
  if(![device isKindOfClass:ICCameraDevice.class])return;
  self.camera=(ICCameraDevice*)device;self.camera.delegate=self;
  printf("X100VI_USB_MATCH: vendor=0x04CB product=0x0305\n");
  [self.camera requestOpenSession];
}
-(void)deviceBrowser:(ICDeviceBrowser*)browser didRemoveDevice:(ICDevice*)device moreGoing:(BOOL)more {}
-(void)didRemoveDevice:(ICDevice*)device {self.exitCode=2;puts("Camera disconnected");}
-(void)device:(ICDevice*)device didCloseSessionWithError:(NSError*)error {}
-(void)device:(ICDevice*)device didOpenSessionWithError:(NSError*)error {
  if(error){[self fail:@"Cannot open X100VI PTP session"];return;}
  if(![device.capabilities containsObject:ICCameraDeviceCanAcceptPTPCommands]){
    [self fail:@"macOS did not grant PTP access"];return;
  }
  __weak typeof(self) weakSelf=self;
  [self send:0x1001 param:0 hasParam:NO completion:^(NSData*payload,uint16_t code) {
    (void)code;
    weakSelf.deviceInfo=payload;
    if(!supportsOp(payload,0x1004)||!supportsOp(payload,0x1005)||!supportsOp(payload,0x1015)){
      [weakSelf fail:@"Read-only storage and USBMode operations are not all advertised"];return;
    }
    printf("CAPTURE_OPCODE_ADVERTISED: %s\n",supportsOp(payload,0x100E)?"yes":"no");
    printf("OPEN_CAPTURE_OPCODE_ADVERTISED: %s\n",supportsOp(payload,0x101C)?"yes":"no");
    printf("FUJI_CAPTURE_PREVIEW_OPCODE_ADVERTISED: %s\n",supportsOp(payload,0x9022)?"yes":"no");
    [weakSelf readMode];
  }];
}
@end

int main(int argc,const char**argv){
  if(argc!=2||strcmp(argv[1],"--read-only")!=0) {
    fputs("Usage: x100vi-usb-tether-capability --read-only\n",stderr);
    return 64;
  }
  @autoreleasepool {
    TetherProbe*probe=[TetherProbe new];probe.browser=[ICDeviceBrowser new];
    probe.browser.delegate=probe;probe.browser.browsedDeviceTypeMask=ICDeviceTypeMaskCamera;
    [probe.browser start];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(20*NSEC_PER_SEC)),dispatch_get_main_queue(),^{
      puts("PTP read-only storage probe timeout; no new commands.");
      exit(2);
    });
    [[NSRunLoop currentRunLoop] run];
  }
  return 0;
}
