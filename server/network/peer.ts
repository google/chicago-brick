import { easyLog } from "../../lib/log.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import * as network from "./network.ts";

const log = easyLog("wall:peer");

interface PeerInfo {
  socket: TypedWebsocketLike;
  serializedRect: string;
}

const knownPeers = new Map<string, PeerInfo>();

type PeerMessages =
  | "peer-offer"
  | "peer-icecandidate"
  | "peer-answer";

function relayMessage<T extends PeerMessages>(
  msg: T,
  ...payload: Parameters<EmittedEvents[T]>
) {
  const { to, from } = payload[0];
  const toPeer = knownPeers.get(to);
  if (!toPeer) {
    log.error(`Unknown peer for msg ${msg}: ${to}`);
    return;
  }
  log(`Forwarding ${msg} message from ${from} to ${to}`);
  // Forward this along to the destination peer so it can connect.
  toPeer.socket.send(msg, ...payload);
}

export function initPeer() {
  network.wss.on("connection", (client: TypedWebsocketLike) => {
    client.on("peer-register", ({ id, rect }) => {
      log(`Peer registered with id ${id} and rect ${rect}`);
      // What do we need to store about a peer? Anything?
      knownPeers.set(id, { socket: client, serializedRect: rect });
    });
    client.on(
      "peer-offer",
      (data) => relayMessage("peer-offer", data),
    );
    client.on(
      "peer-icecandidate",
      (data) => relayMessage("peer-icecandidate", data),
    );
    client.on(
      "peer-answer",
      (data) => relayMessage("peer-answer", data),
    );
    client.on("disconnect", () => {
      const foundPeerEntry = [...knownPeers].find(([, peer]) => {
        return peer.socket === client;
      });
      if (!foundPeerEntry) {
        return;
      }
      const [peerid] = foundPeerEntry;
      log(`Lost peer ${peerid}`);
      knownPeers.delete(peerid);
    });
  });
  log("peer relay registered");
}
