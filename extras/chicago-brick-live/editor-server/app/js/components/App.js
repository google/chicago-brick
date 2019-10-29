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
import React from 'react';
import { default as NavBar } from './NavBar';

var $ = require('jquery');
var logger = require('debug')('chicago-brick-live:editor-server:App');

export default class App extends React.Component {
    componentWillMount() {
        // Suppress the backspace to avoid loosing edits.
        document.addEventListener('keydown', function(e) {
          var target = (e.target || e.srcElement);
          if (e.keyCode == 8 &&
              !$(target).is('input,[contenteditable="true"],textarea')) {
            logger("Supressing backspace from non-edit region");
            e.preventDefault();
          }
        });
    }

    render() {
      return (
              <div>
                <NavBar />
                {this.props.children}
               </div>
          );
      }
}
