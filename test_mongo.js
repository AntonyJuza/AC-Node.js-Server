require('dotenv').config({ path: 'c:/Users/Juza/AC-Node.js-Server/.env' });
const mongoose = require('mongoose');
const Device = require('c:/Users/Juza/AC-Node.js-Server/models/Device');

async function test() {
    const uri = process.env.MONGO_URI;
    console.log("URI:", uri);
    await mongoose.connect(uri);
    console.log("Connected.");
    const devices = await Device.find({});
    console.log("ALL DEVICES IN MONGO:", JSON.stringify(devices, null, 2));
    process.exit(0);
}
test().catch(err => {
    console.error(err);
    process.exit(1);
});
