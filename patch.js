const fs = require('fs');
const path = '/home/juza/Arduino/ac_ble/ac_ble.ino';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('#include <HTTPClient.h>', 
`#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// Azure IoT Hub MQTT Credentials
const char* mqtt_server = "ac-automation-hub.azure-devices.net";
const int mqtt_port = 8883;
const char* mqtt_user = "ac-automation-hub.azure-devices.net/YOUR_DEVICE_ID/?api-version=2021-04-12";
const char* mqtt_password = "YOUR_SAS_TOKEN"; // Generate via Azure CLI: az iot hub generate-sas-token -d YOUR_DEVICE_ID -n ac-automation-hub

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);`);

content = content.replace('const char* SUPABASE_URL  = "http://64.227.129.89:3000"; \nconst char* SUPABASE_KEY  = "not_needed";\n', '');

content = content.replace(/void logToSupabase\(String eventName\) \{[\s\S]*?http\.end\(\);\n\}/, 
`void logToSupabase(String eventName) {
  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Not connected, cannot log.");
    return;
  }
  
  DynamicJsonDocument doc(128);
  doc["event"] = eventName;
  doc["deviceId"] = deviceId;
  String jsonStr;
  serializeJson(doc, jsonStr);

  String topic = String("devices/") + deviceId + "/messages/events/";
  
  if (mqttClient.publish(topic.c_str(), jsonStr.c_str())) {
    Serial.println("[MQTT] Log sent: " + jsonStr);
  } else {
    Serial.println("[MQTT] Log failed");
  }
}`);

content = content.replace(/void syncDeviceToCloud\(\) \{[\s\S]*?http\.end\(\);\n\}/, 
`void syncDeviceToCloud() {
  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Not connected, cannot sync device metadata.");
    return;
  }

  DynamicJsonDocument doc(128);
  doc["event"] = "SYNC";
  doc["deviceId"] = deviceId;
  String cfgName = "NONE";
  if (dynamicConfigName.length() > 0) {
    cfgName = dynamicConfigName;
  } else if (activeProfileIdx >= 0) {
    cfgName = profiles[activeProfileIdx].name;
  }
  doc["activeConfigName"] = cfgName;
  
  String jsonStr;
  serializeJson(doc, jsonStr);

  String topic = String("devices/") + deviceId + "/messages/events/";
  
  if (mqttClient.publish(topic.c_str(), jsonStr.c_str())) {
    Serial.println("[MQTT] Device Sync OK: " + cfgName);
  } else {
    Serial.println("[MQTT] Device Sync Error");
  }
}`);

content = content.replace(/void initWiFi\(\) \{[\s\S]*?syncDeviceToCloud\(\);\n/, 
`void reconnectMQTT() {
  if (!mqttClient.connected()) {
    Serial.print("[MQTT] Connecting to Azure IoT Hub...");
    espClient.setInsecure(); // Bypass cert validation for simplicity, or provide Baltimore CyberTrust Root CA
    mqttClient.setServer(mqtt_server, mqtt_port);
    
    // Connect with deviceId as clientId
    if (mqttClient.connect(deviceId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("connected");
      // Subscribe to C2D messages
      String subTopic = String("devices/") + deviceId + "/messages/devicebound/#";
      mqttClient.subscribe(subTopic.c_str());
    } else {
      Serial.print("failed, rc=");
      Serial.println(mqttClient.state());
    }
  }
}

void initWiFi() {
  if (wifiSsid.length() == 0) {
    Serial.println("[WIFI] No SSID set. Skipping connection.");
    notifyStatus("WIFI_STATUS:NO_CREDS");
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    WiFi.disconnect();
    delay(500);
  }

  Serial.print("[WIFI] Connecting to ");
  Serial.println(wifiSsid);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\n[WIFI] Connected! IP: " + WiFi.localIP().toString());
    notifyStatus("WIFI_STATUS:CONNECTED");
    
    reconnectMQTT();
    syncDeviceToCloud();\n`);

content = content.replace(/void loop\(\) \{/,
`// Callback for C2D messages
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println("[MQTT] C2D Message arrived [" + String(topic) + "] " + message);
  
  // Here we can parse the C2D message JSON and execute commands
  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, message);
  if (!error) {
    String cmd = doc["command"];
    if (cmd == "SET_TEMP") {
       // example handling
    } else if (cmd == "AC_ON") {
       turnACOn();
    } else if (cmd == "AC_OFF") {
       turnACOff();
    }
  }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconnectMQTT();
    }
    mqttClient.loop();
  }`);

content = content.replace(/setup\(\) \{[\s\S]*?initWiFi\(\);/,
`setup() {
  Serial.begin(115200);
  delay(500);

  // Extract MAC from eFuse without needing Wi-Fi initialization
  uint64_t chipid = ESP.getEfuseMac();
  uint8_t* mac = (uint8_t*)&chipid;
  char macStr[13];
  snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  deviceId = "AC_" + String(macStr);

  Serial.println("\\n=== AC Automation BLE Edition ===");
  Serial.println("[SYS] Device ID generated: " + deviceId);

  // Set MQTT Callback
  mqttClient.setCallback(mqttCallback);

  loadProfilesFromNVS();
  loadDynamicConfigFromNVS();
  loadTimingFromNVS();
  loadWifiFromNVS();

  initWiFi();`);

fs.writeFileSync(path, content);
