import { Surface } from "../../client/surface/surface.ts";
import { ContentId } from "./interfaces.ts";

export interface ClientLoadStrategy {
  /**
   * Loads content specified by the content id. The first parameter comes
   * from the server version of this strategy by way of the display
   * strategy. The promise is expected to resolve to an Element.
   */
  loadContent(contentId: ContentId, surface: Surface): Promise<Content>;
}

export interface ClientDisplayStrategy {
  /** Update the surface with the content. */
  draw(time: number, delta: number): void;
}

export interface Content {
  /** The type of the content. */
  readonly type: "video" | "image";
  /** Returns the width of the content. */
  readonly width: number;
  /** Returns the height of the content. */
  readonly height: number;
  /** The 'size' of the content, in terms of bytes. */
  readonly size: number;
  /** Some Element that refers to the content itself. */
  element: HTMLElement;
  /** Some pieces of content have a draw function. */
  draw?: (startTime: number, time: number, delta: number) => void;
}
