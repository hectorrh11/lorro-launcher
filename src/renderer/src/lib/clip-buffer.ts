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

const EBML_SEGMENT = 0x18538067;
const EBML_CLUSTER = 0x1f43b675;
const EBML_TIMECODE = 0xe7;
const EBML_SIMPLE_BLOCK = 0xa3;
const EBML_BLOCK_GROUP = 0xa0;
const EBML_BLOCK = 0xa1;
const HEADROOM_MS = 4000;

let stream: MediaStream | null = null;
let microphoneStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let recorder: MediaRecorder | null = null;
let chunks: { time: number; data: Blob }[] = [];
let mimeType = "video/webm";
let windowMs = DEFAULT_OPTIONS.durationSeconds * 1000;
let activeKey = "";
let saving = false;

interface EbmlElement {
  id: number;
  start: number;
  dataStart: number;
  end: number;
  sizeOffset: number;
  sizeLength: number;
  unknownSize: boolean;
}

interface WebmCluster {
  start: number;
  end: number;
  timecode: number;
  timecodeOffset: number;
  timecodeLength: number;
  hasKeyframe: boolean;
}

const readVint = (bytes: Uint8Array, offset: number, keepMarker: boolean) => {
  if (offset >= bytes.length) throw new Error("Unexpected end of WebM data");

  const first = bytes[offset];
  let length = 1;
  let mask = 0x80;

  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }

  if (length > 8 || offset + length > bytes.length) {
    throw new Error("Invalid WebM variable integer");
  }

  let value = keepMarker ? first : first & (0xff >> length);

  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index];
  }

  return {
    value,
    length,
    unknownSize: !keepMarker && value === 2 ** (7 * length) - 1,
  };
};

const readElement = (
  bytes: Uint8Array,
  offset: number,
  limit: number
): EbmlElement => {
  const id = readVint(bytes, offset, true);
  const sizeOffset = offset + id.length;
  const size = readVint(bytes, sizeOffset, false);
  const dataStart = sizeOffset + size.length;
  let end = size.unknownSize ? limit : dataStart + size.value;

  if (end > limit || end < dataStart) end = limit;

  return {
    id: id.value,
    start: offset,
    dataStart,
    end,
    sizeOffset,
    sizeLength: size.length,
    unknownSize: size.unknownSize,
  };
};

const readUint = (bytes: Uint8Array, offset: number, end: number) => {
  let value = 0;

  for (let index = offset; index < end; index += 1) {
    value = value * 256 + bytes[index];
  }

  return value;
};

