// server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 載入 .env 環境變數
dotenv.config();

// ES模塊兼容性處理
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// 是否為 Render 環境
const isRender = process.env.RENDER === 'true';
const uploadDir = isRender ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const outputBaseDir = isRender ? '/tmp/outputs' : path.join(__dirname, 'outputs');

// Enable CORS
app.use(cors());
app.use('/outputs', express.static(outputBaseDir));

// Firebase 初始化
let serviceAccount;
try {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '';
  if (!serviceAccountPath) {
    throw new Error('Firebase service account path not provided');
  }
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
} catch (err) {
  console.error('❌ Failed to load Firebase service account:', err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});
const bucket = admin.storage().bucket();

// 健康檢查
app.get('/ping', (req, res) => {
  res.send('pong');
});

// 確保上傳目錄存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 上傳設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now();
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// 上傳並轉檔
app.post('/upload', upload.single('video'), (req: Request, res: Response) => {
  (async () => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const inputPath = req.file.path;
    const videoId = path.basename(inputPath, path.extname(inputPath));
    const outputDir = path.join(outputBaseDir, videoId);

    try {
      await generateHLS(inputPath, outputDir);
      await uploadToFirebaseStorage(outputDir, `videos/${videoId}`);

      // 刪除原始影片
      fs.unlink(inputPath, (err) => {
        if (err) console.error(`❌ 無法刪除原始影片: ${inputPath}`, err);
        else console.log(`🧹 已刪除原始影片: ${inputPath}`);
      });

      const masterUrl = `https://storage.googleapis.com/${bucket.name}/videos/${videoId}/master.m3u8`;
      return res.status(202).json({
        status: 'processing',
        message: 'Upload and conversion complete',
        masterPlaylistUrl: masterUrl,
      });
    } catch (err) {
      console.error('❌ 轉檔失敗:', err);
      return res.status(500).send('Conversion failed');
    }
  })();
});

// 轉檔解析度設定（只保留 480p 與 720p）
const resolutions = [
  { name: '480p', width: 854, height: 480, bitrate: '1400k' },
  { name: '720p', width: 1280, height: 720, bitrate: '2800k' },
];

async function generateHLS(inputPath: string, outputDir: string): Promise<void> {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const playlistLines = ['#EXTM3U'];

  for (const res of resolutions) {
    const resDir = path.join(outputDir, res.name);
    if (!fs.existsSync(resDir)) fs.mkdirSync(resDir);

    await new Promise<void>((resolve, reject) => {
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
          '-hls_segment_filename',
          path.join(resDir, 'segment%d.ts'),
        ])
        .output(path.join(resDir, 'index.m3u8'))
        .on('end', () => {
          playlistLines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(res.bitrate) * 1000},RESOLUTION=${res.width}x${res.height}`,
            `${res.name}/index.m3u8`
          );
          resolve();
        })
        .on('error', reject)
        .run();
    });
  }

  fs.writeFileSync(path.join(outputDir, 'master.m3u8'), playlistLines.join('\n'));
}

async function uploadToFirebaseStorage(localDir: string, remotePath: string): Promise<void> {
  const files = fs.readdirSync(localDir);
  for (const file of files) {
    const fullPath = path.join(localDir, file);
    const stat = fs.statSync(fullPath);
    const remoteDest = `${remotePath}/${file}`;

    if (stat.isDirectory()) {
      await uploadToFirebaseStorage(fullPath, remoteDest);
    } else {
      await bucket.upload(fullPath, {
        destination: remoteDest,
        metadata: {
          contentType: getContentType(file),
          cacheControl: 'public, max-age=31536000',
        },
        public: true,
      });
    }
  }
}

// 根據檔案副檔名取得適當的 Content-Type
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.m3u8':
      return 'application/vnd.apple.mpegurl';
    case '.ts':
      return 'video/mp2t';
    default:
      return 'application/octet-stream';
  }
}

// 查詢影片轉檔狀態
app.get('/api/videos/:videoId/status', (req: Request<{ videoId: string }>, res: Response) => {
  (async () => {
    const { videoId } = req.params;
    const masterPath = `videos/${videoId}/master.m3u8`;

    try {
      const file = bucket.file(masterPath);
      const [exists] = await file.exists();

      if (exists) {
        const [metadata] = await file.getMetadata();
        return res.json({
          status: 'ready',
          masterPlaylistUrl: `https://storage.googleapis.com/${bucket.name}/${masterPath}`,
          updatedAt: metadata.updated,
          size: metadata.size,
        });
      } else {
        return res.json({ status: 'processing', message: '影片尚未轉檔完成或不存在' });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '查詢影片狀態失敗' });
    }
  })();
});

// 列出所有影片
app.get('/api/videos', (req: Request, res: Response) => {
  (async () => {
    const prefix = 'videos/';
    try {
      const [files] = await bucket.getFiles({ prefix });
      const masterFiles = files.filter((file) => file.name.endsWith('master.m3u8'));

      const result = await Promise.all(
        masterFiles.map(async (file) => {
          const [metadata] = await file.getMetadata();
          const videoId = file.name.split('/')[1];
          return {
            videoId,
            masterPlaylistUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
            updatedAt: metadata.updated,
            size: metadata.size,
          };
        })
      );

      return res.json(result);
    } catch (err) {
      console.error('❌ 取得影片清單失敗:', err);
      return res.status(500).json({ error: '無法列出影片' });
    }
  })();
});

// 刪除指定影片
app.delete('/api/videos/:videoId', (req: Request<{ videoId: string }>, res: Response) => {
  (async () => {
    const { videoId } = req.params;
    const prefix = `videos/${videoId}/`;

    try {
      const [files] = await bucket.getFiles({ prefix });

      if (files.length === 0) {
        return res.status(404).json({ error: '找不到影片或已刪除' });
      }

      await Promise.all(files.map((file) => file.delete()));
      return res.json({
        status: 'deleted',
        message: `影片 ${videoId} 已刪除 (${files.length} 個檔案)`,
      });
    } catch (err) {
      console.error('❌ 刪除影片失敗:', err);
      return res.status(500).json({ error: '刪除影片失敗' });
    }
  })();
});

// 啟動伺服器
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
