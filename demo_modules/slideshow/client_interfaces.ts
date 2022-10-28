import { Content } from "./interfaces.ts";

export interface ClientLoadStrategy {
  /**
   * Loads content specified by the content id. The first parameter comes
   * from the server version of this strategy by way of the display
   * strategy. The promise is expected to resolve to an Element.
   */
  loadContent(contentId: string): Promise<Content>;
}

export interface ClientDisplayStrategy {
  /** Update the surface with the content. */
  draw(time: number, delta: number): void;
}
