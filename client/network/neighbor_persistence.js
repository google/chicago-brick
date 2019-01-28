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

define(function(require) {
  'use strict';
  var _ = require('underscore');
  var debug = require('debug')('wall:neighbor-persistence');
  var geometry = require('lib/geometry');
  var Rectangle = require('lib/rectangle');
  
  class NeighborPersistence {
    // Creates the neighbor persistence layer. Note that this takes ownership of
    // the peer connection layer, though we expose the neighbor list & a way to
    // handle custom messages via the customMessageHandler. The passed-in rect 
    // must not include any bezel such that a determination of which client 
    // should own a piece of data can be authoritatively determined locally.
    constructor(rect, peer, opt_customMessageHandler) {
      this.clients = peer.connectToNeighbors((conn, data) => {
        if (data.msg == 'persistent-update') {
          // Message from the persistence layer!
          var datum = data.datum;
          // First, check to see if we have this data already or if we do, if the
          // status is non-authoritative.
          var existingDatum = this.data_[datum._id];
          if (!existingDatum || existingDatum._status != 'authoritative' && existingDatum._status != 'downgrading') {
            this.data_[datum._id] = datum;
            datum._status = existingDatum ? existingDatum._status : 'new';
          } else {
            debug('Dropped update to ' + datum._id + ' because we are the authority');
          }
        } else if (data.msg == 'ownership-transfer') {
          let id = data.id;
          // If we don't have this data, freak out!
          console.assert(this.data_[id], 'Ownership transfer for unknown datum ' + id);
          console.assert(this.data_[id]._status == 'shared', 'Ownership transfer of non-shared datum ' + id, this.data_[id]._status);
          // Upgrade! At this point, we have two authorities... eek!
          this.data_[id]._status = 'authoritative';
          // Reply back, saying that we succeeded.
          conn.send({msg: 'ownership-transfer-success', id: id});
        } else if (data.msg == 'ownership-transfer-success') {
          let id = data.id;
          // If we don't have this data, freak out!
          console.assert(this.data_[id], 'Ownership ack for unknown datum ' + id);
          console.assert(this.data_[id]._status == 'downgrading', 'Ownership ack of non-downgrading datum ' + id, this.data_[id]._status);
          // Downgrade.
          this.data_[id]._status = 'shared';
        } else if (opt_customMessageHandler) {
          opt_customMessageHandler(conn, data);
        }
      });
      this.rect_ = rect;
      this.data_ = {};
    }
    // Add a datum that should be persisted. The datum must be an object with
    // x and y values in the space of the screen. Returns the unique ID of the
    // datum.
    addData(data) {
      data._id = data._id || String(Math.random());
      this.data_[data._id] = data;
      data._status = 'new';
      debug('Added data to persistent layer', data);
      return data._id;
    }
    // Return the neighbor that a point is located in.
    findContainingNeighbor_(x, y) {
      return this.clients.find((client) => {
        var rect = new Rectangle(
            client.x * this.rect_.w, client.y * this.rect_.h,
            this.rect_.w, this.rect_.h);
        return geometry.isInsideRect(rect, x, y);
      });
    }
    // Returns the ideal status of a point.
    computeIdealStatus_(x, y) {
      if (geometry.isInsideRect(this.rect_, x, y)) {
        // We should be owning this data.
        return 'authoritative';
      } else {
        var client = this.findContainingNeighbor_(x, y);
        if (client) {
          return 'shared';
        } else {
          return 'delete';
        }
      }
    }
  
    // Sends some data to all neighbors.
    broadcast_(datum) {
      // TODO(applmak): We could be more efficient here by only sending updates
      // to specific peers that are likely to care, versus ALL peers.
      var msg = {msg: 'persistent-update', datum: datum};
      this.clients.forEach((client) => {
        client.conn.send(msg);
      });
    }
  
    // Tick the persistence layer, which transmits data around to neighbors. When
    // new data arrives that will be persisted, we call newCb with the datum.
    // When data is 'shared', we called sharedCb with the datum.
    // Mutations of the data is controlled by updateCb, which is allowed to
    // change the data. Returning false from updateCb will remove the data from
    // the network. When the data passes out of sight of this client, deleteCb is
    // called with the datum that will be removed.
    update(newCb, sharedCb, updateCb, deleteCb) {
      // Compute the ideal statuses for every data point just once ahead of 
      // time.
      var idealStatuses = _(this.data_).mapObject((data) => {
        return this.computeIdealStatus_(data.x, data.y);
      });
      
      // Phase 1: run the cbs.
      _(this.data_).forEach((data, id) => {
        console.assert(data._status != 'delete', 'Data ' + id + ' is somehow marked for delete before update!');
        
        var deleteDueToTimeout = false;
        // For all stuff that's new and not going to be deleted, call newCb 
        // on it.
        if (data._status == 'new') {
          console.assert(idealStatuses[id] != 'delete', 'Logic error: new things can\'t be deleted on the frame they were spawned!');
          let shouldKeep = newCb(data);
          if (!shouldKeep) {
            deleteDueToTimeout = true;
          }
        } else if (data._status == 'shared' && idealStatuses[id] != 'delete') {
          // Then, update all shared stuff that won't be deleted with sharedCb.
          // We allow clients to return false to note that something in the app
          // (like a lifetime event) has removed this data.
          if (!sharedCb(data)) {
            deleteDueToTimeout = true;
          }
        } else if (data._status == 'authoritative' ||
                   data._status == 'downgrading') {
          // Then, update all authoritative stuff that won't be deleted with
          // updateCb, broadcast out this data to neighbors.
          var shouldKeep = updateCb(data);
          this.broadcast_(data);
          if (!shouldKeep) {
            deleteDueToTimeout = true;
          }
        }
        
        // Finally, run the deleteCb on stuff that will be deleted. If the app
        // wants us to delete this, always do it. If not, look at the ideal
        // status. If that says delete & we've 
        if (deleteDueToTimeout || idealStatuses[id] == 'delete' && data._status == 'shared') {
          deleteCb(data);
        }
      });
      
      // Phase 2: Handle status changes.
      this.data_ = _(this.data_).pick((data, id) => {
        // If you are downgrading, no status change here.
        if (data._status == 'downgrading') {
          return true;
        }
      
        // If your new status is authoritative & the old was shared, initiate 
        // upgrade procedure with the target client.
        if (data._status == 'authoritative' && idealStatuses[id] != 'authoritative') {
          var neighbor = this.findContainingNeighbor_(data.x, data.y);
          if (neighbor) {
            // We can only hand off authority if our neighbor exists.
            neighbor.conn.send({msg: 'ownership-transfer', id: data._id});
            data._status = 'downgrading';
          }
          return true;
        } else if (idealStatuses[id] == 'delete') {
          // If your new status is delete, then delete.
          return false;
        } else {
          // Otherwise, set your status directly.
          data._status = idealStatuses[id];
          return true;
        }
      });
      
      _(this.data_).forEach((data) => {
        console.assert(data._status != 'delete');
      });
    }
  }

  return NeighborPersistence;
});
