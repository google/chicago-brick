import * as fakes from './fake_client_modules.js';
import {willReject} from '/lib/testing_utils.js';

const expect = chai.expect;

// Our major concern with the client module is that it cleans up after itself
// when things go wrong.
describe('client module', () => {
  afterEach(() => {
    sinon.restore();
  });
  it('executes load function', async () => {
    const m = fakes.makeClientModule(fakes.TRIVIAL);
    await m.instantiate();
    expect(m.instance).not.to.be.null;
  });
  it('injects dependencies', async () => {
    let injectedState;
    const m = fakes.makeClientModule(function (state) {
      injectedState = state;
      return {client: function() {}};
    });
    await m.instantiate();
    expect(m.instance).not.to.be.null;
    expect(injectedState).not.to.be.null;
  });
  describe('cleanup', () => {
    let networkClose;

    function makeLoad(body) {
      return function(network) {
        networkClose = sinon.spy(network, 'close');
        return body();
      }
    }

    describe('cleans up dependencies', () => {
      afterEach(() => {
        expect(networkClose).to.have.been.called;
      });
      it('when load throws', async () => {
        const m = fakes.makeClientModule(makeLoad(fakes.THROWS_ON_LOAD));
        await willReject(() => m.instantiate());
      });
      it('if module constructor throws', async () => {
        const m = fakes.makeClientModule(makeLoad(fakes.THROWS_ON_CONSTRUCTION));
        await willReject(() => m.instantiate());
      });
      it('if willBeShownSoon throws', async () => {
        const m = fakes.makeClientModule(makeLoad(fakes.THROWS_ON_WILL_BE_SHOWN_SOON));
        await m.instantiate();
        await willReject(() => m.willBeShownSoon());
      });
      it('when beginFadeIn throws', async () => {
        const m = fakes.makeClientModule(makeLoad(fakes.THROWS_ON_BEGIN_FADE_IN));
        await m.instantiate();
        await willReject(() => m.beginFadeIn());
      });
    });

    describe('does not clean up dependencies', () => {
      afterEach(() => {
        expect(networkClose).not.to.have.been.called;
      });
      it('when beginFadeOut throws', async () => {
        const m = fakes.makeClientModule(makeLoad(fakes.THROWS_ON_BEGIN_FADE_OUT));
        await m.instantiate();
        await willReject(() => m.beginFadeOut());
      });
      it('when finishFadeIn throws', async () => {
        const m = fakes.makeClientModule(makeLoad(fakes.THROWS_ON_FINISH_FADE_IN));
        await m.instantiate();
        await willReject(() => m.finishFadeIn());
      });
      it('when finishFadeOut throws', async () => {
        const m = fakes.makeClientModule(makeLoad(fakes.THROWS_ON_FINISH_FADE_OUT));
        await m.instantiate();
        await willReject(() => m.finishFadeOut());
      });
    });
  });
});
