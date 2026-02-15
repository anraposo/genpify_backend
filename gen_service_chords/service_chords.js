// service_chords.js
import express from 'express';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();
const app = express();
app.use(express.json());

// ---------------------------
// Config
// ---------------------------
const PORT = process.env.PORT || 3002;
const JAR_PATH = process.env.GEN_CHORDS_JAR || './GenJazzChords.jar';
const LOG_PATH = path.resolve('./chords_request_log.csv');

// Create CSV with header if it doesn't exist
if (!fs.existsSync(LOG_PATH)) {
  fs.writeFileSync(LOG_PATH, 'timestamp,key,structure,time_ms,size_bytes\n');
}

// ---------------------------
// Helper to call Java JAR
// ---------------------------
function callJavaJar(args) {
  return new Promise((resolve, reject) => {
    const javaArgs = ['-jar', JAR_PATH, ...args];
    const javaProcess = spawn('java', javaArgs);

    let output = '';
    let error = '';

    javaProcess.stdout.on('data', data => { output += data.toString(); });
    javaProcess.stderr.on('data', data => { error += data.toString(); });

    javaProcess.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Java process exited with code ${code}: ${error}`));
      }
      try {
        const parsed = JSON.parse(output);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Invalid JSON output from Java: ${output}`));
      }
    });
  });
}

// ---------------------------
// CSV Logger
// ---------------------------
function logToCsv({ result, timeMs, sizeBytes }) {
  const timestamp = new Date().toISOString();
  
  const key = result?.key ?? '';
  const structure = result?.structure ?? '';

  const line = `${timestamp},${key},${structure},${timeMs},${sizeBytes}\n`;
  fs.appendFile(LOG_PATH, line, err => {
    if (err) console.error('Failed to write log:', err.message);
  });
}

// ---------------------------
// Endpoints
// ---------------------------

// GET /api/generate/:key/:structure/:modulation
app.get('/api/generate/:key/:structure/:modulation', async (req, res) => {
  const { key, structure, modulation } = req.params;
  const args = [key, structure, modulation];

  const startTime = Date.now();

  try {
    const result = await callJavaJar(args);
    const endTime = Date.now();

    const timeMs = endTime - startTime;

    // Measure payload size in bytes
    const jsonString = JSON.stringify(result);
    const sizeBytes = Buffer.byteLength(jsonString, 'utf8');

    logToCsv({
      result,
      timeMs,
      sizeBytes
    });

    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to generate chords', details: err.message });
  }
});

// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Generative chords microservice listening on port ${PORT}`);
});
