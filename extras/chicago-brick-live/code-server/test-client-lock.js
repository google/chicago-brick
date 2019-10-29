/* Copyright 2019 Google Inc. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
var expect = require('chai').expect;

import { ClientLock } from './client-lock';

function client(x,y) { return {x:x, y:y}; }

describe('client-lock', function() {

  let lock;

  beforeEach('', function() {
    lock = new ClientLock();
  });

  it('a client can be locked', function() {
    expect(lock.tryLock(client(0,0))).to.exist;
  });

  it('a locked client cannot be locked again', function() {
    lock.tryLock(client(0,0));
    expect(lock.tryLock(client(0,0))).to.not.exist;
  });

  it('a locked client can be checked', function() {
    lock.tryLock(client(0,0));
    expect(lock.isLocked(client(0,0))).to.equal(true);
  });

  it('an unlocked client can be checked', function() {
    expect(lock.isLocked(client(0,0))).to.equal(false);
  });

  it('a locked client can be unlocked', function() {
    let c = client(0,0);
    let token = lock.tryLock(c);
    expect(lock.isLocked(c)).to.equal(true);
    lock.release(c, token);
    expect(lock.isLocked(c)).to.equal(false);
  });

  it('a valid lock token can be checked', function() {
    let c = client(0,0);
    let token = lock.tryLock(c);
    expect(lock.validateToken(c, token)).to.equal(true);
  });

  it('an invalid lock token can be checked an unlocked client', function() {
    let c1 = client(0,0);
    let c2 = client(1,0);
    let token = lock.tryLock(c1);
    expect(lock.validateToken(c2, token)).to.equal(false);
  });

  it('an invalid lock token can be checked for a locked client', function() {
    let c1 = client(0,0);
    let c2 = client(1,0);
    let token = lock.tryLock(c1);
    lock.tryLock(c2);
    expect(lock.validateToken(c2, token)).to.equal(false);
  });

});
