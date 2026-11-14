/*
 * X100VI macOS ImageCaptureCore: CURRENT ACTIVE PRESET READ-ONLY.
 *
 * Allowed PTP opcodes: GetDeviceInfo(0x1001), GetDevicePropValue(0x1015).
 * There is NO SetDevicePropValue, slot switching, capture, file transfer,
 * SD manipulation, firmware operation, or EEPROM command in this utility.
 * Reads only the camera's *currently selected* C-slot. Cannot claim a full
 * C1-C7 backup, and does not modify the camera's selected C-slot.
 *
 * The actual physical X100VI transport still needs on-camera validation.
 */
#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>
#import <stdlib.h>

static uint16_t rd16(NSData *d, NSUInteger at) {
    if (at > d.length || d.length - at < 2) return 0;
    const uint8_t *p = d.bytes;
    return (uint16_t)(p[at] | ((uint16_t)p[at+1] << 8));
}
static uint32_t rd32(NSData *d, NSUInteger at) {
    if (at > d.length || d.length - at < 4) return 0;
    const uint8_t *p = d.bytes;
    return (uint32_t)p[at] | ((uint32_t)p[at+1] << 8) | ((uint32_t)p[at+2] << 16) | ((uint32_t)p[at+3] << 24);
}
static BOOL skipBytes(NSData *data, NSUInteger *i, NSUInteger length) {
    if (*i > data.length || length > data.length - *i) return NO;
    *i += length;
    return YES;
}
static BOOL skipPTPString(NSData *data, NSUInteger *i) {
    if (*i >= data.length) return NO;
    const uint8_t count = ((const uint8_t *)data.bytes)[(*i)++];
    return skipBytes(data, i, (NSUInteger)count * 2u);
}
static NSString *ptpString(NSData *data) {
    if (data.length < 1) return nil;
    uint8_t units = ((const uint8_t *)data.bytes)[0];
    if (units == 0) return @"";
    NSUInteger size = (NSUInteger)units * 2u;
    if (size > data.length - 1) return nil;
    NSString *s = [[NSString alloc] initWithBytes:((const uint8_t *)data.bytes)+1 length:size encoding:NSUTF16LittleEndianStringEncoding];
    return [s stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"\0"]];
}
static BOOL deviceInfoIsX100VI(NSData *data) {
    // StandardVersion 2, VendorExtensionID 4, VendorExtensionVersion 2,
    // VendorExtensionDesc PTP-string, FunctionalMode 2, five counted u16 arrays,
    // manufacturer PTP-string and model PTP-string. Ignore serial number.
    NSUInteger i = 8;
    if (data.length < 16 || !skipPTPString(data, &i) || !skipBytes(data, &i, 2)) return NO;
    for (NSUInteger n = 0; n < 5; n++) {
        if (i > data.length || data.length - i < 4) return NO;
        uint32_t count = rd32(data, i);
        i += 4;
        if (count > 4096 || !skipBytes(data, &i, (NSUInteger)count * 2u)) return NO;
    }
    if (!skipPTPString(data, &i) || i >= data.length) return NO;
    uint8_t length = ((const uint8_t *)data.bytes)[i];
    if (length == 0 || ((NSUInteger)length * 2u) > data.length - i - 1) return NO;
    NSData *model = [data subdataWithRange:NSMakeRange(i, 1 + (NSUInteger)length * 2u)];
    return [ptpString(model) isEqualToString:@"X100VI"];
}
static NSData *ptpCommand(uint16_t opcode, uint32_t param, BOOL withParam, uint32_t transaction) {
    uint8_t bytes[16] = {0};
    uint32_t length = withParam ? 16 : 12;
    bytes[0] = length & 0xff;
    bytes[4] = 1; // command container
    bytes[6] = opcode & 0xff;
    bytes[7] = opcode >> 8;
    for (NSUInteger j = 0; j < 4; j++) bytes[8+j] = (transaction >> (8*j)) & 0xff;
    if (withParam) for (NSUInteger j = 0; j < 4; j++) bytes[12+j] = (param >> (8*j)) & 0xff;
    return [NSData dataWithBytes:bytes length:length];
}
static NSString *hexBytes(NSData *data) {
    NSMutableString *s = [NSMutableString stringWithCapacity:data.length * 2];
    const uint8_t *bytes = data.bytes;
    for (NSUInteger j = 0; j < data.length; j++) [s appendFormat:@"%02x", bytes[j]];
    return s;
}
static void writeJSON(NSDictionary *info) {
    NSData *json = [NSJSONSerialization dataWithJSONObject:info options:NSJSONWritingSortedKeys error:nil];
    if (!json) { puts("{\"ok\":false,\"error\":\"JSON encoding error\"}"); return; }
    fwrite(json.bytes, 1, json.length, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

@interface FujiCurrentSlot : NSObject <ICDeviceBrowserDelegate, ICDeviceDelegate>
@property (nonatomic, strong) ICDeviceBrowser *browser;
@property (nonatomic, strong) ICCameraDevice *camera;
@property (nonatomic) BOOL finished;
@property (nonatomic) BOOL deviceInfoValid;
@property (nonatomic) NSUInteger propertyIndex;
@property (nonatomic) uint32_t transaction;
@property (nonatomic, strong) NSMutableDictionary *values;
@property (nonatomic, strong) NSMutableArray *warnings;
@end

@implementation FujiCurrentSlot

// A short, bounded, *read-only* set of active C-slot parameters. The camera
// might reject some properties; that is not permission to try write commands.
static const uint16_t CURRENT_PROP_IDS[] = {
    0xD18C, // active C-slot
    0xD18D, // name
    0xD192, // film simulation
    0xD190, // dynamic range
    0xD195, // grain
    0xD196, // color chrome
    0xD197, // blue chrome
    0xD199, // white balance
    0xD19A, // WB shift red
    0xD19B, // WB shift blue
    0xD19D, // highlight
    0xD19E, // shadow
    0xD19F, // color
    0xD1A0, // sharpness
    0xD1A2, // clarity
};

- (instancetype)init {
    if ((self = [super init])) {
        _values = [NSMutableDictionary new];
        _warnings = [NSMutableArray new];
        _transaction = 1;
    }
    return self;
}

- (void)complete:(BOOL)ok error:(NSString *)error {
    if (self.finished) return;
    self.finished = YES;
    NSMutableDictionary *output = [@{
        @"ok": @(ok), @"model": @"X100VI", @"source": @"ImageCaptureCore PTP read-only",
        @"onlyCurrentSlot": @YES, @"writeCommands": @NO,
        @"properties": self.values ?: @{}, @"warnings": self.warnings ?: @[]
    } mutableCopy];
    if (!ok && error) output[@"error"] = error;
    NSNumber *slot = self.values[@"D18C"][@"value"];
    if ([slot isKindOfClass:NSNumber.class] && slot.intValue >= 1 && slot.intValue <= 7) output[@"activeSlot"] = slot;
    NSString *name = self.values[@"D18D"][@"value"];
    if ([name isKindOfClass:NSString.class]) output[@"slotName"] = name;
    writeJSON(output);
    if (self.camera) [self.camera requestCloseSession];
    [self.browser stop];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ exit(ok ? 0 : 2); });
}

