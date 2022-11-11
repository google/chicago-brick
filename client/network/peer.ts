/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import * as info from "../util/info.ts";
import { easyLog } from "../../lib/log.ts";
import * as network from "./network.ts";
import { Point } from "../../lib/math/vector2d.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { Handler } from "../../lib/event.ts";
import { delay, delayThenReject } from "../../lib/promise.ts";

const log = easyLog("wall:peer");

// deno-lint-ignore no-explicit-any
export type HandlerWithSocket<T extends (...args: any[]) => void> = (
  ...args: [string, ...Parameters<T>]
) => void;

interface RemotePeer {
  id: string;
  readyPromise?: Promise<void>;
  ready?: () => void;
  error?: (error: Error) => void;
  rect?: Rectangle;
  connection?: RTCPeerConnection;
  channel?: RTCDataChannel;
  timeBombUntilOpen?: number;
}

function isConnected(peer: RemotePeer) {
  return peer.channel?.readyState === "open";
}

function isConnecting(peer: RemotePeer) {
  return peer.channel?.readyState === "connecting";
}

network.socket.on("peer-icecandidate", async (msg) => {
  const { from, moduleId } = msg;
  // Look up the ModulePeer that is handling this, and let them know.
  const scopedPeer = allScopedPeers.get(moduleId);
  if (!scopedPeer) {
    log.error(
      `Got peer-icecandidate from unknown module-id: ${moduleId} ${from}`,
    );
    return;
  }

  await scopedPeer.handleIceCandidate(from, msg.candidate);
});

network.socket.on("peer-offer", async (msg) => {
  const { from, moduleId, to, rect, offer } = msg;
  // Look up the ModulePeer that is handling this, and let them know.
  const scopedPeer = allScopedPeers.get(moduleId);
  if (!scopedPeer) {
    log.error(`Got peer-offer from unknown module-id: ${moduleId} ${from}`);
    return;
  }

  await scopedPeer.handleOffer(from, to, offer, rect);
});

/**
 * When we send a remote peer an offer, it responds with an answer.
 */
network.socket.on("peer-answer", async (msg) => {
  const { from, moduleId, rect, answer } = msg;
  // Look up the ModulePeer that is handling this, and let them know.
  const scopedPeer = allScopedPeers.get(moduleId);
  if (!scopedPeer) {
    log.error(`Got peer-answer from unknown module-id: ${moduleId} ${from}`);
    return;
  }

  await scopedPeer.handleAnswer(from, rect, answer);
});

export interface TypedPeerSocket {
  on<K extends keyof EmittedEvents>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ): void;
  send<K extends keyof EmittedEvents>(
    to: string,
    msg: K,
    ...payload: Parameters<EmittedEvents[K]>
  ): void;
  sendToAllPeers<K extends keyof EmittedEvents>(
    msg: K,
    ...payload: Parameters<EmittedEvents[K]>
  ): void;
}

export interface RemotePeerReport {
  id: string;
  isConnected: boolean;
  rect?: Rectangle;
}

export interface ModulePeer extends TypedPeerSocket {
  open(): void;
  connectToOffset(offset: Point): Promise<void>;
  connect(id: string): Promise<void>;
  getPeerAtVirtualPosition(pos: Point): string | undefined;
  getPeersIntersectingRectangle(rect: Rectangle): string[];
  getKnownPeers(): RemotePeerReport[];
  close(): void;
  myPeerId: string;
}

const allScopedPeers = new Map<string, ScopedPeer>();

class ScopedPeer implements ModulePeer {
  readonly myPeerId: string;
  readonly remotePeers = new Map<string, RemotePeer>();
  readonly handlers = new Map<string, HandlerWithSocket<Handler>[]>();
  closing = false;
  retrying = false;
  constructor(readonly moduleId: string) {
    this.myPeerId =
      `${info.virtualOffset.x},${info.virtualOffset.y}-${this.moduleId}`;
  }

  open() {
    network.socket.send("peer-register", {
      id: this.myPeerId,
      moduleId: this.moduleId,
      rect: info.virtualRect.serialize(),
    });
  }

