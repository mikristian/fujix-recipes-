import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDualNetwork,parsePhysicalWifiDevices,cameraInterfaceCandidates} from '../network-dual-wifi.mjs';

const ports=`Hardware Port: Ethernet Adapter (en4)\nDevice: en4\nEthernet Address: hidden\n\nHardware Port: Wi-Fi\nDevice: en0\nEthernet Address: hidden\n\nHardware Port: Thunderbolt Bridge\nDevice: bridge0\nEthernet Address: hidden\n`;
const ip=value=>[{family:'IPv4',address:value,internal:false}];

test('only genuine physical Wi-Fi ports count; AWDL and phantom Ethernet are never secondary Wi-Fi',()=>{
  const result=assessDualNetwork({hardwarePorts:ports,interfaces:{en0:ip('192.168.12.208'),awdl0:ip('192.168.0.99'),en4:[]},defaultRouteInterface:'en0'});
  assert.deepEqual(parsePhysicalWifiDevices(ports),['en0']);
  assert.equal(result.mainWifiIsDefault,true);
  assert.equal(result.secondWifiRadioDetected,false);
  assert.equal(result.canJoinSecondSSIDWithoutSwitchingMain,false);
  assert.equal(result.cameraSubnetInterface,null);
  assert.equal(result.verifiedCameraConnected,false);
});

test('second physical Wi-Fi is eligible without touching home default route; direct camera subnet can be on en9',()=>{
  const second=ports+'\nHardware Port: USB Wireless LAN\nDevice: en9\nEthernet Address: hidden\n';
  const interfaces={en0:ip('192.168.12.208'),en9:ip('192.168.0.12')};
  assert.deepEqual(cameraInterfaceCandidates(interfaces),[{interface:'en9',localIp:'192.168.0.12'}]);
  const result=assessDualNetwork({hardwarePorts:second,interfaces,defaultRouteInterface:'en0'});
  assert.deepEqual(result.secondaryWifiInterfaces,['en9']);
  assert.equal(result.canJoinSecondSSIDWithoutSwitchingMain,true);
  assert.equal(result.cameraOnSeparateInterface,true);
  assert.equal(result.cameraSubnetInterface,'en9');
  assert.equal(result.verifiedCameraConnected,false);
});

test('route or main Wi-Fi loss blocks a claim that main Wi-Fi was preserved',()=>{
  const second=ports+'\nHardware Port: Wi-Fi 2\nDevice: en9\n';
  const network={en0:ip('192.168.12.208'),en9:ip('192.168.0.12')};
  const alternateDefault=assessDualNetwork({hardwarePorts:second,interfaces:network,defaultRouteInterface:'en9'});
  assert.equal(alternateDefault.mainWifiIsDefault,false);
  assert.equal(alternateDefault.canJoinSecondSSIDWithoutSwitchingMain,false);
  assert.equal(alternateDefault.cameraOnSeparateInterface,false);
  const dropped=assessDualNetwork({hardwarePorts:second,interfaces:{en9:ip('192.168.0.12')},defaultRouteInterface:'en9'});
  assert.equal(dropped.primaryWifiIPv4,null);
  assert.equal(dropped.canJoinSecondSSIDWithoutSwitchingMain,false);
});
