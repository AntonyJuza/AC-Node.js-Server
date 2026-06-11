require('dotenv').config();
const { publishCommand } = require("./src/mqtt/publisher");

publishCommand(
    "AC_TEST_001",
    "power_on"
);
