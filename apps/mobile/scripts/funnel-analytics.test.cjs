const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/funnelAnalytics.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const DAY = 86400000;
function setup(enabled = true) {
  const storage = new Map(); const events = []; let now = Date.UTC(2026, 8, 29); let identity;
  let failStorage = false;
  const context = { exports: {}, Date: { now: () => now }, require(name) {
    if (name === '@react-native-async-storage/async-storage') return {
      async getItem(k) { if (failStorage) throw Error('unavailable'); return storage.get(k) ?? null; },
      async setItem(k, v) { if (failStorage) throw Error('unavailable'); storage.set(k, v); },
    };
    if (name === '@/config/posthog') return { isPostHogEnabled: enabled, posthog: {
      identify(id) { identity = id; }, capture(event, props) { events.push({ event, props, identity }); },
    } };
    throw Error(name);
  } };
  vm.runInNewContext(compiled, context);
  return { api: context.exports, storage, events, advance: days => now += days * DAY,
    breakStorage: () => failStorage = true };
}
const signup = { status: 'complete', createdUserId: 'new-user', createdSessionId: 'new-session' };

test('completed signup records the new account once, including concurrent callbacks', async () => {
  const x = setup();
  await Promise.all([x.api.trackAccountCreated(signup, 'new-session'), x.api.trackAccountCreated(signup, 'new-session')]);
  assert.equal(x.events.length, 1);
  assert.equal(x.events[0].event, 'account_created');
  assert.equal(x.events[0].identity, 'new-user');
});
test('returning login, incomplete signup and stale SSO signup cannot count as new accounts', async () => {
  const x = setup();
  await x.api.trackAccountCreated(undefined, 'login-session');
  await x.api.trackAccountCreated({ ...signup, status: 'missing_requirements' }, 'new-session');
  await x.api.trackAccountCreated(signup, 'different-session');
  await x.api.trackAccountCreated({ ...signup, createdUserId: null }, 'new-session');
  assert.equal(x.events.length, 0);
});
test('D7 return requires observed activation and counts once at day 7', async () => {
  const x = setup(); x.api.setFunnelAnalyticsUser('owner');
  await x.api.trackActivatedReturn('circle');
  assert.equal(x.events.length, 0);
  await x.api.recordObservedActivation('circle');
  x.advance(6.99); await x.api.trackActivatedReturn('circle');
  assert.equal(x.events.length, 0);
  x.advance(.01);
  await Promise.all([x.api.trackActivatedReturn('circle'), x.api.trackActivatedReturn('circle')]);
  assert.equal(x.events.length, 1);
  assert.equal(x.events[0].event, 'activated_user_returned_7d');
  assert.equal(x.events[0].props.days_since_activation, 7);
  x.advance(1); await x.api.trackActivatedReturn('circle');
  assert.equal(x.events.length, 1);
});
test('retention does not cross accounts or circles or reset the activation clock', async () => {
  const x = setup(); x.api.setFunnelAnalyticsUser('owner');
  await x.api.recordObservedActivation('circle');
  x.advance(7); await x.api.recordObservedActivation('circle');
  await x.api.trackActivatedReturn('another-circle');
  x.api.setFunnelAnalyticsUser('other'); await x.api.trackActivatedReturn('circle');
  x.api.setFunnelAnalyticsUser(null); await x.api.trackActivatedReturn('circle');
  assert.equal(x.events.length, 0);
  x.api.setFunnelAnalyticsUser('owner'); await x.api.trackActivatedReturn('circle');
  assert.equal(x.events.length, 1);
});
test('day 14 is outside the declared return window; corrupt dates are not evidence', async () => {
  const x = setup(); x.api.setFunnelAnalyticsUser('owner');
  await x.api.recordObservedActivation('circle'); x.advance(14);
  await x.api.trackActivatedReturn('circle');
  x.storage.set('@ollia_activation_time_v1:owner:circle', 'invalid');
  await x.api.trackActivatedReturn('circle');
  assert.equal(x.events.length, 0);
});
test('disabled analytics and storage failures do not block authentication or fabricate retention', async () => {
  const x = setup(false); x.api.setFunnelAnalyticsUser('owner');
  await x.api.trackAccountCreated(signup, 'new-session');
  await x.api.recordObservedActivation('circle'); x.advance(7); await x.api.trackActivatedReturn('circle');
  assert.equal(x.events.length, 0); assert.equal(x.storage.size, 0);
  const broken = setup(); broken.breakStorage();
  await assert.doesNotReject(broken.api.trackAccountCreated(signup, 'new-session'));
  assert.equal(broken.events.length, 0);
});

test('queued signup cannot change analytics identity after an account switch', async () => {
  const x = setup();
  const pending = x.api.trackAccountCreated(signup, 'new-session');
  x.api.setFunnelAnalyticsUser('different-user');
  await pending;
  assert.equal(x.events.length, 0);
});

test('signup evidence survives Clerk resource reset after successful session activation', async () => {
  const x = setup(); const mutable = { ...signup };
  const snapshot = x.api.signupSnapshot(mutable);
  mutable.status = null; mutable.createdUserId = null; mutable.createdSessionId = null;
  await x.api.trackAccountCreated(snapshot, 'new-session');
  assert.equal(x.events.length, 1);
});

function analyticsHooks() {
  const calls = []; const storage = new Map();
  const context = { exports: {}, require(name) {
    if (name === '@react-native-async-storage/async-storage') return {
      async getItem(k) { return storage.get(k) ?? null; }, async setItem(k, v) { storage.set(k, v); },
    };
    if (name === '@/config/posthog') return { posthog: {
      capture(event) { calls.push(event); }, register() {}, identify() {}, reset() {},
    } };
    if (name === './funnelAnalytics') return {
      async recordObservedActivation() { calls.push('activation-clock'); },
      async trackActivatedReturn() { calls.push('return-check'); },
      setFunnelAnalyticsUser(id) { calls.push(['identity', id]); },
    };
    throw Error(name);
  } };
  const module = fs.readFileSync(path.join(__dirname, '../src/utils/analytics.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(module, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);
  return { api: context.exports, calls };
}
test('activation clock only starts after viewed reassurance and two joined members', async () => {
  const x = analyticsHooks();
  await x.api.maybeTrackCircleActivated({ circleId: 'c', memberCount: 2 });
  assert.equal(x.calls.includes('activation-clock'), false);
  await x.api.trackReassuranceStateViewed({ circleId: 'c', memberCount: 1 });
  assert.equal(x.calls.includes('activation-clock'), false);
  await x.api.maybeTrackCircleActivated({ circleId: 'c', memberCount: 2 });
  await x.api.maybeTrackCircleActivated({ circleId: 'c', memberCount: 2 });
  assert.equal(x.calls.filter(x => x === 'activation-clock').length, 1);
  assert.equal(x.calls.filter(x => x === 'circle_activated').length, 1);
});
test('only the owner manual heartbeat checks return eligibility and sign-out clears identity', async () => {
  const x = analyticsHooks();
  await x.api.setAnalyticsRole('watched'); await x.api.trackHeartbeat('c');
  assert.equal(x.calls.includes('return-check'), false);
  await x.api.setAnalyticsRole('worrier'); await x.api.trackHeartbeat('c');
  assert.equal(x.calls.filter(x => x === 'return-check').length, 1);
  x.api.identifyUser('owner'); await x.api.resetAnalytics();
  assert.equal(x.calls.at(-1)[0], 'identity');
  assert.equal(x.calls.at(-1)[1], null);
});
