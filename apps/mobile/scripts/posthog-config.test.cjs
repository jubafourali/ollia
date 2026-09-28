const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const mobile = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(mobile, 'src/config/posthog.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function configure(env) {
  let captured;
  class PostHog {
    constructor(key, options) { captured = { key, options }; }
    debug() {}
  }
  const context = {
    exports: {}, process: { env }, __DEV__: false,
    require(name) {
      assert.equal(name, 'posthog-react-native');
      return PostHog;
    },
  };
  vm.runInNewContext(compiled, context);
  return { ...captured, enabled: context.exports.isPostHogEnabled };
}

test('every checked-in build profile uses the project connected to Juba', () => {
  for (const file of ['eas.json', '../../eas.json']) {
    const profiles = JSON.parse(fs.readFileSync(path.resolve(mobile, file))).build;
    for (const [name, profile] of Object.entries(profiles)) {
      const actual = configure(profile.env);
      assert.equal(actual.enabled, true, `${file}:${name}`);
      assert.equal(actual.options.host, 'https://us.i.posthog.com');
      assert.equal(actual.key, 'phc_Ah5wkEXw56gD6cHAUE7Do9iZty8Vd6vXFXCeVs6gHhZz');
      assert.equal(actual.options.captureAppLifecycleEvents, true);
    }
  }
});

test('missing region, missing token or a read-access key cannot enable collection', () => {
  for (const env of [
    {},
    { EXPO_PUBLIC_POSTHOG_KEY: 'phc_test' },
    { EXPO_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' },
    { EXPO_PUBLIC_POSTHOG_KEY: 'phx_read_key', EXPO_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' },
    { EXPO_PUBLIC_POSTHOG_KEY: 'phc_test', EXPO_PUBLIC_POSTHOG_HOST: 'http://us.i.posthog.com' },
  ]) {
    const actual = configure(env);
    assert.equal(actual.enabled, false);
    assert.equal(actual.options.disabled, true);
  }
});

test('an explicitly paired EU project remains supported without silently switching region', () => {
  const actual = configure({
    EXPO_PUBLIC_POSTHOG_KEY: ' phc_test ', EXPO_PUBLIC_POSTHOG_HOST: ' https://eu.i.posthog.com ',
  });
  assert.equal(actual.enabled, true);
  assert.equal(actual.options.host, 'https://eu.i.posthog.com');
  assert.equal(actual.key, 'phc_test');
});
