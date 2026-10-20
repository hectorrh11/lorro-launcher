let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: { time: number; data: Blob }[] = [];
let mimeType = "video/webm";
const WINDOW_MS = 35_000;

export const isClipRecording = () => Boolean(recorder);

export const startClipBuffer = async () => {
  if (recorder) return true;

  const sourceId = await window.electron.getClipSource();
  if (!sourceId) throw new Error("No screen source available.");

  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxFrameRate: 30,
        maxWidth: 1920,
        maxHeight: 1080,
      },
    } as unknown as MediaTrackConstraints,
  });

  mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";

  chunks = [];
  recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return;
    chunks.push({ time: Date.now(), data: event.data });
    const cutoff = Date.now() - WINDOW_MS;
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
  chunks = [];
};

export const saveLastClip = async (): Promise<string | null> => {
  if (!chunks.length) return null;

  const cutoff = Date.now() - WINDOW_MS;
  const slice = chunks.filter((chunk) => chunk.time >= cutoff);
  if (!slice.length) return null;

  const blob = new Blob(
    slice.map((chunk) => chunk.data),
    { type: mimeType }
  );
  const buffer = await blob.arrayBuffer();
  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  return window.electron.saveClip(buffer, extension);
};
