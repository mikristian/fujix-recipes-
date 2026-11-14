/*
 * X100VI Fujifilm proprietary USB protocol capabilities (read-only).
 * Allowed opcodes: GetDeviceInfo 0x1001, GetDevicePropDesc 0x1014
 * for advertised D16E USBMode, GetDevicePropValue 0x1015 for D16E USBMode
 * and 5005 WhiteBalance, and (explicit opt-in) Fuji GetDeviceInfo 0x902B.
 * No capture, SD read/write, setting writes or firmware.
 * Camera VID:PID must match 04CB:0305.
 */
#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>
#import <stdlib.h>

static uint16_t read16(const uint8_t *d, NSUInteger n, NSUInteger at) {
    return at + 2 <= n ? (uint16_t)d[at] | ((uint16_t)d[at + 1] << 8) : 0;
}
static uint32_t read32(const uint8_t *d, NSUInteger n, NSUInteger at) {
    return at + 4 <= n ? (uint32_t)d[at] | ((uint32_t)d[at+1]<<8) |
        ((uint32_t)d[at+2]<<16) | ((uint32_t)d[at+3]<<24) : 0;
}
static BOOL skipString(const uint8_t *d, NSUInteger n, NSUInteger *cursor) {
    if (*cursor >= n) return NO;
    uint8_t chars = d[(*cursor)++];
    if ((NSUInteger)chars * 2 > n - *cursor) return NO;
    *cursor += (NSUInteger)chars * 2;
    return YES;
}
static void printUSBModeDescriptor(NSData *data) {
    const uint8_t *d=data.bytes;
    NSUInteger n=data.length;
    if(n<10){printf("  USBMode descriptor malformed: %lu bytes\n",(unsigned long)n);return;}
    uint16_t code=read16(d,n,0),kind=read16(d,n,2);
    uint8_t getSet=d[4];
    // PTP UInt16 data type is 0x0004. Other types must not be guessed.
    if(code!=0xD16E || kind!=0x0004 || getSet>1) {
      printf("  USBMode descriptor unexpected type: property=0x%04X type=0x%04X getset=%u (not interpreted)\n",code,kind,getSet);
      return;
    }
    uint16_t factoryDefault=read16(d,n,5);
    uint16_t current=read16(d,n,7);
    uint8_t form=d[9];
    printf("  Descriptor: code=0xD16E type=uint16 writable=%s default=%u current=%u form=%u\n",
           getSet?"yes":"no",factoryDefault,current,form);
    if(form==0){puts("  No explicit allowed-value form was provided (not evidence that tether mode is valid).");return;}
    if(form==1){
      if(n<16){puts("  Range descriptor is truncated");return;}
      printf("  Allowed range: minimum=%u maximum=%u step=%u\n",read16(d,n,10),read16(d,n,12),read16(d,n,14));
      return;
    }
    if(form==2){
      if(n<12){puts("  Enumeration descriptor is truncated");return;}
      uint16_t count=read16(d,n,10);
      if(count>128 || n<12+(NSUInteger)count*2){puts("  Enumeration descriptor length invalid");return;}
      BOOL tetherModeListed=NO;
      printf("  Camera-advertised USBMode choices (%u):",(unsigned)count);
      for(uint16_t i=0;i<count;i++){
        uint16_t value=read16(d,n,12+(NSUInteger)i*2);
        if(value==5)tetherModeListed=YES;
        printf(" %u",value);
      }
      printf("\n  Tether USB mode 5 is explicitly listed: %s\n",tetherModeListed?"YES (still no capture proof)":"NO");
      return;
    }
    puts("  Unknown property descriptor form; no allowed values inferred.");
}
static void printPTPDeviceInfo(NSData *data) {
    const uint8_t *d = data.bytes;
    NSUInteger n = data.length, pos = 0;
    if (n < 13) { printf("PTP device-info response too short (%lu bytes)\n",(unsigned long)n);return; }
    uint16_t stdver = read16(d,n,pos); pos+=2;
    uint32_t vendorExtension = read32(d,n,pos); pos+=4;
    uint16_t vendver=read16(d,n,pos);pos+=2;
    if(!skipString(d,n,&pos)) {puts("PTP vendor info string invalid");return;}
    if(pos+2>n) {puts("PTP functional mode absent");return;}
    uint16_t funcMode=read16(d,n,pos);pos+=2;
    if(pos+4>n) {puts("PTP operations list absent");return;}
    uint32_t count=read32(d,n,pos);pos+=4;
    if(count>4096 || (NSUInteger)count>(n-pos)/2) {puts("PTP operations length invalid");return;}
    BOOL capture=NO, openCapture=NO, fujiCapture=NO, getPreview=NO;
    printf("PTP DeviceInfo: std_version=0x%04X vendor_extension=0x%08X vendor_version=0x%04X mode=0x%04X\n",
        stdver,vendorExtension,vendver,funcMode);
    printf("Camera-advertised PTP operations (%u):\n",(unsigned)count);
    for(uint32_t i=0;i<count;i++){
      uint16_t opcode=read16(d,n,pos+2*i);
      printf("%04X%s",opcode,((i+1)%14==0)?"\n":" ");
      if(opcode==0x100E)capture=YES;
      if(opcode==0x101C)openCapture=YES;
      if(opcode==0x901B)fujiCapture=YES;
      if(opcode==0x9022)getPreview=YES;
    }
    printf("\nCapture indicators: InitiateCapture(0x100E)=%s InitiateOpenCapture(0x101C)=%s Fuji-901B=%s GetCapturePreview(0x9022)=%s\n",
       capture?"YES":"NO",openCapture?"YES":"NO",fujiCapture?"YES":"NO",getPreview?"YES":"NO");
    pos+=(NSUInteger)count*2;
    const char *names[]={ "events", "properties", "capture-formats", "image-formats" };
    for(NSUInteger g=0;g<4;g++){
      if(pos+4>n){printf("PTP %s list truncated\n",names[g]);return;}
      uint32_t items=read32(d,n,pos);pos+=4;
      if(items>4096 || (NSUInteger)items>(n-pos)/2){printf("PTP %s list invalid\n",names[g]);return;}
      if(g==1){
        printf("Camera-advertised property codes (%u):\n",(unsigned)items);
        for(uint32_t i=0;i<items;i++)printf("%04X%s",read16(d,n,pos+2*i),((i+1)%14==0)?"\n":" ");
        printf("\n");
      }else printf("PTP %s count=%u\n",names[g],(unsigned)items);
      pos+=(NSUInteger)items*2;
    }
    puts("Vendor probe will only send GetDeviceInfo and known read-only property requests.");
}
static NSSet<NSNumber*> *advertisedPropertyCodes(NSData *data) {
  const uint8_t *d=data.bytes;
  NSUInteger n=data.length,pos=0;
  if(n<13)return nil;
  pos=8;
  if(!skipString(d,n,&pos)||pos+2>n)return nil;
  pos+=2; // PTP functional mode.
  for(NSUInteger group=0;group<3;group++){
    if(pos+4>n)return nil;
    uint32_t count=read32(d,n,pos);pos+=4;
    if(count>4096||(NSUInteger)count>(n-pos)/2)return nil;
    if(group==2){
      NSMutableSet<NSNumber*> *result=[NSMutableSet new];
      for(uint32_t i=0;i<count;i++)[result addObject:@(read16(d,n,pos+2*i))];
      return result;
    }
    pos+=(NSUInteger)count*2;
  }
  return nil;
}

