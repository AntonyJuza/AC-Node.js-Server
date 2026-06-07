const assert = require('assert');

const BASE_URL = 'http://localhost:3000/api';
const testUser = {
    name: 'Test User',
    email: `test_${Date.now()}@example.com`,
    password: 'password123'
};
const testDeviceId = `AC_TEST_${Math.floor(Math.random() * 100000)}`;

async function runTests() {
    console.log('=== STARTING AUTHENTICATION AND SECURITY TESTS ===');
    let token = '';
    let claimedDeviceId = testDeviceId;

    // 1. Try to register a user
    try {
        console.log(`[TEST] Registering user: ${testUser.email}...`);
        const res = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        });
        const data = await res.json();
        assert.strictEqual(res.status, 201, 'Register status should be 201');
        assert.ok(data.success, 'Register response success should be true');
        assert.ok(data.token, 'Register response should contain token');
        console.log('✔ User registration successful.');
    } catch (err) {
        console.error('✘ User registration failed:', err.message);
        process.exit(1);
    }

    // 2. Try to login user
    try {
        console.log(`[TEST] Logging in user: ${testUser.email}...`);
        const res = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testUser.email,
                password: testUser.password
            })
        });
        const data = await res.json();
        assert.strictEqual(res.status, 200, 'Login status should be 200');
        assert.ok(data.success, 'Login response success should be true');
        assert.ok(data.token, 'Login response should contain token');
        token = data.token;
        console.log('✔ User login successful.');
    } catch (err) {
        console.error('✘ User login failed:', err.message);
        process.exit(1);
    }

    // 3. Try to access protected endpoint /api/devices without token
    try {
        console.log('[TEST] Fetching devices without token (should be unauthorized)...');
        const res = await fetch(`${BASE_URL}/devices`);
        assert.strictEqual(res.status, 401, 'Accessing protected endpoint without token should return 401');
        console.log('✔ Unauthenticated access blocked correctly.');
    } catch (err) {
        console.error('✘ Unauthenticated access test failed:', err.message);
        process.exit(1);
    }

    // 4. Try to access protected endpoint with invalid token
    try {
        console.log('[TEST] Fetching devices with invalid token (should be unauthorized)...');
        const res = await fetch(`${BASE_URL}/devices`, {
            headers: { 'Authorization': 'Bearer invalid_token_value' }
        });
        assert.strictEqual(res.status, 401, 'Accessing protected endpoint with invalid token should return 401');
        console.log('✔ Invalid token access blocked correctly.');
    } catch (err) {
        console.error('✘ Invalid token test failed:', err.message);
        process.exit(1);
    }

    // 5. Try to access device details before claiming it
    try {
        console.log(`[TEST] Fetching device ${claimedDeviceId} details before claiming (should be forbidden)...`);
        const res = await fetch(`${BASE_URL}/devices/${claimedDeviceId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        assert.strictEqual(res.status, 403, 'Accessing unclaimed device should return 403');
        console.log('✔ Access to unclaimed device blocked correctly.');
    } catch (err) {
        console.error('✘ Unclaimed device test failed:', err.message);
        process.exit(1);
    }

    // 6. Claim a device
    try {
        console.log(`[TEST] Claiming device: ${claimedDeviceId}...`);
        const res = await fetch(`${BASE_URL}/devices/claim`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ deviceId: claimedDeviceId })
        });
        const data = await res.json();
        assert.strictEqual(res.status, 200, 'Claim device status should be 200');
        assert.ok(data.success, 'Claim device response success should be true');
        assert.ok(data.devices.includes(claimedDeviceId), 'Claimed device should be in user\'s devices list');
        console.log('✔ Device claiming successful.');
    } catch (err) {
        console.error('✘ Device claiming failed:', err.message);
        process.exit(1);
    }

    // 7. Fetch user devices (should contain the claimed device)
    try {
        console.log('[TEST] Listing devices for authenticated user...');
        const res = await fetch(`${BASE_URL}/devices`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        assert.strictEqual(res.status, 200, 'Get devices status should be 200');
        assert.ok(data.success, 'Get devices success should be true');
        const hasDevice = data.data.some(d => d.deviceId === claimedDeviceId);
        assert.ok(hasDevice, 'Device list should contain the claimed device');
        console.log('✔ Claimed device is correctly listed in user devices.');
    } catch (err) {
        console.error('✘ Listing devices test failed:', err.message);
        process.exit(1);
    }

    // 8. Fetch specific device state (should succeed now that it's claimed)
    try {
        console.log(`[TEST] Fetching device ${claimedDeviceId} details after claiming...`);
        const res = await fetch(`${BASE_URL}/devices/${claimedDeviceId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        assert.strictEqual(res.status, 200, 'Get device details should be 200 after claiming');
        console.log('✔ Accessing claimed device details successful.');
    } catch (err) {
        console.error('✘ Claimed device details test failed:', err.message);
        process.exit(1);
    }

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
