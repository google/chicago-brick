import {reset, log, addLogger, enable, disable} from './log.js';

const expect = chai.expect;

describe('log', () => {
  let spy, channelSpy, subSpy, otherChannel;
  beforeEach(() => {
    reset();
    spy = sinon.spy();
    channelSpy = sinon.spy();
    subSpy = sinon.spy();
    otherChannel = sinon.spy();
    addLogger(spy);
    addLogger(channelSpy, 'channel');
    addLogger(subSpy, 'channel:subchannel');
    addLogger(otherChannel, 'otherthing');
  });
  it('logger is invoked with the right args', () => {
    log('channel', 0, 'stuff');
    expect(spy).to.have.been.calledWith('channel', 0, ['stuff']);
  });
  it('enables all loggers at the start', () => {
    log('channel', 0, 'stuff');
    expect(spy).to.have.been.called;
    expect(channelSpy).to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
  it('only logs to the right channel', () => {
    log('other', 0, 'stuff');
    expect(spy).to.have.been.called;
    expect(channelSpy).not.to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
  it('disables all channels when one is enabled', () => {
    disable('channel');
    enable('a');
    log('channel:subchannel', 0, 'things');
    expect(spy).to.have.been.called;
    expect(channelSpy).not.to.have.been.called;
    expect(subSpy).not.to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
  it('disables all but the right channel when one is logged to', () => {
    enable('channel:subchannel');
    disable('channel');
    log('channel:subchannel', 0, 'things');
    expect(spy).to.have.been.called;
    expect(channelSpy).not.to.have.been.called;
    expect(subSpy).to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
});
