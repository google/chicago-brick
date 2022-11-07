import { Point } from "../../lib/math/vector2d.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import { ContentId, ContentPage } from "./interfaces.ts";

// Here, we specify the interfaces for the load and display strategies. There is
// a separate interface for the server and the client.
export interface ServerLoadStrategy {
  /**
   * Return a promise of a result with the following properties:
   *  - paginationToken: An opaque token that will be passed to the next
   *    invocation of loadMoreContent if there is more content to download.
   *  - content: An array of content, suitable for transmission to the client.
   */
  loadMoreContent(paginationToken?: string): ContentPage | Promise<ContentPage>;

  /**
   * Returns the bytes associated with the provided content.
   * Used when we need to write some remote content locally.
   */
  getBytes(contentId: ContentId): Promise<Uint8Array>;
}

export interface ServerDisplayStrategy {
  /** Coordinate with the clients about what should be shown. */
  tick(time: number, delta: number): void;
  /** Called when content with a duration has finished. */
  contentEnded(
    contentId: ContentId,
    offset: Point,
    socket: TypedWebsocketLike,
  ): void;

  /** Called whenever new content is available for display. */
  newContentArrived?: () => void;
  /**
   * Called whenever all the content has been downloaded.
   * Some loading strategies don't necessarily have an end, and can load forever.
   */
  allContentArrived?: () => void;
}
