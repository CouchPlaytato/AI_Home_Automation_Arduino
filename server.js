const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serial communication setup
let serialPort = null;
let parser = null;
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM3'; // Default to COM3, change in .env
const BAUD_RATE = 115200;

// Initialize serial connection with retry logic
function initializeSerial() {
  console.log(`🔌 Attempting to connect to ${SERIAL_PORT}...`);
  
  try {
    serialPort = new SerialPort({
      path: SERIAL_PORT,
      baudRate: BAUD_RATE,
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    serialPort.on('open', () => {
      console.log(`📡 Serial port ${SERIAL_PORT} opened successfully`);
      console.log('✅ ESP32 communication ready!');
    });

    serialPort.on('error', (err) => {
      console.error('❌ Serial port error:', err.message);
      serialPort = null;
      
      if (err.message.includes('Access denied')) {
        console.log('💡 Port access denied. Common causes:');
        console.log('   • Arduino IDE Serial Monitor is open');
        console.log('   • Another application is using the port');
        console.log('   • Device drivers need to be updated');
        console.log('');
        console.log('🔧 To fix:');
        console.log('   1. Close Arduino IDE completely');
        console.log('   2. Unplug and reconnect ESP32');
        console.log('   3. Restart this server');
      }
    });

    serialPort.on('close', () => {
      console.log('📡 Serial port closed');
      serialPort = null;
    });

    parser.on('data', (data) => {
      console.log('📥 ESP32:', data.trim());
    });

  } catch (error) {
    console.error('❌ Failed to initialize serial port:', error.message);
    console.log('💡 Available ports will be listed below...');
    listAvailablePorts();
  }
}

// List available serial ports
async function listAvailablePorts() {
  try {
    const ports = await SerialPort.list();
    console.log('\n📍 Available serial ports:');
    ports.forEach(port => {
      console.log(`   ${port.path} - ${port.manufacturer || 'Unknown'}`);
    });
    console.log(`\n💡 Set SERIAL_PORT in .env file (currently: ${SERIAL_PORT})\n`);
  } catch (error) {
    console.error('Error listing ports:', error.message);
  }
}

// Send command to ESP32 via serial
function sendCommandToESP32(command) {
  if (!serialPort || !serialPort.isOpen) {
    console.error('❌ Serial port not available');
    return false;
  }

  try {
    const jsonCommand = JSON.stringify(command) + '\n';
    serialPort.write(jsonCommand);
    console.log('📤 Sent to ESP32:', jsonCommand.trim());
    return true;
  } catch (error) {
    console.error('❌ Error sending to ESP32:', error.message);
    return false;
  }
}

// Initialize AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  }
});

// Health check endpoint for ESP32
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Speech-to-text conversion using Gemini
async function convertSpeechToText(audioFilePath) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    // Read audio file as base64
    const audioData = fs.readFileSync(audioFilePath);
    const base64Audio = audioData.toString('base64');
    
    // Get file extension for mime type
    const fileExtension = path.extname(audioFilePath).toLowerCase();
    let mimeType = 'audio/wav'; // default
    
    if (fileExtension === '.mp3') mimeType = 'audio/mp3';
    else if (fileExtension === '.webm') mimeType = 'audio/webm';
    else if (fileExtension === '.ogg') mimeType = 'audio/ogg';
    else if (fileExtension === '.m4a') mimeType = 'audio/mp4';
    
    const prompt = `Please transcribe this audio file. Extract only the spoken words without any additional commentary or formatting. Just return the exact text that was spoken.`;
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Audio,
          mimeType: mimeType
        }
      }
    ]);
    
    const response = await result.response;
    const transcription = response.text().trim();
    
    return transcription;
  } catch (error) {
    console.error('Gemini speech-to-text error:', error);
    throw new Error('Failed to convert speech to text with Gemini');
  }
}

