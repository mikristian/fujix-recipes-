import Foundation
import CoreWLAN
import CoreLocation

// Takes JSON {ssid,password} from stdin; credentials are never written to disk or stdout.
// Run only on user's explicit click. No known-wifi auto-reconnect and no network reset.
let input = FileHandle.standardInput.readDataToEndOfFile()
if CommandLine.arguments.contains("--self-test") { print("WIFI_HELPER_OK"); exit(0) }
guard let params = (try? JSONSerialization.jsonObject(with: input)) as? [String:String],
      let ssid = params["ssid"], !ssid.isEmpty, ssid.utf8.count < 128,
      let password = params["password"], password.utf8.count < 200,
      ssid.range(of: "^(FUJIFILM|FUJI|X100)[A-Za-z0-9 _.-]*$", options:.regularExpression) != nil else {
  fputs("INVALID_CAMERA_WIFI_NETWORK\n", stderr); exit(2)
}
guard let wifi = CWWiFiClient.shared().interface(withName:"en0") else {
  fputs("WIFI_INTERFACE_UNAVAILABLE\n", stderr); exit(3)
}
do {
  let networks = try wifi.scanForNetworks(withSSID:Data(ssid.utf8))
  guard let network = networks.first else {
    // We cannot infer the camera is off if macOS privacy restrictions suppress
    // all SSIDs. Do not fall back to an unrelated AP or alter saved networks.
    let location = CLLocationManager().authorizationStatus
    if location == .denied || location == .notDetermined || location == .restricted {
      fputs("CAMERA_WIFI_NOT_FOUND: Mac Wi-Fi names may be hidden by Location Services. Open System Settings → Privacy & Security → Location Services and allow the FujiX Wi-Fi helper, or verify camera hotspot activation. No network change was made.\n", stderr)
    } else {
      fputs("CAMERA_WIFI_NOT_ADVERTISING: X100VI hotspot not found on Mac Wi-Fi. Check camera's wireless communication screen and try again. No network change was made.\n", stderr)
    }
    exit(4)
  }
  try wifi.associate(to:network, password:password.isEmpty ? nil : password)
  print("WIFI_ASSOCIATION_REQUESTED")
} catch {
  // Do not echo the SSID/password from any error output.
  fputs("WIFI_ASSOCIATION_FAILED (check camera Wi-Fi mode, pairing, and macOS Location permission)\n", stderr)
  exit(5)
}