  async connectToOffset(peerOffset: Point): Promise<void> {
    const to = `${peerOffset.x},${peerOffset.y}-${this.moduleId}`;
    return await this.connect(to);
  }
  async connect(to: string): Promise<void> {
    if (to === this.myPeerId) {
      log.warn(`Peer tried to connect to itself: ${to}`);
      return;
    }
    let peer: RemotePeer | undefined = this.remotePeers.get(to);
    if (peer) {
      if (isConnected(peer) || isConnecting(peer)) {
        return peer.readyPromise;
      }
    } else {
      // Make a blank peer.
      peer = {
        id: to,
      };
      this.remotePeers.set(to, peer);
    }
    // Update the ready & readyPromise for this peer so that that we can resolve
    // anyone hanging onto this connect (aka await peer.connect(remote)).
    peer.readyPromise = new Promise<void>((resolve, reject) => {
      peer!.ready = resolve;
      peer!.error = reject;
    });

    // Create a connection and save this info on the peer.
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peer.connection = connection;
    peer.channel = connection.createDataChannel(/** label */ to);

    this.addChannelEventListeners(peer.channel, peer);
    this.addIceEventListeners(peer.connection, this.myPeerId, to);

    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);

    network.socket.send("peer-offer", {
      from: this.myPeerId,
      to,
      moduleId: this.moduleId,
      rect: info.virtualRect.serialize(),
      offer,
    });

    clearTimeout(peer.timeBombUntilOpen);
    peer.timeBombUntilOpen = setTimeout(() => {
      // Give it 5 seconds to go boom.
      this.disconnect(to);
    }, 5000);

