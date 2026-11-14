/*
 * X100VI macOS ImageCaptureCore: COMPLETE CURRENT ACTIVE PRESET READ-ONLY.
 *
 * Allowed PTP opcodes: GetDeviceInfo(0x1001), GetDevicePropValue(0x1015).
 * There is NO SetDevicePropValue, slot switching, capture, file transfer,
 * SD manipulation, firmware operation, or EEPROM command in this utility.
 * Reads only the camera's *currently selected* C-slot, now requiring all
 * 26 D18C–D1A5 raw property records and a real PTP DeviceInfo serial.
 * It CANNOT select a C-slot and NEVER claims to back up all seven slots.
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
static NSString *readPTPStringAt(NSData *data, NSUInteger *offset) {
    NSUInteger start = *offset;
    if (!skipPTPString(data, offset)) return nil;
    return ptpString([data subdataWithRange:NSMakeRange(start, *offset - start)]);
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
static NSString *deviceInfoSerialIfX100VI(NSData *data) {
    // Parse the *standard* PTP GetDeviceInfo identity fields with bounds
    // checks. Never infer a serial from USB VID/PID, name, or user input.
    NSUInteger i = 8;
    if (data.length < 16 || !skipPTPString(data, &i) || !skipBytes(data, &i, 2)) return nil;
    for (NSUInteger n = 0; n < 5; n++) {
        if (i > data.length || data.length - i < 4) return nil;
        uint32_t count = rd32(data, i);
        i += 4;
        if (count > 4096 || !skipBytes(data, &i, (NSUInteger)count * 2u)) return nil;
    }
    if (!skipPTPString(data, &i)) return nil; // manufacturer
    NSString *model = readPTPStringAt(data, &i);
    if (![model isEqualToString:@"X100VI"]) return nil;
    if (!skipPTPString(data, &i)) return nil; // device firmware version
    NSString *serial = readPTPStringAt(data, &i);
    if (!serial) return nil;
    serial = [serial stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (serial.length == 0 || serial.length > 80) return nil;
    return serial;
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
@property (nonatomic, copy) NSString *deviceSerial;
@property (nonatomic, strong) NSMutableDictionary *values;
@property (nonatomic, strong) NSMutableArray *warnings;
@end

@implementation FujiCurrentSlot

// Complete D18C-D1A5 *read-only* property set, with the currently active slot
// confirmed by D18C. If any property is unavailable we FAIL CLOSED; do not
// fabricate a restorable full-bank snapshot from a partial capture.
static const uint16_t CURRENT_PROP_IDS[] = {
    0xD18C, 0xD18D, 0xD18E, 0xD18F, 0xD190, 0xD191,
    0xD192, 0xD193, 0xD194, 0xD195, 0xD196, 0xD197,
    0xD198, 0xD199, 0xD19A, 0xD19B, 0xD19C, 0xD19D,
    0xD19E, 0xD19F, 0xD1A0, 0xD1A1, 0xD1A2, 0xD1A3,
    0xD1A4, 0xD1A5,
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
        @"complete26Properties": @(ok),
        @"properties": self.values ?: @{}, @"warnings": self.warnings ?: @[]
    } mutableCopy];
    if (self.deviceSerial.length > 0) output[@"serial"] = self.deviceSerial;
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
    // Invariant: this binary may transmit ONLY GetDeviceInfo and reads of
    // D18C–D1A5. Even a caller bug must not invoke a mutating opcode.
    if (!((code == 0x1001 && prop == 0) ||
          (code == 0x1015 && prop >= 0xD18C && prop <= 0xD1A5))) {
        done([NSData data], 0, [NSError errorWithDomain:@"X100VIReadOnly" code:1 userInfo:nil]);
        return;
    }
    NSData *command = ptpCommand(code, prop, code == 0x1015, self.transaction++);
    [self.camera requestSendPTPCommand:command outData:nil completion:^(NSData *data, NSData *response, NSError *err) {
        uint16_t result = response.length >= 8 ? rd16(response, 6) : 0;
        done(data ?: [NSData data], result, err);
    }];
}

- (void)nextProperty {
    if (self.finished) return;
    if (self.propertyIndex >= sizeof(CURRENT_PROP_IDS)/sizeof(CURRENT_PROP_IDS[0])) {
        if (self.values.count != sizeof(CURRENT_PROP_IDS)/sizeof(CURRENT_PROP_IDS[0]) || self.deviceSerial.length == 0) {
            [self complete:NO error:@"Incomplete current-slot properties or missing serial: refuse full-slot backup claim"];
            return;
        }
        NSNumber *slot = self.values[@"D18C"][@"value"];
        if (![slot isKindOfClass:NSNumber.class] || slot.intValue < 1 || slot.intValue > 7) {
            [self complete:NO error:@"Active slot D18C not confirmed as C1-C7"];
            return;
        }
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
        self.deviceSerial = deviceInfoSerialIfX100VI(data);
        if (self.deviceSerial.length == 0) {
            [self complete:NO error:@"PTP DeviceInfo did not provide a valid serial for a full-slot snapshot"];
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
            ok = ok && (sizeof(CURRENT_PROP_IDS) / sizeof(CURRENT_PROP_IDS[0]) == 26);
            for (NSUInteger n = 0; n < 26; n++) {
                ok = ok && CURRENT_PROP_IDS[n] == (uint16_t)(0xD18C + n);
            }
            NSData *name = [NSData dataWithBytes:(uint8_t[]){2,'C',0,0,0} length:5];
            ok = ok && [ptpString(name) isEqualToString:@"C"];
            NSData *bad = [NSData dataWithBytes:(uint8_t[]){250,65,0} length:3];
            ok = ok && ptpString(bad) == nil;
            // Synthetic PTP DeviceInfo: fixed fields, empty vendor string,
            // 5 zero-length arrays, Manufacturer, Model, Version and Serial.
            NSMutableData *device = [NSMutableData dataWithLength:8];
            uint8_t zero = 0;
            [device appendBytes:&zero length:1]; // VendorExtensionDesc empty
            uint8_t mode[2] = {0,0};
            [device appendBytes:mode length:2];
            uint8_t count[4] = {0,0,0,0};
            for (int i=0; i<5; i++) [device appendBytes:count length:4];
            uint8_t manufacturer[] = {2,'F',0,0,0};
            uint8_t model[] = {7,'X',0,'1',0,'0',0,'0',0,'V',0,'I',0,0,0};
            uint8_t version[] = {2,'1',0,0,0};
            uint8_t serial[] = {7,'1',0,'2',0,'3',0,'4',0,'5',0,'6',0,0,0};
            [device appendBytes:manufacturer length:sizeof(manufacturer)];
            [device appendBytes:model length:sizeof(model)];
            [device appendBytes:version length:sizeof(version)];
            [device appendBytes:serial length:sizeof(serial)];
            ok = ok && [deviceInfoSerialIfX100VI(device) isEqualToString:@"123456"];
            NSMutableData *invalid = [device mutableCopy];
            // Truncated identity cannot pass the serial gate.
            [invalid setLength:invalid.length - 1];
            ok = ok && deviceInfoSerialIfX100VI(invalid) == nil;
            puts(ok ? "SELFTEST OK: 26 sequential read-only codes, PTP identity/serial framing, bounded strings" : "SELFTEST FAILED");
            return ok ? 0 : 3;
        }
        FujiCurrentSlot *probe = [FujiCurrentSlot new];
        probe.browser = [ICDeviceBrowser new];
        probe.browser.delegate = probe;
        probe.browser.browsedDeviceTypeMask = ICDeviceTypeMaskCamera;
        [probe.browser start];
        // 26 sequential reads can exceed the old 15-property helper's 18s
        // budget on slower USB links; still fail closed with a finite limit.
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(45 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [probe complete:NO error:@"No eligible X100VI or complete 26-property PTP read did not finish within 45 seconds"];
        });
        [[NSRunLoop currentRunLoop] run];
    }
    return 1;
}
