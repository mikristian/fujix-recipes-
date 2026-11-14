// fuji-x-direct-mac/vendor/filmkit/src/profile/enums.ts
var FilmSim = {
  Provia: 1,
  Velvia: 2,
  Astia: 3,
  ProNegHi: 4,
  ProNegStd: 5,
  Monochrome: 6,
  MonochromeYe: 7,
  MonochromeR: 8,
  MonochromeG: 9,
  Sepia: 10,
  ClassicChrome: 11,
  Acros: 12,
  AcrosYe: 13,
  AcrosR: 14,
  AcrosG: 15,
  Eterna: 16,
  ClassicNeg: 17,
  EternaBleach: 18,
  NostalgicNeg: 19,
  RealaAce: 20
};
var MONOCHROME_SIMS = /* @__PURE__ */ new Set([
  FilmSim.Monochrome,
  FilmSim.MonochromeYe,
  FilmSim.MonochromeR,
  FilmSim.MonochromeG,
  FilmSim.Sepia,
  FilmSim.Acros,
  FilmSim.AcrosYe,
  FilmSim.AcrosR,
  FilmSim.AcrosG
]);
var FilmSimLabels = {
  [FilmSim.Provia]: "Provia (Standard)",
  [FilmSim.Velvia]: "Velvia (Vivid)",
  [FilmSim.Astia]: "Astia (Soft)",
  [FilmSim.ProNegHi]: "PRO Neg. Hi",
  [FilmSim.ProNegStd]: "PRO Neg. Std",
  [FilmSim.Monochrome]: "Monochrome",
  [FilmSim.MonochromeYe]: "Monochrome + Yellow",
  [FilmSim.MonochromeR]: "Monochrome + Red",
  [FilmSim.MonochromeG]: "Monochrome + Green",
  [FilmSim.Sepia]: "Sepia",
  [FilmSim.ClassicChrome]: "Classic Chrome",
  [FilmSim.Acros]: "Acros",
  [FilmSim.AcrosYe]: "Acros + Yellow",
  [FilmSim.AcrosR]: "Acros + Red",
  [FilmSim.AcrosG]: "Acros + Green",
  [FilmSim.Eterna]: "Eterna (Cinema)",
  [FilmSim.EternaBleach]: "Eterna Bleach Bypass",
  [FilmSim.NostalgicNeg]: "Nostalgic Neg.",
  [FilmSim.RealaAce]: "Reala Ace",
  [FilmSim.ClassicNeg]: "Classic Neg."
};
var WBMode = {
  AsShot: 0,
  Auto: 2,
  Daylight: 4,
  Incandescent: 6,
  Underwater: 8,
  Fluorescent1: 32769,
  Fluorescent2: 32770,
  Fluorescent3: 32771,
  Shade: 32774,
  ColorTemp: 32775,
  AmbiencePriority: 32801
  // Auto WB sub-mode (confirmed from preset scan)
};
var WBModeLabels = {
  [WBMode.AsShot]: "As Shot",
  [WBMode.Auto]: "Auto",
  [WBMode.Daylight]: "Daylight",
  [WBMode.Shade]: "Shade",
  [WBMode.Fluorescent1]: "Fluorescent 1",
  [WBMode.Fluorescent2]: "Fluorescent 2",
  [WBMode.Fluorescent3]: "Fluorescent 3",
  [WBMode.Incandescent]: "Incandescent",
  [WBMode.Underwater]: "Underwater",
  [WBMode.ColorTemp]: "Color Temperature",
  [WBMode.AmbiencePriority]: "Ambience Priority"
};
var DynRange = {
  DR100: 1,
  DR200: 2,
  DR400: 3
};
var DynRangeLabels = {
  [DynRange.DR100]: "DR 100%",
  [DynRange.DR200]: "DR 200%",
  [DynRange.DR400]: "DR 400%"
};
var GrainStrength = { Off: 0, Weak: 2, Strong: 3 };
var GrainStrengthLabels = {
  [GrainStrength.Off]: "Off",
  [GrainStrength.Weak]: "Weak",
  [GrainStrength.Strong]: "Strong"
};
var GrainSize = { Small: 0, Large: 1 };
var GrainSizeLabels = {
  [GrainSize.Small]: "Small",
  [GrainSize.Large]: "Large"
};
var SmoothSkin = { Off: 0, Weak: 1, Strong: 2 };
var SmoothSkinLabels = {
  [SmoothSkin.Off]: "Off",
  [SmoothSkin.Weak]: "Weak",
  [SmoothSkin.Strong]: "Strong"
};
var ColorChrome = { Off: 0, Weak: 1, Strong: 2 };
var ColorChromeLabels = {
  [ColorChrome.Off]: "Off",
  [ColorChrome.Weak]: "Weak",
  [ColorChrome.Strong]: "Strong"
};
var ColorChromeFxBlue = { Off: 0, Weak: 1, Strong: 2 };
var ColorChromeFxBlueLabels = {
  [ColorChromeFxBlue.Off]: "Off",
  [ColorChromeFxBlue.Weak]: "Weak",
  [ColorChromeFxBlue.Strong]: "Strong"
};
var DRangePriority = { Off: 0, Auto: 1, Weak: 2, Strong: 3 };
var DRangePriorityLabels = {
  [DRangePriority.Off]: "Off",
  [DRangePriority.Auto]: "Auto",
  [DRangePriority.Weak]: "Weak",
  [DRangePriority.Strong]: "Strong"
};

