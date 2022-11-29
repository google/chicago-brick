import { VideoContentOptions } from "./interfaces.ts";
import { Logger } from "../../lib/log.ts";

export type DrawFn = (startTime: number, time: number, delta: number) => void;

export function setUpVideo(
  config: VideoContentOptions,
  durationFn: () => number,
  currentTimeFn: () => number,
  setCurrentTimeFn: (time: number) => void,
  setPlaybackRate: (rate: number) => void,
  setDebugContent: (str: string) => void,
  log: Logger,
): DrawFn | undefined {
  if (config.sync) {
    // True, if we've already tried to sync the video once.
    let didTryToSync = false;
    // We need to sync the video.
    return (startTime: number, time: number, delta: number) => {
      // When restarting a server, time can wind backwards. If we ever see
      // this case, just flip out.
      if (delta <= 0) {
        return;
      }

      const duration = durationFn();

      // We want the videos to be sync'd to some ideal clock. We use the
      // server's clock, as guessed by the client.
      const correctTime = config.loop
        ? (((time - startTime) % duration) + duration) % duration
        : time - startTime;

      // The video is currently here:
      let actualTime = currentTimeFn();

      if (config.loop) {
        if (Math.abs(actualTime - correctTime) > duration / 2) {
          log(
            "Off by a period. Adjusting from",
            actualTime.toFixed(0),
            "to",
            (actualTime - Math.sign(actualTime - correctTime) * duration)
              .toFixed(0),
          );
          actualTime -= Math.sign(actualTime - correctTime) * duration;
        }
      }

      if (!didTryToSync && Math.abs(actualTime - correctTime) > 2000) {
        setCurrentTimeFn(correctTime);
        didTryToSync = true;
        log(
          `Attempted to jump video to ${correctTime} (it's currently at ${actualTime})`,
        );
      }

      const rateFactor = 2.0;
      let rate;
      if (
        0 <= actualTime - correctTime &&
        actualTime - correctTime < 1000 / 60 / 2
      ) {
        rate = 1;
      } else if (actualTime > correctTime) {
        rate = 1 / rateFactor;
      } else {
        rate = rateFactor;
      }

      if (config.syncDebug) {
        setDebugContent(
          `${(actualTime).toFixed(0)} | ${
            (correctTime).toFixed(0)
          } | ${rate}x | ${time.toFixed(0)}`,
        );
      }

      setPlaybackRate(rate);
    };
  }
}

export function setUpVideoElement(
  config: VideoContentOptions,
  video: HTMLVideoElement,
  log: Logger,
): DrawFn | undefined {
  return setUpVideo(config, () => {
    return video.duration * 1000;
  }, () => {
    return video.currentTime * 1000;
  }, (time) => {
    video.currentTime = time / 1000;
  }, (rate) => {
    if (video.playbackRate !== rate) {
      log("Adjusting playback rate to", rate);
      video.playbackRate = rate;
    }
  }, (str) => {
    let el = video.parentElement?.querySelector(
      ".test",
    ) as HTMLDivElement;
    if (!el) {
      el = document.createElement("div")!;
      el.classList.add("test");
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.right = "0";
      el.style.top = "0";
      el.style.bottom = "0";
      el.style.textAlign = "center";
      el.style.font = "36px sans-serif";
      el.style.color = "white";
      video.parentElement?.appendChild(el);
    }

    el.textContent = str;
  }, log);
}
