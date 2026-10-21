export interface ClipBufferOptions {
  durationSeconds: number;
  systemAudio: boolean;
  microphone: boolean;
}

const DEFAULT_OPTIONS: ClipBufferOptions = {
  durationSeconds: 30,
  systemAudio: true,
  microphone: false,
};

let stream: MediaStream | null = null;
let microphoneStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let recorder: MediaRecorder | null = null;
let chunks: { time: number; data: Blob }[] = [];
let mimeType = "video/webm";
let windowMs = DEFAULT_OPTIONS.durationSeconds * 1000;
let activeKey = "";
let saving = false;

export const isClipRecording = () => Boolean(recorder);

const buildAudioMix = async (
  source: MediaStream,
  options: ClipBufferOptions
): Promise<MediaStream> => {
  if (!options.microphone) return source;

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    return source;
  }

  if (!microphoneStream.getAudioTracks().length) return source;

  audioContext = new AudioContext();
  await audioContext.resume().catch(() => undefined);

  const destination = audioContext.createMediaStreamDestination();
  const inputs = [source, microphoneStream];

  for (const input of inputs) {
    if (!input.getAudioTracks().length) continue;
    const node = audioContext.createMediaStreamSource(input);
    node.connect(destination);
  }

  return new MediaStream([
    ...source.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
};

const captureScreen = async (options: ClipBufferOptions) => {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 } as MediaTrackConstraints,
    audio: options.systemAudio,
  });

  return buildAudioMix(display, options);
};

export const startClipBuffer = async (
  partialOptions?: Partial<ClipBufferOptions>
) => {
  const options: ClipBufferOptions = {
    ...DEFAULT_OPTIONS,
    ...partialOptions,
  };

  const nextWindowMs = Math.max(5000, options.durationSeconds * 1000);
  const nextKey = `${nextWindowMs}|${options.systemAudio}|${options.microphone}`;

  if (recorder) {
    if (activeKey === nextKey) return true;
    stopClipBuffer();
  }

  stream = await captureScreen(options);
  windowMs = nextWindowMs;
  activeKey = nextKey;

  mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";

  chunks = [];
  recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 128_000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return;
    chunks.push({ time: Date.now(), data: event.data });
    const cutoff = Date.now() - windowMs;
    chunks = chunks.filter((chunk) => chunk.time >= cutoff);
  };

  recorder.start(1000);
  return true;
};

export const stopClipBuffer = () => {
  recorder?.stop();
  recorder = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  void audioContext?.close().catch(() => undefined);
  audioContext = null;
  chunks = [];
  activeKey = "";
};

export const saveLastClip = async (): Promise<string | null> => {
  if (saving || !chunks.length) return null;

  saving = true;

  try {
    const cutoff = Date.now() - windowMs;
    const slice = chunks.filter((chunk) => chunk.time >= cutoff);
    if (!slice.length) return null;

    const blob = new Blob(
      slice.map((chunk) => chunk.data),
      { type: mimeType }
    );
    const buffer = await blob.arrayBuffer();
    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    const result = await window.electron.saveClip(buffer, extension);
    return result?.ok ? result.path : null;
  } finally {
    saving = false;
  }
};
