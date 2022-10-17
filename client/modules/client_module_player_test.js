import * as fakes from './fake_client_modules.js';
import {ClientModule} from './module.ts';
import {ClientModulePlayer} from './client_module_player.ts';

const expect = chai.expect;

function makeEmptyModule() {
  return ClientModule.newEmptyModule(0, fakes.NopTransition);
}

// Major concern here is that no matter where untrusted module code throws, we
// are always able to continue moving forward.
describe('client module player', () => {
  let player;
  beforeEach(() => {
    ClientModulePlayer.makeEmptyModule = makeEmptyModule;
    player = new ClientModulePlayer;
    document.body.querySelectorAll('#containers').forEach(e => e.remove());
    const containersEl = document.createElement('div');
    containersEl.id = 'containers';
    document.body.append(containersEl);
  });
  afterEach(() => {
    sinon.restore();
  });

  // The playModule tests are all similar: Given a badly behaving module, do we
  // do the right thing: either give up the proposed transition or succeed?
  describe('goToModule keeps the original module', () => {
    async function ensureOriginalModule(m, resume) {
      const originalModule = player.oldModule;
      const p = player.goToModule(m);
      player.playModule(makeEmptyModule());
      resume();
      await p;
      expect(player.oldModule).to.equal(originalModule);
    }

    it('when the module throws during load', async () => {
      const m = fakes.makeClientModule(fakes.THROWS_ON_LOAD);
      const originalModule = player.oldModule;
      await player.playModule(m);
      expect(player.oldModule).to.equal(originalModule);
    });
    it('when the module throws during construction', async () => {
      const m = fakes.makeClientModule(fakes.THROWS_ON_CONSTRUCTION);
      const originalModule = player.oldModule;
      await player.playModule(m);
      expect(player.oldModule).to.equal(originalModule);
    });
    it('cleanly aborts if new module during instantiation', async () => {
      const {module: m, resume} = fakes.makeClientModuleWithPause(fakes.TRIVIAL);
      const disposeSpy = sinon.spy(m, 'dispose');
      await ensureOriginalModule(m, resume);
      expect(disposeSpy).to.have.been.called;
    });
    it('cleanly aborts if new module during willBeShownSoon', async () => {
      const {load, resume} = fakes.allowPauseOnWillBeShownSoon();
      const m = fakes.makeClientModule(load);
      const disposeSpy = sinon.spy(m, 'dispose');
      await ensureOriginalModule(m, resume);
      expect(disposeSpy).to.have.been.called;
    });
  });

  describe('goToModule continues in the face of', () => {
    it('the old module throwing in beginFadeOut', async () => {
      const badModule = fakes.makeClientModule(fakes.THROWS_ON_BEGIN_FADE_OUT);
      const disposeSpy = sinon.spy(badModule, 'dispose');
      player.oldModule = badModule;
      await player.playModule(makeEmptyModule());
      expect(disposeSpy).to.have.been.called;
      expect(player.oldModule).not.to.equal(badModule);
    });
    it('the new module throwing in beginFadeIn', async () => {
      const badModule = fakes.makeClientModule(fakes.THROWS_ON_BEGIN_FADE_IN);
      const disposeSpy = sinon.spy(badModule, 'dispose');
      await player.playModule(badModule);
      expect(disposeSpy).to.have.been.called;
      expect(player.oldModule).not.to.equal(badModule);
      expect(player.nextModule.name).to.equal('_empty');
    });
    it('the old module throwing in finishFadeOut', async () => {
      const badModule = fakes.makeClientModule(fakes.THROWS_ON_FINISH_FADE_OUT);
      const disposeSpy = sinon.spy(badModule, 'dispose');
      player.oldModule = badModule;
      await player.playModule(makeEmptyModule());
      expect(disposeSpy).to.have.been.called;
      expect(player.oldModule).not.to.equal(badModule);
    });
    it('the new module throwing in finishFadeIn', async () => {
      const badModule = fakes.makeClientModule(fakes.THROWS_ON_FINISH_FADE_IN);
      const disposeSpy = sinon.spy(badModule, 'dispose');
      await player.playModule(badModule);
      expect(disposeSpy).not.to.have.been.called;
      expect(player.oldModule).to.equal(badModule);
    });
  });
});