const writeUint = (
  bytes: Uint8Array,
  offset: number,
  value: number,
  length: number
) => {
  let remaining = value;

  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[offset + index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
};

const writeVint = (
  bytes: Uint8Array,
  offset: number,
  length: number,
  value: number
) => {
  if (value < 0 || value >= 2 ** (7 * length) - 1) return;

  let remaining = value;

  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[offset + index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  bytes[offset] |= 0x80 >> (length - 1);
};

const blockHasKeyframe = (
  bytes: Uint8Array,
  dataStart: number,
  end: number
) => {
  if (dataStart >= end) return false;

  const track = readVint(bytes, dataStart, false);
  const flagsOffset = dataStart + track.length + 2;

  return flagsOffset < end && (bytes[flagsOffset] & 0x80) !== 0;
};

const blockGroupHasKeyframe = (bytes: Uint8Array, element: EbmlElement) => {
  let cursor = element.dataStart;

  while (cursor < element.end) {
    const child = readElement(bytes, cursor, element.end);

    if (
      child.id === EBML_BLOCK &&
      blockHasKeyframe(bytes, child.dataStart, child.end)
    ) {
      return true;
    }

    if (child.end <= cursor) break;
    cursor = child.end;
  }

  return false;
};

const parseCluster = (bytes: Uint8Array, element: EbmlElement): WebmCluster => {
  let cursor = element.dataStart;
  let timecode = 0;
  let timecodeOffset = -1;
  let timecodeLength = 0;
  let hasKeyframe = false;

  while (cursor < element.end) {
    const child = readElement(bytes, cursor, element.end);

    if (child.id === EBML_TIMECODE) {
      timecode = readUint(bytes, child.dataStart, child.end);
      timecodeOffset = child.dataStart;
      timecodeLength = child.end - child.dataStart;
    } else if (child.id === EBML_SIMPLE_BLOCK) {
      hasKeyframe ||= blockHasKeyframe(bytes, child.dataStart, child.end);
    } else if (child.id === EBML_BLOCK_GROUP) {
      hasKeyframe ||= blockGroupHasKeyframe(bytes, child);
    }

    if (child.end <= cursor) break;
    cursor = child.end;
  }

  return {
    start: element.start,
    end: element.end,
    timecode,
    timecodeOffset,
    timecodeLength,
    hasKeyframe,
  };
};

const parseWebm = (bytes: Uint8Array) => {
  let offset = 0;
  let segment: EbmlElement | null = null;

  while (offset < bytes.length) {
    const element = readElement(bytes, offset, bytes.length);

    if (element.id === EBML_SEGMENT) {
      segment = element;
      break;
    }

    if (element.end <= offset) break;
    offset = element.end;
  }

  if (!segment) throw new Error("WebM segment not found");

  const limit = segment.unknownSize ? bytes.length : segment.end;
  const clusters: WebmCluster[] = [];
  let cursor = segment.dataStart;

  while (cursor < limit) {
    const element = readElement(bytes, cursor, limit);

    if (element.id === EBML_CLUSTER) {
      clusters.push(parseCluster(bytes, element));
    }

    if (element.end <= cursor) break;
    cursor = element.end;
  }

  if (!clusters.length) throw new Error("No WebM clusters found");

  return { clusters, segment, headerEnd: clusters[0].start };
};

export const rebaseWebm = async (blob: Blob, maxDurationMs: number): Promise<Blob> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { clusters, segment, headerEnd } = parseWebm(bytes);
  const lastCluster = clusters[clusters.length - 1];
  const cutoff = Math.max(0, lastCluster.timecode - maxDurationMs);
  let startIndex = clusters.findIndex((cluster) => cluster.timecode >= cutoff);

  if (startIndex < 0) startIndex = 0;

  if (startIndex > 0) {
    let keyframeIndex = -1;

    for (let index = startIndex; index >= 0; index -= 1) {
      const cluster = clusters[index];

      if (cluster.hasKeyframe && cluster.timecode >= cutoff - 3000) {
        keyframeIndex = index;
        break;
      }
    }

    if (keyframeIndex < 0) {
      keyframeIndex = clusters.findIndex(
        (cluster, index) => index >= startIndex && cluster.hasKeyframe
      );
    }

    if (keyframeIndex >= 0) startIndex = keyframeIndex;
  }

  const selected = clusters.slice(startIndex);
  const base = selected[0].timecode;
  let total = headerEnd;

  for (const cluster of selected) total += cluster.end - cluster.start;

  const output = new Uint8Array(total);
  output.set(bytes.subarray(0, headerEnd), 0);

  let cursor = headerEnd;

  for (const cluster of selected) {
    const copy = bytes.subarray(cluster.start, cluster.end);
    output.set(copy, cursor);

    if (cluster.timecodeOffset >= 0) {
      const target = cursor + (cluster.timecodeOffset - cluster.start);
      writeUint(
        output,
        target,
        cluster.timecode - base,
        cluster.timecodeLength
      );
    }

    cursor += copy.length;
  }

  if (!segment.unknownSize && segment.sizeLength > 0) {
    writeVint(
      output,
      segment.sizeOffset,
      segment.sizeLength,
      total - segment.dataStart
    );
  }

  return new Blob([output], { type: blob.type || mimeType });
};

const getClipBlob = async () => {
  const cutoff = Date.now() - windowMs - HEADROOM_MS;
  const recent = chunks.filter((chunk) => chunk.time >= cutoff);
  const header = chunks[0];
  const parts =
    header && !recent.includes(header) ? [header, ...recent] : recent;

  if (!parts.length) return null;

  const blob = new Blob(
    parts.map((chunk) => chunk.data),
    { type: mimeType }
  );

  try {
    return await rebaseWebm(blob, windowMs);
  } catch {
    return blob;
  }
};

const flushRecorder = (timeoutMs = 700) =>
  new Promise<void>((resolve) => {
    if (!recorder || recorder.state === "inactive") {
      resolve();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      recorder?.removeEventListener("dataavailable", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);

    recorder.addEventListener("dataavailable", finish, { once: true });
    recorder.requestData();
  });

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

const supportsSystemAudio = window.electron.platform === "win32";

const captureScreen = async (options: ClipBufferOptions) => {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 } as MediaTrackConstraints,
    audio: options.systemAudio && supportsSystemAudio,
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
  const nextKey = `${options.systemAudio}|${options.microphone}`;

  if (recorder) {
    if (activeKey === nextKey) {
      windowMs = nextWindowMs;
      return true;
    }

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
    const cutoff = Date.now() - windowMs - HEADROOM_MS;
    chunks = chunks.filter(
      (chunk, index) => index === 0 || chunk.time >= cutoff
    );
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
  if (saving || (!chunks.length && !recorder)) return null;

  saving = true;

  try {
    await flushRecorder();

    const blob = await getClipBlob();
    if (!blob) return null;

    const buffer = await blob.arrayBuffer();
    const extension = blob.type.includes("mp4") ? "mp4" : "webm";
    const result = await window.electron.saveClip(buffer, extension);
    return result?.ok ? result.path : null;
  } finally {
    saving = false;
  }
};
