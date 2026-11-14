/** Read-only interface inventory for a dual-network X100VI workflow.
 * Never joins Wi-Fi, resets a route, or treats AWDL/AP/P2P as an extra radio.
 */
const IPV4_CAMERA=/^192\.168\.0\.(?:[1-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])$/;

export function parsePhysicalWifiDevices(output){
  const devices=[];
  for(const group of String(output).split(/\r?\n\s*\r?\n/)){
    const port=/^Hardware Port:\s*(.+)$/m.exec(group)?.[1]?.trim()||'';
    const device=/^Device:\s*(en\d+)\s*$/m.exec(group)?.[1];
    if(device && /(?:wi[ -]?fi|wireless\s*(?:lan|network)|802\.11|wlan)/i.test(port))devices.push(device);
  }
  return [...new Set(devices)];
}

export function activeIPv4(interfaces,name){
  return (interfaces?.[name]||[]).find(value=>value.family==='IPv4'&&!value.internal)?.address||null;
}

export function cameraInterfaceCandidates(interfaces){
  return Object.keys(interfaces||{})
    .filter(name=>/^en\d+$/.test(name))
    .filter(name=>IPV4_CAMERA.test(activeIPv4(interfaces,name)||''))
    .map(name=>({interface:name,localIp:activeIPv4(interfaces,name)}));
}

/** Readiness does NOT imply actual camera discovery, verified identity, or Internet. */
export function assessDualNetwork({hardwarePorts='',interfaces={},defaultRouteInterface=null}={}){
  const physicalWifi=parsePhysicalWifiDevices(hardwarePorts);
  const primaryWifi=physicalWifi.includes('en0')?'en0':physicalWifi[0]||null;
  const primaryWifiIP=primaryWifi?activeIPv4(interfaces,primaryWifi):null;
  const secondaryWifi=physicalWifi.filter(name=>name!==primaryWifi);
  const candidates=cameraInterfaceCandidates(interfaces);
  const activeCamera=candidates.find(item=>item.interface!==primaryWifi) || candidates[0] || null;
  const mainWifiIsDefault=Boolean(primaryWifi&&defaultRouteInterface===primaryWifi&&primaryWifiIP);
  const separateCameraPath=Boolean(activeCamera&&primaryWifi&&activeCamera.interface!==primaryWifi&&mainWifiIsDefault);
  return {
    primaryWifiInterface:primaryWifi,
    primaryWifiIPv4:primaryWifiIP,
    mainWifiIsDefault,
    primaryRouteInterface:defaultRouteInterface,
    physicalWifiCount:physicalWifi.length,
    secondaryWifiInterfaces:secondaryWifi,
    secondWifiRadioDetected:secondaryWifi.length>0,
    canJoinSecondSSIDWithoutSwitchingMain:mainWifiIsDefault&&secondaryWifi.length>0,
    cameraSubnetInterface:activeCamera?.interface||null,
    cameraSubnetIP:activeCamera?.localIp||null,
    cameraOnSeparateInterface:separateCameraPath,
    verifiedCameraConnected:false,
    note:secondaryWifi.length>0
      ? 'A second physical Wi-Fi adapter is listed. It must be joined to the X100VI hotspot and its Fujifilm PTP/IP session must be verified before original transfer can work.'
      : 'Only one physical Wi-Fi adapter is detected. AirDrop/AWDL and Thunderbolt virtual interfaces cannot join an independent X100VI Wi-Fi hotspot while preserving the main Wi-Fi network. Use a second macOS-compatible Wi-Fi adapter or a separate wired Internet connection.'
  };
}
