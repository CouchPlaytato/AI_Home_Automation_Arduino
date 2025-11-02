#include <ArduinoJson.h>

// L9110 Motor Driver pins for fan control
#define FAN_INA_PIN 25  // L9110 INA pin
#define FAN_INB_PIN 26  // L9110 INB pin
#define LED_PIN 2       // Built-in LED for status

// Fan state
bool fanOn = false;
int currentFanSpeed = 0;  // Speed from 0-5
int pwmValue = 0;         // PWM value for motor (0-255)

// PWM channel for ESP32
#define PWM_CHANNEL_A 0
#define PWM_CHANNEL_B 1
#define PWM_FREQ 1000
#define PWM_RESOLUTION 8

void setup() {
  Serial.begin(115200);
  
  // Initialize PWM channels for L9110
  ledcSetup(PWM_CHANNEL_A, PWM_FREQ, PWM_RESOLUTION);
  ledcSetup(PWM_CHANNEL_B, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(FAN_INA_PIN, PWM_CHANNEL_A);
  ledcAttachPin(FAN_INB_PIN, PWM_CHANNEL_B);
  
  // Initialize LED
  pinMode(LED_PIN, OUTPUT);
  
  // Turn off fan initially
  stopFan();
  digitalWrite(LED_PIN, LOW);
  
  Serial.println("🌀 ESP32 L9110 Fan Controller Ready!");
  Serial.println("Waiting for commands from Node.js server...");
  Serial.println("Commands: {\"device\":\"fan\",\"action\":\"on|off|speed\",\"value\":1-5}");
  
  // Blink LED to indicate ready
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    delay(200);
  }
}

void loop() {
  // Check for serial input from Node.js server
  if (Serial.available()) {
    String jsonString = Serial.readStringUntil('\n');
    jsonString.trim();
    
    if (jsonString.length() > 0) {
      Serial.println("📥 Received: " + jsonString);
      processCommand(jsonString);
    }
  }
  
  delay(100);
}

void processCommand(String jsonString) {
  // Parse JSON command
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, jsonString);
  
  if (error) {
    Serial.println("❌ JSON parsing failed: " + String(error.c_str()));
    return;
  }
  
  String device = doc["device"];
  String action = doc["action"];
  int value = doc["value"] | 0;
  
  Serial.println("� Processing command:");
  Serial.println("   Device: " + device);
  Serial.println("   Action: " + action);
  Serial.println("   Value: " + String(value));
  
  // Execute command
  if (device == "fan") {
    if (action == "on") {
      turnFanOn();
    } else if (action == "off") {
      turnFanOff();
    } else if (action == "speed") {
      setFanSpeed(value);
    }
  } else if (device == "lights") {
    if (action == "on") {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("💡 LED turned ON");
    } else if (action == "off") {
      digitalWrite(LED_PIN, LOW);
      Serial.println("💡 LED turned OFF");
    }
  }
  
  // Send confirmation back to server
  sendStatus();
}

void turnFanOn() {
  fanOn = true;
  
  // If no speed is set, default to speed 1
  if (currentFanSpeed == 0) {
    setFanSpeed(1);
  } else {
    // Apply current speed
    applyFanSpeed();
  }
  
  Serial.println("🌀 Fan turned ON at speed " + String(currentFanSpeed));
}

void turnFanOff() {
  fanOn = false;
  stopFan();
  Serial.println("🌀 Fan turned OFF");
}

void setFanSpeed(int speed) {
  // Ensure speed is within valid range
  if (speed < 0) speed = 0;
  if (speed > 5) speed = 5;
  
  currentFanSpeed = speed;
  
  if (speed > 0) {
    fanOn = true;
    applyFanSpeed();
    Serial.println("🌀 Fan speed set to " + String(speed));
  } else {
    turnFanOff();
  }
}

void applyFanSpeed() {
  if (!fanOn || currentFanSpeed == 0) {
    stopFan();
    return;
  }
  
  // Convert speed (1-5) to PWM value (51-255)
  // Speed 1 = ~20% = 51, Speed 5 = 100% = 255
  pwmValue = map(currentFanSpeed, 1, 5, 51, 255);
  
  // Set L9110 for forward rotation
  ledcWrite(PWM_CHANNEL_A, pwmValue);  // INA = PWM
  ledcWrite(PWM_CHANNEL_B, 0);         // INB = 0
  
  Serial.println("⚡ PWM Value: " + String(pwmValue) + " (" + String((pwmValue * 100) / 255) + "%)");
}

void stopFan() {
  // Stop L9110 motor driver
  ledcWrite(PWM_CHANNEL_A, 0);
  ledcWrite(PWM_CHANNEL_B, 0);
  pwmValue = 0;
}

void sendStatus() {
  // Send current status back to Node.js server
  StaticJsonDocument<150> statusDoc;
  statusDoc["device"] = "esp32";
  statusDoc["fanOn"] = fanOn;
  statusDoc["fanSpeed"] = currentFanSpeed;
  statusDoc["pwmValue"] = pwmValue;
  
  String statusString;
  serializeJson(statusDoc, statusString);
  Serial.println("📤 Status: " + statusString);
}