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

import {ClientController} from './client_controller.js';
import {PlaylistController} from './playlist_controller.js';
import {ErrorController} from './error_controller.js';
import {PlaylistCreator} from './playlist_creator.js';
import {WS} from '/lib/websocket.js';
import {addLogger} from '/lib/log.js';
import {makeConsoleLogger} from '/lib/console_logger.js';

function makeConsoleColorFn(css) {
  const ret = str => {
    return `%c${str}%c`;
  }
  ret.desc = css;
  return ret;
}

addLogger(makeConsoleLogger(c => {
  const ret = makeConsoleColorFn([`color: ${c}`]);
  ret.bold = {
    bgRed: makeConsoleColorFn(['font-weight: bolder', 'background-color: red', `color: ${c}`]),
  };
  ret.bgBlue = makeConsoleColorFn(['background-color: blue', `color: ${c}`]);
  return ret;
}, () => performance.now()));

let lastUpdateFromServer = 0;
let timeOfLastUpdateFromServer = window.performance.now();
let connected = false;
function getTime() {
  if (!connected) {
    return lastUpdateFromServer;
  }
  return lastUpdateFromServer + window.performance.now() - timeOfLastUpdateFromServer;
}
const host = new URL(location).searchParams.get('host') || 'localhost:6001';
const control = WS.clientWrapper(`ws://${host}/`);
const creatorEl = document.querySelector('#playlist-creator');

function applyNewPlaylist(playlist, moduleConfig) {
  // TODO(applmak): Passing a string here is a bit hacky.
  if (playlist == 'reset') {
    control.emit('resetPlaylist');
  } else {
    control.emit('newPlaylist', {playlist, moduleConfig});
  }
}

const playlistCreator = new PlaylistCreator(creatorEl, applyNewPlaylist);
const playlistController = new PlaylistController(document.querySelector('.playlist-container'), getTime);
const errorController = new ErrorController(document.querySelector('footer'));
const clientController = new ClientController(
  document.querySelector('.diagram'),
  req => control.emit('takeSnapshot', req),
  errorController,
  getTime,
);

function convertMsDurationToText(ms) {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);

  return mins ? `${mins} minutes` : secs ? `${secs} seconds` : String(ms);
}

let transitionData = {};
control.on('transition', data => {
  transitionData = data;

  const duration = data.nextDeadline - data.deadline;
  const moduleNameEl = document.querySelector('#module');
  moduleNameEl.textContent = data.module;
  const durationEl = document.querySelector('#duration');
  durationEl.textContent = convertMsDurationToText(duration);

  playlistController.updateTransitionData(data);
  playlistCreator.setLivePlaylist(data.layouts);
  playlistCreator.setModuleConfig(data.configMap);
});
control.on('clients', data => {
  clientController.setClients(data);
})
control.on('connect', () => {
  connected = true;
  document.querySelector('#disconnected-warning').style.visibility = 'hidden';
});
control.on('disconnect', () => {
  connected = false;
  document.querySelector('#disconnected-warning').style.visibility = 'visible';
  playlistController.disconnect();
  errorController.disconnect();
  clientController.disconnect();
});
control.on('time', data => {
  lastUpdateFromServer = data.time;
  timeOfLastUpdateFromServer = window.performance.now();
});
control.on('error', e => {
  playlistController.error(e);
  errorController.error(e);
});
control.on('errors', es => {
  es.forEach(e => {
    errorController.error(e);
  });
});
control.on('new-client', c => {
  clientController.newClient(c);
});
control.on('lost-client', c => {
  clientController.lostClient(c);
});
control.on('wallGeometry', p => {
  clientController.setWallGeometry(p);
});
control.on('takeSnapshotRes', res => {
  clientController.takeSnapshotRes(res);
});

const openCreatorEl = document.querySelector('#open-creator');
openCreatorEl.addEventListener('click', () => {
  playlistCreator.open();
});

const timeEl = document.querySelector('#time');
const remainingEl = document.querySelector('#remaining');
function render() {
  timeEl.textContent = getTime().toFixed(0);
  const remainingMs = transitionData.nextDeadline - getTime();
  if (remainingMs < 0) {
    remainingEl.textContent = `Fading (${-remainingMs})`;
    remainingEl.classList.add('transitioning');
  } else {
    remainingEl.classList.remove('transitioning');
    remainingEl.textContent = convertMsDurationToText(remainingMs);
  }


  playlistController.render();

  window.requestAnimationFrame(render);
}
render();
