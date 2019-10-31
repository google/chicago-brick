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
export const RECEIVE_CODE = 'RECEIVE_CODE';
export const STORE_CODE = 'STORE_CODE';
export const REQUEST_CODE = 'REQUEST_CODE';
export const CLEAR_TOKEN = 'CLEAR_TOKEN';

export function requestCode(client) {
  return {
    type: REQUEST_CODE,
    client,
  };
}

export function clearToken() {
  return {
    type: CLEAR_TOKEN,
  };
}

export function storeCode(client) {
  return {
    type: STORE_CODE,
    client,
  };
}

export function receiveCode(client, code, token) {
  return {
    type: RECEIVE_CODE,
    client,
    code,
    token,
    receivedAt: Date.now(),
  };
}


// Composite action that requests code from a code server.
export function loadRemoteCode(client, codeServer) {
  return function(dispatch) {
    // First notify that code is being loaded.
    dispatch(requestCode(client));

    // Request code form codeserver, always try to get a lock so we can edit.
    codeServer.emit('requestCode', { client: client, tryLock: true });
  };
}

// Composite action that saves code to a code server.
export function storeRemoteCode(client, code, token, codeServer) {
  return function(dispatch) {
    // First notify that code is being stored to server.
    dispatch(storeCode(client));

    // For the actual request
    codeServer.emit('storeCode', {
        client: client,
        code: code,
        token: token
      }
    );
  };
}

// Composite action that saves releases code toke on a code server.
export function releaseToken(client, token, codeServer) {
  return function(dispatch) {
    // First notify that code is being stored to server.
    dispatch(clearToken());

    codeServer.emit('releaseToken', {
        client: client,
        token: token
      }
    );
  };
}
