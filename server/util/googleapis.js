/* Copyright 2015 Google Inc. All Rights Reserved.

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

'use strict';

var googleapis = require('googleapis');
var credentials = require('server/util/credentials');

var SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/youtube.readonly'
];

var key = null;
/**
 * Returns an API client that has authenticated with a service account.
 * To use this, create a service account in the Google Developers Console
 * and place the resulting key file in this directory as
 * googleserviceaccountkey.json.
 */
function getAuthenticatedClient() {
  if (!key) {
    key = credentials.get('googleserviceaccountkey');
    if (!key) {
      return Promise.reject('Missing required service account key file');
    }
  }
  var jwtClient = new googleapis.auth.JWT(
      key.client_email, null, key.private_key, SCOPES);
  return new Promise((resolve, reject) => {
    jwtClient.authorize((err, tokens) => {
      if (err) {
        reject(err);
        return;
      }
      googleapis.options({
        auth: jwtClient
      });
      resolve({
        googleapis: googleapis,
        credentials: jwtClient.credentials,
      });
    });
  });
}

module.exports = {
  unauthenticated: googleapis,
  getAuthenticatedClient: getAuthenticatedClient,
  key: key
};
