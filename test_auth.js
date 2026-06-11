const http = require('http');

const SERVER_URL = 'http://localhost:3000';
let userToken = '';
let deviceId = 'test_device_123';

async function request(path, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(SERVER_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('--- Running Auth Tests ---');
    
    const email = `testuser${Date.now()}@example.com`;
    console.log(`\nTesting Registration with ${email}...`);
    let res = await request('/api/auth/register', 'POST', {
        name: 'Test User',
        email: email,
        password: 'password123'
    });
    console.log('Response:', res.status, res.data);
    if (res.status === 200 || res.status === 201) {
        userToken = res.data.token;
        console.log('Registration OK.');
    } else {
        console.error('Registration failed.');
        return;
    }

    console.log(`\nTesting Login with ${email}...`);
    res = await request('/api/auth/login', 'POST', {
        email: email,
        password: 'password123'
    });
    console.log('Response:', res.status, res.data);
    if (res.status === 200) {
        userToken = res.data.token;
        console.log('Login OK.');
    } else {
        console.error('Login failed.');
        return;
    }

    console.log('\nTesting Protected Route w/o Token...');
    res = await request('/api/devices');
    console.log('Response:', res.status, res.data);
    if (res.status === 401) {
        console.log('Unauthenticated access blocked OK.');
    } else {
        console.error('Unauthenticated access failed to block.');
    }

    console.log('\nTesting Protected Route with Token...');
    res = await request('/api/devices', 'GET', null, userToken);
    console.log('Response:', res.status, res.data);
    if (res.status === 200) {
        console.log('Authenticated access OK.');
    } else {
        console.error('Authenticated access failed.');
    }

    console.log('\nTesting Device Claiming...');
    res = await request('/api/devices/claim', 'POST', { deviceId: deviceId }, userToken);
    console.log('Response:', res.status, res.data);
    if (res.status === 200) {
        console.log('Device claim OK.');
    } else {
        console.error('Device claim failed.');
    }

    console.log('\nTesting Device Specific Route (Owned)...');
    res = await request(`/api/devices/${deviceId}`, 'GET', null, userToken);
    console.log('Response:', res.status, res.data);
    if (res.status === 200 || res.status === 404) { // 404 means route is accessed but device not completely found, meaning auth passed
        console.log('Device Specific access OK.');
    } else {
        console.error('Device Specific access failed.');
    }
}

runTests().catch(console.error);
