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
import _ from 'lodash';
import { connect} from 'react-redux';
import brace from 'brace';
import AceEditor from 'react-ace';
import { Button, Grid, Row, Col, ButtonGroup, ButtonToolbar, Alert } from 'react-bootstrap';

import { loadRemoteCode, storeRemoteCode, releaseToken } from '../actions';
import { codeServer } from '../code-server-client';
import { EXAMPLE_CODE } from './Editor-example-code';

import 'brace/mode/javascript';
import 'brace/theme/monokai';

var logger = require('debug')('chicago-brick-live:editor-server:ClientCode');

class Editor extends React.Component {
  constructor(props) {
      super(props);

      this.state = {
        serverCodeChanged: false,
        code: props.code || "",
      };

      // Request a remote code load.
      props.loadCode(this.getClient(props));
    }

    getClient(props) {
      return {
        x: props.params.clientX,
        y: props.params.clientY,
      };
    }

    componentWillUnmount() {
      // Load the new client code.
      this.props.releaseToken(this.getClient(this.props), this.props.token);
    }

    componentWillReceiveProps(nextProps) {
      logger('New props received: ' + nextProps);

      // Do the params specify a new client?
      var nextClient = this.getClient(nextProps);
      var curClient = this.getClient(this.props);

      if (!_.isEqual(nextClient, curClient)) {
        // Load the new client code.
        this.props.releaseToken(curClient, this.props.token);
        nextProps.loadCode(nextClient);
      } else if (this.props.fetchingCode && nextProps.code != this.props.code) {
        // The code has changed and we are fetching code, use it.
        // TODO Any local edits will be lost, can we give user a choice?
        this.setCode(nextProps.code);
      } else if (nextProps.code != this.state.code) {
        // The code has changed, probably not by us.
        this.setState({serverCodeChanged: true});
      }
    }

    setCode(code) {
      this.setState({ code: code });
    }

    saveCode() {
      logger('Saving code to CodeServer');
      this.props.storeCode(this.getClient(this.props), this.state.code, this.props.token);
    }

    appendCode(code) {
      this.setState({ code: this.state.code + '\n' + code });
    }

    clearCode(code) {
      this.setState({ code: "" });
    }

    render() {
      var canSaveCode = !!this.props.token;

      var fetching;
      var saving;
      var alert;
      var codeControl;

      if (this.props.isFetching) {
        fetching = <div>Fetching code for ({this.props.params.clientX}, {this.props.params.clientY})</div>;
      }

      if (this.props.isSaving) {
        saving = <div>Saving code for ({this.props.params.clientX}, {this.props.params.clientY})</div>;
      }

      if (!canSaveCode) {
        alert = <Alert>Someone else is already controlling this screen.</Alert>;
      } else {
        codeControl = (
        <Row>
          <Col xs={10}>
          <div className="pull-left">
            <ButtonToolbar>
              <Button bsStyle="warning" bsSize="large" onClick={this.clearCode.bind(this)}>Clear Code</Button>
            </ButtonToolbar>
          </div>
            <div className="pull-right">
              <Button bsStyle="primary" bsSize="large" onClick={this.saveCode.bind(this)}>Send code to wall ({this.props.params.clientX}, {this.props.params.clientY})</Button>
            </div>
          </Col>
        </Row>);
      }

      var functionOpening =
`function(canvas, time, globalTime, screen, artist) {
// canvas: Javscript canvas object.
// time: Milliseconds since code started running.
// globalTime: MilliSeconds since all screens started running.
// screen: Rectangle (x, y, width, height) with extents of screen.
// artist: An artist that can draw lines (see the example code for more details.`;
      var functionClosing = "}";

      return (
        <Grid fluid>
          {codeControl}

          <Row>
            <Col md={10}>
            { fetching }
            { saving }
            { alert }

            <AceEditor className="code-editor fake-gutter" mode="javascript" theme="monokai" value={functionOpening}
                readOnly maxLines={6} minLines={6} showGutter={false} name="code-editor-opening" highlightActiveLine={false}/>
            <AceEditor className="code-editor" mode="javascript" theme="monokai" value={this.state.code}
                onChange={this.setCode.bind(this)} name="code-editor-source"/>
            <AceEditor className="code-editor fake-gutter" mode="javascript" theme="monokai" value={functionClosing}
                readOnly  showGutter={false} maxLines={1} name="code-editor-closing" highlightActiveLine={false}/>

            </Col>
            <Col md={2}>
              <h3>Add example code</h3>
              <ButtonGroup vertical>
                {
                  EXAMPLE_CODE.map((ex) => {
                    return <Button key={ex.name} onClick={this.appendCode.bind(this, ex.code)}>{ex.name}</Button>;
                  })
                }
              </ButtonGroup>
            </Col>
          </Row>
        </Grid>
      );
    }
}

var mapDispatchToProps = function(dispatch){
    return {
        loadCode: (client) => { dispatch(loadRemoteCode(client, codeServer)); },
        releaseToken: (client, token) => { dispatch(releaseToken(client, token, codeServer)); },
        storeCode: (client, code, token) => { dispatch(storeRemoteCode(client, code, token, codeServer)); }
    };
};

var mapStateToProps = function(state) {
  return {
    savingCode: state.code.isSaving,
    fetchingCode: state.code.isFetching,
    code: state.code.value,
    token: state.code.token,
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(Editor);
