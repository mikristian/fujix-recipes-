/*
 * Read-only ImageCaptureCore camera-card inventory, X100VI USB 04CB:0305.
 * Only opens/closes an ImageCaptureCore session and enumerates file metadata.
 * NEVER sends PTP opcodes directly, downloads, captures, deletes, or changes
 * camera settings. It prints aggregates only: no paths, serials, file names
 * or EXIF. A separate explicit user-selected import is required to copy.
 */
#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>
#import <stdlib.h>

@interface FujiCardList : NSObject<ICDeviceBrowserDelegate,ICCameraDeviceDelegate>
@property(nonatomic,strong)ICDeviceBrowser *browser;
@property(nonatomic,strong)ICCameraDevice *camera;
@property(nonatomic,assign)BOOL sessionOpen;
@property(nonatomic,assign)BOOL completed;
@end

@implementation FujiCardList
-(void)report {
 if(self.completed)return;
 ICCameraDevice *camera=self.camera;
 if(!camera || !self.sessionOpen)return;
 NSArray<ICCameraItem*> *files=camera.mediaFiles?:@[];
 NSUInteger jpg=0,raf=0,other=0,valid=0;
 unsigned long long bytes=0;
 NSMutableArray<NSDictionary*> *inventory=[NSMutableArray array];
 for(ICCameraItem *item in files){
  if(![item isKindOfClass:[ICCameraFile class]])continue;
  ICCameraFile *file=(ICCameraFile*)item;
  NSString *extension=file.name.pathExtension.lowercaseString?:@"";
  if([extension isEqualToString:@"jpg"]||[extension isEqualToString:@"jpeg"])jpg++;
  else if([extension isEqualToString:@"raf"])raf++;
  else other++;
  if(file.fileSize>0){valid++;bytes+=file.fileSize;}
  // Only safe, bounded JPEG/RAF inventory metadata. Never access image bytes,
  // camera serials, EXIF, GPS or other private device properties.
  NSString *filename=file.name?:@"";
  static NSCharacterSet *safeName=nil;
  if(!safeName)safeName=[[NSCharacterSet characterSetWithCharactersInString:
    @"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-"] invertedSet];
  if(filename.length==0||filename.length>100||[filename rangeOfCharacterFromSet:safeName].location!=NSNotFound)continue;
  if(!([extension isEqualToString:@"jpg"]||[extension isEqualToString:@"jpeg"]||[extension isEqualToString:@"raf"]))continue;
  if(file.fileSize<128||file.fileSize>200ULL*1024*1024||inventory.count>=2000)continue;
  [inventory addObject:@{@"name":filename,@"format":extension.uppercaseString,
     @"bytes":@(file.fileSize),@"handle":@(file.ptpObjectHandle)}];
 }
 printf("CARD_CATALOG_PROGRESS: %lu\n",(unsigned long)camera.contentCatalogPercentCompleted);
 printf("CARD_FILE_COUNT: %lu\n",(unsigned long)files.count);
 printf("CARD_JPEG_COUNT: %lu\n",(unsigned long)jpg);
 printf("CARD_RAF_COUNT: %lu\n",(unsigned long)raf);
 printf("CARD_OTHER_COUNT: %lu\n",(unsigned long)other);
 printf("CARD_NONZERO_SIZE_COUNT: %lu\n",(unsigned long)valid);
 printf("CARD_MEDIA_BYTES: %llu\n",bytes);
 NSError *error=nil;
 NSData *receipt=[NSJSONSerialization dataWithJSONObject:inventory options:0 error:&error];
 if(error||!receipt){puts("CARD_STOP: Could not produce read-only camera file inventory");[camera requestCloseSession];exit(2);}
 NSString *list=[[NSString alloc] initWithData:receipt encoding:NSUTF8StringEncoding];
 printf("CARD_FILES_JSON: %s\n",list.UTF8String);
 printf("CARD_ENUM_ONLY: yes\n");
 printf("CARD_DOWNLOAD_ATTEMPTED: no\n");
 fflush(stdout);
 self.completed=YES;
 [camera requestCloseSession];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(0.4*NSEC_PER_SEC)),dispatch_get_main_queue(),^{exit(0);});
}
-(void)deviceBrowser:(ICDeviceBrowser*)browser didAddDevice:(ICDevice*)device moreComing:(BOOL)more {
 if(device.usbVendorID!=0x04cb||device.usbProductID!=0x0305)return;
 if(![device isKindOfClass:ICCameraDevice.class])return;
 self.camera=(ICCameraDevice*)device;
 self.camera.delegate=self;
 puts("X100VI_CARD_READER_USB_MATCH: yes");
 puts("Opening read-only macOS camera catalog session...");
 [self.camera requestOpenSession];
}
-(void)deviceBrowser:(ICDeviceBrowser*)browser didRemoveDevice:(ICDevice*)device moreGoing:(BOOL)more {}
-(void)didRemoveDevice:(ICDevice*)device {
 if(!self.completed){puts("CARD_STOP: Camera disconnected");exit(3);}
}
-(void)device:(ICDevice*)device didCloseSessionWithError:(NSError*)error {}
-(void)device:(ICDevice*)device didOpenSessionWithError:(NSError*)error {
 if(error){puts("CARD_STOP: Image Capture session unavailable");exit(2);}
 self.sessionOpen=YES;
 puts("CARD_IMAGE_CAPTURE_SESSION_OPEN: yes");
 // Content cataloging may continue asynchronously after the session opens.
 // Do not interpret zero files as an empty camera until catalog progress 100.
 [self pollCatalog];
}
-(void)cameraDevice:(ICCameraDevice*)camera didAddItems:(NSArray<ICCameraItem*>*)items {
 // Do not expose metadata or media here; the main-thread poll reads the
 // aggregate once the catalog finishes.
 (void)camera;(void)items;
}
-(void)cameraDevice:(ICCameraDevice*)camera didRemoveItems:(NSArray<ICCameraItem*>*)items {
 (void)camera;(void)items;
}
-(void)deviceDidBecomeReadyWithCompleteContentCatalog:(ICCameraDevice*)device {
 if(device==self.camera&&self.sessionOpen)[self report];
}
-(void)pollCatalog {
 if(self.completed||!self.sessionOpen)return;
 if(self.camera.contentCatalogPercentCompleted>=100){[self report];return;}
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(0.5*NSEC_PER_SEC)),dispatch_get_main_queue(),^{[self pollCatalog];});
}
@end

int main(int argc,const char**argv){
 if(argc!=2||strcmp(argv[1],"--read-only")!=0){
  fputs("Usage: x100vi-card-reader-list --read-only\n",stderr);return 64;
 }
 @autoreleasepool {
  FujiCardList *probe=[FujiCardList new];
  probe.browser=[ICDeviceBrowser new];
  probe.browser.delegate=probe;
  probe.browser.browsedDeviceTypeMask=ICDeviceTypeMaskCamera;
  [probe.browser start];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(32*NSEC_PER_SEC)),dispatch_get_main_queue(),^{
   if(probe.camera && probe.sessionOpen){
    printf("CARD_CATALOG_PROGRESS: %lu\n",(unsigned long)probe.camera.contentCatalogPercentCompleted);
    puts("CARD_STOP: Camera file catalog incomplete (not reporting an empty card).");
    [probe.camera requestCloseSession];
   }else puts("CARD_STOP: PTP camera Image Capture discovery timed out.");
   exit(2);
  });
  [[NSRunLoop currentRunLoop] run];
 }
 return 0;
}
