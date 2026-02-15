// gateway.js

import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --------------------------------------------------
// Config
// --------------------------------------------------
const PORT = process.env.PORT || 3000;
const CHORDS_SERVICE_URL = process.env.CHORDS_SERVICE_URL;
const IMPRO_SERVICE_URL = process.env.IMPRO_SERVICE_URL;

// --------------------------------------------------
// Paths
// --------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, 'gateway_requests_log.csv');

if (!fs.existsSync(LOG_FILE)) {
  const header = 'timestamp;time_ms_chords;time_ms_improvisor;info_chords;info_improvisor;size_bytes_chords;size_bytes_improvisor;size_bytes_sent_to_client\n';
  fs.writeFileSync(LOG_FILE, header, 'utf8');
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function sanitizeForCSV(str) {
  if (!str) return '';
  return String(str).replace(/\r?\n/g, '').replace(/;/g, ',');
}

function appendToCSV(row, file) {
  const line = Object.values(row).map(sanitizeForCSV).join(';') + '\n';
  fs.appendFileSync(file, line, 'utf8');
}

// --------------------------------------------------
// Axios defaults
// --------------------------------------------------
const http = axios.create({
  timeout: 10_000
});

// --------------------------------------------------
// Main orchestration endpoint
// --------------------------------------------------
app.post('/api/generate-midi-random', async (req, res) => {
  try {
    const { style, tempo } = req.body || {};

    // -------------------------------
    // Step 1: Generate chords
    // -------------------------------
    const chordsStart = Date.now();
    const chordsUrl = `${CHORDS_SERVICE_URL.replace(/\/$/, '')}/api/generate/Random/Random/Random`;
    const chordsResp = await http.get(chordsUrl);
    const chordsData = chordsResp.data;
    const timeMsChords = Date.now() - chordsStart;

    if (!Array.isArray(chordsData.sections) || chordsData.sections.length === 0) {
      throw new Error('Chords service returned no sections');
    }

    const flattenedChords = chordsData.sections
      .map(s => s.chords)
      .join('|');

    const infoChords = `${chordsData.key}|${chordsData.structure}|${chordsData.sections.length}`;
    const sizeBytesChords = Buffer.byteLength(JSON.stringify(chordsResp.data), 'utf8');

    // -------------------------------
    // Step 2: Generate solo
    // -------------------------------
    const improStart = Date.now();
    const soloPayload = {
      chords: flattenedChords,
      style,
      tempo
    };

    const soloResp = await http.post(
      `${IMPRO_SERVICE_URL.replace(/\/$/, '')}/api/generate-solo`,
      soloPayload
    );

    const timeMsImpro = Date.now() - improStart;

    const midiBase64 =
      soloResp.data?.midiBase64 ||
      soloResp.data?.midi_base64 ||
      soloResp.data?.data;

    if (!midiBase64) {
      throw new Error('Solo service returned no MIDI base64');
    }

    const infoImpro = `${style || ''}|${tempo || ''}|${Buffer.byteLength(midiBase64, 'utf8')}`;
    const sizeBytesImprovisor = Buffer.byteLength(JSON.stringify(soloResp.data), 'utf8');

    // -------------------------------
    // Prepare response to client
    // -------------------------------
    const responsePayload = {
      ...chordsData,
      midiBase64,
      time_ms_chords: timeMsChords,
      time_ms_improvisor: timeMsImpro
    };

    const sizeBytesSentToClient = Buffer.byteLength(JSON.stringify(responsePayload), 'utf8');

    // -------------------------------
    // Step 3: Append to CSV log
    // -------------------------------
    appendToCSV(
      {
        timestamp: new Date().toISOString(),
        time_ms_chords: timeMsChords,
        time_ms_improvisor: timeMsImpro,
        info_chords: infoChords,
        info_improvisor: infoImpro,
        size_bytes_chords: sizeBytesChords,
        size_bytes_improvisor: sizeBytesImprovisor,
        size_bytes_sent_to_client: sizeBytesSentToClient
      },
      LOG_FILE
    );

    // -------------------------------
    // Step 4: Respond
    // -------------------------------
    res.json(responsePayload);

  } catch (err) {
    console.error('GATEWAY FAILURE:', err);
    res.status(500).json({
      error: 'Failed to generate random MIDI',
      details: err.response?.data || err.message || String(err)
    });
  }
});

// --------------------------------------------------
// Health check
// --------------------------------------------------
app.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    services: {
      chords: CHORDS_SERVICE_URL,
      solo: IMPRO_SERVICE_URL
    }
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway listening on port ${PORT}`);
});
