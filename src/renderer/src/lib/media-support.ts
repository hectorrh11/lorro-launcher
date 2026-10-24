export function canPlayVideoSource(
  source: string,
  timeoutMs = 20000
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
      video.oncanplay = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.style.position = "fixed";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };
    video.onloadeddata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };
    video.oncanplay = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };
    video.onerror = () => finish(false);
    document.body.appendChild(video);
    video.src = source;
    video.load();
    video.play().catch(() => undefined);
  });
}
