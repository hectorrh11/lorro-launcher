import { useEffect, useRef } from "react";
import { toLocalUrl, useAppearance } from "@renderer/features/appearance";

export function LorroBackground() {
  const { background } = useAppearance();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
      } else {
        video.play().catch(() => undefined);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [background]);

  if (!background) return null;

  if (background.kind === "preset") {
    return (
      <div className="lorro-background" aria-hidden="true">
        <div
          className={`lorro-background__media lorro-wallpaper lorro-wallpaper--${background.path}`}
        />
        <div className="lorro-background__overlay" />
      </div>
    );
  }

  const url = toLocalUrl(background.path);

  return (
    <div className="lorro-background" aria-hidden="true">
      {background.kind === "video" ? (
        <video
          ref={videoRef}
          className="lorro-background__media"
          src={url}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <img
          className="lorro-background__media"
          src={url}
          alt=""
          decoding="async"
          draggable={false}
        />
      )}

      <div className="lorro-background__overlay" />
    </div>
  );
}
