import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {FLAPPING_DEFAULTS, validateFlapping} from './flapping.js';

// Exercise the actual page save handlers without loading browser/Three.js code.
const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const handlers = section('async function saveFlight(event)', 'function beginnerSensitivityLevel')
  + section('async function saveBeginnerFlightOrientation(form)', 'function sleep(ms)')
  + section('function readFlappingForm(', 'function renderFlappingCard()');

function fixture(beginner, enabled, legacy = false) {
  const wing = structuredClone(FLAPPING_DEFAULTS);
  wing.enabled = enabled;
  wing.differential_percent = 27;
  wing.left = {output: 1, up_us: 1400, down_us: 1800, park_us: 1500};
  wing.right = {output: 2, up_us: 1600, down_us: 1200, park_us: 1500};
  const device = {fc_arm_enabled: true, fc_arm_channel: 5, fc_arm_range: [1700, 2100],
    fc_rate_pid: Array(12).fill(1), fc_rate_ff: [0, 0, 0],
    pwm: [{config: 0, pin: 1}, {config: 0, pin: 2}],
    fc_flapping: {...structuredClone(wing), enabled: !enabled, differential_percent: 20}};
  if (legacy) delete device.fc_flapping;
  const elements = {};
  const input = (name, value) => elements[name] = {name, value: String(value), checked: value === true};
  for (const [key, value] of Object.entries(wing)) {
    if (key === 'left' || key === 'right') {
      for (const [field, v] of Object.entries(value)) input(`flapping_${key}_${field}`, v);
    } else input(`flapping_${key}`, value);
  }
  for (const [key, value] of Object.entries({fc_arm_enabled: true, fc_arm_channel: 5, fc_arm_start: 1700,
    fc_arm_end: 2100, fc_rate_enabled: false, fc_angle_enabled: false, fc_wifi_coexist_enabled: false,
    fc_dterm_lpf_hz: 0, fc_gyro_lpf_hz: 0, fc_angle_rate_lpf_hz: 5, fc_gyro_bias_mode: 0})) input(key, value);
  const form = {...elements, elements};
  const writes = [];
  const state = {beginnerMode: beginner, target: {}, profileDraft: null, orientationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1]};
  let restored = false;
  const context = vm.createContext({
    state, Object, Number, String, FLAPPING_DEFAULTS, config: () => device,
    DEFAULT_DTERM_LPF_HZ: 0, DEFAULT_GYRO_LPF_HZ: 0, DEFAULT_ANGLE_RATE_LPF_HZ: 5,
    document: {querySelector: () => null}, // runBusy replaces the live form; handlers must retain it.
    validatedFlapping: validateFlapping, flightConfigValue: (key, fallback) => device[key] ?? fallback,
    intOrDefault: (v, d) => Number.parseInt(v, 10) || d,
    orientationMatrixOrIdentity: (v) => v, round4: (v) => v, t: (key) => key,
    readBeginnerRatePid: () => Array(12).fill(2), readBeginnerRateFeedforward: () => [1, 1, 1],
    readNumGrid: (_form, key, rows, cols) => Array(rows * cols).fill(key === 'fc_accel_scale' ? 1 : 0),
    readMixerServos: () => [false, true], motorCount: () => 2,
    apiFetch: async (_url, options) => { writes.push(JSON.parse(options.body)); },
    loadDevice: async () => {}, markProfileSectionApplied: () => {},
    setMessage: (type, text) => { state.message = {type, text}; },
    restoreFlightForm: () => { restored = true; },
    runBusy: async (task, message) => {
      await task();
      state.message = {type: 'ok', text: message};
    },
  });
  vm.runInContext(handlers, context);
  return {context, state, elements, writes, wing, restored: () => restored,
    save: () => context.saveFlight({currentTarget: form, preventDefault() {}})};
}

for (const beginner of [true, false]) {
  test(`${beginner ? 'beginner' : 'expert'} shared save persists edited wing toggle and parameters`, async () => {
    for (const enabled of [true, false]) {
      const f = fixture(beginner, enabled);
      await f.save();
      assert.equal(f.writes.length, 1);
      assert.deepEqual(f.writes[0].fc_flapping, f.wing);
      assert.equal(f.writes[0].fc_arm_enabled, true);
      assert.equal(f.writes[0].pwm, undefined);
      assert.equal(f.writes[0].fc_rate_pid[0], beginner ? 2 : 0);
    }
  });
  test(`${beginner ? 'beginner' : 'expert'} shared save rejects invalid calibration before writing`, async () => {
    const f = fixture(beginner, true);
    f.elements.flapping_left_down_us.value = '1400';
    await f.save();
    assert.equal(f.writes.length, 0);
    assert.equal(f.state.message.text, 'calibration');
    assert.equal(f.restored(), true);
  });
  test(`${beginner ? 'beginner' : 'expert'} legacy firmware save omits flapping`, async () => {
    const f = fixture(beginner, false, true);
    await f.save();
    assert.equal(f.writes.length, 1);
    assert.equal(Object.hasOwn(f.writes[0], 'fc_flapping'), false);
  });
}
