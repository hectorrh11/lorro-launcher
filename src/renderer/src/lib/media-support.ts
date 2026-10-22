export function canPlayVideoSource(
  source: string,
  timeoutMs = 12000
): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) finish(false);
    };
    video.onloadeddata = () =>
      finish(video.videoWidth > 0 && video.videoHeight > 0);
    video.onerror = () => finish(false);
    video.src = source;
    video.load();
  });
}
