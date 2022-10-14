import {ClientModule} from './module.js';
import {Polygon} from '/lib/math/polygon2d.ts';
import {TitleCard} from '/client/title_card.js';
import {Client} from '/lib/module_interface.ts';

export const TRIVIAL = function() {
  return {client: class extends Client {}};
};
export const THROWS_ON_LOAD = function() {
  throw new Error();
};
export const THROWS_ON_CONSTRUCTION = function () {
  return {client: class extends Client {
    constructor() {
      super();
      throw new Error();
    }
  }};
};
export const THROWS_ON_WILL_BE_SHOWN_SOON = function () {
  return {client: class extends Client {
    async willBeShownSoon() {
      throw new Error();
    }
  }};
};
export const THROWS_ON_BEGIN_FADE_OUT = function () {
  return {client: class extends Client {
    beginFadeOut() {
      throw new Error();
    }
  }};
};
export const THROWS_ON_FINISH_FADE_OUT = function () {
  return {client: class extends Client {
    finishFadeOut() {
      throw new Error();
    }
  }};
};
export const THROWS_ON_BEGIN_FADE_IN = function () {
  return {client: class extends Client {
    beginFadeIn() {
      throw new Error();
    }
  }};
};
export const THROWS_ON_FINISH_FADE_IN = function () {
  return {client: class extends Client {
    finishFadeIn() {
      throw new Error();
    }
  }};
};

export function allowPauseOnWillBeShownSoon() {
  let r, p = new Promise(resolve => r = resolve);
  return {
    load: function () {
      return {client: class extends Client {
        async willBeShownSoon() {
          return p;
        }
      }};
    },
    resume: r,
  };
}

export const NopTransition = {
  start() {},
  async perform() {},
}

export function makeClientModule(load) {
  sinon.replace(ClientModule, 'loadPath', function() {
    return {load};
  });
  const titleCard = new TitleCard({});
  return new ClientModule('fake', 'path', {}, titleCard, 0, new Polygon([{x: 0, y:0}]), NopTransition);
}

export function makeClientModuleWithPause(load) {
  let resume, promise = new Promise(resolve => resume = resolve);
  sinon.replace(ClientModule, 'loadPath', async () => {
    await promise;
    return {load};
  });
  const titleCard = new TitleCard({});
  return {
    module: new ClientModule('fake', 'path', {}, titleCard, 0, new Polygon([{x: 0, y:0}]), NopTransition),
    resume
  };
}
