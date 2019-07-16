import {installModuleOverlayHandler, makeModuleOverlaySocket, cleanupModuleOverlayHandler} from './socket_wrapper.js';

const expect = chai.expect;

function makeSockets() {
  const registry = {};
  const receiver = {
    on(messageName, cb) {
      registry[messageName] = cb;
    }
  };
  const sender = {
    emit(messageName, payload) {
      registry[messageName](payload);
    }
  };
  return {receiver, sender};
}

describe('socket wrapper', () => {
  let sender, receiver;
  let wrappedSender, wrappedReceiver;
  beforeEach(() => {
    ({sender, receiver} = makeSockets());
    installModuleOverlayHandler(receiver);
    wrappedSender = makeModuleOverlaySocket('id1', sender);
    wrappedReceiver = makeModuleOverlaySocket('id1', receiver);
  });
  it('allows sending messages', () => {
    const receiverSpy = sinon.spy();
    const wrappedReceiverSpy = sinon.spy();
    receiver.on('some message', receiverSpy);
    wrappedReceiver.on('some message', wrappedReceiverSpy);
    wrappedSender.emit('some message', {});
    expect(receiverSpy).not.to.have.been.called;
    expect(wrappedReceiverSpy).to.have.been.called;
  });
  it('prevents sending messages from another wrapper', () => {
    const wrappedSender2 = makeModuleOverlaySocket('id2', sender);
    const wrappedReceiver2 = makeModuleOverlaySocket('id2', receiver);
    const wrappedReceiverSpy = sinon.spy();
    const wrappedReceiver2Spy = sinon.spy();
    wrappedReceiver.on('some message', wrappedReceiverSpy);
    wrappedReceiver2.on('some message', wrappedReceiver2Spy);
    wrappedSender.emit('some message', {});
    expect(wrappedReceiverSpy).to.have.been.called;
    expect(wrappedReceiver2Spy).not.to.have.been.called;

    wrappedReceiverSpy.resetHistory();
    wrappedSender2.emit('some message', {});
    expect(wrappedReceiverSpy).not.to.have.been.called;
    expect(wrappedReceiver2Spy).to.have.been.called;
  });
  it('cleanup prevents further messages', () => {
    cleanupModuleOverlayHandler('id1');
    expect(() => wrappedSender.emit('some message', {})).to.throw;
  });
  it('supports late-registering handlers', () => {
    wrappedSender.emit('some message', {});
    const wrappedReceiverSpy = sinon.spy();
    wrappedReceiver.on('some message', wrappedReceiverSpy);
    expect(wrappedReceiverSpy).to.have.been.called;
  });
});
