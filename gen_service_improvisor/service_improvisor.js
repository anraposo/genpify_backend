// service_improvisor.js

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs';

const app = express();
app.use(express.json());

// ---------------------------
// Config
// ---------------------------
const PORT = process.env.PORT || 4000;
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:3001';
const JAR_PATH = process.env.IMPROVISOR_JAR || './GenJazzSolos.jar';
const DEFAULT_STYLE = 'John Coltrane';
const DEFAULT_TEMPO = 160;
const LOG_FILE = 'improvisor_requests_log.csv';

// Create log file with header if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, 'timestamp;time_ms;data_used;response_bytes\n');
}

// ---------------------------
// Helpers
// ---------------------------
function sanitizeForCSV(str) {
  if (!str) return '';
  return String(str)
    .replace(/\r?\n/g, '')   
    .replace(/;/g, ',');     
}

// ---------------------------
// POST /api/generate-solo
// ---------------------------
app.post('/api/generate-solo', async (req, res) => {
  const startTime = Date.now();
  const { chords, style, tempo } = req.body;

  if (!chords || typeof chords !== 'string' || chords.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid chords string' });
  }

  const soloStyle = style || DEFAULT_STYLE;
  const soloTempo = tempo || DEFAULT_TEMPO;

  const args = ['-jar', JAR_PATH, chords, soloStyle, String(soloTempo)];
  const javaProcess = spawn('java', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';

  javaProcess.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  javaProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  javaProcess.on('close', async (code) => {
    const timeMs = Date.now() - startTime;

    if (code !== 0) {
      console.error('Java process failed:', stderr);

      try {
        await axios.post(`${DB_SERVICE_URL}/api/log`, {
          request: JSON.stringify({ chords, soloStyle, soloTempo }),
          response: JSON.stringify({ error: stderr })
        });
      } catch (_) {}

      return res.status(500).json({
        error: 'Solo generation failed',
        details: stderr
      });
    }

    const midiBase64 = stdout.trim();

    if (!midiBase64 || midiBase64.length < 20) {
      console.error('Invalid Base64 returned:', stderr);
      return res.status(500).json({
        error: 'Invalid MIDI data returned from generator',
        details: stderr
      });
    }

    // ---------------------------
    // Append to local CSV log
    // ---------------------------
    try {
      const timestamp = new Date().toISOString();
      const dataUsed = sanitizeForCSV(`${chords}|${soloStyle}|${soloTempo}`);
      const responseBytes = Buffer.byteLength(midiBase64, 'utf8');

      const line = `${timestamp};${timeMs};${dataUsed};${responseBytes}\n`;
      fs.appendFileSync(LOG_FILE, line);
    } catch (err) {
      console.error('Failed to write CSV log:', err.message);
    }

    // ---------------------------
    // Optional external DB log
    // ---------------------------
    try {
      await axios.post(`${DB_SERVICE_URL}/api/log`, {
        request: JSON.stringify({ chords, soloStyle, soloTempo }),
        response: JSON.stringify({ time_ms: timeMs })
      });
    } catch (_) {}

    // ---------------------------
    // Return result
    // ---------------------------
    res.json({
      midi_base64: midiBase64,
      time_ms: timeMs
    });
  });
});

// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Generative improvisor microservice listening on port ${PORT}`);
});
