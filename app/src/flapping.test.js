import test from 'node:test';
import assert from 'node:assert/strict';
import {FLAPPING_DEFAULTS, validateFlapping, flappingPayload} from './flapping.js';

const wings = () => ({...validateFlapping(), enabled: true,
  left: {output: 1, up_us: 1400, down_us: 1800, park_us: 1500},
  right: {output: 2, up_us: 1600, down_us: 1200, park_us: 1500}});
const device = {fc_arm_enabled: true, fc_arm_channel: 5, fc_wifi_conditions: {coexist: [7, 1700, 2100]},
  pwm: [{config: 0, pin: 1}, {config: 0, pin: 2}], fc_pwm_output_limits: [[1000, 1500, 2000], [1000, 1500, 2000]]};
test('old profiles default to disabled with independent nested defaults', () => {
  const a = validateFlapping(); a.left.up_us = 1000;
  assert.deepEqual(validateFlapping(), FLAPPING_DEFAULTS);
});
test('calibrated mirrored outputs survive JSON round trip', () => {
  const s = wings();
  assert.deepEqual(validateFlapping(JSON.parse(JSON.stringify(s)), device), s);
  assert.throws(() => validateFlapping({...FLAPPING_DEFAULTS, enabled: true}, device), /calibration/);
});
test('reject invalid fields, duplicate mappings and nonfinite parameters', () => {
  for (const patch of [{enabled: 1}, {reverse_steering: 1}, {throttle_channel: 1}, {steering_channel: 17},
    {min_hz: NaN}, {max_hz: Infinity}, {min_hz: 3}, {downstroke_percent: 19}, {differential_percent: 51},
    {left: {...wings().left, output: 2}}, {right: {...wings().right, up_us: 1500.5}}]) {
    assert.throws(() => validateFlapping({...wings(), ...patch}, device), /parameters/);
  }
});
test('requires arm, independent inputs and exclusive operating mode', () => {
  assert.throws(() => validateFlapping(wings(), {...device, fc_arm_enabled: false}), /arm/);
  assert.throws(() => validateFlapping(wings(), {...device, fc_drift: {enabled: true}}), /exclusive/);
  for (const channel of [5, 7]) assert.throws(() => validateFlapping({...wings(), throttle_channel: channel}, device), /channel/);
});
test('validates real output count, PWM mode, limits and refresh rate', () => {
  for (const raw of [6 << 15, 8 << 15, 1 << 19]) assert.throws(() => validateFlapping(wings(), {...device, pwm: [raw, 0]}), /output/);
  assert.throws(() => validateFlapping(wings(), {...device, pwm: [0]}), /output/);
  assert.throws(() => validateFlapping(wings(), {...device, fc_pwm_output_limits: [[1450, 1500, 1550]]}), /limits/);
  assert.throws(() => validateFlapping({...wings(), max_hz: 5}, device), /frequency/);
  assert.doesNotThrow(() => validateFlapping({...wings(), max_hz: 5}, {...device, pwm: [2 << 15, 2 << 15]}));
});
test('old firmware never receives enabled flapping or unknown fields', () => {
  assert.deepEqual(flappingPayload({fc_flapping: validateFlapping(), modelid: 1}, {}), {modelid: 1});
  assert.throws(() => flappingPayload({fc_flapping: wings()}, {}), /unsupported/);
  assert.deepEqual(flappingPayload({fc_flapping: wings()}, {fc_flapping: {}}), {fc_flapping: wings()});
});