// fuji-x-direct-mac/vendor/filmkit/src/ptp/constants.ts
var PTPOp = {
  GetDeviceInfo: 4097,
  OpenSession: 4098,
  CloseSession: 4099,
  GetStorageIDs: 4100,
  GetStorageInfo: 4101,
  GetNumObjects: 4102,
  GetObjectHandles: 4103,
  GetObjectInfo: 4104,
  GetObject: 4105,
  DeleteObject: 4107,
  SendObjectInfo: 4108,
  SendObject: 4109,
  GetDevicePropDesc: 4116,
  GetDevicePropValue: 4117,
  SetDevicePropValue: 4118
};
var FujiOp = {
  SendObjectInfo: 36876,
  SendObject2: 36877
};
var PTPResp = {
  OK: 8193,
  GeneralError: 8194,
  SessionNotOpen: 8195,
  InvalidTransactionID: 8196,
  OperationNotSupported: 8197,
  ParameterNotSupported: 8198,
  IncompleteTransfer: 8199,
  InvalidStorageID: 8200,
  InvalidObjectHandle: 8201,
  DevicePropNotSupported: 8202,
  SessionAlreadyOpen: 8222
};
var ContainerType = {
  Command: 1,
  Data: 2,
  Response: 3,
  Event: 4
};
var FujiProp = {
  RawConvProfile: 53637,
  StartRawConversion: 53635
};
var FujiPropNames = {
  // Camera shooting properties (D001-D0xx)
  53249: "FilmSimulation",
  53250: "FilmSimulationTune",
  53251: "DRangeMode",
  53255: "ColorTemperature",
  53256: "WhiteBalanceFineTune",
  53258: "NoiseReduction",
  53259: "ImageQuality",
  53260: "RecMode",
  53263: "FocusMode",
  53271: "GrainEffect",
  53273: "ShadowHighlight",
  53504: "ExposureIndex",
  53508: "FocusMeteringMode",
  53514: "ShutterSpeed",
  53515: "ImageAspectRatio",
  53617: "RawConversionEdit",
  53635: "StartRawConversion",
  53636: "IOPCodes",
  53637: "RawConvProfile",
  53638: "FirmwareVersion",
  53639: "FirmwareVersion2",
  // Custom preset properties (D18C-D1A5)
  //
  // Confirmed mapping via cross-referencing 7 camera presets (X100VI, 2026-03).
  // Encoding differs from d185 profile format:
  //   Effects:  1=Off 2=Weak 3=Strong (not 0/2/3)
  //   Grain:    flat enum 1=Off 2=WeakSmall 3=StrongSmall 4=WeakLarge 5=StrongLarge
  //   DynRange: raw percentage 100/200/400 (not enum 1/2/3)
  //   WB:       uint16 values (read as int16 — mask with 0xFFFF for lookup)
  //   Tone:     ×10 encoding (same as d185)
  //
  // RESOLVED via Wireshark captures (2026-03):
  //   D193: MonoWC (Warm/Cool) — ×10 encoding, rejects writing 0, only for B&W sims
  //   D194: MonoMG (Magenta/Green) — same encoding as D193
  //   D1A1: HighIsoNR — Fuji-specific encoding (NOT ×10): -4→0x8000, 0→0x2000, +4→0x5000
  //
  // Still unknown:
  //   D191: always 0
  //   D1A5: always 7
  //
  53644: "PresetSlot",
  53645: "PresetName",
  53646: "P:ImageSize",
  53647: "P:ImageQuality",
  53648: "P:DynamicRange%",
  53649: "P:?D191",
  53650: "P:FilmSimulation",
  53651: "P:MonoWC\xD710",
  53652: "P:MonoMG\xD710",
  53653: "P:GrainEffect",
  53654: "P:ColorChrome",
  53655: "P:ColorChromeFxBlue",
  53656: "P:SmoothSkin",
  53657: "P:WhiteBalance",
  53658: "P:WBShiftR",
  53659: "P:WBShiftB",
  53660: "P:ColorTemp(K)",
  53661: "P:HighlightTone\xD710",
  // confirmed: matches camera menu order
  53662: "P:ShadowTone\xD710",
  53663: "P:Color\xD710",
  53664: "P:Sharpness\xD710",
  53665: "P:HighIsoNR?",
  // always 0x8000 — sentinel/not stored in presets
  53666: "P:Clarity\xD710",
  53667: "P:LongExpNR",
  // 1=on for all tested presets
  53668: "P:ColorSpace",
  // 1=sRGB for all tested presets
  53669: "P:?D1A5"
  // 7 for all tested presets — image format?
};
var FUJI_VENDOR_ID = 1227;
function respName(code) {
  for (const [name, val] of Object.entries(PTPResp)) {
    if (val === code) return name;
  }
  return `0x${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

// fuji-x-direct-mac/vendor/filmkit/src/util/binary.ts
var PTPReader = class {
  view;
  pos = 0;
  constructor(data) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  get remaining() {
    return this.view.byteLength - this.pos;
  }
  u8() {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }
  u16() {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i8() {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }
  i16() {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i32() {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  /** PTP string: uint8 numChars (incl. null), then numChars × UCS-2LE */
  str() {
    const numChars = this.u8();
    if (numChars === 0) return "";
    let s = "";
    for (let i = 0; i < numChars; i++) {
      const ch = this.u16();
      if (ch !== 0) s += String.fromCharCode(ch);
    }
    return s;
  }
  /** PTP uint16 array: uint32 count, then count × uint16 */
  u16array() {
    const count = this.u32();
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(this.u16());
    return arr;
  }
  /** PTP uint32 array: uint32 count, then count × uint32 */
  u32array() {
    const count = this.u32();
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(this.u32());
    return arr;
  }
  /** Read a value by PTP data type code */
  valueByType(dataType) {
    switch (dataType) {
      case 1:
        return this.i8();
      case 2:
        return this.u8();
      case 3:
        return this.i16();
      case 4:
        return this.u16();
      case 5:
        return this.i32();
      case 6:
        return this.u32();
      case 65535:
        return this.str();
      default:
        return this.u32();
    }
  }
  /** Size in bytes for a PTP data type */
  static typeSize(dataType) {
    switch (dataType) {
      case 1:
      case 2:
        return 1;
      case 3:
      case 4:
        return 2;
      case 5:
      case 6:
        return 4;
      default:
        return 4;
    }
  }
};
function parsePTPStringRaw(data) {
  if (data.length < 1) return "";
  const r = new PTPReader(data);
  return r.str();
}
function packU16(value) {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setUint16(0, value, true);
  return new Uint8Array(buf);
}
function packU32(value) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, value, true);
  return new Uint8Array(buf);
}
function unpackU16(data, offset) {
  return data.getUint16(offset, true);
}
function unpackU32(data, offset) {
  return data.getUint32(offset, true);
}
function concat(...buffers) {
  const arrays = buffers.map((b) => b instanceof Uint8Array ? b : new Uint8Array(b));
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
function packPTPString(str) {
  if (str.length === 0) return new Uint8Array([0]);
  const parts = [];
  parts.push(new Uint8Array([str.length + 1]));
  for (const char of str) {
    parts.push(packU16(char.charCodeAt(0)));
  }
  parts.push(packU16(0));
  return concat(...parts);
}

// fuji-x-direct-mac/vendor/filmkit/src/ptp/container.ts
var HEADER_SIZE = 12;
function packContainer(c) {
  const paramBytes = c.params.slice(0, 5).map((p) => packU32(p));
  const paramsTotal = paramBytes.reduce((s, b) => s + b.length, 0);
  const totalLength = HEADER_SIZE + paramsTotal + c.data.length;
  return concat(
    packU32(totalLength),
    packU16(c.type),
    packU16(c.code),
    packU32(c.transactionId),
    ...paramBytes,
    c.data
  );
}
function unpackContainer(raw) {
  if (raw.length < HEADER_SIZE) {
    throw new Error(`Container too short: ${raw.length} bytes`);
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const _length = unpackU32(view, 0);
  const type = unpackU16(view, 4);
  const code = unpackU16(view, 6);
  const transactionId = unpackU32(view, 8);
  const rest = raw.slice(HEADER_SIZE);
  const params = [];
  let data = new Uint8Array(0);
  if (type === ContainerType.Data) {
    data = rest;
  } else if (type === ContainerType.Response) {
    const restView = new DataView(rest.buffer, rest.byteOffset, rest.byteLength);
    let offset = 0;
    while (offset + 4 <= rest.length && params.length < 5) {
      params.push(unpackU32(restView, offset));
      offset += 4;
    }
  }
  return { type, code, transactionId, params, data };
}
function containerLength(raw) {
  if (raw.length < 4) return 0;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return unpackU32(view, 0);
}

// fuji-x-direct-mac/vendor/filmkit/src/ptp/transport.ts
var CHUNK_SIZE = 512 * 1024;
var DEFAULT_TIMEOUT = 5e3;
var USBTransport = class _USBTransport {
  device = null;
  epOut = 0;
  epIn = 0;
  log;
  constructor(log = console.log) {
    this.log = log;
  }
  /** Check if WebUSB is available in this browser */
  static isSupported() {
    return typeof navigator !== "undefined" && "usb" in navigator;
  }
  /**
   * Request and open a Fujifilm camera.
   * MUST be called from a user gesture (click handler).
   */
  /** Connection error types for caller-side UI handling */
  static ConnectError = {
    Cancelled: "cancelled",
    Security: "security",
    InterfaceBusy: "interface-busy",
    Other: "other"
  };
  async connect() {
    if (!_USBTransport.isSupported()) {
      this.log("WebUSB not supported in this browser (need Chromium-based)");
      return { ok: false, error: "other", detail: "WebUSB not supported" };
    }
    try {
      this.device = await navigator.usb.requestDevice({
        filters: [{ vendorId: FUJI_VENDOR_ID }]
      });
      this.log(`Found: ${this.device.productName ?? "Fujifilm camera"} (PID=0x${this.device.productId.toString(16).padStart(4, "0")})`);
      await this.device.open();
      await this.device.selectConfiguration(1);
      await this.device.claimInterface(0);
      this.log("USB interface claimed");
      this.findEndpoints();
      this.log(`Endpoints: OUT=${this.epOut}, IN=${this.epIn}`);
      return { ok: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") {
        this.log("No camera selected");
        return { ok: false, error: "cancelled", detail: "No camera selected" };
      } else if (err instanceof DOMException && err.name === "SecurityError") {
        this.log("WebUSB blocked \u2014 needs HTTPS or localhost");
        return { ok: false, error: "security", detail: "WebUSB blocked \u2014 needs HTTPS or localhost" };
      } else if (err instanceof DOMException && err.name === "NetworkError") {
        this.log("Failed to claim USB interface \u2014 another application may have the device");
        return { ok: false, error: "interface-busy", detail: String(err) };
      } else {
        this.log(`Connection failed: ${err}`);
        return { ok: false, error: "other", detail: String(err) };
      }
    }
  }
  async disconnect() {
    if (!this.device) return;
    try {
      await this.device.releaseInterface(0);
      await this.device.close();
    } catch {
    }
    this.device = null;
    this.log("Disconnected");
  }
  /**
   * Reset the USB connection without losing the device reference.
   * Releases interface, closes, reopens, reclaims — clears stale PTP state.
   */
  async resetConnection() {
    if (!this.device) return;
    try {
      await this.device.releaseInterface(0);
      await this.device.close();
    } catch {
    }
    this._transactionId = 0;
    await this.device.open();
    await this.device.selectConfiguration(1);
    await this.device.claimInterface(0);
    this.findEndpoints();
    this.log("USB connection reset");
  }
  /** Find bulk IN and OUT endpoints on interface 0 */
  findEndpoints() {
    const intf = this.device.configuration.interfaces[0];
    const alt = intf.alternate;
    for (const ep of alt.endpoints) {
      if (ep.type === "bulk") {
        if (ep.direction === "out") this.epOut = ep.endpointNumber;
        if (ep.direction === "in") this.epIn = ep.endpointNumber;
      }
    }
    if (!this.epOut || !this.epIn) {
      throw new Error("Could not find bulk endpoints");
    }
  }
  /**
   * Send a PTP container, chunking large transfers at 512KB.
   *
   * Large RAF files (25-55MB) must be chunked — WebUSB may reject
   * very large buffers on some platforms.
   */
  async send(container) {
    const data = packContainer(container);
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      const result = await this.transferOut(chunk);
      if (result.status !== "ok") {
        throw new Error(`USB write failed: ${result.status}`);
      }
      offset += chunk.length;
    }
  }
  /**
   * Receive a PTP container, handling multi-packet responses.
   *
   * Reads the first chunk to get the container length from the header,
   * then continues reading until we have all the bytes.
   */
  async recv(timeout = DEFAULT_TIMEOUT) {
    const firstResult = await this.transferIn(CHUNK_SIZE, timeout);
    if (firstResult.status !== "ok" || !firstResult.data) {
      throw new Error(`USB read failed: ${firstResult.status}`);
    }
    let data = new Uint8Array(firstResult.data.buffer);
    const totalLength = containerLength(data);
    while (data.length < totalLength) {
      const moreResult = await this.transferIn(CHUNK_SIZE, timeout);
      if (moreResult.status !== "ok" || !moreResult.data) {
        throw new Error(`USB read continuation failed: ${moreResult.status}`);
      }
      const more = new Uint8Array(moreResult.data.buffer);
      const combined = new Uint8Array(data.length + more.length);
      combined.set(data);
      combined.set(more, data.length);
      data = combined;
      if (data.length > 100 * 1024 * 1024) {
        throw new Error(`Response too large: ${data.length} bytes`);
      }
    }
    return unpackContainer(data);
  }
  /**
   * Send a PTP command and receive the response.
   *
   * Handles the optional DATA phase: if the camera sends a DATA container
   * before the RESPONSE, we capture the data payload.
   *
   * Returns: { code, params, data }
   */
  async sendCommand(opcode, params = [], timeout = DEFAULT_TIMEOUT) {
    const transactionId = this.nextTransactionId();
    await this.send({
      type: ContainerType.Command,
      code: opcode,
      transactionId,
      params,
      data: new Uint8Array(0)
    });
    let resp = await this.recv(timeout);
    let data = new Uint8Array(0);
    if (resp.type === ContainerType.Data) {
      data = resp.data;
      resp = await this.recv(timeout);
    }
    if (resp.type !== ContainerType.Response) {
      throw new Error(`Expected RESPONSE, got type 0x${resp.type.toString(16)}`);
    }
    return { code: resp.code, params: resp.params, data };
  }
  /**
   * Send a PTP command with a data payload (two-phase: COMMAND then DATA).
   *
   * Used for SetDevicePropValue, SendObjectInfo, SendObject, etc.
   */
  async sendDataCommand(opcode, params, data, timeout = DEFAULT_TIMEOUT) {
    const transactionId = this.nextTransactionId();
    await this.send({
      type: ContainerType.Command,
      code: opcode,
      transactionId,
      params,
      data: new Uint8Array(0)
    });
    await this.send({
      type: ContainerType.Data,
      code: opcode,
      transactionId,
      params: [],
      data
    });
    const resp = await this.recv(timeout);
    if (resp.type !== ContainerType.Response) {
      throw new Error(`Expected RESPONSE, got type 0x${resp.type.toString(16)}`);
    }
    return { code: resp.code, params: resp.params };
  }
  /**
   * Best-effort CloseSession for page unload — fire and forget.
   * Sends the command packet without waiting for a response.
   */
  fireCloseSession() {
    if (!this.device) return;
    try {
      this.send({
        type: ContainerType.Command,
        code: PTPOp.CloseSession,
        transactionId: this.nextTransactionId(),
        params: [],
        data: new Uint8Array(0)
      });
    } catch {
    }
  }
  // -- Private helpers --
  _transactionId = 0;
  nextTransactionId() {
    return ++this._transactionId;
  }
  /** transferOut with the device, small wrapper for readability */
  transferOut(data) {
    return this.device.transferOut(this.epOut, data);
  }
  /** transferIn with timeout (WebUSB has no native timeout) */
  transferIn(length, timeout) {
    const transfer = this.device.transferIn(this.epIn, length);
    const timer = new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`USB read timeout (${timeout}ms)`)), timeout)
    );
    return Promise.race([transfer, timer]);
  }
};

// fuji-x-direct-mac/vendor/filmkit/src/ptp/session.ts
var CancelledError = class extends Error {
  constructor() {
    super("Cancelled");
  }
};
function decodePropValue(data) {
  if (data.length >= 3) {
    const numChars = data[0];
    const expectedLen = 1 + numChars * 2;
    if (numChars >= 2 && (expectedLen === data.length || expectedLen === data.length + 1)) {
      return parsePTPStringRaw(data);
    }
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length === 2) return view.getInt16(0, true);
  if (data.length === 4) return view.getInt32(0, true);
  if (data.length === 1) return data[0];
  return "0x" + Array.from(data.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var FujiCamera = class {
  transport;
  log;
  sessionOpen = false;
  /** Camera model name from PTP DeviceInfo (e.g. "X100VI") */
  modelName = "";
  /** Supported device property IDs from PTP DeviceInfo */
  supportedProperties = /* @__PURE__ */ new Set();
  /** Base profile from the camera (cached after first RAF upload) */
  baseProfile = null;
  /** Whether a RAF is currently loaded in camera memory */
  rafLoaded = false;
  // Command queue — serializes all camera I/O
  queue = [];
  draining = false;
  constructor(log = console.log) {
    this.log = log;
    this.transport = new USBTransport(log);
  }
  /**
   * Enqueue a camera action. Only one action runs at a time.
   * Tag 'render' enables latest-wins: pending renders are cancelled when a new one arrives.
   */
  enqueue(tag, fn) {
    if (tag === "render") {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        if (this.queue[i].tag === "render") {
          this.queue[i].reject(new CancelledError());
          this.queue.splice(i, 1);
        }
      }
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ tag, fn, resolve, reject });
      if (!this.draining) this.drain();
    });
  }
  async drain() {
    this.draining = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }
    this.draining = false;
  }
  /** Cancel all pending queue items (used on disconnect). */
  clearQueue() {
    for (const item of this.queue) {
      item.reject(new CancelledError());
    }
    this.queue = [];
  }
  get connected() {
    return this.transport.device !== null;
  }
  get deviceName() {
    return this.transport.device?.productName ?? "Unknown camera";
  }
  /** FujiX Sync integration: expose hardware USB identity for fail-closed
   * model matching before any profile property writes. */
  get usbIdentity() {
    const device = this.transport.device;
    return device ? { vendorId: device.vendorId, productId: device.productId } : null;
  }
  /** Connect to camera (opens USB device + PTP session) */
  async connect() {
    const result = await this.transport.connect();
    if (!result.ok) return result;
    if (!await this.openSession()) return { ok: false, error: "other" };
    try {
      const info = await this.getDeviceInfo();
      this.modelName = info.model;
      this.supportedProperties = new Set(info.properties);
    } catch {
      this.modelName = this.transport.device?.productName ?? "Unknown camera";
    }
    return { ok: true };
  }
  /** Best-effort session close for page unload — fire and forget, no await. */
  emergencyClose() {
    if (this.sessionOpen) {
      this.transport.fireCloseSession();
    }
  }
  /** Disconnect (close session + release USB). Cancels all pending queue items. */
  async disconnect() {
    this.clearQueue();
    if (this.sessionOpen) {
      await this.closeSession();
    }
    await this.transport.disconnect();
  }
  async openSession() {
    this.log("Opening PTP session...");
    const sessionId = 1;
    const { code } = await this.transport.sendCommand(PTPOp.OpenSession, [sessionId]);
    if (code === PTPResp.OK) {
      this.sessionOpen = true;
      this.log("Session opened");
      return true;
    }
    if (code === PTPResp.SessionAlreadyOpen) {
      this.log("Stale session detected, closing and resetting...");
      try {
        await this.transport.sendCommand(PTPOp.CloseSession);
      } catch {
      }
      await this.transport.resetConnection();
      const retry = await this.transport.sendCommand(PTPOp.OpenSession, [sessionId]);
      if (retry.code === PTPResp.OK) {
        this.sessionOpen = true;
        this.log("Session opened");
        return true;
      }
      this.log(`OpenSession failed after reset: ${respName(retry.code)}`);
      return false;
    }
    this.log(`OpenSession failed: ${respName(code)}`);
    return false;
  }
  async closeSession() {
    this.log("Closing session...");
    try {
      const { code } = await this.transport.sendCommand(PTPOp.CloseSession);
      if (code === PTPResp.OK) {
        this.log("Session closed");
      }
    } catch {
    }
    this.sessionOpen = false;
  }
  // ==========================================================================
  // Device inspection — enumerate & read camera properties
  // ==========================================================================
  /** Read PTP DeviceInfo to discover supported operations and properties */
  async getDeviceInfo() {
    const { code, data } = await this.transport.sendCommand(PTPOp.GetDeviceInfo);
    if (code !== PTPResp.OK) {
      throw new Error(`GetDeviceInfo failed: ${respName(code)}`);
    }
    const r = new PTPReader(data);
    r.u16();
    r.u32();
    r.u16();
    r.str();
    r.u16();
    const operations = r.u16array();
    r.u16array();
    const properties = r.u16array();
    r.u16array();
    r.u16array();
    const manufacturer = r.str();
    const model = r.str();
    const deviceVersion = r.str();
    const serialNumber = r.str();
    this.log(`${model} (${deviceVersion}), ${properties.length} properties supported`);
    return { model, serialNumber, manufacturer, deviceVersion, properties, operations };
  }
  /** Read a single property value (GetDevicePropValue), smart-decoded */
  async readProp(propId) {
    try {
      const { code, data } = await this.transport.sendCommand(
        PTPOp.GetDevicePropValue,
        [propId]
      );
      if (code !== PTPResp.OK || data.length === 0) return null;
      const name = FujiPropNames[propId] ?? `0x${propId.toString(16).toUpperCase()}`;
      return { id: propId, name, bytes: data, value: decodePropValue(data) };
    } catch {
      return null;
    }
  }
  /** Write a uint16 value to a device property */
  async writePropU16(propId, value) {
    const data = packU16(value);
    const { code } = await this.transport.sendDataCommand(
      PTPOp.SetDevicePropValue,
      [propId],
      data
    );
    return code === PTPResp.OK;
  }
  /** Write raw bytes to a device property */
  async writePropRaw(propId, bytes) {
    const data = new Uint8Array(bytes);
    const { code } = await this.transport.sendDataCommand(
      PTPOp.SetDevicePropValue,
      [propId],
      data
    );
    return code === PTPResp.OK;
  }
  /** Write a PTP string to a device property */
  async writePropString(propId, value) {
    const data = packPTPString(value);
    const { code } = await this.transport.sendDataCommand(
      PTPOp.SetDevicePropValue,
      [propId],
      data
    );
    return code === PTPResp.OK;
  }
  /**
   * Write a complete preset to a camera slot with verification.
   * Returns { ok, errors }. Errors list any properties that failed to write or verify.
   */
  /**
   * Write a complete preset to a camera slot with verification.
   * Returns { ok, warnings }. Write failures on individual properties are
   * non-fatal warnings (some properties like D19C, D19F, D1A1 are read-only).
   * Only slot selection or name write failure is fatal.
   */
  async writePreset(slot, name, settings) {
    return this.enqueue("default", async () => {
      const warnings = [];
      if (!await this.writePropU16(53644, slot)) {
        return { ok: false, warnings: ["Failed to select slot"] };
      }
      await new Promise((r) => setTimeout(r, 100));
      if (!await this.writePropString(53645, name)) {
        return { ok: false, warnings: ["Failed to write preset name"] };
      }
      const written = /* @__PURE__ */ new Set();
      for (const s of settings) {
        const ok = await this.writePropRaw(s.id, s.bytes);
        if (ok) {
          written.add(s.id);
        } else {
          const propName = FujiPropNames[s.id] ?? "0x" + s.id.toString(16);
          const hex = Array.from(s.bytes).map((b) => b.toString(16).padStart(2, "0")).join(" ");
          warnings.push(`${propName}: write rejected [${hex}]`);
        }
      }
      const verifyName = await this.readProp(53645);
      if (verifyName && typeof verifyName.value === "string" && verifyName.value !== name) {
        return { ok: false, warnings: [`Name verify failed: wrote "${name}" read "${verifyName.value}"`] };
      }
      for (const s of settings) {
        if (!written.has(s.id)) continue;
        const rb = await this.readProp(s.id);
        if (!rb) continue;
        if (s.bytes.length === rb.bytes.length) {
          let match = true;
          for (let i = 0; i < s.bytes.length; i++) {
            if (s.bytes[i] !== rb.bytes[i]) {
              match = false;
              break;
            }
          }
          if (!match) {
            const propName = FujiPropNames[s.id] ?? "0x" + s.id.toString(16);
            return { ok: false, warnings: [`${propName}: verify mismatch after successful write`] };
          }
        }
      }
      this.log(`Slot ${slot}: wrote ${written.size}/${settings.length} properties`);
      return { ok: true, warnings };
    });
  }
  /** Lightweight read to check if camera is still connected. Enqueued to avoid USB conflicts. */
  async heartbeat() {
    return this.enqueue("default", async () => {
      const prop = await this.readProp(53778);
      if (!prop) throw new Error("heartbeat failed");
    });
  }
  /** Scan all Fuji vendor properties (uses GetDevicePropValue) */
  async scanProperties() {
    return this.enqueue("default", async () => {
      const info = await this.getDeviceInfo();
      const fujiProps = info.properties.filter((p) => p >= 53248);
      this.log(`Scanning ${fujiProps.length} Fuji properties...`);
      const results = [];
      for (const propId of fujiProps) {
        if (propId === FujiProp.RawConvProfile) continue;
        const prop = await this.readProp(propId);
        if (prop) results.push(prop);
      }
      this.log(`Read ${results.length} properties`);
      return results;
    });
  }
  /**
   * Scan all 7 custom presets (C1-C7).
   *
   * Hypothesis: D18C selects the preset slot, D18D-D1A5 hold its settings.
   * We cycle D18C through 1-7, reading the settings for each slot.
   */
  async scanPresets() {
    return this.enqueue("default", async () => {
      if (this.supportedProperties.size > 0 && !this.supportedProperties.has(53644)) {
        this.log("Camera does not advertise preset properties (D18C) \u2014 skipping preset scan");
        return [];
      }
      const origSlot = await this.readProp(53644);
      const origSlotVal = origSlot && typeof origSlot.value === "number" ? origSlot.value : 1;
      const presets = [];
      for (let slot = 1; slot <= 7; slot++) {
        const ok = await this.writePropU16(53644, slot);
        if (!ok) {
          this.log(`Failed to select slot ${slot}`);
          if (slot === 1) {
            this.log("Slot selection not supported \u2014 aborting preset scan");
            break;
          }
          continue;
        }
        await new Promise((r) => setTimeout(r, 100));
        const nameProp = await this.readProp(53645);
        const name = nameProp && typeof nameProp.value === "string" ? nameProp.value : `(slot ${slot})`;
        const settings = [];
        for (let pid = 53646; pid <= 53669; pid++) {
          const prop = await this.readProp(pid);
          if (prop) settings.push(prop);
        }
        presets.push({ slot, name, settings });
        this.log(`C${slot}: "${name}" (${settings.length} settings)`);
      }
      await this.writePropU16(53644, origSlotVal);
      return presets;
    });
  }
  // ==========================================================================
  // Phase 2: RAF Upload + Profile Read
  // ==========================================================================
  /**
   * Upload a RAF file to the camera.
   *
   * Two-step process using Fuji vendor commands:
   * 1. SendObjectInfo (0x900C) — tells camera about the incoming file
   * 2. SendObject2 (0x900D) — sends the actual RAF data
   *
   * The ObjectInfo structure must match what the camera expects exactly —
   * wrong ObjectFormat (e.g., 0x5000 instead of 0xF802) causes silent failure.
   */
  async sendRaf(data) {
    const sizeMB = (data.byteLength / 1024 / 1024).toFixed(1);
    this.log(`Sending RAF file (${sizeMB} MB)...`);
    const objectInfo = concat(
      packU32(0),
      // StorageID
      packU16(63490),
      // ObjectFormat — MUST be 0xF802 for RAF
      packU16(0),
      // ProtectionStatus
      packU32(data.byteLength),
      // CompressedSize
      packU16(0),
      // ThumbFormat
      packU32(0),
      // ThumbCompressedSize
      packU32(0),
      // ThumbPixWidth
      packU32(0),
      // ThumbPixHeight
      packU32(0),
      // ImagePixWidth
      packU32(0),
      // ImagePixHeight
      packU32(0),
      // ImageBitDepth
      packU32(0),
      // ParentObject
      packU16(0),
      // AssociationType
      packU32(0),
      // AssociationDesc
      packU32(0),
      // SequenceNumber
      packPTPString("FUP_FILE.dat"),
      // Filename
      new Uint8Array([0]),
      // CaptureDate (empty)
      new Uint8Array([0]),
      // ModificationDate (empty)
      new Uint8Array([0])
      // Keywords (empty)
    );
    this.log("Sending object info...");
    const infoResult = await this.transport.sendDataCommand(
      FujiOp.SendObjectInfo,
      [0, 0, 0],
      // storage_id, handle, 0
      objectInfo
    );
    if (infoResult.code !== PTPResp.OK) {
      throw new Error(`SendObjectInfo failed: ${respName(infoResult.code)}`);
    }
    this.log("Uploading RAF data...");
    const sendResult = await this.transport.sendDataCommand(
      FujiOp.SendObject2,
      [],
      new Uint8Array(data),
      6e4
      // 60s timeout for large files
    );
    if (sendResult.code !== PTPResp.OK) {
      throw new Error(`SendObject failed: ${respName(sendResult.code)}`);
    }
    this.log("RAF file uploaded");
  }
  /**
   * Read the current RAW conversion profile from the camera (property 0xD185).
   *
   * This returns the camera's d185 binary profile — a 605-byte or 632-byte
   * structure containing all current conversion parameters.
   * The camera needs a RAF loaded first for this to return valid data.
   */
  async getProfile() {
    this.log("Reading profile from camera...");
    const { code, data } = await this.transport.sendCommand(
      PTPOp.GetDevicePropValue,
      [FujiProp.RawConvProfile]
    );
    if (code !== PTPResp.OK) {
      throw new Error(`GetDevicePropValue(0xD185) failed: ${respName(code)}`);
    }
    if (data.length === 0) {
      throw new Error("Profile data is empty \u2014 is a RAF file loaded?");
    }
    this.log(`Profile received: ${data.length} bytes`);
    return data;
  }
  // ==========================================================================
  // Phase 3: Profile Write + Conversion
  // ==========================================================================
  /** Send a modified profile to the camera (property 0xD185) */
  async setProfile(profile) {
    this.log(`Sending modified profile (${profile.length} bytes)...`);
    const { code } = await this.transport.sendDataCommand(
      PTPOp.SetDevicePropValue,
      [FujiProp.RawConvProfile],
      profile
    );
    if (code !== PTPResp.OK) {
      throw new Error(`SetDevicePropValue(0xD185) failed: ${respName(code)}`);
    }
    this.log("Profile sent");
  }
  /** Trigger RAW conversion (set property 0xD183 to 0) */
  async triggerConversion() {
    this.log("Triggering conversion...");
    const data = packU16(0);
    const { code } = await this.transport.sendDataCommand(
      PTPOp.SetDevicePropValue,
      [FujiProp.StartRawConversion],
      data
    );
    if (code !== PTPResp.OK) {
      throw new Error(`StartRawConversion failed: ${respName(code)}`);
    }
    this.log("Conversion started");
  }
  /**
   * Poll for the converted JPEG and download it.
   *
   * After triggering conversion, the camera processes the RAF and creates
   * a temporary JPEG object. We poll GetObjectHandles until it appears,
   * download it, then delete the temp object.
   */
  async waitForResult(timeoutMs = 3e4) {
    this.log("Waiting for result...");
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { code, data } = await this.transport.sendCommand(
        PTPOp.GetObjectHandles,
        [4294967295, 0, 0]
      );
      if (code !== PTPResp.OK) {
        throw new Error(`GetObjectHandles failed: ${respName(code)}`);
      }
      if (data.length >= 8) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const numHandles = view.getUint32(0, true);
        if (numHandles > 0) {
          const handle = view.getUint32(4, true);
          this.log(`Conversion complete (handle=0x${handle.toString(16).padStart(8, "0")})`);
          this.log("Downloading JPEG...");
          const getResult = await this.transport.sendCommand(
            PTPOp.GetObject,
            [handle],
            6e4
            // Large JPEGs may take a moment
          );
          if (getResult.code !== PTPResp.OK) {
            throw new Error(`GetObject failed: ${respName(getResult.code)}`);
          }
          const jpeg = getResult.data;
          const sizeMB = (jpeg.length / 1024 / 1024).toFixed(1);
          this.log(`Downloaded ${sizeMB} MB`);
          try {
            await this.transport.sendCommand(PTPOp.DeleteObject, [handle]);
          } catch {
          }
          return jpeg;
        }
      }
      await new Promise((r) => setTimeout(r, 1e3));
    }
    throw new Error(`Conversion timeout after ${timeoutMs / 1e3}s`);
  }
  /**
   * Upload a RAF and cache the base profile. Call this once per file.
   * After this, use reconvert() for fast re-renders with different settings.
   */
  async loadRaf(data) {
    return this.enqueue("default", async () => {
      await this.sendRaf(data);
      this.baseProfile = await this.getProfile();
      this.rafLoaded = true;
      await this.setProfile(this.baseProfile);
      await this.triggerConversion();
      return this.waitForResult();
    });
  }
  /**
   * Re-convert the already-loaded RAF with new settings.
   * Enqueued as 'render' — latest-wins: pending renders are cancelled
   * when a new one arrives, so only the most recent settings get processed.
   */
  async reconvert(buildProfile) {
    return this.enqueue("render", async () => {
      if (!this.rafLoaded || !this.baseProfile) {
        throw new Error("No RAF loaded \u2014 call loadRaf() first");
      }
      const modified = buildProfile(this.baseProfile);
      await this.setProfile(modified);
      await this.triggerConversion();
      return this.waitForResult();
    });
  }
};

// fuji-x-direct-mac/filmkit-preset-bridge.ts
var SIMULATIONS = Object.freeze(Object.entries(FilmSimLabels).map(([code, label]) => ({ code: Number(code), label })).sort((a, b) => a.code - b.code));
var PROP_SLOT = 53644;
var PROP_NAME = 53645;
var PROP_FILM = 53650;
var FIRST_PROP = 53646;
var LAST_PROP = 53669;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var toHex = (bytes) => Array.from(bytes).map((n) => n.toString(16).padStart(2, "0")).join("");
var u16 = (hex) => parseInt(hex.slice(2, 4) + hex.slice(0, 2), 16);
function validSlot(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 7) throw Error("Choose C1\u2013C7");
  return slot;
}
function required(prop, what) {
  if (!prop) throw Error("Could not read " + what + " from the real camera; nothing was changed.");
  return prop;
}
function slotValue(prop) {
  const v = required(prop, "active preset selector");
  if (v.bytes.length !== 2 || typeof v.value !== "number" || v.value < 1 || v.value > 7) throw Error("Camera did not return a valid C1\u2013C7 active slot");
  return v.value;
}
function compare(a, b, changedSlot, changedFilm) {
  const issues = [];
  if (a.camera.serial !== b.camera.serial || a.camera.model !== b.camera.model || a.camera.firmware !== b.camera.firmware) issues.push("Camera identity/firmware changed");
  for (let i = 0; i < 7; i++) {
    const before = a.slots[i], after = b.slots[i];
    if (before.name !== after.name) issues.push(`C${i + 1} name changed`);
    if (before.properties.length !== after.properties.length) issues.push(`C${i + 1} property count changed`);
    for (const prop of before.properties) {
      const current = after.properties.find((p) => p.id === prop.id);
      const expected = changedSlot === i + 1 && prop.id === PROP_FILM ? changedFilm : prop.hex;
      if (!current || current.hex !== expected) issues.push(`C${i + 1} property 0x${prop.id.toString(16)} changed unexpectedly`);
    }
  }
  return issues;
}
var X100viPresetBridge = class {
  camera = null;
  info = null;
  snapshot = null;
  receipt = null;
  busy = false;
  onLog;
  constructor(onLog = () => {
  }) {
    this.onLog = onLog;
  }
  get connected() {
    return Boolean(this.camera?.connected && this.info);
  }
  get current() {
    return this.snapshot;
  }
  get backup() {
    return this.receipt;
  }
  assertConnected() {
    if (!this.camera?.connected || !this.info) throw Error("Connect the physical X100VI in USB RAW CONV./BACKUP RESTORE mode first.");
    const usb = this.camera.usbIdentity;
    if (usb?.vendorId !== 1227 || usb.productId !== 773 || this.info.model.trim().toUpperCase() !== "X100VI") throw Error("Camera identity does not match X100VI (USB 04cb:0305)");
    return this.camera;
  }
  async identity() {
    const cam = this.assertConnected();
    const info = await cam.getDeviceInfo();
    const usb = cam.usbIdentity;
    if (!usb || usb.vendorId !== 1227 || usb.productId !== 773 || info.model.trim().toUpperCase() !== "X100VI" || !info.serialNumber || !info.deviceVersion) throw Error("X100VI model/serial/firmware confirmation failed");
    if (!info.properties.includes(PROP_SLOT) || !info.properties.includes(PROP_FILM) || !info.operations.includes(4117) || !info.operations.includes(4118)) throw Error("X100VI preset properties/operations are not available in this USB mode. Select USB RAW CONV./BACKUP RESTORE on the camera.");
    this.info = info;
    return { model: "X100VI", serial: info.serialNumber, firmware: info.deviceVersion, usbVendorId: usb.vendorId, usbProductId: usb.productId };
  }
  /** Browser user gesture required: invokes navigator.usb.requestDevice(). */
  async connect() {
    if (this.busy) throw Error("A camera operation is already running");
    if (this.camera) await this.disconnect();
    this.busy = true;
    try {
      const cam = new FujiCamera((msg) => this.onLog(msg));
      this.camera = cam;
      const result = await cam.connect();
      if (!result.ok) throw Error(`Could not claim X100VI USB device (${result.error}). Close Image Capture/X RAW STUDIO or switch camera USB mode and try again.`);
      this.info = await cam.getDeviceInfo();
      const identity = await this.identity();
      this.snapshot = null;
      this.receipt = null;
      this.onLog(`Connected ${identity.model} firmware ${identity.firmware}, USB 04cb:0305`);
      return identity;
    } catch (error) {
      try {
        await this.camera?.disconnect();
      } catch {
      }
      this.camera = null;
      this.info = null;
      this.snapshot = null;
      this.receipt = null;
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async disconnect() {
    if (this.busy) throw Error("Wait for the camera operation to finish before disconnecting.");
    const cam = this.camera;
    this.camera = null;
    this.info = null;
    this.snapshot = null;
    this.receipt = null;
    await cam?.disconnect();
  }
  /** NOTE: this is not purely read-only; Fuji uses D18C SetDevicePropValue
   * to select a slot before reading its D18D-D1A5 values. We restore the
   * original selector in a finally block and verify the restoration. */
  async capture() {
    const cam = this.assertConnected();
    const camera = await this.identity();
    const originalSlot = slotValue(await cam.readProp(PROP_SLOT));
    const slots = [];
    let restoreFailure = null;
    let readFailure = null;
    let result = null;
    try {
      for (let slot = 1; slot <= 7; slot++) {
        this.onLog(`Reading physical C${slot}/C7 preset properties\u2026`);
        if (!await cam.writePropU16(PROP_SLOT, slot)) throw Error(`Camera refused selection of C${slot}`);
        await sleep(100);
        if (slotValue(await cam.readProp(PROP_SLOT)) !== slot) throw Error(`C${slot} selection did not read back correctly`);
        const nameProp = required(await cam.readProp(PROP_NAME), `C${slot} name`);
        if (typeof nameProp.value !== "string" || !nameProp.value.trim()) throw Error(`C${slot} name was not decoded`);
        const properties = [];
        for (let pid = FIRST_PROP; pid <= LAST_PROP; pid++) {
          const raw = await cam.readProp(pid);
          if (raw) properties.push({ id: pid, hex: toHex(raw.bytes), value: raw.value });
        }
        if (properties.length < 18 || !properties.some((p) => p.id === PROP_FILM && p.hex.length === 4)) throw Error(`C${slot} read incomplete (${properties.length} properties); no backup certified`);
        slots.push({ slot, name: nameProp.value, properties });
      }
      result = { format: "fujix-camera-ptp-presets", version: 1, capturedAt: (/* @__PURE__ */ new Date()).toISOString(), originalSlot, camera, slots };
    } catch (error) {
      readFailure = error;
    } finally {
      try {
        const restored = await cam.writePropU16(PROP_SLOT, originalSlot);
        const confirmed = restored && slotValue(await cam.readProp(PROP_SLOT)) === originalSlot;
        if (!confirmed) restoreFailure = Error(`Could not verify original C${originalSlot} selection was restored`);
      } catch (error) {
        restoreFailure = error;
      }
    }
    if (restoreFailure) throw Error("The camera preset selector could not be restored: " + String(restoreFailure) + (readFailure ? "; scan also failed: " + String(readFailure) : ""));
    if (readFailure) throw readFailure;
    if (!result) throw Error("Camera scan did not return a complete backup");
    return result;
  }
  async scanAndBackup() {
    if (this.busy) throw Error("Camera operation already in progress");
    this.busy = true;
    this.snapshot = null;
    this.receipt = null;
    try {
      const snapshot = await this.capture();
      const r = await fetch("/api/studio/camera-presets/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot }) });
      const saved = await r.json();
      if (!r.ok || saved.ok !== true || saved.stored !== true || saved.slots !== 7) throw Error("Saving camera backup failed: " + (saved.error || "no verified receipt"));
      const check = await fetch("/api/studio/camera-presets/backup/verify?id=" + encodeURIComponent(saved.id) + "&sha256=" + encodeURIComponent(saved.sha256));
      const verified = await check.json();
      if (!check.ok || verified.verified !== true || verified.sha256 !== saved.sha256) throw Error("Camera backup is not verifiably stored; writing is disabled");
      this.snapshot = snapshot;
      this.receipt = saved;
      this.onLog("All seven X100VI presets read and backed up with verified disk SHA-256");
      return { snapshot, receipt: saved };
    } finally {
      this.busy = false;
    }
  }
  /** Write exactly one known two-byte FilmSimulation value to one C slot.
   * All other properties must match the pre-write backup. On any failure after
   * attempted write, send original bytes back and report rollback result. */
  async testOneSimulation(slot, newCode) {
    validSlot(slot);
    if (!SIMULATIONS.some((s) => s.code === newCode)) throw Error("Unsupported film simulation code");
    if (this.busy) throw Error("A camera operation is already running");
    if (!this.snapshot || !this.receipt) throw Error("Read and verify all seven camera slots first");
    this.busy = true;
    let attempted = false;
    let oldFilmHex = "";
    let previousSlot = null;
    let restoredSelector = true;
    let rolledBack = "not-needed";
    try {
      const snapshot = this.snapshot, receipt = this.receipt;
      const check = await fetch("/api/studio/camera-presets/backup/verify?id=" + encodeURIComponent(receipt.id) + "&sha256=" + encodeURIComponent(receipt.sha256));
      if (!check.ok || (await check.json()).verified !== true) throw Error("Stored backup failed integrity verification. Camera write blocked.");
      const before = await this.capture();
      const differences = compare(snapshot, before);
      if (differences.length) throw Error("Camera settings changed since backup; refresh backup before writing: " + differences.slice(0, 3).join("; "));
      const prop = snapshot.slots[slot - 1].properties.find((p) => p.id === PROP_FILM);
      if (!prop || prop.hex.length !== 4) throw Error("Film simulation property missing from verified backup");
      oldFilmHex = prop.hex;
      const oldCode = u16(oldFilmHex);
      if (newCode === oldCode) throw Error("Choose a different film simulation for the one-slot test");
      if (!FilmSimLabels[oldCode] || MONOCHROME_SIMS.has(oldCode) || MONOCHROME_SIMS.has(newCode)) throw Error("First hardware write test is restricted to two recognized color simulations, to avoid monochrome-dependent setting changes.");
      const cam = this.assertConnected();
      previousSlot = slotValue(await cam.readProp(PROP_SLOT));
      try {
        if (!await cam.writePropU16(PROP_SLOT, slot)) throw Error("Could not select target slot");
        await sleep(100);
        if (slotValue(await cam.readProp(PROP_SLOT)) !== slot) throw Error("Target slot not confirmed");
        const current = required(await cam.readProp(PROP_FILM), "original film simulation");
        if (toHex(current.bytes) !== oldFilmHex) throw Error("Target slot changed since backup");
        attempted = true;
        if (!await cam.writePropU16(PROP_FILM, newCode)) throw Error("Camera rejected film simulation write");
        const verify = required(await cam.readProp(PROP_FILM), "written film simulation");
        const newHex = newCode.toString(16).padStart(4, "0").match(/../g).reverse().join("");
        if (toHex(verify.bytes) !== newHex) throw Error("Camera film simulation readback did not match written value");
        const after = await this.capture();
        const changed = compare(snapshot, after, slot, newHex);
        if (changed.length) throw Error("Post-write verification detected changes beyond the requested field: " + changed.slice(0, 4).join("; "));
        this.snapshot = null;
        this.receipt = null;
        this.onLog(`Verified C${slot} film simulation ${FilmSimLabels[oldCode]} \u2192 ${FilmSimLabels[newCode]}; original backup preserved`);
        return { ok: true, slot, from: FilmSimLabels[oldCode] ?? String(oldCode), to: FilmSimLabels[newCode], verified: true };
      } catch (error) {
        if (attempted) {
          try {
            const selected = await cam.writePropU16(PROP_SLOT, slot);
            if (!selected) throw Error("Cannot select slot for rollback");
            await sleep(100);
            const original = new Uint8Array(oldFilmHex.match(/../g).map((byte) => parseInt(byte, 16)));
            if (!await cam.writePropRaw(PROP_FILM, original)) throw Error("Camera rejected original film simulation bytes");
            const rb = required(await cam.readProp(PROP_FILM), "rollback verification");
            if (toHex(rb.bytes) !== oldFilmHex) throw Error("Rollback property did not match original bytes");
            rolledBack = "verified single-property restore";
          } catch (rollbackError) {
            rolledBack = "FAILED/UNVERIFIED: " + String(rollbackError);
          }
          this.snapshot = null;
          this.receipt = null;
        }
        throw Error(String(error) + "; rollback: " + rolledBack);
      } finally {
        try {
          const ok = await cam.writePropU16(PROP_SLOT, previousSlot);
          if (!ok || slotValue(await cam.readProp(PROP_SLOT)) !== previousSlot) restoredSelector = false;
        } catch {
          restoredSelector = false;
        }
        if (!restoredSelector) {
          this.onLog("WARNING: Original active C-slot selection could not be verified as restored. Inspect camera directly.");
          throw Error("Original active camera C-slot could not be verified as restored; inspect the camera directly. Do not continue writing.");
        }
      }
    } finally {
      this.busy = false;
    }
  }
};
export {
  SIMULATIONS,
  X100viPresetBridge
};
