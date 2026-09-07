export interface BrowserCapabilities {
  webCodecs: boolean;
  videoEncoder: boolean;
  audioEncoder: boolean;
  offscreenCanvas: boolean;
  fileSystemAccess: boolean;
  sharedArrayBuffer: boolean;
  mediaRecorder: boolean;
  canvasCaptureStream: boolean;
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  return {
    webCodecs: 'VideoDecoder' in window,
    videoEncoder: 'VideoEncoder' in window,
    audioEncoder: 'AudioEncoder' in window,
    offscreenCanvas: 'OffscreenCanvas' in window,
    fileSystemAccess: 'showOpenFilePicker' in window,
    sharedArrayBuffer: 'SharedArrayBuffer' in window,
    mediaRecorder: 'MediaRecorder' in window,
    canvasCaptureStream: 'captureStream' in HTMLCanvasElement.prototype,
  };
}
