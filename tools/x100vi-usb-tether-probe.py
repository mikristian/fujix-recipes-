#!/usr/bin/env python3
"""Read-only X100VI USB reconnaissance for testing gPhoto2's 2026 patch.

This script never sends a PTP opcode, takes a photograph, changes camera
settings, or alters firmware. It reads macOS USB device registration only.
When gphoto2 is installed, --gphoto-info runs metadata-only commands.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

FUJI_VENDOR = 0x04CB
X100VI_PRODUCT_IN_GPHOTO = 0x0305


def parse_usb_id(raw: object) -> int | None:
    if isinstance(raw, int):
        return raw
    if not isinstance(raw, str):
        return None
    match = re.search(r"0x[0-9a-fA-F]+", raw)
    if match:
        return int(match.group(), 16)
    if raw.isdigit():
        return int(raw)
    return None


def all_usb_devices(tree: object):
    if isinstance(tree, list):
        for entry in tree:
            yield from all_usb_devices(entry)
    elif isinstance(tree, dict):
        if any(key in tree for key in ("vendor_id", "product_id",
                                      "USBDeviceKeyVendorID", "USBDeviceKeyProductID")):
            yield tree
        for value in tree.values():
            if isinstance(value, (dict, list)):
                yield from all_usb_devices(value)


def read_mac_usb_devices() -> list[dict]:
    # Recent macOS uses SPUSBHostDataType with USBDeviceKey* fields; older
    # versions use SPUSBDataType with vendor_id/product_id. Both are read-only.
    for report in ("SPUSBHostDataType", "SPUSBDataType"):
        process = subprocess.run(
            ["/usr/sbin/system_profiler", report, "-json"],
            capture_output=True, text=True, timeout=40, check=True
        )
        result = json.loads(process.stdout)
        found = list(all_usb_devices(result.get(report, result)))
        if found:
            return found
    return []


def safe_gphoto_info() -> None:
    executable = shutil.which("gphoto2")
    if not executable:
        print("gPhoto2: not installed. We can prepare the current development build separately.")
        return
    print(f"gPhoto2 executable: {executable}")
    for arguments in (("--version",), ("--auto-detect",), ("--abilities",), ("--summary",)):
        print("\n$ gphoto2 " + " ".join(arguments))
        try:
            output = subprocess.run([executable, *arguments], capture_output=True,
                                    text=True, timeout=20, check=False)
            # Never copy an unredacted camera serial into the research report.
            combined = output.stdout + output.stderr
            combined = re.sub(r"(?im)^\s*(serial\s*(?:number|no\.)?)\s*[:=].*$",
                              r"\1: [redacted]", combined)
            print(combined[:8000] or "(no output)")
            print(f"exit={output.returncode}")
        except subprocess.TimeoutExpired:
            print("Timed out. The camera may be busy or owned by macOS Image Capture.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gphoto-info", action="store_true",
                        help="Run only read-only gphoto2 metadata commands, if installed.")
    args = parser.parse_args()
    try:
        devices = read_mac_usb_devices()
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        print(f"USB inventory unavailable: {error}", file=sys.stderr)
        return 2
    cameras = [entry for entry in devices
               if parse_usb_id(entry.get("vendor_id", entry.get("USBDeviceKeyVendorID"))) == FUJI_VENDOR
               or "x100vi" in str(entry.get("_name", "")).lower()]
    print(f"macOS USB enumeration: {len(devices)} enumerated devices.")
    if not cameras:
        print("X100VI NOT DETECTED. Turn camera ON, select USB RAW CONV./BACKUP RESTORE,")
        print("set USB POWER SUPPLY/COMM SETTING to AUTO or POWER SUPPLY OFF/COMM ON,")
        print("and reconnect directly with a data-capable USB-C cable.")
        print("No shutter/capture test has been run.")
        return 1
    for entry in cameras:
        name = entry.get("_name") or "Fujifilm USB device"
        vid = parse_usb_id(entry.get("vendor_id", entry.get("USBDeviceKeyVendorID")))
        pid = parse_usb_id(entry.get("product_id", entry.get("USBDeviceKeyProductID")))
        print(f"DETECTED {name}  VID={f'0x{vid:04x}' if vid is not None else '?'}"
              f"  PID={f'0x{pid:04x}' if pid is not None else '?'}")
        if pid == X100VI_PRODUCT_IN_GPHOTO:
            print("USB product matches the X100VI entry modified by libgphoto2 PR #1327.")
        else:
            print("USB product differs from the gPhoto2 X100VI entry 0x0305.")
            print("This can indicate a different USB connection mode; never force capture on an unidentified device.")
    if args.gphoto_info:
        safe_gphoto_info()
    print("\nREAD-ONLY TEST COMPLETE. No USB control command or photo capture attempted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
