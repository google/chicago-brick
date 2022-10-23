import { easyLog } from "../../lib/log.ts";
import { WS } from "../../lib/websocket.ts";
import * as network from "./network.ts";

const log = easyLog("wall:peer");

// The only thing we remember about a peer right now it its socket.
interface PeerInfo {
  socket: WS;
}

interface CommonPayloadFields {
  to: string;
}

const knownPeers = new Map<string, PeerInfo>();

function relayMessage(msg: string, payload: CommonPayloadFields) {
  const { to } = payload;
  const toPeer = knownPeers.get(to);
  if (!toPeer) {
    log.error(`Unknown peer: ${to}`);
    return;
  }
  // Forward this along to the destination peer so it can connect.
  toPeer.socket.send(msg, payload as never);
}

export function initPeer() {
  network.wss.on("connection", (client: WS) => {
    client.on("peer-register", ({ id }) => {
      // What do we need to store about a peer? Anything?
      knownPeers.set(id, { socket: client });

      client.send("peer-list", {
        knownPeers: [...knownPeers.keys()],
      });
    });
    client.on(
      "peer-offer",
      (data: CommonPayloadFields) => relayMessage("peer-offer", data),
    );
    client.on(
      "peer-icecandidate",
      (data: CommonPayloadFields) => relayMessage("peer-icecandidate", data),
    );
    client.on(
      "peer-answer",
      (data: CommonPayloadFields) => relayMessage("peer-answer", data),
    );
  });
  log("peer relay registered");
}
