/*
 * X100VI native PTP capability probe.
 * Read-only by design: the ONLY permitted PTP operation here is
 * GetDeviceInfo (0x1001). No firmware changes, capture, settings writes,
 * serial numbers, or SD file reads. Camera identity must be 04cb:0305.
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
@end
@implementation FujiProbe
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
    // Close only our own session. Never eject, delete, capture or write.
    [weakSelf.camera requestCloseSession];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(0.8*NSEC_PER_SEC)), dispatch_get_main_queue(), ^{exit(0);});
  }];
}
@end

int main(void) {
  @autoreleasepool {
    FujiProbe *probe=[FujiProbe new];
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
