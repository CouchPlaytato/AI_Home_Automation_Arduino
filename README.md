# Voice-Gemini Server for ESP32 Home Automation

A Node.js server that accepts voice input via microphone, converts speech to text using Google's Gemini AI, generates intelligent responses using Gemini Flash, and sends parsed commands to ESP32 via USB serial communication for fan control using L9110 motor driver.

## Features

- 🎤 Voice input processing using Google Gemini AI
- 🤖 AI responses via Google Gemini Flash
- 🔍 Intelligent command parsing for home automation
- 🌀 **Fan Control Commands**: "fan on", "fan off", "fan speed 1-5"
- 🔌 **USB Serial Communication** with ESP32 (no WiFi required)
- ⚡ **L9110 Motor Driver Support** for precise PWM fan control
- 🌐 RESTful API endpoints for testing and integration
- 🔧 Simple command interface for device control
- 💬 Text-only mode for non-voice scenarios
- 🚀 **Single API dependency** - only Gemini needed!

## Prerequisites

- Node.js 16+ installed
- Google Gemini API key (handles both speech-to-text and responses)
- ESP32 development board
- L9110 motor driver module
- USB cable for ESP32 connection

## Quick Setup

### 1. Install Dependencies

```bash
cd "c:\Users\visha\Arduino Projects\HomeAutomation"
npm install
```

### 2. Configure Environment

Copy the example environment file and add your API keys:

```bash
copy .env.example .env
```

Edit `.env` with your API key and serial port:
```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
NODE_ENV=development
SERIAL_PORT=COM3
```

### 3. Get Gemini API Key

**Gemini API Key:**
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create new project or use existing
3. Get API key from the API section
4. Enable Gemini API access

### 4. Setup ESP32 Hardware

**L9110 Motor Driver Connections:**
```
ESP32 Pin 25 → L9110 INA
ESP32 Pin 26 → L9110 INB
ESP32 GND   → L9110 GND
ESP32 3.3V  → L9110 VCC

L9110 OUTA → Fan Positive
L9110 OUTB → Fan Negative
```

**Upload ESP32 Code:**
1. Open `esp32-examples/fan_voice_control.ino` in Arduino IDE
2. Select your ESP32 board and COM port
3. Upload the code

### 5. Find Your COM Port

The server will automatically list available ports on startup. Common ports:
- **Windows**: COM3, COM4, COM5, etc.
- **macOS**: /dev/tty.usbserial-*, /dev/tty.SLAB_USBtoUART
- **Linux**: /dev/ttyUSB0, /dev/ttyACM0

### 6. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000` and automatically connect to your ESP32 via USB.

### 7. Test the System

**Option 1: Test Serial Communication**
```bash
node test-serial.js
```

**Option 2: Test Voice Commands**
Use the API endpoints with tools like Postman or curl.

**Option 3: Arduino IDE Serial Monitor**
Open the Serial Monitor in Arduino IDE to see real-time communication.

## Supported Voice Commands

The server intelligently parses voice commands for home automation. Here are the supported patterns:

### Fan Control Commands
- **Turn On**: "fan on", "turn fan on", "start fan", "switch on fan"
- **Turn Off**: "fan off", "turn fan off", "stop fan", "switch off fan"  
- **Set Speed**: "fan speed 3", "set fan speed to 4", "fan speed 1", "speed 5"
  - Supports speeds 1-5 (1=lowest, 5=highest)

### Light Control Commands
- **Turn On**: "lights on", "turn lights on", "turn on lights"
- **Turn Off**: "lights off", "turn lights off", "turn off lights"

### Command Response Format
All voice and text endpoints return a `parsedCommand` object:
```json
{
  "device": "fan",           // Detected device: "fan", "lights", "unknown"
  "action": "speed",         // Action: "on", "off", "speed", "general"
  "value": 3,               // Numeric value (for speed commands)
  "confidence": "high",      // Confidence: "high", "medium", "low"
  "originalText": "fan speed 3"
}
```

**Confidence Levels:**
- **High**: Exact pattern match for device commands
- **Medium**: Partial match or general device commands  
- **Low**: No specific pattern detected

