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

// The interface for any module. Not every module needs to implement this
// interface, though it's likely that this will be required. All modules that
// need to synchronize state across the multiple clients should do that in an
// implementation of this interface.
// The ModuleInterface (on the server). The module manager will construct this
// instance with the configuration blob that is set in the instance. The
// manager may construct many instances of this module, though, so be careful
// with shared global state! An implementation should configure the module
// with the config data, but should not do any drawing/file/network operations
// in the constructor.
class Server {
  constructor(_config?: unknown) {}

  // Notification that your module has been selected next in the queue. You now
  // have 60 seconds to load whatever content you'd like to load.
  // Implementations can take less than this time, though, by returning a
  // promise that is resolved when this work is finished. If you take longer
  // than 60 seconds to load, the module manager will assume that your code is
  // deadlocked, will issue an error, and do its best to blacklist you from
  // running again. At this point, the impl is free to start reading from disk.
  // Communication with clients is also fine, as we ensure that clients are
  // notified before we notify the server module.
  willBeShownSoon(_deadline: number): Promise<void> | void {}

  // Notification that your module has been removed from the clients.
  dispose() {}

  // Notification that your module should execute a tick of work. Your tick
  // should never take longer than 16ms to execute. Work that takes longer than
  // this should be scheduled on another thread in order to not block. It's
  // possible for multiple modules to be ticked at the same time. The first
  // argument is the current time that we have ticked you. The manager
  // guarantees that this number is never decreasing with respect to any prior
  // tick. The second argument is the amount of time that has passed since the
  // last tick. This is always >= 0, and is 0 on the first call. All times are
  // in ms.
  tick(_time: number, _delta: number) {}
}

export { Server };