// Parse voice commands for home automation
function parseHomeAutomationCommand(text) {
  const lowerText = text.toLowerCase().trim();
  
  // Fan control patterns
  const fanPatterns = {
    on: /(?:turn\s+)?(?:the\s+)?fan\s+on|(?:start|switch\s+on)\s+(?:the\s+)?fan/i,
    off: /(?:turn\s+)?(?:the\s+)?fan\s+off|(?:stop|switch\s+off)\s+(?:the\s+)?fan/i,
    speed: /(?:set\s+)?(?:the\s+)?fan\s+(?:speed\s+)?(?:to\s+)?(\d+)|(?:fan\s+)?speed\s+(\d+)/i
  };
  
  // Check for fan commands
  if (fanPatterns.on.test(lowerText)) {
    return {
      device: 'fan',
      action: 'on',
      value: null,
      confidence: 'high',
      originalText: text
    };
  }
  
  if (fanPatterns.off.test(lowerText)) {
    return {
      device: 'fan',
      action: 'off',
      value: null,
      confidence: 'high',
      originalText: text
    };
  }
  
  // Check for fan speed (1-5)
  const speedMatch = lowerText.match(fanPatterns.speed);
  if (speedMatch) {
    const speed = parseInt(speedMatch[1] || speedMatch[2]);
    if (speed >= 1 && speed <= 5) {
      return {
        device: 'fan',
        action: 'speed',
        value: speed,
        confidence: 'high',
        originalText: text
      };
    }
  }
  
  // Check for other common patterns
  const lightPatterns = {
    on: /(?:turn\s+)?(?:the\s+)?lights?\s+on|lights?\s+on/i,
    off: /(?:turn\s+)?(?:the\s+)?lights?\s+off|lights?\s+off/i
  };
  
  if (lightPatterns.on.test(lowerText)) {
    return {
      device: 'lights',
      action: 'on',
      value: null,
      confidence: 'medium',
      originalText: text
    };
  }
  
  if (lightPatterns.off.test(lowerText)) {
    return {
      device: 'lights',
      action: 'off',
      value: null,
      confidence: 'medium',
      originalText: text
    };
  }
  
  // No specific command detected
  return {
    device: 'unknown',
    action: 'general',
    value: null,
    confidence: 'low',
    originalText: text
  };
}

// Parse Gemini response into command object
function parseGeminiCommand(geminiResponse) {
  try {
    if (!geminiResponse || typeof geminiResponse !== 'string') {
      console.log('❌ Invalid Gemini response: not a string');
      return null;
    }
    
    const response = geminiResponse.toLowerCase().trim();
    console.log('🔍 Parsing Gemini response:', response);
    
    // Parse "fan on"
    if (response === 'fan on') {
      return {
        device: 'fan',
        action: 'on',
        value: null,
        confidence: 'high',
        source: 'gemini'
      };
    }
    
    // Parse "fan off"
    if (response === 'fan off') {
      return {
        device: 'fan',
        action: 'off',
        value: null,
        confidence: 'high',
        source: 'gemini'
      };
    }
    
    // Parse "fan speed X" where X is 1-5
    const speedMatch = response.match(/^fan speed (\d+)$/);
    if (speedMatch) {
      const speed = parseInt(speedMatch[1]);
      if (speed >= 1 && speed <= 5) {
        return {
          device: 'fan',
          action: 'speed',
          value: speed,
          confidence: 'high',
          source: 'gemini'
        };
      }
    }
    
    // If no valid command found, return null
    console.log('❌ Invalid Gemini response format:', geminiResponse);
    return null;
  } catch (error) {
    console.error('❌ Error parsing Gemini command:', error.message);
    return null;
  }
}

