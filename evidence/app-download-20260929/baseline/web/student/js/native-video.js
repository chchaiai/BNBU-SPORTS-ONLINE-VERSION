// Use the browser's local H.264/AAC encoder before loading the WASM fallback.
// Canvas/Web Audio output contains no source location or camera metadata.
export async function compressVideoNatively(file) {
  const mimeType = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2']
    .find(type => globalThis.MediaRecorder?.isTypeSupported(type));
  if (!mimeType || !globalThis.AudioContext || !HTMLCanvasElement.prototype.captureStream) return null;
  const video = document.createElement('video'), canvas = document.createElement('canvas');
  const url = URL.createObjectURL(file);
  let audio, stream, recorder, animation, timer;
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  video.style.cssText = 'position:fixed;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none';
  document.body.append(video);
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Video metadata timeout')), 12000);
      video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Video decode failed'));
      video.src = url;
    });
    clearTimeout(timer);
    if (!video.videoWidth || !video.videoHeight) throw new Error('Video dimensions unavailable');
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(2, Math.floor(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.floor(video.videoHeight * scale / 2) * 2);
    const context = canvas.getContext('2d', {alpha:false});
    stream = canvas.captureStream(30);
    audio = new AudioContext();
    const source = audio.createMediaElementSource(video), destination = audio.createMediaStreamDestination();
    source.connect(destination);
    // The element's mute flag silences MediaElementSource too. Output is routed
    // only into the recorder, so unmuting here never plays through the speakers.
    video.muted = false;
    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    await audio.resume();
    if (audio.state !== 'running') throw new Error('Audio encoder unavailable');
    recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond:1800000, audioBitsPerSecond:96000});
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const result = new Promise((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Native encoding failed'));
      recorder.onstop = () => resolve(new File(chunks, 'recording.mp4', {type:'video/mp4'}));
      video.onerror = () => reject(new Error('Video playback failed'));
      video.onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      timer = setTimeout(() => reject(new Error('Native encoding timeout')), 25000);
    });
    const draw = () => { context.drawImage(video,0,0,canvas.width,canvas.height); animation = requestAnimationFrame(draw); };
    // Attach rejection handling before play(), which can fail under autoplay policy.
    const playback = (async () => { await video.play(); draw(); recorder.start(); })();
    await Promise.all([playback, result]);
    return await result;
  } finally {
    clearTimeout(timer); cancelAnimationFrame(animation);
    if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); }
    stream?.getTracks().forEach(track => track.stop());
    video.pause(); video.removeAttribute('src'); video.load(); video.remove();
    URL.revokeObjectURL(url); if (audio) await audio.close();
  }
}
