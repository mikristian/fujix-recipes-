import Foundation
import CoreBluetooth

/** Native macOS Fujifilm X100VI secure BLE authentication bridge.
 * Calls only known Fuji secure pairing GATT fields; never triggers shutter,
 * camera firmware, card storage, or Wi-Fi unless future explicit modes added.
 */
final class FujiBLEAuth: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    let shootRequested = CommandLine.arguments.contains("--shoot")
    let advertised = CBUUID(string:"A9D2B304-E8D6-4902-8336-352B772D7597")
    let pairUUID = CBUUID(string:"123D8F06-62A1-4935-9322-833C531EE225")
    let shutterUUID = CBUUID(string:"6514EB81-4E8F-458D-AA2A-E691336CDFAC")
    let releaseUUID = CBUUID(string:"7FCF49C6-4FF0-4777-A03D-1A79166AF7A8")
    let statusUUID = CBUUID(string:"F557D96B-8284-4667-8793-B971C1DECA2A")
    let identityUUID = CBUUID(string:"85B9163E-62D1-49FF-A6F5-054B4630D4A1")
    var central: CBCentralManager!
    var camera: CBPeripheral?
    var statusChar: CBCharacteristic?
    var identityChar: CBCharacteristic?
    var shutterChar: CBCharacteristic?
    var stage="idle"
    var finished=false
    var success=false
    override init(){super.init();central=CBCentralManager(delegate:self,queue:DispatchQueue.main,options:[CBCentralManagerOptionShowPowerAlertKey:false]);DispatchQueue.main.asyncAfter(deadline:.now()+34){[weak self] in self?.finish("timeout")}}
    func log(_ message:String){print("BLE_AUTH \(message)");fflush(stdout)}
    func finish(_ reason:String){
        if finished{return}
        finished=true
        log("END \(reason)")
        central.stopScan()
        if let camera=camera {central.cancelPeripheralConnection(camera)}
        // RunLoop.main.run() can re-enter after CFRunLoopStop; exit this
        // one-shot helper explicitly so the Mac does not retain GATT access.
        exit(success ? 0 : 1)
    }
    func centralManagerDidUpdateState(_ central:CBCentralManager){
        guard central.state == .poweredOn else {
            log("UNAVAILABLE state=\(central.state.rawValue)")
            finish("bluetooth_not_ready")
            return
        }
        // An X100VI already connected at macOS level may not advertise again.
        // Check CoreBluetooth's existing GATT connections before scanning.
        let connected = central.retrieveConnectedPeripherals(withServices:[advertised,pairUUID])
        if let existing = connected.first(where: { $0.name?.uppercased().contains("X100VI") == true }) {
            camera = existing
            existing.delegate = self
            stage = "connecting"
            log("X100VI_RETRIEVED_ALREADY_CONNECTED")
            central.connect(existing,options:nil)
            return
        }
        log("SCAN_STARTED name-based X100VI discovery")
        central.scanForPeripherals(withServices:nil,options:[CBCentralManagerScanOptionAllowDuplicatesKey:false])
    }
    func centralManager(_ central:CBCentralManager,didDiscover peripheral:CBPeripheral,advertisementData:[String:Any],rssi RSSI:NSNumber){guard camera == nil,peripheral.name?.uppercased().contains("X100VI")==true else{return};camera=peripheral;peripheral.delegate=self;log("X100VI_FOUND signal=\(RSSI)");central.stopScan();stage="connecting";central.connect(peripheral,options:nil)}
    func centralManager(_ central:CBCentralManager,didConnect peripheral:CBPeripheral){log("GATT_CONNECTED");stage="discovering-service";peripheral.discoverServices([pairUUID])}
    func centralManager(_ central:CBCentralManager,didFailToConnect peripheral:CBPeripheral,error:Error?){log("GATT_ERROR \(error?.localizedDescription ?? "unknown")");finish("connect_failed")}
    func centralManager(_ central:CBCentralManager,didDisconnectPeripheral peripheral:CBPeripheral,error:Error?){if !finished {log("DISCONNECTED \(error?.localizedDescription ?? "no error")");finish("unexpected_disconnect")}}
    func peripheral(_ peripheral:CBPeripheral,didDiscoverServices error:Error?){
        if let error=error{log("DISCOVER_SERVICE_ERROR \(error.localizedDescription)");finish("service_error");return}
        if stage=="discovering-shutter" {
            guard let service=peripheral.services?.first(where:{$0.uuid==shutterUUID}) else {finish("shutter_service_missing");return}
            peripheral.discoverCharacteristics([releaseUUID],for:service)
            return
        }
        guard let s=peripheral.services?.first(where:{$0.uuid==pairUUID})else{finish("secure_pair_service_unavailable");return}
        stage="discovering-chars";peripheral.discoverCharacteristics([statusUUID,identityUUID],for:s)
    }
    func peripheral(_ peripheral:CBPeripheral,didDiscoverCharacteristicsFor service:CBService,error:Error?){
        if let error=error{log("DISCOVER_CHARS_ERROR \(error.localizedDescription)");finish("characteristics_error");return}
        if stage=="discovering-shutter" {
            guard let characteristic=service.characteristics?.first(where:{$0.uuid==releaseUUID}),characteristic.properties.contains(.write) else {finish("writable_shutter_characteristic_missing");return}
            shutterChar=characteristic
            stage="shutter-half"
            log("SHUTTER_CHARACTERISTIC_FOUND sending one authorized shutter sequence")
            peripheral.writeValue(Data([1,0]),for:characteristic,type:.withResponse)
            return
        }
        statusChar=service.characteristics?.first(where:{$0.uuid==statusUUID});identityChar=service.characteristics?.first(where:{$0.uuid==identityUUID})
        guard let status=statusChar,identityChar != nil else{finish("secure_pair_characteristics_missing");return}
        stage="reading-status";log("SECURE_CHARS_FOUND");peripheral.readValue(for:status)
    }
    func peripheral(_ peripheral:CBPeripheral,didUpdateValueFor characteristic:CBCharacteristic,error:Error?){guard stage=="reading-status",characteristic.uuid == statusUUID else{return};if let error=error{log("STATUS_READ_ERROR \(error.localizedDescription)");finish("status_read_failed");return};guard let status=characteristic.value,status.count==4 else{finish("status_length_invalid");return};var reply=[UInt8](status);reply[3]=0x20;stage="writing-ack";log("STATUS_CHALLENGE_READ, sending secure ack");peripheral.writeValue(Data(reply),for:characteristic,type:.withResponse)}
    func peripheral(_ peripheral:CBPeripheral,didWriteValueFor characteristic:CBCharacteristic,error:Error?){
        if let error=error{log("WRITE_FAILED stage=\(stage) \(error.localizedDescription)");finish("write_failed");return}
        if stage=="writing-ack" {
            guard let identity=identityChar else{finish("no_identity");return}
            stage="writing-identity";log("ACK_OK, sending native client identity")
            peripheral.writeValue(Data("FujiX Sync Mac".utf8),for:identity,type:.withResponse)
        } else if stage=="writing-identity" {
            log("SECURE_HANDSHAKE_COMPLETED")
            if shootRequested {
                stage="discovering-shutter"
                peripheral.discoverServices([shutterUUID])
            } else {stage="authenticated";success=true;finish("success")}
        } else if let shutter=shutterChar,characteristic.uuid==releaseUUID {
            if stage=="shutter-half" {
                stage="shutter-full"
                peripheral.writeValue(Data([2,0]),for:shutter,type:.withResponse)
            } else if stage=="shutter-full" {
                stage="shutter-release-half"
                DispatchQueue.main.asyncAfter(deadline:.now()+0.13){[weak self] in
                    guard let self=self,!self.finished else{return}
                    peripheral.writeValue(Data([1,0]),for:shutter,type:.withResponse)
                }
            } else if stage=="shutter-release-half" {
                stage="shutter-release-all"
                peripheral.writeValue(Data([0,0]),for:shutter,type:.withResponse)
            } else if stage=="shutter-release-all" {
                log("SHUTTER_COMMAND_SEQUENCE_ACKED photo_saved_unverified")
                success=true
                finish("shutter_command_sent")
            }
        }
    }
}
let auth=FujiBLEAuth();RunLoop.main.run();exit(auth.success ? 0:1)
