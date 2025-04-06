// server.ts
import express from 'express';
import cors from 'cors';  // 首先安裝 cors: npm install cors
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

const app = express();
const port = 3001;

console.log('🟢 server.ts 啟動了！');
app.use(cors());

// Health check API
app.get('/ping', (req, res) => {
  res.send('pong');
});

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now();
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// POST /upload to receive and process video
app.post('/upload', upload.single('video'), (req, res) => {
  (async () => {
    if (!req.file) return res.status(400).send('No file uploaded.');

    const inputPath = req.file.path;
    const videoId = path.basename(inputPath, path.extname(inputPath));
    const outputDir = path.join('outputs', videoId);

    try {
      await generateHLS(inputPath, outputDir);
      res.json({
        message: 'Upload and conversion complete',
        masterPlaylistUrl: `/outputs/${videoId}/master.m3u8`
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Conversion failed');
    }
  })();
});


// Serve the outputs statically
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

const resolutions = [
  { name: '360p', width: 640, height: 360, bitrate: '800k' },
  { name: '480p', width: 854, height: 480, bitrate: '1400k' },
  { name: '720p', width: 1280, height: 720, bitrate: '2800k' }
];

// HLS generator function
async function generateHLS(inputPath: string, outputDir: string) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const playlistLines = ['#EXTM3U'];

  for (const res of resolutions) {
    const resDir = path.join(outputDir, res.name);
    if (!fs.existsSync(resDir)) fs.mkdirSync(resDir);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .size(`${res.width}x${res.height}`)
        .videoBitrate(res.bitrate)
        .audioCodec('aac')
        .addOptions([
          '-preset veryfast',
          '-g 48',
          '-sc_threshold 0',
          '-hls_time 10',
          '-hls_list_size 0',
          '-hls_segment_filename', path.join(resDir, 'segment%d.ts')
        ])
        .output(path.join(resDir, 'index.m3u8'))
        .on('end', () => {
          playlistLines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(res.bitrate) * 1000},RESOLUTION=${res.width}x${res.height}`,
            `${res.name}/index.m3u8`
          );
          resolve(null);
        })
        .on('error', reject)
        .run();
    });
  }

  fs.writeFileSync(path.join(outputDir, 'master.m3u8'), playlistLines.join('\n'));
}