## API Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-01T10:30:00.000Z",
  "uptime": 3600
}
```

### Server Status
```http
GET /status
```

**Response:**
```json
{
  "server": "voice-gemini-server",
  "status": "running",
  "endpoints": {
    "voice": "/voice",
    "text": "/text",
    "health": "/health"
  },
  "timestamp": "2025-11-01T10:30:00.000Z"
}
```

### Voice Input Processing
```http
POST /voice
Content-Type: multipart/form-data
```

**Parameters:**
- `audio` (file): Audio file (WAV, MP3, WebM supported)
- `context` (optional string): Additional context for better responses

**Response:**
```json
{
  "success": true,
  "transcription": "Turn on the fan at speed 3",
  "parsedCommand": {
    "device": "fan",
    "action": "speed",
    "value": 3,
    "confidence": "high",
    "originalText": "Turn on the fan at speed 3"
  },
  "response": "I'll turn on the fan and set it to speed 3. The fan is now running at medium speed.",
  "esp32Sent": true,
  "timestamp": "2025-11-01T10:30:00.000Z"
}
```

### Text Input Processing
```http
POST /text
Content-Type: application/json
```

**Body:**
```json
{
  "message": "What's the weather like?",
  "context": "Living room temperature sensor shows 22°C"
}
```

**Response:**
```json
{
  "success": true,
  "message": "fan speed 2",
  "parsedCommand": {
    "device": "fan",
    "action": "speed", 
    "value": 2,
    "confidence": "high",
    "originalText": "fan speed 2"
  },
  "response": "Setting the fan to speed 2. The fan is now running at low-medium speed for comfortable airflow.",
  "esp32Sent": true,
  "timestamp": "2025-11-01T10:30:00.000Z"
}
```

### Device Command
```http
POST /command
Content-Type: application/json
```

**Body:**
```json
{
  "command": "turn on",
  "device": "living room lights",
  "value": "100%",
  "context": "Evening time, user arriving home"
}
```

**Response:**
```json
{
  "success": true,
  "command": "turn on",
  "device": "living room lights",
  "value": "100%",
  "response": "Turning on the living room lights to 100% brightness. Perfect for your evening arrival home!",
  "timestamp": "2025-11-01T10:30:00.000Z"
}
```

## ESP32 Serial Communication

The ESP32 receives JSON commands via USB serial:

```json
{
  "device": "fan",
  "action": "speed",
  "value": 3
}
```

**ESP32 Response:**
```json
{
  "device": "esp32",
  "fanOn": true,
  "fanSpeed": 3,
  "pwmValue": 153
}
```

### L9110 Motor Driver Control

The ESP32 uses PWM to control fan speed through the L9110:
- **Speed 1**: 20% PWM (51/255)
- **Speed 2**: 35% PWM (89/255)  
- **Speed 3**: 50% PWM (127/255)
- **Speed 4**: 75% PWM (191/255)
- **Speed 5**: 100% PWM (255/255)

**L9110 Control Logic:**
- **Forward**: INA = PWM, INB = 0
- **Stop**: INA = 0, INB = 0

## Development Commands

```bash
# Install dependencies
npm install

# Start server with ESP32 connection
npm start

# Test serial communication only
node test-serial.js

# Development with auto-restart
npm run dev
```

## File Structure

```
HomeAutomation/
├── server.js                    # Main server with serial communication
├── test-serial.js              # ESP32 serial communication test
├── package.json                # Dependencies and scripts
├── .env                        # Environment variables (create from .env.example)
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── README.md                  # This file
├── uploads/                   # Temporary audio file storage (auto-created)
└── esp32-examples/
    └── fan_voice_control.ino  # ESP32 L9110 fan controller code
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2025-11-01T10:30:00.000Z"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad request (missing parameters)
- `500`: Server error (API issues, file processing errors)

## Security Notes

1. **API Keys**: Never commit your `.env` file to version control
2. **ngrok**: Use ngrok authentication for production deployments
3. **CORS**: The server allows all origins - restrict in production
4. **File Uploads**: Audio files are automatically deleted after processing
5. **Rate Limiting**: Consider adding rate limiting for production use

## Troubleshooting

### Common Issues

1. **"Serial port not available"**: 
   - Check ESP32 USB connection
   - Verify correct COM port in `.env` file
   - Close Arduino IDE Serial Monitor
   - Try different USB cable/port

2. **"GEMINI_API_KEY not set"**: Add your Gemini API key to `.env` file
4. **ESP32 not responding**: 
   - Verify ESP32 code is uploaded correctly
   - Check baud rate (115200)
   - Reset ESP32 board
5. **Fan not spinning**:
   - Check L9110 wiring connections
   - Verify power supply to L9110
   - Test with manual PWM commands

### Testing the System

**Test Serial Connection:**
```bash
node test-serial.js
```

**Test Voice Command via curl:**
```bash
# Create a test audio file or use text endpoint
curl -X POST http://localhost:3000/text \
  -H "Content-Type: application/json" \
  -d '{"message": "fan speed 3"}'
```

**Monitor ESP32 Output:**
Open Arduino IDE Serial Monitor at 115200 baud to see real-time communication.

## License

MIT License - Feel free to modify and use for your projects.