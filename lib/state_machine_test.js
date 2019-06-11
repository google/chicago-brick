import {State, StateMachine} from './state_machine.js';
const expect = chai.expect;

const debugSm = debug('sm');

describe('simple statemachine', function() {
  class InitialState extends State {}
  class OtherState extends State {}

  let machine, initialState;
  beforeEach(function() {
    initialState = new InitialState;
    machine = new StateMachine(initialState, debugSm);
  });

  it('can transition from a state to another state externally', async function() {
    let newState = new OtherState;
    let exitSpy = sinon.spy(initialState, 'exit');
    let enterSpy = sinon.spy(newState, 'enter');

    expect(machine.state).to.be.an.instanceof(InitialState);
    machine.transitionTo(newState);
    expect(machine.state).to.be.an.instanceof(InitialState);
    expect(exitSpy).not.to.have.been.called;
    expect(enterSpy).not.to.have.been.called;

    const s = await machine.getTransitionPromise()
    expect(machine.state).to.be.an.instanceof(OtherState);
    expect(machine.state).to.equal(s);

    expect(exitSpy).to.have.been.called;
    expect(enterSpy).to.have.been.calledWith(
        sinon.match.func, sinon.match.same(undefined));
  });

  class TimedState extends State {
    enter(resolver) {
      setTimeout(() => resolver(new OtherState), 10);
    }
  }

  it('can internally transition from a state to another state', async function() {
    machine.transitionTo(new TimedState);
    const s = await machine.getTransitionPromise();
    expect(s).to.be.an.instanceof(TimedState);
    machine.getTransitionPromise().then(s => {
      expect(s).to.be.an.instanceof(OtherState);
    });
  });

  class DeferringState extends State {
    enter(resolver) {
      resolver(new OtherState);
    }
  }

  it('can immediately transition to another state', async function() {
    machine.transitionTo(new DeferringState);
    const s = await machine.getTransitionPromise();
    expect(s).to.be.an.instanceof(DeferringState);
    expect(machine.state).to.be.an.instanceof(OtherState);
  });

  it('lets external transitions override internal ones', async function() {
    machine.transitionTo(new DeferringState);
    const s = await machine.getTransitionPromise();
    expect(s).to.be.an.instanceof(DeferringState);
    machine.transitionTo(new InitialState);
    const s2 = await machine.getTransitionPromise();
    expect(s2).to.be.an.instanceof(InitialState);
  });

  it('lets external systems watch for a thing to happen', async function() {
    let watchPromise = new Promise(resolve => {
      let watch = () => {
        return machine.getTransitionPromise().then(s => {
          if (s.getName() == 'OtherState') {
            resolve(true);
          } else {
            return watch();
          }
        })
      };
      watch();
    });

    machine.transitionTo(new TimedState);

    const v = await watchPromise;
    expect(v).to.equal(true);
  });
});
