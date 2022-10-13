import {ClientModule} from './module.js';
import {Polygon} from '/lib/math/polygon2d.ts';
import {TitleCard} from '/client/title_card.js';
import {Client} from '/lib/module_interface.js';
import conform from '/lib/conform.js';

export const TRIVIAL = function() {
  return {client: conform(class {}, Client)};
};
export const THROWS_ON_LOAD = function() {
  throw new Error();
};
export const THROWS_ON_CONSTRUCTION = function () {
  return {client: conform(class {
    constructor() {
      throw new Error();
    }
  }, Client)};
};
export const THROWS_ON_WILL_BE_SHOWN_SOON = function () {
  return {client: conform(class {
    async willBeShownSoon() {
      throw new Error();
    }
  }, Client)};
};
export const THROWS_ON_BEGIN_FADE_OUT = function () {
  return {client: conform(class {
    beginFadeOut() {
      throw new Error();
    }
  }, Client)};
};
export const THROWS_ON_FINISH_FADE_OUT = function () {
  return {client: conform(class {
    finishFadeOut() {
      throw new Error();
    }
  }, Client)};
};
export const THROWS_ON_BEGIN_FADE_IN = function () {
  return {client: conform(class {
    beginFadeIn() {
      throw new Error();
    }
  }, Client)};
};
export const THROWS_ON_FINISH_FADE_IN = function () {
  return {client: conform(class {
    finishFadeIn() {
      throw new Error();
    }
  }, Client)};
};

export function allowPauseOnWillBeShownSoon() {
  let r, p = new Promise(resolve => r = resolve);
  return {
    load: function () {
      return {client: conform(class {
        async willBeShownSoon() {
          return p;
        }
      }, Client)};
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
