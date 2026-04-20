#!/usr/bin/env node
/**
 * Unit-style tests for src/lib/pwa/deviceDetection.ts.
 *
 * Stubs globalThis.navigator for each scenario and asserts getDeviceKind()
 * returns the expected DeviceKind. Run with: `npm run test:device`
 *
 * Exit 0 on all pass, 1 on any failure.
 */
import assert from 'node:assert/strict';

const CASES = [
  {
    name: 'iPhone UA -> iphone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    expected: 'iphone',
  },
  {
    name: 'Legacy iPad UA -> ipad',
    ua: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    expected: 'ipad',
  },
  {
    name: 'iPadOS 13+ Mac UA + maxTouchPoints > 1 -> ipad',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    maxTouchPoints: 5,
    expected: 'ipad',
  },
  {
    name: 'Mac UA + maxTouchPoints = 0 -> desktop',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    maxTouchPoints: 0,
    expected: 'desktop',
  },
  {
    name: 'Android UA with Mobile -> android-phone',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: 5,
    expected: 'android-phone',
  },
  {
    name: 'Android UA without Mobile -> android-tablet',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    maxTouchPoints: 5,
    expected: 'android-tablet',
  },
  {
    name: 'Chrome Windows UA -> desktop',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
    expected: 'desktop',
  },
];

function stubNavigator(ua, maxTouchPoints) {
  // Node >=20 defines globalThis.navigator as a non-writable getter. Use
  // defineProperty to replace it with a configurable, writable stub so we
  // can swap it per test case.
  const stub = {
    userAgent: ua,
    maxTouchPoints,
    platform:
      ua.includes('Win')
        ? 'Win32'
        : ua.includes('Mac') || ua.includes('iPad') || ua.includes('iPhone')
          ? 'MacIntel'
          : 'Linux',
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: stub,
    writable: true,
    configurable: true,
  });
}

async function run() {
  // Import with cache-busting per iteration so module-level reads (if any) re-run.
  // getDeviceKind() should itself read navigator dynamically, so one import is fine.
  const mod = await import('../src/lib/pwa/deviceDetection.ts');
  const { getDeviceKind } = mod;

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const tc of CASES) {
    stubNavigator(tc.ua, tc.maxTouchPoints);
    try {
      const got = getDeviceKind();
      assert.equal(got, tc.expected, `${tc.name}: expected ${tc.expected}, got ${got}`);
      console.log(`  PASS  ${tc.name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${tc.name}`);
      console.log(`        ${err.message}`);
      failed++;
      failures.push({ name: tc.name, message: err.message });
    }
  }

  console.log('');
  console.log(`Total: ${CASES.length}  Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
