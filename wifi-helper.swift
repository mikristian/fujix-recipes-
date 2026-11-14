// FujiX Sync Mac Wi-Fi helper: camera-only SSID discovery and explicit joining.
// CoreWLAN needs macOS Location Services authorization to disclose Wi-Fi SSIDs.
// We never request coordinates, persist camera credentials or enumerate third-
// party network names in output. --authorize requires a separate user click.
import Foundation
import CoreWLAN
import CoreLocation
import AppKit

func permissionName(_ value: CLAuthorizationStatus) -> String {
    switch value {
    case .notDetermined: return "not-determined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways, .authorizedWhenInUse: return "authorized"
    @unknown default: return "unknown"
    }
}
func respond(_ object: [String:Any]) {
    if let data=try? JSONSerialization.data(withJSONObject:object,options:[.sortedKeys]),
       let string=String(data:data,encoding:.utf8) { print(string) }
}
class PermissionRequest: NSObject, CLLocationManagerDelegate {
    private let manager=CLLocationManager()
    private var completed=false
    private var requestButton:NSButton?=nil
    @objc private func requestAccess(_ sender:Any?) {
        requestButton?.isEnabled=false
        manager.requestWhenInUseAuthorization()
    }
    func run() {
        manager.delegate=self
        let app=NSApplication.shared
        app.setActivationPolicy(.regular)
        // macOS can silently defer a location prompt from a faceless command-
        // line helper. Show a real foreground window with an explanation so
        // the user can decide whether to allow Wi-Fi SSID discovery.
        let window=NSWindow(contentRect:NSRect(x:0,y:0,width:490,height:220),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        window.title="FujiX Sync — Mac Wi-Fi Network Discovery"
        let message=NSTextField(wrappingLabelWithString:"macOS hides nearby Wi-Fi network names until you approve Location Services for this helper. Permission is used only to identify your X100VI Wi-Fi hotspot; FujiX Sync does not request your coordinates. You may choose Allow or Don’t Allow in the system prompt.")
        message.frame=NSRect(x:24,y:72,width:440,height:125)
        message.font=NSFont.systemFont(ofSize:14)
        message.alignment = .left
        window.contentView?.addSubview(message)
        let button=NSButton(title:"Request Wi-Fi network-name permission",target:self,action:#selector(requestAccess(_:)))
        button.frame=NSRect(x:95,y:20,width:300,height:42)
        button.bezelStyle = .rounded
        window.contentView?.addSubview(button)
        requestButton=button
        window.center()
        window.makeKeyAndOrderFront(nil)
        app.activate(ignoringOtherApps: true)
        let current=manager.authorizationStatus
        if current != .notDetermined { complete(current) }
        // Permission request fires ONLY from a real click on the button above.
        // Keep the explicit opt-in dialog available while the user reviews it.
        // The helper performs no scanning or location reads while waiting.
        let deadline=Date().addingTimeInterval(600)
        while !completed && Date()<deadline {
            RunLoop.current.run(mode:.default,before:Date().addingTimeInterval(0.2))
        }
        if !completed { respond(["permission":permissionName(manager.authorizationStatus),"requestTimedOut":true]) }
        window.orderOut(nil)
    }
    func locationManagerDidChangeAuthorization(_ manager:CLLocationManager) {
        if manager.authorizationStatus != .notDetermined {complete(manager.authorizationStatus)}
    }
    private func complete(_ status:CLAuthorizationStatus) {
        if completed {return}
        completed=true
        respond(["permission":permissionName(status),"requestTimedOut":false])
    }
}
func scan(_ wifi:CWInterface, _ permission:String) {
    var cameras:[[String:Any]]=[]
    var visible=0
    var hidden=0
    var problem:String?=nil
    do {
        let networks=try wifi.scanForNetworks(withSSID:nil)
        for network in networks {
            guard let ssid=network.ssid, !ssid.isEmpty else {hidden+=1;continue}
            visible+=1
            let name=ssid.uppercased()
            if name.hasPrefix("FUJIFILM") || name.hasPrefix("FUJI-") || name.contains("X100VI") || name.contains("X100-VI") {
                cameras.append(["ssid":ssid,"signal":network.rssiValue])
            }
        }
        if hidden>0 && visible==0 {
            problem="macOS detected nearby Wi-Fi but concealed every network name. Grant Location Services permission to the FujiX Sync Wi-Fi Helper (only for Wi-Fi SSID discovery), then scan again."
        }
    } catch {problem="macOS Wi-Fi scan failed. Check Wi-Fi, Location Services and camera hotspot status."}
    respond(["ok":problem==nil,"error":problem as Any? ?? NSNull(),"cameras":cameras,"permission":permission,"networkNamesHidden":hidden>0 && visible==0,"visibleNetworkCount":visible])
}
func join(_ wifi:CWInterface) {
    let input=FileHandle.standardInput.readDataToEndOfFile()
    guard input.count<=4096,
          let values=(try? JSONSerialization.jsonObject(with:input)) as? [String:String],
          let ssid=values["ssid"], !ssid.isEmpty, ssid.utf8.count<128,
          let password=values["password"], password.utf8.count<200,
          ssid.range(of:"^(FUJIFILM|FUJI|X100)[A-Za-z0-9 _.-]*$",options:.regularExpression) != nil else {
        fputs("INVALID_CAMERA_NETWORK\n",stderr);exit(2)
    }
    do {
        let found=try wifi.scanForNetworks(withSSID:Data(ssid.utf8))
        guard let candidate=found.first else {
            // No association is attempted if the exact camera SSID is missing.
            fputs("CAMERA_HOTSPOT_NOT_FOUND: camera Wi-Fi is not advertising or macOS hides nearby SSIDs. Check FujiX helper Location permission and X100VI camera Wi-Fi status. No Mac network was changed.\n",stderr)
            exit(3)
        }
        try wifi.associate(to:candidate,password:password.isEmpty ? nil : password)
        print("CAMERA_WIFI_ASSOCIATION_REQUESTED")
    } catch {
        // Never include SSID, credentials, BSSID or external error description.
        fputs("CAMERA_WIFI_ASSOCIATION_FAILED: verify camera hotspot and macOS Wi-Fi permissions. No settings were reset.\n",stderr)
        exit(4)
    }
}

let mode=CommandLine.arguments.dropFirst().first ?? ""
if mode=="--self-test" {print("FUJIX_WIFI_HELPER_READY");exit(0)}
if mode=="--authorize" {PermissionRequest().run();exit(0)}
if mode=="--permission-status" {
    respond(["permission":permissionName(CLLocationManager().authorizationStatus)]);exit(0)
}
guard let wifi=CWWiFiClient.shared().interface(withName:"en0") else {
    fputs("MAC_WIFI_INTERFACE_MISSING\n",stderr);exit(5)
}
switch mode {
case "--scan": scan(wifi,permissionName(CLLocationManager().authorizationStatus))
case "--join": join(wifi)
default: fputs("Usage: FujiXWiFi --scan|--join|--authorize|--permission-status|--self-test\n",stderr);exit(2)
}
