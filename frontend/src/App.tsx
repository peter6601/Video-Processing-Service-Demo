
import React, { useState } from 'react';
import Hls from 'hls.js';

function App() {
  const [videoUrl, setVideoUrl] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('video', file);

    const res = await fetch('http://localhost:3000/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    setVideoUrl(`http://localhost:3000${data.masterPlaylistUrl}`);
  };

  return (
    <div className="p-4">
      <input type="file" accept="video/*" onChange={handleUpload} />
      {videoUrl && (
        <video id="video" controls width="640" className="mt-4" />
      )}
      {videoUrl && typeof window !== 'undefined' && (() => {
        const video = document.getElementById('video') as HTMLVideoElement;
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
        }
      })()}
    </div>
  );
}

export default App;