import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import sinon from "https://cdn.skypack.dev/sinon?dts";
import sinonChai from "https://cdn.skypack.dev/sinon-chai?dts";
import {
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.166.0/testing/bdd.ts";
import { addLogger, disable, enable, log, Logger, reset } from "./log.ts";

chai.use(sinonChai);
const expect = chai.expect;

describe("log", () => {
  let spy: sinon.SinonSpy;
  let channelSpy: sinon.SinonSpy;
  let subSpy: sinon.SinonSpy;
  let otherChannel: sinon.SinonSpy;
  beforeEach(() => {
    reset();
    spy = sinon.spy();
    channelSpy = sinon.spy();
    subSpy = sinon.spy();
    otherChannel = sinon.spy();
    addLogger(spy as unknown as Logger);
    addLogger(channelSpy as unknown as Logger, "channel");
    addLogger(subSpy as unknown as Logger, "channel:subchannel");
    addLogger(otherChannel as unknown as Logger, "otherthing");
  });
  it("logger is invoked with the right args", () => {
    log("channel", 0, "stuff");
    expect(spy).to.have.been.calledWith("channel", 0, ["stuff"]);
  });
  it("enables all loggers at the start", () => {
    log("channel", 0, "stuff");
    expect(spy).to.have.been.called;
    expect(channelSpy).to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
  it("only logs to the right channel", () => {
    log("other", 0, "stuff");
    expect(spy).to.have.been.called;
    expect(channelSpy).not.to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
  it("disables all channels when one is enabled", () => {
    disable("channel");
    enable("a");
    log("channel:subchannel", 0, "things");
    expect(spy).to.have.been.called;
    expect(channelSpy).not.to.have.been.called;
    expect(subSpy).not.to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
  it("disables all but the right channel when one is logged to", () => {
    enable("channel:subchannel");
    disable("channel");
    log("channel:subchannel", 0, "things");
    expect(spy).to.have.been.called;
    expect(channelSpy).not.to.have.been.called;
    expect(subSpy).to.have.been.called;
    expect(otherChannel).not.to.have.been.called;
  });
});
