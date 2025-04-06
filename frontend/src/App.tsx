import { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentQuality, setCurrentQuality] = useState('720p'); // 預設最高畫質
  const [serverStatus, setServerStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  
  const BASE_URL = 'http://localhost:3001';

  // 檢查服務器健康狀態
  const checkServerStatus = async () => {
    setIsCheckingServer(true);
    try {
      console.log('開始檢查服務器狀態...');
      const response = await fetch(`${BASE_URL}/ping`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        },
        signal: AbortSignal.timeout(5000)
      });
      
      console.log('服務器回應狀態碼:', response.status);
      const responseText = await response.text();
      console.log('服務器回應內容:', responseText);
      
      if (response.ok && responseText === 'pong') {
        console.log('服務器判定為在線');
        setServerStatus('online');
        return true;
      } else {
        console.log('服務器判定為離線，回應不符合預期');
        setServerStatus('offline');
        return false;
      }
    } catch (error) {
      console.error('服務器檢查出錯:', error);
      setServerStatus('offline');
      return false;
    } finally {
      setIsCheckingServer(false);
    }
  };

  // 組件初始化時檢查服務器狀態
  useEffect(() => {
    checkServerStatus();
    
    // 每60秒檢查一次服務器狀態
    const intervalId = setInterval(checkServerStatus, 60000);
    
    return () => clearInterval(intervalId);
  }, []);

  // 驗證文件
  const validateFile = (file: File) => {
    // 檢查是否為影片文件
    if (!file.type.startsWith('video/')) {
      alert('請選擇有效的影片文件');
      return false;
    }

    // 檢查文件大小，這裡設定 500MB 限制
    const maxSize = 500 * 1024 * 1024; // 500MB in bytes
    if (file.size > maxSize) {
      alert('文件大小不能超過 500MB');
      return false;
    }

    return true;
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return alert('請先選擇影片檔案');

    if (!validateFile(file)) return;
    
    // 上傳前先檢查服務器狀態
    setIsCheckingServer(true);
    const isServerOnline = await checkServerStatus();
    setIsCheckingServer(false);
    
    if (!isServerOnline) {
      alert('服務器目前不可用，請稍後再試');
      return;
    }

    const formData = new FormData();
    formData.append('video', file);

    setIsUploading(true);
    setUploadProgress(0);
    setShowModal(false);
    setVideoUrl(''); // 清除之前的視頻

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          const fullUrl = `${BASE_URL}${data.masterPlaylistUrl}`;
          setVideoUrl(fullUrl);
          setShowModal(true);
          // 當上傳完成後，設置可用畫質
          setAvailableQualities(['360p', '480p', '720p']); // 基於server.ts中的設置
          setCurrentQuality('720p'); // 預設最高畫質
        } catch (error) {
          alert('解析回應失敗: ' + error);
        }
      } else {
        alert(`上傳失敗: ${xhr.status} ${xhr.statusText}`);
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      alert('請求錯誤，請檢查網絡連接');
      // 發生錯誤時再次檢查服務器狀態
      checkServerStatus();
    };

    xhr.timeout = 300000; // 5分鐘超時
    xhr.ontimeout = () => {
      setIsUploading(false);
      alert('請求超時，請檢查網絡連接或減小文件大小');
      // 超時時再次檢查服務器狀態
      checkServerStatus();
    };

    xhr.send(formData);
  };

  // 手動檢查服務器
  const handleCheckServer = () => {
    checkServerStatus();
  };

  // 切換畫質
  const changeQuality = (quality: string) => {
    if (!videoUrl || !hlsRef.current) return;
    
    setCurrentQuality(quality);
    
    // 從原始 m3u8 URL 獲取基礎路徑
    const baseUrl = videoUrl.substring(0, videoUrl.lastIndexOf('/') + 1);
    // 依據選擇的畫質設置新的播放源
    const qualityUrl = `${baseUrl}${quality}/index.m3u8`;
    
    const video = document.getElementById('video') as HTMLVideoElement;
    const currentTime = video.currentTime;
    const isPaused = video.paused;
    
    // 重新載入新畫質
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }
    
    const hls = new Hls();
    hlsRef.current = hls;
    hls.loadSource(qualityUrl);
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      // 恢復播放位置和狀態
      video.currentTime = currentTime;
      if (!isPaused) {
        video.play().catch(e => console.error('無法自動播放:', e));
      }
    });
  };

  useEffect(() => {
    // 當組件卸載時清理 HLS 實例
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (videoUrl) {
      const video = document.getElementById('video') as HTMLVideoElement;
      if (video) {
        if (Hls.isSupported()) {
          // 清理之前的實例
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }
          
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          
          // 監聽 manifest 解析事件，可以獲取可用的畫質
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(e => console.error('無法自動播放:', e));
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
          video.addEventListener('loadedmetadata', () => {
            video.play().catch(e => console.error('無法自動播放:', e));
          });
        } else {
          alert('您的瀏覽器不支持 HLS 視頻格式，請使用最新版的 Chrome, Firefox, Edge 或 Safari');
        }
      }
    }
  }, [videoUrl]);

  // 渲染服務器狀態指示器
  const renderServerStatus = () => {
    let statusColor = 'bg-gray-300'; // 預設未知
    let statusText = '未檢查';

    if (isCheckingServer) {
      statusColor = 'bg-yellow-300';
      statusText = '檢查中...';
    } else if (serverStatus === 'online') {
      statusColor = 'bg-green-500';
      statusText = '服務器在線';
    } else if (serverStatus === 'offline') {
      statusColor = 'bg-red-500';
      statusText = '服務器離線';
    }

    return (
      <div className="flex items-center space-x-2 mb-4">
        <div className={`w-3 h-3 rounded-full ${statusColor}`}></div>
        <span>{statusText}</span>
        <button 
          onClick={handleCheckServer}
          disabled={isCheckingServer}
          className="ml-2 text-sm px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition"
        >
          重新檢查
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">影片上傳與轉檔系統</h1>
      
      {renderServerStatus()}
      
      <div className="mb-4 p-4 border rounded shadow">
        <h2 className="text-lg font-semibold mb-2">選擇並上傳影片</h2>
        <div className="flex flex-wrap items-center">
          <input
            type="file"
            accept="video/*"
            ref={fileInputRef}
            className="border p-2 rounded"
          />
          <button
            onClick={handleUpload}
            className={`ml-2 px-4 py-2 rounded transition ${
              serverStatus === 'online' 
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-400 text-gray-700 cursor-not-allowed'
            }`}
            disabled={isUploading || serverStatus !== 'online'}
          >
            {isUploading ? '上傳中...' : '上傳'}
          </button>
        </div>

        {serverStatus !== 'online' && !isCheckingServer && (
          <p className="mt-2 text-sm text-red-500">
            服務器不可用，無法上傳。請檢查伺服器狀態後再試。
          </p>
        )}

        {isUploading && (
          <div className="mt-4">
            <p className="mb-1">上傳進度:</p>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-blue-500 h-4 rounded-full transition-all duration-300 text-xs text-white text-center leading-4"
                style={{ width: `${uploadProgress}%` }}
              >
                {uploadProgress < 100 ? `${uploadProgress}%` : '轉檔中...'}
              </div>
            </div>
            {uploadProgress === 100 && (
              <p className="mt-2 text-sm text-gray-600">
                文件已上傳，正在進行轉檔處理，請稍候...
              </p>
            )}
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="mt-6 border p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">影片播放器</h2>
          
          <div className="mb-3">
            <p className="mb-1">選擇畫質:</p>
            <div className="flex space-x-2">
              {availableQualities.map(quality => (
                <button
                  key={quality}
                  onClick={() => changeQuality(quality)}
                  className={`px-3 py-1 rounded text-sm ${
                    currentQuality === quality
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {quality}
                </button>
              ))}
            </div>
          </div>
          
          <video 
            id="video" 
            controls 
            className="w-full max-h-96 bg-black" 
            playsInline
          />
          
          <p className="mt-2 text-sm text-gray-600">
            當前畫質: {currentQuality}
          </p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded shadow max-w-md">
            <h2 className="text-lg font-semibold mb-2">上傳成功</h2>
            <p>影片已完成轉檔並可播放！您現在可以使用播放器查看您的影片，並且可以切換不同畫質。</p>
            <button
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              onClick={() => setShowModal(false)}
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;