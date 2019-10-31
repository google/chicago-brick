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
import { connect} from 'react-redux';
import { Grid, Button, Input, Row } from 'react-bootstrap';
import { setClient } from '../actions';
import { push } from 'react-router-redux';

var logger = require('debug')('chicago-brick-live:editor-server:SelectClient');

class SelectClient extends React.Component {
  constructor(props) {
      super(props);
      this.state = { x: this.props.initialX, y: this.props.initialY };
    }

    selectClient() {
      this.props.pushLocation(`client/${this.state.x},${this.state.y}`);
    }

    setX(e) { this.setState({ x: e.target.value }); }
    setY(e) { this.setState({ y: e.target.value }); }

    hasValidClient() {
      return (parseInt(this.state.x) >= 0 && parseInt(this.state.y) >= 0);
    }

    render() {
      var validClient = this.hasValidClient();

      return (
            <Grid>
              <Row>
                <div className="center center-block text-center">
                  <h3>Write some code for the big screen!</h3>
                  <div className="screen center">
                      <h4>Choose your screen</h4>
                      <input type="text" value={this.state.x} onChange={this.setX.bind(this)}/>,<input type="text" value={this.state.y} onChange={this.setY.bind(this)}/>
                      <Button bsStyle="primary" onClick={this.selectClient.bind(this)} disabled={!validClient}>Code!</Button>
                  </div>
                </div>
              </Row>
            </Grid>
          );
    }
}


var mapDispatchToProps = function(dispatch){
    return {
        pushLocation: function(nextLocation) { dispatch(push(nextLocation)); }
    }
};

var mapStateToProps = function(state) {
  return {
    initialX: state.code.client.x,
    initialY: state.code.client.y
  }
};

export default connect(mapStateToProps, mapDispatchToProps)(SelectClient)
