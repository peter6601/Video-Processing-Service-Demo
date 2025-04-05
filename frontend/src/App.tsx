import { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return alert('請先選擇影片檔案');

    const formData = new FormData();
    formData.append('video', file);

    setIsUploading(true);
    setUploadProgress(0);
    setShowModal(false);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:3000/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setVideoUrl(`http://localhost:3000${data.masterPlaylistUrl}`);
        setShowModal(true);
      } else {
        alert('上傳失敗');
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      alert('請求錯誤');
    };

    xhr.send(formData);
  };

  useEffect(() => {
    if (videoUrl) {
      const video = document.getElementById('video') as HTMLVideoElement;
      if (video) {
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
        }
      }
    }
  }, [videoUrl]);

  return (
    <div className="p-4">
      <input
        type="file"
        accept="video/*"
        ref={fileInputRef}
      />
      <button
        onClick={handleUpload}
        className="ml-2 px-4 py-1 bg-blue-600 text-white rounded"
        disabled={isUploading}
      >
        {isUploading ? '上傳中...' : '上傳'}
      </button>

      {isUploading && (
        <div className="mt-2 w-full bg-gray-200 rounded">
          <div
            className="bg-blue-500 text-xs leading-none py-1 text-center text-white rounded"
            style={{ width: `${uploadProgress}%` }}
          >
            {uploadProgress < 100 ? `${uploadProgress}%` : '轉檔中...'}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold mb-2">上傳成功</h2>
            <p>影片已完成轉檔並可播放！</p>
            <button
              className="mt-4 px-4 py-1 bg-blue-600 text-white rounded"
              onClick={() => setShowModal(false)}
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {videoUrl && <video id="video" controls width="640" className="mt-4" />}
    </div>
  );
}

export default App;