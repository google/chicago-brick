const statemachine = require('lib/state_machine');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const expect = chai.expect;

const debug = require('debug')('sm');

describe('simple statemachine', function() {
  class InitialState extends statemachine.State {}
  class OtherState extends statemachine.State {}
  
  let machine, initialState;
  beforeEach(function() {
    initialState = new InitialState;
    machine = new statemachine.Machine(initialState, debug);
  });
  
  it('can transition from a state to another state externally', function() {
    let newState = new OtherState;
    let exitSpy = sinon.spy(initialState, 'exit');
    let enterSpy = sinon.spy(newState, 'enter');
    
    expect(machine.state).to.be.an.instanceof(InitialState);
    machine.transitionTo(newState);
    expect(machine.state).to.be.an.instanceof(InitialState);
    expect(exitSpy).not.to.have.been.called;
    expect(enterSpy).not.to.have.been.called;
    
    machine.getTransitionPromise().then(s => {
      expect(machine.state).to.be.an.instanceof(OtherState);
      expect(machine.state).to.equal(s);
      
      expect(exitSpy).to.have.been.called;
      expect(enterSpy).to.have.been.calledWith(
          sinon.match.func, sinon.match.same(undefined));
    });
  });
  
  class TimedState extends statemachine.State {
    enter(resolver) {
      setTimeout(() => resolver(new OtherState), 10);
    }
  }
  
  it('can internally transition from a state to another state', function() {
    machine.transitionTo(new TimedState);
    return machine.getTransitionPromise().then(s => {
      expect(s).to.be.an.instanceof(TimedState);
      machine.getTransitionPromise().then(s => {
        expect(s).to.be.an.instanceof(OtherState);
      })
    });
  });
  
  class DeferringState extends statemachine.State {
    enter(resolver) {
      resolver(new OtherState);
    }
  }
  
  it('can immediately transition to another state', function() {
    machine.transitionTo(new DeferringState);
    return machine.getTransitionPromise().then(s => {
      expect(s).to.be.an.instanceof(DeferringState);
      expect(machine.state).to.be.an.instanceof(OtherState);
    });
  });
  
  it('lets external transitions override internal ones', function() {
    machine.transitionTo(new DeferringState);
    return machine.getTransitionPromise().then(s => {
      expect(s).to.be.an.instanceof(DeferringState);
      machine.transitionTo(new InitialState);
      machine.getTransitionPromise().then(s => {
        expect(s).to.be.an.instanceof(InitialState);
      });
    });
  });
  
  it('lets external systems watch for a thing to happen', function() {
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
    
    return watchPromise.then(v => {
      expect(v).to.equal(true);
    });
  });
});
