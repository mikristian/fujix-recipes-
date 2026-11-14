#!/usr/bin/env node
// Stable JSON interface for a future Chromaforge native integration.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const emit = (data, status = 0) => {
  process.stdout.write(`${JSON.stringify(data)}\n`);
  process.exit(status);
};
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('fujix-camera-bridge-cli --capabilities | --convert <RAF> | --help\n');
  process.exit(0);
}
if (args[0] === '--convert') {
  emit({ ok: false, error: 'conversion_not_validated', conversion_available: false,
    detail: 'No validated native camera conversion transaction or output verification exists yet.' }, 3);
}
if (args.length !== 1 || args[0] !== '--capabilities') {
  emit({ ok: false, error: 'invalid_arguments', conversion_available: false }, 64);
}
if (process.platform !== 'darwin') {
  emit({ ok: false, error: 'macos_required', conversion_available: false }, 2);
}
const binary = join(dirname(fileURLToPath(import.meta.url)), 'fujix-camera-bridge');
if (!existsSync(binary)) {
  emit({ ok: false, error: 'native_helper_missing', conversion_available: false,
    detail: 'Compile fujix-camera-bridge.m with clang and the Foundation/ImageCaptureCore frameworks.' }, 2);
}
const result = spawnSync(binary, ['--capabilities'], { encoding: 'utf8', timeout: 16000,
  maxBuffer: 128 * 1024, env: process.env });
if (result.error) {
  emit({ ok: false, error: result.error.code === 'ETIMEDOUT' ? 'helper_timeout' : 'helper_failed',
    conversion_available: false }, 2);
}
try {
  const data = JSON.parse(result.stdout.trim());
  if (!data || typeof data !== 'object' || typeof data.ok !== 'boolean' ||
      data.conversion_available !== false ||
      (data.ok && (data.device !== 'X100VI' || !Number.isInteger(data.usb_mode)))) {
    throw new Error('invalid helper response');
  }
  emit(data, result.status === 0 && data.ok ? 0 : 2);
} catch {
  emit({ ok: false, error: 'invalid_helper_response', conversion_available: false }, 2);
}
