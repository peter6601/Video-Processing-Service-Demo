# 🎬 Video Upload & HLS Streaming App

這是一個全端專案，支援使用者透過前端介面上傳影片並轉換為 HLS 格式，轉檔後可選擇不同畫質播放影片。

---

## 📁 專案結構

```
.
├── backend/      # 後端服務 - Node.js + Express + ffmpeg
├── frontend/     # 前端介面 - React + Vite + HLS.js
```

---

## 🔧 環境需求

- Node.js (建議 v18+)
- npm
- ffmpeg（需安裝於本機系統）

### 安裝 ffmpeg：

- macOS：
  ```bash
  brew install ffmpeg
  ```
- Ubuntu：
  ```bash
  sudo apt update && sudo apt install ffmpeg
  ```
- Windows：
  請從 [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html) 下載並設定系統環境變數

---

## 📦 安裝步驟

### 1️⃣ 安裝後端（backend）

```bash
cd backend
npm install
mkdir uploads outputs
```

> ⚠️ `uploads/` 與 `outputs/` 是用來儲存上傳影片與轉檔後的檔案，請務必建立。

---

### 2️⃣ 啟動後端伺服器

```bash
npm run dev
```

預設會啟動在 `http://localhost:3001`

---

### 3️⃣ 安裝前端（frontend）

在專案根目錄中執行：

```bash
cd frontend
npm install
```

---

### 4️⃣ 啟動前端開發伺服器

```bash
npm run dev
```

預設會啟動在 `http://localhost:5173`

---

## 🧪 功能測試

### 🔄 1. 檢查後端狀態

前端會自動 ping `/ping` 來檢查後端是否在線，並在介面上顯示狀態。

### ⬆️ 2. 上傳影片

- 支援影片類型 (`video/*`)
- 檔案大小限制為 500MB
- 上傳後伺服器會轉檔為 HLS 並產出三種畫質：360p、480p、720p
- 成功後會顯示播放器並可切換畫質

### ▶️ 3. 播放影片 + 切換畫質

使用 [HLS.js](https://github.com/video-dev/hls.js) 播放轉檔後的影片，支援畫質切換功能。

---

## 📝 注意事項

- 僅供本地開發用途，尚未實作驗證與安全機制。
- 不支援續傳、縮圖等進階功能。
- 若需部署至正式環境，建議整合雲端儲存與轉檔服務（如 AWS S3 + MediaConvert）。

---

## 📮 API 介面（後端）

| Method | Path       | 說明         |
|--------|------------|--------------|
| GET    | `/ping`    | 健康檢查回應 `pong` |
| POST   | `/upload`  | 上傳影片（form-data，key 為 `video`）|

---

## 🧪 開發與測試狀態

目前此專案設計為 **本地開發與測試環境使用**，使用者可於本機上：

- 啟動後端（提供 API 與 HLS 轉檔服務）
- 啟動前端（提供影片上傳與播放 UI）
- 測試影片上傳、轉檔與畫質切換功能

---

## ✅ TODO：未來規劃

- [ ] 將前端 build 檔案整合至後端以單一伺服器提供服務
- [ ] 將後端部署至雲端主機（如 EC2、Render、VPS 等）
- [ ] 整合影片儲存至雲端（如 S3）
- [ ] 加入使用者驗證機制
- [ ] 增加影片刪除與管理功能
- [ ] 增加影片轉檔佇列處理與狀態追蹤
- [ ] 增加影片縮圖預覽功能
