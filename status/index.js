/* Copyright 2018 Google Inc. All Rights Reserved.

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
import io from './socket.io-client.js';

let lastUpdateFromServer = 0;
let timeOfLastUpdateFromServer = window.performance.now();
let connected = false;
function getTime() {
  if (!connected) {
    return lastUpdateFromServer;
  }
  return lastUpdateFromServer + window.performance.now() - timeOfLastUpdateFromServer;
}

const control = io('http://localhost:3000/control');
const creatorEl = document.querySelector('#playlist-creator');

function applyNewPlaylist(playlist, moduleConfig) {
  control.emit('newPlaylist', {playlist, moduleConfig});
}

const playlistCreator = new PlaylistCreator(creatorEl, applyNewPlaylist);
const playlistController = new PlaylistController(document.querySelector('.playlist-scroll'), getTime);
const errorController = new ErrorController(document.querySelector('footer'));
const clientController = new ClientController(
  document.querySelector('.diagram'),
  req => control.emit('takeSnapshot', req),
  errorController,
  getTime,
);

let transitionData = {};
control.on('transition', data => {
  transitionData = data;
  const moduleNameEl = document.querySelector('#module');
  moduleNameEl.textContent = data.module;
  const zeroPointEl = document.querySelector('#zero-point');
  zeroPointEl.textContent = data.deadline.toFixed(0);
  const deadlineEl = document.querySelector('#deadline');
  deadlineEl.textContent = data.nextDeadline.toFixed(0);

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
  remainingEl.textContent = (transitionData.nextDeadline - getTime()).toFixed(0);

  playlistController.render();

  window.requestAnimationFrame(render);
}
render();
