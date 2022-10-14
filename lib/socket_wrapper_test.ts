import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import sinon from "https://cdn.skypack.dev/sinon?dts";
import sinonChai from "https://cdn.skypack.dev/sinon-chai?dts";
import {
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.159.0/testing/bdd.ts";
import {
  cleanupModuleOverlayHandler,
  installModuleOverlayHandler,
  makeModuleOverlaySocket,
} from "./socket_wrapper.ts";

chai.use(sinonChai);
const expect = chai.expect;

interface FakeSocket {
  emit(messageName: string, payload: unknown): void;
  on(messageName: string, cb: (payload: unknown) => void): void;
}

function makeSockets(): { receiver: FakeSocket; sender: FakeSocket } {
  const registry: Record<string, (payload: unknown) => void> = {};
  const receiver = {
    on(messageName: string, cb: (payload: unknown) => void) {
      registry[messageName] = cb;
    },
    emit() {},
  };
  const sender = {
    on() {},
    emit(messageName: string, payload: unknown) {
      registry[messageName](payload);
    },
  };
  return { receiver, sender };
}

describe("socket wrapper", () => {
  let sender: FakeSocket, receiver: FakeSocket;
  let wrappedSender: ReturnType<typeof makeModuleOverlaySocket>,
    wrappedReceiver: ReturnType<typeof makeModuleOverlaySocket>;
  beforeEach(() => {
    ({ sender, receiver } = makeSockets());
    installModuleOverlayHandler(receiver);
    wrappedSender = makeModuleOverlaySocket("id1", sender);
    wrappedReceiver = makeModuleOverlaySocket("id1", receiver);
  });
  it("allows sending messages", () => {
    const receiverSpy = sinon.spy();
    const wrappedReceiverSpy = sinon.spy();
    receiver.on("some message", receiverSpy);
    wrappedReceiver.on("some message", wrappedReceiverSpy);
    wrappedSender.emit("some message", {});
    expect(receiverSpy).not.to.have.been.called;
    expect(wrappedReceiverSpy).to.have.been.called;
  });
  it("prevents sending messages from another wrapper", () => {
    const wrappedSender2 = makeModuleOverlaySocket("id2", sender);
    const wrappedReceiver2 = makeModuleOverlaySocket("id2", receiver);
    const wrappedReceiverSpy = sinon.spy();
    const wrappedReceiver2Spy = sinon.spy();
    wrappedReceiver.on("some message", wrappedReceiverSpy);
    wrappedReceiver2.on("some message", wrappedReceiver2Spy);
    wrappedSender.emit("some message", {});
    expect(wrappedReceiverSpy).to.have.been.called;
    expect(wrappedReceiver2Spy).not.to.have.been.called;

    wrappedReceiverSpy.resetHistory();
    wrappedSender2.emit("some message", {});
    expect(wrappedReceiverSpy).not.to.have.been.called;
    expect(wrappedReceiver2Spy).to.have.been.called;
  });
  it("cleanup prevents further messages", () => {
    cleanupModuleOverlayHandler("id1");
    expect(() => wrappedSender.emit("some message", {})).to.throw;
  });
  it("supports late-registering handlers", () => {
    wrappedSender.emit("some message", {});
    const wrappedReceiverSpy = sinon.spy();
    wrappedReceiver.on("some message", wrappedReceiverSpy);
    expect(wrappedReceiverSpy).to.have.been.called;
  });
});
