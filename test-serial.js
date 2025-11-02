const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Test script for ESP32 communication
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM3';

async function listPorts() {
  try {
    const ports = await SerialPort.list();
    console.log('\n📍 Available serial ports:');
    ports.forEach(port => {
      console.log(`   ${port.path} - ${port.manufacturer || 'Unknown'}`);
    });
    console.log();
  } catch (error) {
    console.error('Error listing ports:', error.message);
  }
}

function testSerial() {
  console.log(`\n🔌 Testing serial communication on ${SERIAL_PORT}...`);
  
  const port = new SerialPort({
    path: SERIAL_PORT,
    baudRate: 115200,
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.on('open', () => {
    console.log('✅ Serial port opened successfully');
    
    // Test commands
    const testCommands = [
      { device: 'fan', action: 'on', value: null },
      { device: 'fan', action: 'speed', value: 3 },
      { device: 'fan', action: 'speed', value: 5 },
      { device: 'fan', action: 'off', value: null }
    ];
    
    let commandIndex = 0;
    
    const sendNextCommand = () => {
      if (commandIndex < testCommands.length) {
        const command = testCommands[commandIndex];
        const jsonCommand = JSON.stringify(command) + '\n';
        
        console.log(`\n📤 Sending command ${commandIndex + 1}:`, jsonCommand.trim());
        port.write(jsonCommand);
        commandIndex++;
        
        setTimeout(sendNextCommand, 3000); // Send next command after 3 seconds
      } else {
        console.log('\n✅ All test commands sent!');
        console.log('Press Ctrl+C to exit');
      }
    };
    
    // Start sending commands after 2 seconds
    setTimeout(sendNextCommand, 2000);
  });

  port.on('error', (err) => {
    console.error('❌ Serial port error:', err.message);
    console.log('\n💡 Make sure:');
    console.log('   1. ESP32 is connected via USB');
    console.log('   2. Correct COM port is specified');
    console.log('   3. ESP32 code is uploaded and running');
    console.log('   4. Serial monitor is closed in Arduino IDE');
  });

  parser.on('data', (data) => {
    console.log('📥 ESP32:', data.trim());
  });
}

// Main execution
console.log('🧪 ESP32 Serial Communication Test');
console.log('===================================');

listPorts().then(() => {
  testSerial();
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Exiting...');
  process.exit(0);
});