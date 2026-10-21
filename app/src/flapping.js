export const FLAPPING_DEFAULTS = {
  enabled: false, throttle_channel: 3, steering_channel: 1,
  min_hz: 0.5, max_hz: 2, downstroke_percent: 35, differential_percent: 20,
  reverse_steering: false,
  left: {output: 1, up_us: 1500, down_us: 1500, park_us: 1500},
  right: {output: 2, up_us: 1500, down_us: 1500, park_us: 1500},
};

export function validateFlapping(value, context) {
  const s = value === undefined ? structuredClone(FLAPPING_DEFAULTS) : value;
  const num = (v, lo, hi, integer = false) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!integer || Number.isInteger(v));
  if (!s || typeof s.enabled !== 'boolean' || typeof s.reverse_steering !== 'boolean' ||
      !num(s.throttle_channel, 1, 16, true) || !num(s.steering_channel, 1, 16, true) || s.throttle_channel === s.steering_channel ||
      !num(s.min_hz, 0.1, 10) || !num(s.max_hz, 0.1, 10) || s.min_hz > s.max_hz ||
      !num(s.downstroke_percent, 20, 50) || !num(s.differential_percent, 0, 50) ||
      ![s.left, s.right].every((w) => w && num(w.output, 1, 16, true) && ['up_us', 'down_us', 'park_us'].every((key) => num(w[key], 500, 2500, true))) ||
      s.left.output === s.right.output) throw new Error('parameters');
  if (s.enabled) {
    if ([s.left, s.right].some((w) => w.up_us === w.down_us)) throw new Error('calibration');
    if (context) {
      if (!context.fc_arm_enabled) throw new Error('arm');
      if (context.fc_drift?.enabled) throw new Error('exclusive');
      const channels = [s.throttle_channel, s.steering_channel];
      if (channels.includes(context.fc_arm_channel) || channels.includes(context.fc_wifi_conditions?.coexist?.[0])) throw new Error('channel');
      for (const wing of [s.left, s.right]) {
        const entry = context.pwm?.[wing.output - 1];
        const raw = typeof entry === 'number' ? entry : entry?.config;
        const mode = (raw >>> 15) & 15;
        if (raw === undefined || !Number.isInteger(raw) || mode > 5 || ((raw >>> 19) & 1) || entry?.pin === -1) throw new Error('output');
        const limits = context.fc_pwm_output_limits?.[wing.output - 1] ?? [1000, 1500, 2000];
        if ([wing.up_us, wing.down_us, wing.park_us].some((v) => v < limits[0] || v > limits[2])) throw new Error('limits');
        const hz = [50, 60, 100, 160, 333, 400][mode];
        if (hz * s.downstroke_percent / 100 + 0.0001 < 4 * s.max_hz) throw new Error('frequency');
      }
    }
  }
  return structuredClone(s);
}

// Omit unsupported fields without dropping ordinary settings from old devices.
export function flappingPayload(payload, device) {
  const result = {...payload};
  if (!Object.hasOwn(device, 'fc_flapping')) {
    if (result.fc_flapping?.enabled) throw new Error('unsupported');
    delete result.fc_flapping;
  }
  return result;
}
