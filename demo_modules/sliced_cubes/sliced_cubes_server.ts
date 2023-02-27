import { Server } from '../../server/modules/module_interface.ts';
import { ModuleState } from '../../server/network/state_manager.ts';
import { STAGE1, STAGE2, STAGE3, STAGE4, STATE_NAME } from './sliced_cubes.ts';

const stage1 = { ...STAGE1 };
const stage1a = { ...STAGE1, cn: 1 };
const stage1b = { ...STAGE1, co: 1, cn: 2 };
const stage2 = { ...STAGE2 };
const stage2a = { ...STAGE2, ac: 1 };
const stage2b = { ...STAGE2, cn: 2, ac: 0 };
const stage2c = { ...STAGE2, cn: 1, ac: 0 };
const stage2d = { ...STAGE2, cn: 0, ac: 0, bc: 1 };
const stage3 = { ...STAGE3 };
const stage3a = { ...STAGE3, cn: 1 };
const stage3b = { ...STAGE3, co: 0, cn: 2 };
const stage4 = { ...STAGE4 };
const schedule = [
  { dur: 5, state: [stage1, stage1, stage1, stage1] },
  { dur: 2, state: [stage1a, stage1a, stage1a, stage1a] },
  { dur: 1, state: [stage1, stage1, stage1, stage1] },
  { dur: 3, state: [stage1, stage1, stage1, stage1] },
  { dur: 1, state: [stage1a, stage1, stage1, stage1] },
  { dur: 2, state: [stage1b, stage1, stage1, stage1] },
  { dur: 1, state: [stage2, stage1a, stage1, stage1] },
  { dur: 1, state: [stage2, stage1b, stage1, stage1] },
  { dur: 1, state: [stage2, stage2, stage1a, stage1] },
  { dur: 2, state: [stage2, stage2, stage1b, stage1] },
  { dur: 1, state: [stage2, stage2, stage2, stage1a] },
  { dur: 1, state: [stage2, stage2, stage2, stage1b] },
  { dur: 1, state: [stage2, stage2, stage2, stage2] },
  { dur: 2, state: [stage2, stage2, stage2, stage2] },
  { dur: 2, state: [stage2a, stage2a, stage2a, stage2a] },
  { dur: 1, state: [stage2b, stage2b, stage2b, stage2b] },
  { dur: 2, state: [stage2c, stage2c, stage2c, stage2c] },
  { dur: 1, state: [stage2d, stage2d, stage2d, stage2d] },
  { dur: 1, state: [stage3, stage3, stage3, stage3] },
  { dur: 4, state: [stage3, stage3, stage3, stage3] },
  { dur: 2, state: [stage3a, stage3a, stage3a, stage3a] },
  { dur: 2, state: [stage3b, stage3b, stage3b, stage3b] },
  { dur: 1, state: [stage4, stage4, stage4, stage4] },
  { dur: 2, state: [stage4, stage4, stage4, stage4] },
  { dur: 1, state: [stage3b, stage4, stage3b, stage4] },
  { dur: 1, state: [stage3a, stage3b, stage3a, stage3b] },
  { dur: 1, state: [stage3, stage3a, stage3, stage3a] },
  { dur: 1, state: [stage3, stage3, stage3, stage3] },
  { dur: 2, state: [stage3, stage3, stage3, stage3] },
  { dur: 1, state: [stage2d, stage2d, stage3, stage3] },
  { dur: 1, state: [stage2c, stage2c, stage2d, stage2d] },
  { dur: 1, state: [stage2b, stage2b, stage2c, stage2c] },
  { dur: 1, state: [stage2a, stage2a, stage2b, stage2b] },
  { dur: 1, state: [stage2, stage2, stage2a, stage2a] },
  { dur: 1, state: [stage2, stage2, stage2, stage2] },
  { dur: 2, state: [stage2, stage2, stage2, stage2] },
  { dur: 1, state: [stage1b, stage1b, stage1b, stage1b] },
  { dur: 1, state: [stage1a, stage1a, stage1a, stage1a] },
  { dur: 1, state: [stage1, stage1, stage1, stage1] },
];

/**
 * Loads the SlicedCubes server.
 */
export function load(state: ModuleState) {
  class SlicedCubesServer extends Server {
    private nextIndex = 0;
    private nextTime = -1;

    override willBeShownSoon() {
      state.store(STATE_NAME, 0, schedule[0].state);
      return Promise.resolve();
    }

    override tick(time: number, _delta: number): void {
      if (this.nextTime < 0) {
        // First tick.
        this.nextTime = time;
      }
      if (time >= this.nextTime) {
        if (this.nextIndex >= schedule.length) {
          this.nextIndex = 0;
        }
        const item = schedule[this.nextIndex++];
        this.nextTime += item.dur * 1000;
        state.store(STATE_NAME, this.nextTime, item.state);
      }
    }
  }

  return { server: SlicedCubesServer };
}
