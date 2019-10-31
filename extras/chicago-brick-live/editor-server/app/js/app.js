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
var logger = require('debug')('chicago-brick-live:editor-server:app');

import AppConfig from './config';
import { Router, Route, IndexRoute, hashHistory } from 'react-router';
import React from 'react';
import ReactDOM from 'react-dom';
import { routerMiddleware, routerReducer, syncHistoryWithStore } from 'react-router-redux';
import thunkMiddleware from 'redux-thunk';
import { Provider } from 'react-redux';
import { createStore, combineReducers, applyMiddleware } from 'redux';
import createLogger from 'redux-logger';
import { clientCodeReducer } from './reducers';
import { App, SelectClient, Editor } from './components';

import { initializeCodeServer } from "./code-server-client";

// Setup Redux store.
const loggerMiddleware = createLogger();
const store = createStore(
  combineReducers({
    code: clientCodeReducer,
    routing: routerReducer
  }),
  applyMiddleware(loggerMiddleware, thunkMiddleware, routerMiddleware(hashHistory))
);

// Code server setup.
initializeCodeServer(AppConfig.codeServer.connectionString, store);

// Create an enhanced history that syncs navigation events with the store
const history = syncHistoryWithStore(hashHistory, store);

ReactDOM.render((
    <Provider store={store}>
        <Router history={history}>
            <Route path="/" name="root" component={App} >
              <IndexRoute component={SelectClient} />
              <Route path="/client/:clientX,:clientY" component={Editor} />
            </Route>
        </Router>
      </Provider>
), document.getElementById('app'));