- (void)sendRead:(uint16_t)code property:(uint32_t)prop completion:(void(^)(NSData *, uint16_t, NSError *))done {
    if (!self.camera || self.finished) return;
    NSData *command = ptpCommand(code, prop, code == 0x1015, self.transaction++);
    [self.camera requestSendPTPCommand:command outData:nil completion:^(NSData *data, NSData *response, NSError *err) {
        uint16_t result = response.length >= 8 ? rd16(response, 6) : 0;
        done(data ?: [NSData data], result, err);
    }];
}

- (void)nextProperty {
    if (self.finished) return;
    if (self.propertyIndex >= sizeof(CURRENT_PROP_IDS)/sizeof(CURRENT_PROP_IDS[0])) {
        // Some bodies may legitimately omit properties; keep the fields read.
        [self complete:YES error:nil];
        return;
    }
    uint16_t prop = CURRENT_PROP_IDS[self.propertyIndex++];
    [self sendRead:0x1015 property:prop completion:^(NSData *data, uint16_t response, NSError *err) {
        if (self.finished) return;
        NSString *key = [NSString stringWithFormat:@"%04X", prop];
        if (err || response != 0x2001 || data.length == 0) {
            [self.warnings addObject:[NSString stringWithFormat:@"%@ not readable (PTP 0x%04X)", key, response]];
        } else {
            id value = [NSNull null];
            if (prop == 0xD18D) {
                NSString *name = ptpString(data);
                if (name) value = name;
            } else if (data.length == 2) {
                value = @(rd16(data, 0));
            } else if (data.length == 4) {
                value = @(rd32(data, 0));
            }
            self.values[key] = @{ @"hex": hexBytes(data), @"value": value };
        }
        [self nextProperty];
    }];
}

