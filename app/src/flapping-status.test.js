import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('function flappingStatusHtml()'), source.indexOf('function renderFlappingCard()'));
const locales = ['zh-CN', 'en'].map((locale) => JSON.parse(readFileSync(new URL(`./locales/${locale}.json`, import.meta.url), 'utf8')));
const html = (status, connected = true, locale = locales[0]) => {
  const context = vm.createContext({
    state: {connectionStatus: connected ? 'connected' : 'idle', flappingStatus: status},
    t: (key) => key.split('.').reduce((value, part) => value?.[part], locale) ?? key,
    escapeHtml: (value) => String(value).replaceAll('<', '&lt;'),
  });
  return vm.runInContext(`${render}\nflappingStatusHtml()`, context);
};

test('offline and older firmware do not claim flapping is ready', () => {
  assert.equal(html(null, false), '');
  assert.match(html(null), /当前固件未提供扑翼运行状态/);
});

test('show the received throttle and ARM values and explain the zero gate', () => {
  const output = html({reason: 'waiting_zero', throttle_channel: 3, arm_channel: 5,
    throttle_us: 1000, arm_us: 2012, left_us: 1500, right_us: 1500, frequency_hz: 0});
  assert.match(output, /等待解锁后的零油门/);
  assert.match(output, /CH3: 1000 \/ CH5: 2012 μs/);
  assert.match(output, /≤998μs/);
  assert.match(output, /非舵机位置反馈/);
});

test('every receiver runtime reason and configuration failure has translated text', () => {
  for (const locale of locales) {
    for (const reason of ['waiting', 'disabled', 'pwm_test', 'wifi_only', 'rc_unavailable', 'disarmed',
      'configuration_invalid', 'configuration_changed', 'waiting_zero', 'idle', 'parking', 'starting', 'running']) {
      assert.doesNotMatch(html({reason}, true, locale), /flapping\.reason\./);
    }
    assert.ok(html({reason: 'configuration_invalid',
      configuration_error: 'Flapping requires two standard PWM servo outputs'}, true, locale)
      .includes(locale.flapping.error.output));
  }
});
