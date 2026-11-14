import Foundation
import CoreWLAN
import CoreLocation

// Only exposes nearby plausible X100VI AP names. Never returns unrelated SSIDs
// or their metadata. Camera Wi-Fi must have actually been activated beforehand.
let client = CWWiFiClient.shared()
guard let wifi = client.interface(withName: "en0") else {
    print("{\"ok\":false,\"error\":\"Mac Wi-Fi interface unavailable\",\"cameras\":[]}")
    exit(0)
}
var cameras: [[String:Any]] = []
var scanError: String? = nil
var scannedCount = 0
var hiddenNames = 0
let locationPermission: String = {
    switch CLLocationManager().authorizationStatus {
    case .notDetermined: return "not-determined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways, .authorizedWhenInUse: return "authorized"
    @unknown default: return "unknown"
    }
}()
do {
    let found = try wifi.scanForNetworks(withSSID: nil)
    scannedCount = found.count
    hiddenNames = found.filter { $0.ssid == nil || $0.ssid?.isEmpty == true }.count
    for network in found {
        guard let ssid = network.ssid else { continue }
        // Names seen by the current Fujifilm ecosystem include FUJIFILM-*.
        // Keep names with X100VI even if the camera firmware changes prefix.
        let u = ssid.uppercased()
        if u.hasPrefix("FUJIFILM") || u.hasPrefix("FUJI-") || u.contains("X100VI") || u.contains("X100-VI") {
            cameras.append(["ssid":ssid,"signal":network.rssiValue])
        }
    }
} catch {
    scanError = "macOS Wi-Fi scan unavailable. Check Location Services and Wi-Fi permissions."
}
// macOS deliberately hides SSIDs and BSSIDs from unentitled/unapproved apps.
// Reporting zero cameras in this case is misleading; surface the permission
// issue without exposing any third-party SSIDs, BSSIDs or device location.
let hiddenByPrivacy = scannedCount > 0 && hiddenNames == scannedCount
if hiddenByPrivacy && scanError == nil {
    scanError = "macOS detected nearby Wi-Fi networks but concealed every network name. Allow Location Services for the app running FujiX Sync Wi-Fi discovery, then scan again. No location coordinates are requested."
}
let payload: [String:Any] = ["ok":scanError == nil,"error":scanError as Any? ?? NSNull(),"cameras":cameras,"permission":locationPermission,"networkNamesHidden":hiddenByPrivacy,"visibleNetworkCount":scannedCount-hiddenNames]
if let data = try? JSONSerialization.data(withJSONObject:payload,options:[.sortedKeys]),let text = String(data:data,encoding:.utf8){print(text)}
