---
layout: default
title: API Docs
permalink: /api.html
---

API Docs
=============

The module author has access to a variety of APIs that provide access to the displays, to the clock, to the network, etc. This pages documents those APIs.

# Utilities
## debug
Based on the [npm debug module](https://www.npmjs.com/package/debug), a debugger that logs to the console on either the client or server under the `wall:module:$NAME` namespace.

**Note** that this is currently automagically injected (no `require('debug')` is needed).

## underscore
The normal [underscore.js](http://underscorejs.org/) library.

    var _ = require('underscore');

## assert
A function that asserts that its first parameter is truthy. Failures are logged to the console, along with the additional arguments to `assert`, and an exception is thrown.

    var assert = require('assert');

## Rectangle
A class that represents a 2D rectangle.

    var Rectangle = require('lib/rectangle');

## wallGeometry
A Polygon that describes the wall geometry for this layout.

**Note** that this is currently automagically injected.

## globalWallGeometry
A Polygon that describes the global wall geometry, regardless of layout.

**Note** that this is currently automagically injected.

## geometry
A namespace of handy geometry utilities.

# Client

## Surfaces

### CanvasSurface

A raw HTML5 Canvas surface that you can interact with.

### ThreeJsSurface

A canvas based on the popular [three.js](http://threejs.org) 3D framework.

### P5Surface

A canvas based on the [p5js](http://p5js.org) port of processing.  This surface
is set up to let you operate on the entire wall with minimal changes to your p5
sketches.

## network

## state

# Server

## network

## state
