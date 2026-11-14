// X100VI macOS capability bridge. Only PTP GetDeviceInfo and advertised
// GetDevicePropValue(D16E) are permitted. No state-changing PTP commands.
#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>
#include <stdlib.h>

static uint16_t u16(NSData *d, NSUInteger i) { const uint8_t *p=d.bytes; return i+2<=d.length?(uint16_t)(p[i]|(p[i+1]<<8)):0; }
static uint32_t u32(NSData *d, NSUInteger i) { const uint8_t *p=d.bytes; return i+4<=d.length?(uint32_t)(p[i]|p[i+1]<<8|p[i+2]<<16|p[i+3]<<24):0; }
static BOOL skip(NSData *d, NSUInteger *at, NSUInteger n) { if (*at>d.length||n>d.length-*at)return NO; *at+=n;return YES; }
static NSString *str(NSData *d, NSUInteger *at) {
  if (*at>=d.length)return nil;
  uint8_t n=((const uint8_t*)d.bytes)[(*at)++];
  if (!skip(d,at,(NSUInteger)n*2))return nil;
  NSUInteger start=*at-(NSUInteger)n*2;
  NSString *s=[[NSString alloc] initWithBytes:((const uint8_t*)d.bytes)+start length:(NSUInteger)n*2 encoding:NSUTF16LittleEndianStringEncoding];
  return [s stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"\0"]];
}
static NSData *cmd(uint16_t op, uint32_t param, uint32_t txn, BOOL hasParam) {
  uint8_t p[16]={0}; p[0]=hasParam?16:12;p[4]=1;p[6]=op&255;p[7]=op>>8;
  for(int i=0;i<4;i++)p[8+i]=(txn>>(i*8))&255;
  if(hasParam)for(int i=0;i<4;i++)p[12+i]=(param>>(i*8))&255;
  return [NSData dataWithBytes:p length:hasParam?16:12];
}
static NSDictionary *deviceInfo(NSData *d) {
  NSUInteger i=8;if(d.length<16||!str(d,&i)||!skip(d,&i,2))return nil;
  NSMutableArray *lists=[NSMutableArray new];
  for(int group=0;group<5;group++){
    if(i+4>d.length)return nil;
    uint32_t n=u32(d,i);i+=4;
    if(n>4096||n>(d.length-i)/2)return nil;
    NSMutableArray *v=[NSMutableArray new];
    for(uint32_t j=0;j<n;j++)[v addObject:@(u16(d,i+2*j))];
    i+=2*n;[lists addObject:v];
  }
  NSString *manufacturer=str(d,&i),*model=str(d,&i);
  if(!manufacturer||!model)return nil;
  return @{ @"model":model,@"manufacturer":manufacturer,@"operations":lists[0],@"properties":lists[2] };
}
static void output(NSDictionary *v,int status) {
  NSError *e=nil;NSData *json=[NSJSONSerialization dataWithJSONObject:v options:NSJSONWritingSortedKeys error:&e];
  if(json){fwrite(json.bytes,1,json.length,stdout);fputc('\n',stdout);fflush(stdout);}else puts("{\"ok\":false,\"error\":\"json_failed\"}");
  exit(status);
}
@interface Bridge : NSObject<ICDeviceBrowserDelegate,ICDeviceDelegate>
@property(strong) ICDeviceBrowser *browser;
@property(strong) ICCameraDevice *camera;
@property(strong) NSDictionary *info;
@end
@implementation Bridge
-(void)fail:(NSString*)code { if(self.camera)[self.camera requestCloseSession];output(@{@"ok":@NO,@"error":code,@"conversion_available":@NO},2); }
-(void)deviceBrowser:(ICDeviceBrowser*)browser didAddDevice:(ICDevice*)dev moreComing:(BOOL)more {
  if(dev.usbVendorID!=0x04cb||dev.usbProductID!=0x0305)return;
  if(![dev isKindOfClass:[ICCameraDevice class]]){[self fail:@"not_ptp_camera"];return;}
  self.camera=(ICCameraDevice*)dev;self.camera.delegate=self;
  [self.camera requestOpenSession];
}
-(void)deviceBrowser:(ICDeviceBrowser*)browser didRemoveDevice:(ICDevice*)dev moreGoing:(BOOL)more {}
-(void)didRemoveDevice:(ICDevice*)device {[self fail:@"device_removed"];}
-(void)device:(ICDevice*)device didCloseSessionWithError:(NSError*)error {}
-(void)send:(NSData*)command completion:(void (^)(NSData*,NSData*,NSError*))callback {
  [self.camera requestSendPTPCommand:command outData:nil completion:callback];
}
-(void)device:(ICDevice*)device didOpenSessionWithError:(NSError*)error {
  if(error){[self fail:@"session_open_failed"];return;}
  if(![device.capabilities containsObject:ICCameraDeviceCanAcceptPTPCommands]){[self fail:@"ptp_passthrough_unavailable"];return;}
  [self send:cmd(0x1001,0,1,NO) completion:^(NSData *data,NSData *response,NSError *err){
    if(err||u16(response,6)!=0x2001){[self fail:@"device_info_failed"];return;}
    NSDictionary *info=deviceInfo(data);
    if(!info||![info[@"model"] isEqualToString:@"X100VI"]){[self fail:@"model_unverified"];return;}
    self.info=info;
    if(![info[@"operations"] containsObject:@(0x1015)]||![info[@"properties"] containsObject:@(0xD16E)]){
      [self fail:@"usb_mode_property_not_advertised"];return;
    }
    [self send:cmd(0x1015,0xD16E,2,YES) completion:^(NSData *mode,NSData *resp,NSError *modeError){
      if(modeError||u16(resp,6)!=0x2001||mode.length!=2){[self fail:@"usb_mode_read_failed"];return;}
      uint16_t m=u16(mode,0);
      [self.camera requestCloseSession];
      output(@{@"ok":@YES,@"device":@"X100VI",@"usb_vid":@"04cb",@"usb_pid":@"0305",
               @"usb_mode":@(m),@"raw_conversion_mode":@(m==6),
               @"read_only_handshake":@YES,@"conversion_available":@NO,
               @"conversion_status":@"requires_validated_native_conversion_transport"},0);
    }];
  }];
}
@end
int main(int argc,char **argv) {
  @autoreleasepool {
    if(argc!=2||strcmp(argv[1],"--capabilities")!=0){fputs("usage: fujix-camera-bridge --capabilities\n",stderr);return 64;}
    Bridge *b=[Bridge new];b.browser=[ICDeviceBrowser new];b.browser.delegate=b;
    b.browser.browsedDeviceTypeMask=ICDeviceTypeMaskCamera;[b.browser start];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,12*NSEC_PER_SEC),dispatch_get_main_queue(),^{[b fail:@"device_timeout"];});
    [[NSRunLoop currentRunLoop] run];
  }return 2;
}