// Generate response using Gemini Flash
async function generateGeminiResponse(text, context = '', parsedCommand = null) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    let prompt = `You are a smart home automation system that ONLY controls a fan. 

STRICT RULES:
- You can ONLY respond with these exact commands:
  1. "fan on"
  2. "fan off" 
  3. "fan speed 1" (or 2, 3, 4, 5)

- If the user says anything about turning on/starting the fan, respond: "fan on"
- If the user says anything about turning off/stopping the fan, respond: "fan off"
- If the user mentions a specific speed (1-5), respond: "fan speed X" where X is the number
- If the user mentions "low speed" or "slow", respond: "fan speed 1"
- If the user mentions "medium speed", respond: "fan speed 3"
- If the user mentions "high speed", "fast", or "maximum", respond: "fan speed 5"
- If the user asks about anything else (lights, temperature, etc.), respond: "fan off"

User said: "${text}"

Respond with ONLY one of the three allowed commands. Nothing else.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('Failed to generate response from Gemini');
  }
}

// Voice upload and processing endpoint
app.post('/voice', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('Processing audio file:', req.file.filename);
    
    const audioFilePath = req.file.path;
    
    // Convert speech to text
    const transcribedText = await convertSpeechToText(audioFilePath);
    console.log('Transcribed text:', transcribedText);
    
    // Parse the command for home automation
    const parsedCommand = parseHomeAutomationCommand(transcribedText);
    console.log('Initial parsed command:', parsedCommand);
    
    // Generate response using Gemini with parsed command context
    const geminiResponse = await generateGeminiResponse(transcribedText, req.body.context, parsedCommand);
    console.log('Gemini response:', geminiResponse);
    
    // Parse the Gemini response to extract the final command
    const finalCommand = parseGeminiCommand(geminiResponse);
    console.log('Final command from Gemini:', finalCommand);
    
    // Send command to ESP32 if it's valid
    let esp32Sent = false;
    if (finalCommand && finalCommand.device === 'fan') {
      esp32Sent = sendCommandToESP32(finalCommand);
    } else {
      console.log('❌ No valid command to send to ESP32');
    }
    
    // Clean up audio file
    fs.removeSync(audioFilePath);
    
    res.json({
      success: true,
      transcription: transcribedText,
      originalCommand: parsedCommand || null,
      finalCommand: finalCommand || null,
      response: geminiResponse,
      esp32Sent: esp32Sent,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Voice processing error:', error);
    
    // Clean up file if it exists
    if (req.file && req.file.path) {
      fs.removeSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Text-only endpoint for ESP32 (when voice isn't available)
app.post('/text', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    console.log('Processing text message:', message);
    
    // Parse the command for home automation
    const parsedCommand = parseHomeAutomationCommand(message);
    console.log('Initial parsed command:', parsedCommand);
    
    const geminiResponse = await generateGeminiResponse(message, context, parsedCommand);
    console.log('Gemini response:', geminiResponse);
    
    // Parse the Gemini response to extract the final command
    const finalCommand = parseGeminiCommand(geminiResponse);
    console.log('Final command from Gemini:', finalCommand);
    
    // Send command to ESP32 if it's valid
    let esp32Sent = false;
    if (finalCommand && finalCommand.device === 'fan') {
      esp32Sent = sendCommandToESP32(finalCommand);
    } else {
      console.log('❌ No valid command to send to ESP32');
    }
    
    res.json({
      success: true,
      message: message,
      originalCommand: parsedCommand || null,
      finalCommand: finalCommand || null,
      response: geminiResponse,
      esp32Sent: esp32Sent,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Text processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ESP32 status endpoint
app.get('/status', (req, res) => {
  res.json({
    server: 'voice-gemini-server',
    status: 'running',
    serial: {
      connected: serialPort && serialPort.isOpen,
      port: SERIAL_PORT,
      baudRate: BAUD_RATE
    },
    endpoints: {
      voice: '/voice',
      text: '/text',
      health: '/health',
      retry: '/retry-serial'
    },
    timestamp: new Date().toISOString()
  });
});

// Retry serial connection endpoint
app.post('/retry-serial', (req, res) => {
  console.log('🔄 Manual serial retry requested...');
  
  if (serialPort && serialPort.isOpen) {
    serialPort.close(() => {
      setTimeout(() => {
        initializeSerial();
        res.json({ 
          success: true, 
          message: 'Serial connection retry initiated',
          port: SERIAL_PORT
        });
      }, 1000);
    });
  } else {
    initializeSerial();
    res.json({ 
      success: true, 
      message: 'Serial connection retry initiated',
      port: SERIAL_PORT
    });
  }
});

// Simple command endpoint for ESP32
app.post('/command', async (req, res) => {
  try {
    const { command, device, value, context } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'No command provided' });
    }

    // Process the command through Gemini for intelligent responses
    const prompt = `Command: ${command}${device ? `, Device: ${device}` : ''}${value ? `, Value: ${value}` : ''}`;
    const response = await generateGeminiResponse(prompt, context);
    
    res.json({
      success: true,
      command: command,
      device: device || null,
      value: value || null,
      response: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Command processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  console.error('Unexpected error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Voice-Gemini server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
  console.log(`🎤 Voice endpoint: http://localhost:${PORT}/voice`);
  console.log(`💬 Text endpoint: http://localhost:${PORT}/text`);
  console.log(`📋 Status endpoint: http://localhost:${PORT}/status`);
  console.log(`🔧 Command endpoint: http://localhost:${PORT}/command`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  Warning: GEMINI_API_KEY not set');
  }
  
  // Initialize serial communication
  console.log('\n🔌 Initializing ESP32 serial communication...');
  initializeSerial();
});

module.exports = app;