@interface FujiProbe : NSObject <ICDeviceBrowserDelegate, ICDeviceDelegate>
@property(nonatomic,strong) ICDeviceBrowser *browser;
@property(nonatomic,strong) ICCameraDevice *camera;
@property(nonatomic,assign) NSUInteger queryIndex;
@property(nonatomic,assign) BOOL allowUnadvertisedVendorQuery;
@property(nonatomic,assign) BOOL tetherCompatibilityReads;
@property(nonatomic,strong) NSSet<NSNumber*> *advertisedProperties;
@property(nonatomic,assign) int exitCode;
@end
@implementation FujiProbe
-(void)closeAndExit {
  [self.camera requestCloseSession];
  int code=self.exitCode;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(0.7*NSEC_PER_SEC)),dispatch_get_main_queue(),^{exit(code);});
}
-(void)queryNext {
  // Exact known read-only opcodes/parameters. No brute-force scan.
  struct ReadQuery {uint16_t opcode;uint32_t param;const char *name;};
  static const struct ReadQuery normalQueries[]={
    {0x1014,0xD16E,"USBMode descriptor (0xD16E, advertised, read-only)"},
    {0x1015,0xD16E,"USBMode (0xD16E, advertised)"},
    {0x1015,0x5005,"WhiteBalance (0x5005, advertised read-only baseline)"},
    {0x902B,0,"Fuji GetDeviceInfo (0x902B, proprietary read-only)"}
  };
  static const struct ReadQuery tetherQueries[]={
    {0x1015,0xD16E,"USBMode (0xD16E)"},
    {0x1015,0xD186,"TetherRawConditionCode (0xD186)"},
    {0x1015,0xD187,"TetherRawCompatibilityCode (0xD187)"},
    {0x1015,0xD208,"Fujifilm device property (0xD208, meaning unverified)"},
    {0x1015,0xD212,"CurrentState (0xD212)"}
  };
  const struct ReadQuery *queries=self.tetherCompatibilityReads?tetherQueries:normalQueries;
  NSUInteger size=self.tetherCompatibilityReads
    ?sizeof(tetherQueries)/sizeof(tetherQueries[0]):sizeof(normalQueries)/sizeof(normalQueries[0]);
  if(!self.tetherCompatibilityReads && self.queryIndex==3 && !self.allowUnadvertisedVendorQuery){
    puts("Skipping unadvertised Fuji 0x902B without explicit --vendor-device-info flag.");
    [self closeAndExit];
    return;
  }
  if(self.queryIndex>=size){puts("Completed all whitelisted read-only Fuji queries.");[self closeAndExit];return;}
  NSUInteger index=self.queryIndex++;
  uint16_t opcode=queries[index].opcode;
  uint32_t param=queries[index].param;
  if(opcode!=0x902B && ![self.advertisedProperties containsObject:@(param)]){
    printf("STOP: Property 0x%04X is not in the camera's advertised list.\n",(unsigned)param);
    self.exitCode=2;[self closeAndExit];return;
  }
  BOOL hasParam=(opcode==0x1015 || opcode==0x1014);
  uint8_t cmd[16]={0};
  cmd[0]=hasParam?16:12;cmd[4]=1;
  cmd[6]=(uint8_t)(opcode&0xff);cmd[7]=(uint8_t)(opcode>>8);
  cmd[8]=(uint8_t)(index+2);
  if(hasParam)for(int i=0;i<4;i++)cmd[12+i]=(uint8_t)((param>>(8*i))&0xff);
  printf("READ-ONLY QUERY: %s\n",queries[index].name);
  NSData *packet=[NSData dataWithBytes:cmd length:hasParam?16:12];
  __weak typeof(self) weakSelf=self;
  [self.camera requestSendPTPCommand:packet outData:nil completion:^(NSData *payload,NSData *reply,NSError *error) {
    printf("  Callback bytes: data=%lu reply=%lu\n",(unsigned long)payload.length,(unsigned long)reply.length);
    if(error) printf("  Transport error: %s (code=%ld)\n",error.localizedDescription.UTF8String,(long)error.code);
    else if(reply.length>=8){
      uint16_t code=read16(reply.bytes,reply.length,6);
      printf("  PTP response=0x%04X, data=%lu bytes\n",code,(unsigned long)payload.length);
      if(code==0x2001 && opcode==0x1014 && param==0xD16E) {
        printUSBModeDescriptor(payload);
      } else if(code==0x2001 && opcode==0x1015 && payload.length>=1 && payload.length<=4){
        uint32_t value=0;
        const uint8_t *p=payload.bytes;
        for(NSUInteger i=0;i<payload.length;i++)value|=((uint32_t)p[i]<<(8*i));
        printf("  Read-only property value=0x%X (%u)\n",value,(unsigned)value);
      } else if(code==0x2001 && opcode==0x902B) {
        if(payload.length>=2)printf("  Vendor descriptor first word=0x%04X (format unverified)\n",read16(payload.bytes,payload.length,0));
        puts("  Vendor payload intentionally not printed; could contain camera settings/identifiers.");
      }
    }else puts("  No PTP response packet from ImageCaptureCore (may be unsupported or a transport-layer issue; NOT proof of a particular camera response code).");
    // Stop on error/absent reply or explicit non-OK response. The first
    // experimental 0x902B attempt returned no valid response, so continuing
    // after a failed command is not safe: the session may be out of sync.
    if(error || reply.length<8 || read16(reply.bytes,reply.length,6)!=0x2001){
      puts("STOP: PTP command did not complete normally. No more opcodes will be sent.");
      weakSelf.exitCode=2;
      dispatch_async(dispatch_get_main_queue(),^{[weakSelf closeAndExit];});
    }else dispatch_async(dispatch_get_main_queue(),^{[weakSelf queryNext];});
  }];
}
-(void)deviceBrowser:(ICDeviceBrowser*)browser didAddDevice:(ICDevice*)device moreComing:(BOOL)more {
  if(device.usbVendorID!=0x04cb || device.usbProductID!=0x0305) return;
  if(![device isKindOfClass:[ICCameraDevice class]]) {
    puts("Expected X100VI USB ID found, but Image Capture did not identify a PTP camera.");
    return;
  }
  self.camera=(ICCameraDevice*)device;
  self.camera.delegate=self;
  printf("ImageCaptureCore detected X100VI USB VID=0x%04X PID=0x%04X\n",device.usbVendorID,device.usbProductID);
  NSArray *caps=device.capabilities ?: @[];
  printf("macOS camera capabilities: canTakePicture=%s canAcceptPTPCommands=%s\n",
    [caps containsObject:ICCameraDeviceCanTakePicture]?"YES":"NO",
    [caps containsObject:ICCameraDeviceCanAcceptPTPCommands]?"YES":"NO");
  puts("Opening a read-only PTP metadata session...");
  [self.camera requestOpenSession];
}
-(void)deviceBrowser:(ICDeviceBrowser*)browser didRemoveDevice:(ICDevice*)device moreGoing:(BOOL)more {}
-(void)device:(ICDevice*)device didCloseSessionWithError:(NSError*)error {}
-(void)didRemoveDevice:(ICDevice*)device {puts("X100VI unplugged during test.");}
-(void)device:(ICDevice*)device didOpenSessionWithError:(NSError*)error {
  if(error){
    printf("PTP open-session failed: %s\n",error.localizedDescription.UTF8String);
    return;
  }
  if(![device.capabilities containsObject:ICCameraDeviceCanAcceptPTPCommands]){
    puts("macOS did not grant PTP passthrough. No command sent.");
    [self.camera requestCloseSession];return;
  }
  // PTP USB command container: length=12,type=1,opcode=0x1001,transaction=1
  const uint8_t getDeviceInfo[12]={12,0,0,0,1,0,1,0x10,1,0,0,0};
  NSData *command=[NSData dataWithBytes:getDeviceInfo length:12];
  puts("Sending one read-only GetDeviceInfo (0x1001) PTP command...");
  __weak typeof(self) weakSelf=self;
  [self.camera requestSendPTPCommand:command outData:nil completion:^(NSData *data,NSData *response,NSError *sendError){
    if(sendError){ printf("PTP GetDeviceInfo error: %s\n",sendError.localizedDescription.UTF8String); }
    else {
      printf("PTP response=%lu bytes; DeviceInfo payload=%lu bytes\n",
           (unsigned long)response.length,(unsigned long)data.length);
      if(response.length>=8){
        const uint8_t *rp=response.bytes;
        printf("PTP response code=0x%04X\n",read16(rp,response.length,6));
      }
      printPTPDeviceInfo(data);
    }
    // Never proceed to vendor-specific commands without successful standard
    // DeviceInfo and exact X100VI USB identity.
    if(!sendError && response.length>=8 && read16(response.bytes,response.length,6)==0x2001){
      weakSelf.advertisedProperties=advertisedPropertyCodes(data);
      if(!weakSelf.advertisedProperties || weakSelf.advertisedProperties.count==0){
        puts("STOP: Could not verify advertised device property list.");
        weakSelf.exitCode=2;[weakSelf closeAndExit];
      }else dispatch_async(dispatch_get_main_queue(),^{[weakSelf queryNext];});
    }else{weakSelf.exitCode=2;[weakSelf closeAndExit];}
  }];
}
@end

int main(int argc, const char **argv) {
  BOOL vendor=argc==2 && strcmp(argv[1],"--vendor-device-info")==0;
  BOOL tether=argc==2 && strcmp(argv[1],"--tether-compat-readonly")==0;
  if(argc>2 || (argc==2 && !vendor && !tether)){
    fprintf(stderr,"Usage: x100vi-fuji-vendor-probe [--vendor-device-info | --tether-compat-readonly]\n");
    return 64;
  }
  @autoreleasepool {
    FujiProbe *probe=[FujiProbe new];
    probe.allowUnadvertisedVendorQuery=vendor;
    probe.tetherCompatibilityReads=tether;
    probe.browser=[ICDeviceBrowser new];
    probe.browser.delegate=probe;
    probe.browser.browsedDeviceTypeMask=ICDeviceTypeMaskCamera;
    [probe.browser start];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(22*NSEC_PER_SEC)),
        dispatch_get_main_queue(), ^{
      puts("Probe timeout. The physical X100VI may be busy or macOS Image Capture may own the session.");
      [probe.browser stop]; exit(2);
    });
    [[NSRunLoop currentRunLoop] run];
  }
  return 0;
}
