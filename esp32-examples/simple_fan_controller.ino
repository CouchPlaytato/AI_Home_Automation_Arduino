/*
 * ESP32 Voice Fan Controller
 * Controls fan via L9110 motor driver based on commands from Node.js server
 * Commands received via USB Serial as JSON
 */

#include <ArduinoJson.h>

// L9110 Motor Driver pins
#define FAN_INA_PIN 25  // L9110 INA pin (PWM)
#define FAN_INB_PIN 26  // L9110 INB pin (Direction)
#define STATUS_LED_PIN 2 // Built-in LED for status

// PWM settings
#define PWM_FREQ 1000
#define PWM_RESOLUTION 8

// Fan state variables
bool fanOn = false;
int currentSpeed = 0;  // 0-5
int pwmValue = 0;      // 0-255

void setup() {
  Serial.begin(115200);
  
  // Setup PWM pins with frequency and resolution
  ledcAttach(FAN_INA_PIN, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(FAN_INB_PIN, PWM_FREQ, PWM_RESOLUTION);
  
  // Setup status LED
  pinMode(STATUS_LED_PIN, OUTPUT);
  
  // Initialize fan to OFF
  stopFan();
  
  Serial.println("🌀 ESP32 Fan Controller Ready!");
  Serial.println("Hardware: L9110 Motor Driver on pins 25 & 26");
  Serial.println("Waiting for commands from Node.js server...");
  
  // Startup LED blink
  blinkLED(3, 200);
}

void loop() {
  // if(!fanOn){
  //   turnFanOn();
  //   fanOn = true;
  // }
  // Check for serial commands from Node.js
  if (Serial.available()) {
    String jsonString = Serial.readStringUntil('\n');
    jsonString.trim();
    
    if (jsonString.length() > 0) {
      processCommand(jsonString);
    }
  }
  
  delay(50); // Small delay to prevent overwhelming the serial
}

void processCommand(String jsonCommand) {
  Serial.println("📥 Received: " + jsonCommand);
  
  // Parse JSON command
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, jsonCommand);
  
  if (error) {
    Serial.println("❌ JSON Error: " + String(error.c_str()));
    sendStatus("error", "Invalid JSON");
    return;
  }
  
  // Extract command data
  String device = doc["device"];
  String action = doc["action"];
  int value = doc["value"] | 0;
  
  Serial.println("🔧 Command: " + device + " → " + action + 
                 (value > 0 ? " (" + String(value) + ")" : ""));
  
  // Execute fan commands
  if (device == "fan") {
    if (action == "on") {
      turnFanOn();
    } 
    else if (action == "off") {
      turnFanOff();
    } 
    else if (action == "speed") {
      setFanSpeed(value);
    }
    else {
      Serial.println("❌ Unknown fan action: " + action);
      sendStatus("error", "Unknown action");
      return;
    }
  }
  else {
    Serial.println("❌ Unknown device: " + device);
    sendStatus("error", "Unknown device");
    return;
  }
  
  // Send status confirmation
  sendStatus("success", "Command executed");
}

void turnFanOn() {
  fanOn = true;
  
  // If no speed set, use speed 1 as default
  if (currentSpeed == 0) {
    setFanSpeed(3);
  } else {
    applyPWM();
  }
  
  Serial.println("🌀 Fan ON at speed " + String(currentSpeed));
  blinkLED(1, 100); // Quick blink for ON
}

void turnFanOff() {
  fanOn = false;
  stopFan();
  Serial.println("🌀 Fan OFF");
  digitalWrite(STATUS_LED_PIN, LOW); // Turn off LED
}

void setFanSpeed(int speed) {
  // Validate speed range
  if (speed < 1 || speed > 5) {
    Serial.println("❌ Invalid speed: " + String(speed) + " (must be 1-5)");
    sendStatus("error", "Speed must be 1-5");
    return;
  }
  
  currentSpeed = speed;
  fanOn = true;
  applyPWM();
  
  Serial.println("🌀 Fan speed set to " + String(speed) + 
                 " (PWM: " + String(pwmValue) + "/255)");
  
  // LED blinks equal to speed level
  blinkLED(speed, 150);
}

void applyPWM() {
  if (!fanOn || currentSpeed == 0) {
    stopFan();
    return;
  }
  
  // Convert speed (1-5) to PWM (51-255)
  // Speed 1 = 20%, Speed 5 = 100%
  pwmValue = map(currentSpeed, 1, 5, 51, 255);
  
  // L9110 Forward rotation: INA = PWM, INB = 0
  ledcWrite(FAN_INA_PIN, pwmValue);
  ledcWrite(FAN_INB_PIN, 0);
  
  // Turn on status LED to show fan is running
  digitalWrite(STATUS_LED_PIN, HIGH);
}

void stopFan() {
  // Stop L9110: Both pins to 0
  ledcWrite(FAN_INA_PIN, 0);
  ledcWrite(FAN_INB_PIN, 0);
  pwmValue = 0;
  currentSpeed = 0;
  
  digitalWrite(STATUS_LED_PIN, LOW);
}

void sendStatus(String status, String message) {
  // Send JSON status back to Node.js
  StaticJsonDocument<200> statusDoc;
  statusDoc["device"] = "esp32";
  statusDoc["status"] = status;
  statusDoc["message"] = message;
  statusDoc["fanOn"] = fanOn;
  statusDoc["speed"] = currentSpeed;
  statusDoc["pwm"] = pwmValue;
  statusDoc["timestamp"] = millis();
  
  String statusString;
  serializeJson(statusDoc, statusString);
  Serial.println("📤 Status: " + statusString);
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(STATUS_LED_PIN, LOW);
    if (i < times - 1) delay(delayMs);
  }
}