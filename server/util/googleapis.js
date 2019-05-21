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

'use strict';

const {google} = require('googleapis');
const credentials = require('server/util/credentials');

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/youtube.readonly'
];

/**
 * Our private key for Google APIs.
 * Lazily initialized.
 */
let key = null;

/**
 * Returns an API client that has authenticated with a service account.
 * To use this, create a service account in the Google Developers Console
 * and place the resulting key file in this directory as
 * googleserviceaccountkey.json.
 */
async function getAuthenticatedClient() {
  if (!key) {
    key = credentials.get('googleserviceaccountkey');
    if (!key) {
      throw new Error('Missing required service account key file');
    }
  }
  const client = new google.auth.JWT(
      key.client_email, null, key.private_key, SCOPES);
  await client.authorize();

  google.options({
    auth: client
  });
  return {googleapis: google, credentials: client.credentials};
}

module.exports = {getAuthenticatedClient};
