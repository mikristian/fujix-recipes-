/*
 * X100VI native single-shot PTP test: 0x1001 GetDeviceInfo, 0x1015
 * GetDevicePropValue(D16E) and AT MOST ONE 0x100E InitiateCapture.
 * The shutter command is BLOCKED unless the camera itself advertises
 * 0x100E and independently reports D16E=5. Takes ONE PHOTO if accepted.
 * NEVER changes firmware/settings,
 * downloads/deletes SD files, or reads serial numbers.
 * Requires explicit --capture-once CLI flag and USB identity 04cb:0305.
 * Uses Apple's ImageCaptureCore, requiring no Homebrew/gPhoto install.
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
static BOOL deviceInfoAdvertisesCapture(NSData *data) {
  const uint8_t *d=data.bytes;
  NSUInteger n=data.length,pos=8;
  if(n<16 || !skipString(d,n,&pos) || pos+6>n) return NO;
  pos+=2; // FunctionalMode
  uint32_t count=read32(d,n,pos);
  pos+=4;
  if(count>4096 || (NSUInteger)count>(n-pos)/2) return NO;
  BOOL hasCapture=NO,hasGetProperty=NO;
  for(uint32_t i=0;i<count;i++) {
    const uint16_t op=read16(d,n,pos+i*2);
    if(op==0x100E)hasCapture=YES;
    if(op==0x1015)hasGetProperty=YES;
  }
  return hasCapture && hasGetProperty;
}
static BOOL captureGateAllows(BOOL advertised,BOOL modeReplyValid,uint16_t mode) {
  return advertised && modeReplyValid && mode==5;
}
static int offlineGuardSelftest(void) {
  // Synthetic standard PTP DeviceInfo; no ImageCaptureCore, no USB I/O.
  const uint8_t hasCapture[]={
    0x00,0x01,0,0,0,0,0,0,0,0,0,2,0,0,0,0x0E,0x10,0x15,0x10
  };
  const uint8_t noCapture[]={
    0x00,0x01,0,0,0,0,0,0,0,0,0,2,0,0,0,0x01,0x10,0x15,0x10
  };
  const uint8_t noModeRead[]={
    0x00,0x01,0,0,0,0,0,0,0,0,0,1,0,0,0,0x0E,0x10
  };
  BOOL valid=deviceInfoAdvertisesCapture([NSData dataWithBytes:hasCapture length:sizeof(hasCapture)]);
  BOOL blocked1=!deviceInfoAdvertisesCapture([NSData dataWithBytes:noCapture length:sizeof(noCapture)]);
  BOOL blocked2=!deviceInfoAdvertisesCapture([NSData dataWithBytes:noModeRead length:sizeof(noModeRead)]);
  BOOL blocked3=!captureGateAllows(YES,YES,6);
  BOOL blocked4=!captureGateAllows(YES,NO,5);
  BOOL blocked5=!captureGateAllows(NO,YES,5);
  BOOL allowed=captureGateAllows(YES,YES,5);
  BOOL success=valid && blocked1 && blocked2 && blocked3 && blocked4 && blocked5 && allowed;
  puts(success?"OFFLINE CAPTURE PREFLIGHT: PASS (mode6/unadvertised/invalid blocks)":
               "OFFLINE CAPTURE PREFLIGHT: FAIL");
  return success?0:2;
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
    puts("OPCODE LIST IS CAMERA-REPORTED; THIS TEST DID NOT ISSUE A SHUTTER COMMAND.");
}

@interface FujiProbe : NSObject <ICDeviceBrowserDelegate, ICDeviceDelegate>
@property(nonatomic,strong) ICDeviceBrowser *browser;
@property(nonatomic,strong) ICCameraDevice *camera;
@property(nonatomic,assign) BOOL captureOnce;
@property(nonatomic,assign) int exitCode;
@end
@implementation FujiProbe
-(void)finish {
  [self.camera requestCloseSession];
  int result=self.exitCode;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(0.8*NSEC_PER_SEC)), dispatch_get_main_queue(), ^{exit(result);});
}
-(void)runCaptureOnce {
  // One standard PTP InitiateCapture request: length=20, type=command(1),
  // opcode=0x100e, transaction=3 (after GetDeviceInfo and D16E read),
  // storage=0, format=0 (camera defaults).
  const uint8_t captureCommand[20]={
    20,0,0,0,1,0,0x0E,0x10,3,0,0,0,0,0,0,0,0,0,0,0
  };
  NSData *command=[NSData dataWithBytes:captureCommand length:sizeof(captureCommand)];
  puts("EXPLICIT TEST: sending ONE standard PTP InitiateCapture(0x100E). This could take one real photograph.");
  __weak typeof(self) weakSelf=self;
  [self.camera requestSendPTPCommand:command outData:nil completion:^(NSData *data, NSData *response, NSError *error) {
    (void)data;
    if(error) printf("Capture transport error: %s\n",error.localizedDescription.UTF8String);
    else if(response.length>=8){
      uint16_t code=read16(response.bytes,response.length,6);
      printf("Capture command PTP reply: 0x%04X (%s)\n",code,
         code==0x2001?"accepted (SD photo NOT verified)":
         code==0x2005?"OperationNotSupported":
         code==0x2019?"DeviceBusy":"camera error or other result");
    } else puts("Camera did not return a usable capture-response packet.");
    if(error || response.length<8 || read16(response.bytes,response.length,6)!=0x2001)
      weakSelf.exitCode=3; // A rejection is not a successful photo.
    puts("No additional shutter command will be sent. Inspect SD card manually to verify any still exposure.");
    [weakSelf finish];
  }];
}
-(void)checkLiveUsbModeThenCapture {
  // Read-only GetDevicePropValue, D16E (Fujifilm USBMode). Do NOT
  // attempt SetDevicePropValue, mode changes or unadvertised commands.
  const uint8_t modeCommand[16]={
    16,0,0,0,1,0,0x15,0x10,2,0,0,0,0x6E,0xD1,0,0
  };
  puts("Read-only preflight: verifying camera-reported USBMode D16E=5 before shutter.");
  NSData *command=[NSData dataWithBytes:modeCommand length:sizeof(modeCommand)];
  __weak typeof(self) weakSelf=self;
  [self.camera requestSendPTPCommand:command outData:nil completion:^(NSData *data,NSData *response,NSError *error) {
    BOOL valid=!error && response.length>=8 &&
      read16(response.bytes,response.length,6)==0x2001 && data.length==2;
    uint16_t mode=valid?read16(data.bytes,data.length,0):0xFFFF;
    if(!captureGateAllows(YES,valid,mode)) {
      weakSelf.exitCode=3;
      if(valid) printf("CAPTURE_BLOCKED: Camera USBMode=%u, not verified tether mode 5. No shutter command sent.\n",mode);
      else puts("CAPTURE_BLOCKED: Cannot verify USBMode D16E. No shutter command sent.");
      [weakSelf finish];
      return;
    }
    puts("PRECHECK PASSED: Camera itself advertises 0x100E and reports USBMode 5. Starting a SINGLE explicitly requested capture.");
    [weakSelf runCaptureOnce];
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
    BOOL metadataValid=!sendError && response.length>=8 &&
      read16(response.bytes,response.length,6)==0x2001;
    if(weakSelf.captureOnce && metadataValid && deviceInfoAdvertisesCapture(data))
      [weakSelf checkLiveUsbModeThenCapture];
    else {
      weakSelf.exitCode=3;
      puts("CAPTURE_BLOCKED: Camera does not advertise a valid InitiateCapture operation (0x100E). No shutter command sent.");
      [weakSelf finish];
    }
  }];
}
@end

int main(int argc,const char **argv) {
  if(argc==2 && strcmp(argv[1],"--offline-selftest")==0) {
    @autoreleasepool { return offlineGuardSelftest(); }
  }
  if(argc!=2 || strcmp(argv[1],"--capture-once")!=0){
    fprintf(stderr,"Usage: x100vi-ptp-capture-once --capture-once\nThe single explicit capture flag is mandatory.\n");
    return 64;
  }
  @autoreleasepool {
    FujiProbe *probe=[FujiProbe new];
    probe.captureOnce=YES;
    probe.browser=[ICDeviceBrowser new];
    probe.browser.delegate=probe;
    probe.browser.browsedDeviceTypeMask=ICDeviceTypeMaskCamera;
    [probe.browser start];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(16*NSEC_PER_SEC)),
        dispatch_get_main_queue(), ^{
      puts("Probe timeout. The physical X100VI may be busy or macOS Image Capture may own the session.");
      [probe.browser stop]; exit(2);
    });
    [[NSRunLoop currentRunLoop] run];
  }
  return 0;
}