    return peer.readyPromise;
  }

  disconnect(id: string) {
    const peer = this.remotePeers.get(id);
    if (!peer) {
      log.error(
        `Asked to disconnect peer ${id} which I don't know anything about.`,
      );
      return;
    }
    log(`Closing peer connection: ${id}`);
    // If the peer is ready, this next line does nothing.
    peer.error?.(new Error("Closed before finished handshake."));
    peer.ready = undefined;
    peer.error = undefined;
    peer.readyPromise = undefined;
    peer.channel?.close();
    peer.connection?.close();
    if (!this.retrying && !this.closing && this.myPeerId < id) {
      // We are still interested in connecting, so try to reconnect.
      this.retryConnection(id);
    }
  }

  async retryConnection(id: string): Promise<void> {
    this.retrying = true;
    let backoffMs = Math.random() * 500;
    const retry = async (): Promise<void> => {
      if (this.closing) {
        // Stop retrying!
        return;
      }
      const peer = this.remotePeers.get(id);
      if (!peer) {
        throw new Error(`Unknown peer in retry: ${id}`);
      }

      try {
        log(`Retrying connection to ${id} with backoff ${backoffMs}`);
        // Try to connect, but if we don't, then throw.
        await Promise.race([this.connect(id), delayThenReject(2000)]);
        log(`Connection restored to ${id}`);
        this.retrying = false;
      } catch (e) {
        log.error(`Reconnect failed: ${e}`);
        // Some error, huh? Okay.
        await delay(backoffMs);
        backoffMs *= 2.0;
        return retry();
      }
    };
    await retry();
  }

  async handleIceCandidate(
    from: string,
    candidate: RTCIceCandidate | undefined,
  ) {
    const peer = this.remotePeers.get(from);
    if (!peer) {
      log.error(`Got ice-candidate from unknown peer: ${from}`);
      return;
    }
    try {
      await peer.connection!.addIceCandidate(candidate);
    } catch (e) {
      log.error(`Error adding ice candidate from: ${from}`);
      log.error(e);
    }
    log(`peer-icecandidate accepted from: ${from}`);
  }

  async handleOffer(
    from: string,
    to: string,
    offer: RTCSessionDescriptionInit,
    rect: string,
  ) {
    log(`peer-offer from: ${from}`);
    // Am I already connected to that peer via some other mechanism?
    let peer = this.remotePeers.get(from);
    if (peer?.readyPromise) {
      log.warn(
        `Received peer-offer from ${from} despite already trying to connect to this peer. This is a race.`,
      );
      if (from < to) {
        log.warn(`Because ${from} < ${to}, we will drop this peer-offer.`);
        return;
      } else {
        log.warn(`Because ${from} > ${to}, we will allow this peer-offer.`);
      }
    }

    // We will accept this peer-offer.
    if (peer?.readyPromise) {
      // If there is a peer already, then we went through the 'connect' implementation
      // while at the same time a remote peer send us a 'peer-offer'. This means that we already
      // have a connection and a channel, but that channel is not the right one! It was a local channel,
      // but we need to switch it to a remote one.
    } else {
      // We've never heard from this existing peer before.
      const connection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      // We need to make a ready / ready promise in case some connection comes
      let ready: () => void = () => {};
      let error: (error: Error) => void = () => {};
      const readyPromise = new Promise<void>((resolve, reject) => {
        ready = resolve;
        error = reject;
      });
      peer = {
        id: from,
        rect: Rectangle.deserialize(rect)!,
        connection,
        ready,
        error,
        readyPromise,
        channel: undefined,
      };
      this.remotePeers.set(from, peer);
    }
    const connection = peer.connection;
    if (!connection) {
      throw new Error(`Existing peer is missing connection: ${peer.id}`);
    }
    connection.addEventListener("datachannel", (e) => {
      log(`Created data channel by: ${from}`);
      peer!.channel = e.channel;
      this.addChannelEventListeners(peer!.channel, peer!);
      // Channel is ready!
    });
    this.addIceEventListeners(connection, from, to);
    connection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    log(`Sending answer to: ${from}`);
    network.socket.send("peer-answer", {
      from: to,
      to: from,
      moduleId: this.moduleId,
      rect: info.virtualRect.serialize(),
      answer,
    });

    // Okay, set a timer so that if the channel isn't opened within 5 seconds, we
    // give up and shut everything down.
    clearTimeout(peer.timeBombUntilOpen);
    peer.timeBombUntilOpen = setTimeout(() => {
      log.warn(`Timeout fired for peer after offer: ${peer!.id}`);
      // We waited 5 seconds until we heard back from our remote friend, and we got nothing.
      // As a result, we are giving up on him.
      this.disconnect(peer!.id);
    }, 5000);
  }

  async handleAnswer(
    from: string,
    rect: string,
    answer: RTCSessionDescriptionInit,
  ) {
    log(`peer-answer from: ${from}`);
    const peer = this.remotePeers.get(from);
    if (!peer) {
      log.error(`Answer from unknown peer: ${from}`);
      return;
    }
    peer.rect = Rectangle.deserialize(rect)!;
    await peer.connection!.setRemoteDescription(
      new RTCSessionDescription(answer),
    );
    log(`peer-answer accepted from: ${from}`);
    // Okay, set a timer so that if the channel isn't opened within 5 seconds, we
    // give up and shut everything down.
    clearTimeout(peer.timeBombUntilOpen);
    peer.timeBombUntilOpen = setTimeout(() => {
      log.warn(`Timeout fired for peer after answer: ${peer!.id}`);
      // We waited 5 seconds until we heard back from our remote friend, and we got nothing.
      // As a result, we are giving up on him.
      this.disconnect(peer.id);
    }, 5000);
  }

  addChannelEventListeners(channel: RTCDataChannel, peer: RemotePeer) {
    channel.addEventListener("open", () => {
      log("Open channel with peer:", peer.id);
      // Stop the time bomb for either local or remote peers.
      clearTimeout(peer.timeBombUntilOpen);
      peer.ready!();

      this.fire(peer.id, "peer-connect", []);
    });
    channel.addEventListener("message", (event: MessageEvent) => {
      log.debugAt(1, `Received message from ${peer.id}`);
      const { data } = event;
      try {
        const [msgType, payload] = JSON.parse(data);
        this.fire(peer.id, msgType, payload);
      } catch (e) {
        log.error(`Invalid message from peer: ${peer.id}`);
        log.error(e);
      }
    });
    channel.addEventListener("close", () => {
      log(`Closed channel with peer: ${peer.id}`);
      this.fire(peer.id, "peer-disconnect", []);
      this.disconnect(peer.id);
    });
    channel.addEventListener("error", (event: Event) => {
      const error = (event as RTCErrorEvent).error;
      log.error(`Error with peer: ${peer.id}`, error);
    });
  }

  addIceEventListeners(
    connection: RTCPeerConnection,
    from: string,
    to: string,
  ) {
    connection.addEventListener(
      "icecandidate",
      (event: RTCPeerConnectionIceEvent) => {
        network.socket.send("peer-icecandidate", {
          from,
          moduleId: this.moduleId,
          to,
          candidate: event.candidate ?? undefined,
        });
      },
    );
  }

  getPeerAtVirtualPosition(pos: Point): string | undefined {
    for (const peer of this.remotePeers.values()) {
      if (peer.rect?.isInside(pos)) {
        return peer.id;
      }
    }
    return undefined;
  }
  getPeersIntersectingRectangle(rect: Rectangle): string[] {
    const peers: string[] = [];
    for (const peer of this.remotePeers.values()) {
      if (peer.rect?.intersects(rect)) {
        peers.push(peer.id);
      }
    }
    return peers;
  }
  getKnownPeers(): RemotePeerReport[] {
    const report: RemotePeerReport[] = [];
    for (const peer of this.remotePeers.values()) {
      report.push({
        id: peer.id,
        isConnected: isConnected(peer),
        rect: peer.rect,
      });
    }
    return report;
  }
  on<K extends keyof EmittedEvents>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ): void {
    const existingHandlers = this.handlers.get(msg) || [];
    existingHandlers.push(handler);
    this.handlers.set(msg, existingHandlers);
  }
  send<K extends keyof EmittedEvents>(
    to: string,
    msg: K,
    ...payload: Parameters<EmittedEvents[K]>
  ): void {
    const peer = this.remotePeers.get(to);
    if (!peer) {
      throw new Error(
        `Tried to send message ${msg} to peer ${to} but peer is not known`,
      );
    }
    if (peer.channel?.readyState !== "open") {
      throw new Error(
        `Tried to send message ${msg} to peer ${to} but connection is not established`,
      );
    }
    // Cool, we have a channel, we should be good to go.
    const toSend = [msg, payload];
    peer.channel.send(JSON.stringify(toSend));
  }
  sendToAllPeers<K extends keyof EmittedEvents>(
    msg: K,
    ...payload: Parameters<EmittedEvents[K]>
  ): void {
    for (const peer of this.remotePeers.values()) {
      if (peer.channel?.readyState === "open") {
        const toSend = [msg, payload];
        peer.channel.send(JSON.stringify(toSend));
      }
    }
  }
  fire(from: string, msg: string, payload: unknown[]) {
    const existingHandlers = this.handlers.get(msg) || [];
    for (const handler of existingHandlers) {
      handler(from, ...payload);
    }
  }

  close() {
    log(`Asked to stop peer network for module id: ${this.moduleId}`);
    this.closing = true;
    // Remove all handlers related to moduleid.
    const toRemove: string[] = [];
    for (const handler of this.handlers.keys()) {
      if (handler.startsWith(this.moduleId)) {
        toRemove.push(handler);
      }
    }
    for (const rm of toRemove) {
      this.handlers.delete(rm);
    }
    for (const [peerid] of this.remotePeers) {
      // We need to close this peer.
      this.disconnect(peerid);
    }
    // Remove me from the scoped peer list.
    allScopedPeers.delete(this.moduleId);
  }
}

export function forModule(moduleId: string): ModulePeer {
  const newScopedPeer = new ScopedPeer(moduleId);
  allScopedPeers.set(moduleId, newScopedPeer);
  return newScopedPeer;
}

declare global {
  interface EmittedEvents {
    "peer-connect": (peerid: string) => void;
    "peer-disconnect": (peerid: string) => void;
    "peer-register": (msg: {
      id: string;
      moduleId: string;
      rect: string;
    }) => void;
    "peer-offer": (msg: {
      from: string;
      to: string;
      moduleId: string;
      rect: string;
      offer: RTCSessionDescriptionInit;
    }) => void;
    "peer-answer": (msg: {
      from: string;
      to: string;
      moduleId: string;
      rect: string;
      answer: RTCSessionDescriptionInit;
    }) => void;
    "peer-icecandidate": (msg: {
      from: string;
      to: string;
      moduleId: string;
      candidate: RTCIceCandidate | undefined;
    }) => void;
  }
}