- (void)deviceBrowser:(ICDeviceBrowser *)browser didAddDevice:(ICDevice *)device moreComing:(BOOL)more {
    if (self.camera || self.finished) return;
    if (device.usbVendorID != 0x04cb || device.usbProductID != 0x0305 || ![device isKindOfClass:ICCameraDevice.class]) return;
    self.camera = (ICCameraDevice *)device;
    self.camera.delegate = self;
    [self.camera requestOpenSession];
}
- (void)deviceBrowser:(ICDeviceBrowser *)browser didRemoveDevice:(ICDevice *)device moreGoing:(BOOL)more {
    if (device == self.camera && !self.finished) [self complete:NO error:@"X100VI disconnected during read-only PTP inspection"];
}
- (void)device:(ICDevice *)device didCloseSessionWithError:(NSError *)error {}
- (void)didRemoveDevice:(ICDevice *)device {}
- (void)device:(ICDevice *)device didOpenSessionWithError:(NSError *)error {
    if (self.finished) return;
    if (error || ![self.camera.capabilities containsObject:ICCameraDeviceCanAcceptPTPCommands]) {
        [self complete:NO error:@"Unable to open PTP read session for X100VI in current USB mode"];
        return;
    }
    [self sendRead:0x1001 property:0 completion:^(NSData *data, uint16_t response, NSError *err) {
        if (self.finished) return;
        if (err || response != 0x2001 || !deviceInfoIsX100VI(data)) {
            [self complete:NO error:@"Read-only PTP GetDeviceInfo failed or model was not exactly X100VI"];
            return;
        }
        self.deviceInfoValid = YES;
        [self nextProperty];
    }];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc == 2 && strcmp(argv[1], "--self-test") == 0) {
            NSData *c = ptpCommand(0x1015, 0xD18C, YES, 2);
            BOOL ok = c.length == 16 && rd16(c,6) == 0x1015 && rd32(c,12) == 0xD18C;
            NSData *name = [NSData dataWithBytes:(uint8_t[]){2,'C',0,0,0} length:5];
            ok = ok && [ptpString(name) isEqualToString:@"C"];
            NSData *bad = [NSData dataWithBytes:(uint8_t[]){250,65,0} length:3];
            ok = ok && ptpString(bad) == nil;
            puts(ok ? "SELFTEST OK: read-only PTP container and bounded string decoder" : "SELFTEST FAILED");
            return ok ? 0 : 3;
        }
        FujiCurrentSlot *probe = [FujiCurrentSlot new];
        probe.browser = [ICDeviceBrowser new];
        probe.browser.delegate = probe;
        probe.browser.browsedDeviceTypeMask = ICDeviceTypeMaskCamera;
        [probe.browser start];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(18 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [probe complete:NO error:@"No eligible X100VI or PTP read did not complete before timeout"];
        });
        [[NSRunLoop currentRunLoop] run];
    }
    return 1;
}
