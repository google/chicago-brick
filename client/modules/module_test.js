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
    let m;

    beforeEach(() => {
      m = null;
    });

    describe('cleans up dependencies', () => {
      afterEach(() => {
        expect(m.network).to.be.null;
      });
      it('when load throws', async () => {
        m = fakes.makeClientModule(fakes.THROWS_ON_LOAD);
        await willReject(() => m.instantiate());
      });
      it('if module constructor throws', async () => {
        m = fakes.makeClientModule(fakes.THROWS_ON_CONSTRUCTION);
        await willReject(() => m.instantiate());
      });
      it('if willBeShownSoon throws', async () => {
        m = fakes.makeClientModule(fakes.THROWS_ON_WILL_BE_SHOWN_SOON);
        await m.instantiate();
        await willReject(() => m.willBeShownSoon());
      });
      it('when beginTransitionIn throws', async () => {
        m = fakes.makeClientModule(fakes.THROWS_ON_BEGIN_FADE_IN);
        await m.instantiate();
        await willReject(() => m.beginTransitionIn());
      });
    });

    describe('does not clean up dependencies', () => {
      afterEach(() => {
        expect(m.network).not.to.be.null;
      });
      it('when beginTransitionOut throws', async () => {
        m = fakes.makeClientModule(fakes.THROWS_ON_BEGIN_FADE_OUT);
        await m.instantiate();
        await willReject(() => m.beginTransitionOut());
      });
      it('when finishTransitionIn throws', async () => {
        m = fakes.makeClientModule(fakes.THROWS_ON_FINISH_FADE_IN);
        await m.instantiate();
        await willReject(() => m.finishTransitionIn());
      });
      it('when finishTransitionOut throws', async () => {
        m = fakes.makeClientModule(fakes.THROWS_ON_FINISH_FADE_OUT);
        await m.instantiate();
        await willReject(() => m.finishTransitionOut());
      });
    });
  });
});
