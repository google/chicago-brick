var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var eventemitter3 = createCommonjsModule(function (module) {

var has = Object.prototype.hasOwnProperty
  , prefix = '~';

/**
 * Constructor to create a storage for our `EE` objects.
 * An `Events` instance is a plain object whose properties are event names.
 *
 * @constructor
 * @private
 */
function Events() {}

//
// We try to not inherit from `Object.prototype`. In some engines creating an
// instance in this way is faster than calling `Object.create(null)` directly.
// If `Object.create(null)` is not supported we prefix the event names with a
// character to make sure that the built-in object properties are not
// overridden or used as an attack vector.
//
if (Object.create) {
  Events.prototype = Object.create(null);

  //
  // This hack is needed because the `__proto__` property is still inherited in
  // some old browsers like Android 4, iPhone 5.1, Opera 11 and Safari 5.
  //
  if (!new Events().__proto__) prefix = false;
}

/**
 * Representation of a single event listener.
 *
 * @param {Function} fn The listener function.
 * @param {*} context The context to invoke the listener with.
 * @param {Boolean} [once=false] Specify if the listener is a one-time listener.
 * @constructor
 * @private
 */
function EE(fn, context, once) {
  this.fn = fn;
  this.context = context;
  this.once = once || false;
}

/**
 * Add a listener for a given event.
 *
 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} context The context to invoke the listener with.
 * @param {Boolean} once Specify if the listener is a one-time listener.
 * @returns {EventEmitter}
 * @private
 */
function addListener(emitter, event, fn, context, once) {
  if (typeof fn !== 'function') {
    throw new TypeError('The listener must be a function');
  }

  var listener = new EE(fn, context || emitter, once)
    , evt = prefix ? prefix + event : event;

  if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
  else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
  else emitter._events[evt] = [emitter._events[evt], listener];

  return emitter;
}

/**
 * Clear event by name.
 *
 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
 * @param {(String|Symbol)} evt The Event name.
 * @private
 */
function clearEvent(emitter, evt) {
  if (--emitter._eventsCount === 0) emitter._events = new Events();
  else delete emitter._events[evt];
}

/**
 * Minimal `EventEmitter` interface that is molded against the Node.js
 * `EventEmitter` interface.
 *
 * @constructor
 * @public
 */
function EventEmitter() {
  this._events = new Events();
  this._eventsCount = 0;
}

/**
 * Return an array listing the events for which the emitter has registered
 * listeners.
 *
 * @returns {Array}
 * @public
 */
EventEmitter.prototype.eventNames = function eventNames() {
  var names = []
    , events
    , name;

  if (this._eventsCount === 0) return names;

  for (name in (events = this._events)) {
    if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
  }

  if (Object.getOwnPropertySymbols) {
    return names.concat(Object.getOwnPropertySymbols(events));
  }

  return names;
};

/**
 * Return the listeners registered for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Array} The registered listeners.
 * @public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  var evt = prefix ? prefix + event : event
    , handlers = this._events[evt];

  if (!handlers) return [];
  if (handlers.fn) return [handlers.fn];

  for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
    ee[i] = handlers[i].fn;
  }

  return ee;
};

/**
 * Return the number of listeners listening to a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Number} The number of listeners.
 * @public
 */
EventEmitter.prototype.listenerCount = function listenerCount(event) {
  var evt = prefix ? prefix + event : event
    , listeners = this._events[evt];

  if (!listeners) return 0;
  if (listeners.fn) return 1;
  return listeners.length;
};

/**
 * Calls each of the listeners registered for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Boolean} `true` if the event had listeners, else `false`.
 * @public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  var evt = prefix ? prefix + event : event;

  if (!this._events[evt]) return false;

  var listeners = this._events[evt]
    , len = arguments.length
    , args
    , i;

  if (listeners.fn) {
    if (listeners.once) this.removeListener(event, listeners.fn, undefined, true);

    switch (len) {
      case 1: return listeners.fn.call(listeners.context), true;
      case 2: return listeners.fn.call(listeners.context, a1), true;
      case 3: return listeners.fn.call(listeners.context, a1, a2), true;
      case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
      case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
      case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
    }

    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    listeners.fn.apply(listeners.context, args);
  } else {
    var length = listeners.length
      , j;

    for (i = 0; i < length; i++) {
      if (listeners[i].once) this.removeListener(event, listeners[i].fn, undefined, true);

      switch (len) {
        case 1: listeners[i].fn.call(listeners[i].context); break;
        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
        case 4: listeners[i].fn.call(listeners[i].context, a1, a2, a3); break;
        default:
          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
            args[j - 1] = arguments[j];
          }

          listeners[i].fn.apply(listeners[i].context, args);
      }
    }
  }

  return true;
};

/**
 * Add a listener for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} [context=this] The context to invoke the listener with.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.on = function on(event, fn, context) {
  return addListener(this, event, fn, context, false);
};

/**
 * Add a one-time listener for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} [context=this] The context to invoke the listener with.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.once = function once(event, fn, context) {
  return addListener(this, event, fn, context, true);
};

/**
 * Remove the listeners of a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn Only remove the listeners that match this function.
 * @param {*} context Only remove the listeners that have this context.
 * @param {Boolean} once Only remove one-time listeners.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
  var evt = prefix ? prefix + event : event;

  if (!this._events[evt]) return this;
  if (!fn) {
    clearEvent(this, evt);
    return this;
  }

  var listeners = this._events[evt];

  if (listeners.fn) {
    if (
      listeners.fn === fn &&
      (!once || listeners.once) &&
      (!context || listeners.context === context)
    ) {
      clearEvent(this, evt);
    }
  } else {
    for (var i = 0, events = [], length = listeners.length; i < length; i++) {
      if (
        listeners[i].fn !== fn ||
        (once && !listeners[i].once) ||
        (context && listeners[i].context !== context)
      ) {
        events.push(listeners[i]);
      }
    }

    //
    // Reset the array, or remove it completely if we have no more listeners.
    //
    if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
    else clearEvent(this, evt);
  }

  return this;
};

/**
 * Remove all listeners, or those of the specified event.
 *
 * @param {(String|Symbol)} [event] The event name.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  var evt;

  if (event) {
    evt = prefix ? prefix + event : event;
    if (this._events[evt]) clearEvent(this, evt);
  } else {
    this._events = new Events();
    this._eventsCount = 0;
  }

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// Expose the prefix.
//
EventEmitter.prefixed = prefix;

//
// Allow `EventEmitter` to be imported as module namespace.
//
EventEmitter.EventEmitter = EventEmitter;

//
// Expose the module.
//
{
  module.exports = EventEmitter;
}
});

var bufferbuilder = createCommonjsModule(function (module) {
var binaryFeatures = {};
binaryFeatures.useBlobBuilder = (function(){
  try {
    new Blob([]);
    return false;
  } catch (e) {
    return true;
  }
})();

binaryFeatures.useArrayBufferView = !binaryFeatures.useBlobBuilder && (function(){
  try {
    return (new Blob([new Uint8Array([])])).size === 0;
  } catch (e) {
    return true;
  }
})();

module.exports.binaryFeatures = binaryFeatures;
var BlobBuilder = module.exports.BlobBuilder;
if (typeof window != 'undefined') {
  BlobBuilder = module.exports.BlobBuilder = window.WebKitBlobBuilder ||
    window.MozBlobBuilder || window.MSBlobBuilder || window.BlobBuilder;
}

function BufferBuilder(){
  this._pieces = [];
  this._parts = [];
}

BufferBuilder.prototype.append = function(data) {
  if(typeof data === 'number') {
    this._pieces.push(data);
  } else {
    this.flush();
    this._parts.push(data);
  }
};

BufferBuilder.prototype.flush = function() {
  if (this._pieces.length > 0) {
    var buf = new Uint8Array(this._pieces);
    if(!binaryFeatures.useArrayBufferView) {
      buf = buf.buffer;
    }
    this._parts.push(buf);
    this._pieces = [];
  }
};

BufferBuilder.prototype.getBuffer = function() {
  this.flush();
  if(binaryFeatures.useBlobBuilder) {
    var builder = new BlobBuilder();
    for(var i = 0, ii = this._parts.length; i < ii; i++) {
      builder.append(this._parts[i]);
    }
    return builder.getBlob();
  } else {
    return new Blob(this._parts);
  }
};

module.exports.BufferBuilder = BufferBuilder;
});
var bufferbuilder_1 = bufferbuilder.binaryFeatures;
var bufferbuilder_2 = bufferbuilder.BlobBuilder;
var bufferbuilder_3 = bufferbuilder.BufferBuilder;

var BufferBuilder = bufferbuilder.BufferBuilder;
var binaryFeatures = bufferbuilder.binaryFeatures;

var BinaryPack = {
  unpack: function(data){
    var unpacker = new Unpacker(data);
    return unpacker.unpack();
  },
  pack: function(data){
    var packer = new Packer();
    packer.pack(data);
    var buffer = packer.getBuffer();
    return buffer;
  }
};

var binarypack = BinaryPack;

function Unpacker (data){
  // Data is ArrayBuffer
  this.index = 0;
  this.dataBuffer = data;
  this.dataView = new Uint8Array(this.dataBuffer);
  this.length = this.dataBuffer.byteLength;
}

Unpacker.prototype.unpack = function(){
  var type = this.unpack_uint8();
  if (type < 0x80){
    var positive_fixnum = type;
    return positive_fixnum;
  } else if ((type ^ 0xe0) < 0x20){
    var negative_fixnum = (type ^ 0xe0) - 0x20;
    return negative_fixnum;
  }
  var size;
  if ((size = type ^ 0xa0) <= 0x0f){
    return this.unpack_raw(size);
  } else if ((size = type ^ 0xb0) <= 0x0f){
    return this.unpack_string(size);
  } else if ((size = type ^ 0x90) <= 0x0f){
    return this.unpack_array(size);
  } else if ((size = type ^ 0x80) <= 0x0f){
    return this.unpack_map(size);
  }
  switch(type){
    case 0xc0:
      return null;
    case 0xc1:
      return undefined;
    case 0xc2:
      return false;
    case 0xc3:
      return true;
    case 0xca:
      return this.unpack_float();
    case 0xcb:
      return this.unpack_double();
    case 0xcc:
      return this.unpack_uint8();
    case 0xcd:
      return this.unpack_uint16();
    case 0xce:
      return this.unpack_uint32();
    case 0xcf:
      return this.unpack_uint64();
    case 0xd0:
      return this.unpack_int8();
    case 0xd1:
      return this.unpack_int16();
    case 0xd2:
      return this.unpack_int32();
    case 0xd3:
      return this.unpack_int64();
    case 0xd4:
      return undefined;
    case 0xd5:
      return undefined;
    case 0xd6:
      return undefined;
    case 0xd7:
      return undefined;
    case 0xd8:
      size = this.unpack_uint16();
      return this.unpack_string(size);
    case 0xd9:
      size = this.unpack_uint32();
      return this.unpack_string(size);
    case 0xda:
      size = this.unpack_uint16();
      return this.unpack_raw(size);
    case 0xdb:
      size = this.unpack_uint32();
      return this.unpack_raw(size);
    case 0xdc:
      size = this.unpack_uint16();
      return this.unpack_array(size);
    case 0xdd:
      size = this.unpack_uint32();
      return this.unpack_array(size);
    case 0xde:
      size = this.unpack_uint16();
      return this.unpack_map(size);
    case 0xdf:
      size = this.unpack_uint32();
      return this.unpack_map(size);
  }
};

Unpacker.prototype.unpack_uint8 = function(){
  var byte = this.dataView[this.index] & 0xff;
  this.index++;
  return byte;
};

Unpacker.prototype.unpack_uint16 = function(){
  var bytes = this.read(2);
  var uint16 =
    ((bytes[0] & 0xff) * 256) + (bytes[1] & 0xff);
  this.index += 2;
  return uint16;
};

Unpacker.prototype.unpack_uint32 = function(){
  var bytes = this.read(4);
  var uint32 =
     ((bytes[0]  * 256 +
       bytes[1]) * 256 +
       bytes[2]) * 256 +
       bytes[3];
  this.index += 4;
  return uint32;
};

Unpacker.prototype.unpack_uint64 = function(){
  var bytes = this.read(8);
  var uint64 =
   ((((((bytes[0]  * 256 +
       bytes[1]) * 256 +
       bytes[2]) * 256 +
       bytes[3]) * 256 +
       bytes[4]) * 256 +
       bytes[5]) * 256 +
       bytes[6]) * 256 +
       bytes[7];
  this.index += 8;
  return uint64;
};


Unpacker.prototype.unpack_int8 = function(){
  var uint8 = this.unpack_uint8();
  return (uint8 < 0x80 ) ? uint8 : uint8 - (1 << 8);
};

Unpacker.prototype.unpack_int16 = function(){
  var uint16 = this.unpack_uint16();
  return (uint16 < 0x8000 ) ? uint16 : uint16 - (1 << 16);
};

Unpacker.prototype.unpack_int32 = function(){
  var uint32 = this.unpack_uint32();
  return (uint32 < Math.pow(2, 31) ) ? uint32 :
    uint32 - Math.pow(2, 32);
};

Unpacker.prototype.unpack_int64 = function(){
  var uint64 = this.unpack_uint64();
  return (uint64 < Math.pow(2, 63) ) ? uint64 :
    uint64 - Math.pow(2, 64);
};

Unpacker.prototype.unpack_raw = function(size){
  if ( this.length < this.index + size){
    throw new Error('BinaryPackFailure: index is out of range'
      + ' ' + this.index + ' ' + size + ' ' + this.length);
  }
  var buf = this.dataBuffer.slice(this.index, this.index + size);
  this.index += size;

    //buf = util.bufferToString(buf);

  return buf;
};

Unpacker.prototype.unpack_string = function(size){
  var bytes = this.read(size);
  var i = 0, str = '', c, code;
  while(i < size){
    c = bytes[i];
    if ( c < 128){
      str += String.fromCharCode(c);
      i++;
    } else if ((c ^ 0xc0) < 32){
      code = ((c ^ 0xc0) << 6) | (bytes[i+1] & 63);
      str += String.fromCharCode(code);
      i += 2;
    } else {
      code = ((c & 15) << 12) | ((bytes[i+1] & 63) << 6) |
        (bytes[i+2] & 63);
      str += String.fromCharCode(code);
      i += 3;
    }
  }
  this.index += size;
  return str;
};

Unpacker.prototype.unpack_array = function(size){
  var objects = new Array(size);
  for(var i = 0; i < size ; i++){
    objects[i] = this.unpack();
  }
  return objects;
};

Unpacker.prototype.unpack_map = function(size){
  var map = {};
  for(var i = 0; i < size ; i++){
    var key  = this.unpack();
    var value = this.unpack();
    map[key] = value;
  }
  return map;
};

Unpacker.prototype.unpack_float = function(){
  var uint32 = this.unpack_uint32();
  var sign = uint32 >> 31;
  var exp  = ((uint32 >> 23) & 0xff) - 127;
  var fraction = ( uint32 & 0x7fffff ) | 0x800000;
  return (sign == 0 ? 1 : -1) *
    fraction * Math.pow(2, exp - 23);
};

Unpacker.prototype.unpack_double = function(){
  var h32 = this.unpack_uint32();
  var l32 = this.unpack_uint32();
  var sign = h32 >> 31;
  var exp  = ((h32 >> 20) & 0x7ff) - 1023;
  var hfrac = ( h32 & 0xfffff ) | 0x100000;
  var frac = hfrac * Math.pow(2, exp - 20) +
    l32   * Math.pow(2, exp - 52);
  return (sign == 0 ? 1 : -1) * frac;
};

Unpacker.prototype.read = function(length){
  var j = this.index;
  if (j + length <= this.length) {
    return this.dataView.subarray(j, j + length);
  } else {
    throw new Error('BinaryPackFailure: read index out of range');
  }
};

function Packer(){
  this.bufferBuilder = new BufferBuilder();
}

Packer.prototype.getBuffer = function(){
  return this.bufferBuilder.getBuffer();
};

Packer.prototype.pack = function(value){
  var type = typeof(value);
  if (type == 'string'){
    this.pack_string(value);
  } else if (type == 'number'){
    if (Math.floor(value) === value){
      this.pack_integer(value);
    } else{
      this.pack_double(value);
    }
  } else if (type == 'boolean'){
    if (value === true){
      this.bufferBuilder.append(0xc3);
    } else if (value === false){
      this.bufferBuilder.append(0xc2);
    }
  } else if (type == 'undefined'){
    this.bufferBuilder.append(0xc0);
  } else if (type == 'object'){
    if (value === null){
      this.bufferBuilder.append(0xc0);
    } else {
      var constructor = value.constructor;
      if (constructor == Array){
        this.pack_array(value);
      } else if (constructor == Blob || constructor == File) {
        this.pack_bin(value);
      } else if (constructor == ArrayBuffer) {
        if(binaryFeatures.useArrayBufferView) {
          this.pack_bin(new Uint8Array(value));
        } else {
          this.pack_bin(value);
        }
      } else if ('BYTES_PER_ELEMENT' in value){
        if(binaryFeatures.useArrayBufferView) {
          this.pack_bin(new Uint8Array(value.buffer));
        } else {
          this.pack_bin(value.buffer);
        }
      } else if (constructor == Object){
        this.pack_object(value);
      } else if (constructor == Date){
        this.pack_string(value.toString());
      } else if (typeof value.toBinaryPack == 'function'){
        this.bufferBuilder.append(value.toBinaryPack());
      } else {
        throw new Error('Type "' + constructor.toString() + '" not yet supported');
      }
    }
  } else {
    throw new Error('Type "' + type + '" not yet supported');
  }
  this.bufferBuilder.flush();
};


Packer.prototype.pack_bin = function(blob){
  var length = blob.length || blob.byteLength || blob.size;
  if (length <= 0x0f){
    this.pack_uint8(0xa0 + length);
  } else if (length <= 0xffff){
    this.bufferBuilder.append(0xda) ;
    this.pack_uint16(length);
  } else if (length <= 0xffffffff){
    this.bufferBuilder.append(0xdb);
    this.pack_uint32(length);
  } else{
    throw new Error('Invalid length');
  }
  this.bufferBuilder.append(blob);
};

Packer.prototype.pack_string = function(str){
  var length = utf8Length(str);

  if (length <= 0x0f){
    this.pack_uint8(0xb0 + length);
  } else if (length <= 0xffff){
    this.bufferBuilder.append(0xd8) ;
    this.pack_uint16(length);
  } else if (length <= 0xffffffff){
    this.bufferBuilder.append(0xd9);
    this.pack_uint32(length);
  } else{
    throw new Error('Invalid length');
  }
  this.bufferBuilder.append(str);
};

Packer.prototype.pack_array = function(ary){
  var length = ary.length;
  if (length <= 0x0f){
    this.pack_uint8(0x90 + length);
  } else if (length <= 0xffff){
    this.bufferBuilder.append(0xdc);
    this.pack_uint16(length);
  } else if (length <= 0xffffffff){
    this.bufferBuilder.append(0xdd);
    this.pack_uint32(length);
  } else{
    throw new Error('Invalid length');
  }
  for(var i = 0; i < length ; i++){
    this.pack(ary[i]);
  }
};

Packer.prototype.pack_integer = function(num){
  if ( -0x20 <= num && num <= 0x7f){
    this.bufferBuilder.append(num & 0xff);
  } else if (0x00 <= num && num <= 0xff){
    this.bufferBuilder.append(0xcc);
    this.pack_uint8(num);
  } else if (-0x80 <= num && num <= 0x7f){
    this.bufferBuilder.append(0xd0);
    this.pack_int8(num);
  } else if ( 0x0000 <= num && num <= 0xffff){
    this.bufferBuilder.append(0xcd);
    this.pack_uint16(num);
  } else if (-0x8000 <= num && num <= 0x7fff){
    this.bufferBuilder.append(0xd1);
    this.pack_int16(num);
  } else if ( 0x00000000 <= num && num <= 0xffffffff){
    this.bufferBuilder.append(0xce);
    this.pack_uint32(num);
  } else if (-0x80000000 <= num && num <= 0x7fffffff){
    this.bufferBuilder.append(0xd2);
    this.pack_int32(num);
  } else if (-0x8000000000000000 <= num && num <= 0x7FFFFFFFFFFFFFFF){
    this.bufferBuilder.append(0xd3);
    this.pack_int64(num);
  } else if (0x0000000000000000 <= num && num <= 0xFFFFFFFFFFFFFFFF){
    this.bufferBuilder.append(0xcf);
    this.pack_uint64(num);
  } else{
    throw new Error('Invalid integer');
  }
};

Packer.prototype.pack_double = function(num){
  var sign = 0;
  if (num < 0){
    sign = 1;
    num = -num;
  }
  var exp  = Math.floor(Math.log(num) / Math.LN2);
  var frac0 = num / Math.pow(2, exp) - 1;
  var frac1 = Math.floor(frac0 * Math.pow(2, 52));
  var b32   = Math.pow(2, 32);
  var h32 = (sign << 31) | ((exp+1023) << 20) |
      (frac1 / b32) & 0x0fffff;
  var l32 = frac1 % b32;
  this.bufferBuilder.append(0xcb);
  this.pack_int32(h32);
  this.pack_int32(l32);
};

Packer.prototype.pack_object = function(obj){
  var keys = Object.keys(obj);
  var length = keys.length;
  if (length <= 0x0f){
    this.pack_uint8(0x80 + length);
  } else if (length <= 0xffff){
    this.bufferBuilder.append(0xde);
    this.pack_uint16(length);
  } else if (length <= 0xffffffff){
    this.bufferBuilder.append(0xdf);
    this.pack_uint32(length);
  } else{
    throw new Error('Invalid length');
  }
  for(var prop in obj){
    if (obj.hasOwnProperty(prop)){
      this.pack(prop);
      this.pack(obj[prop]);
    }
  }
};

Packer.prototype.pack_uint8 = function(num){
  this.bufferBuilder.append(num);
};

Packer.prototype.pack_uint16 = function(num){
  this.bufferBuilder.append(num >> 8);
  this.bufferBuilder.append(num & 0xff);
};

Packer.prototype.pack_uint32 = function(num){
  var n = num & 0xffffffff;
  this.bufferBuilder.append((n & 0xff000000) >>> 24);
  this.bufferBuilder.append((n & 0x00ff0000) >>> 16);
  this.bufferBuilder.append((n & 0x0000ff00) >>>  8);
  this.bufferBuilder.append((n & 0x000000ff));
};

Packer.prototype.pack_uint64 = function(num){
  var high = num / Math.pow(2, 32);
  var low  = num % Math.pow(2, 32);
  this.bufferBuilder.append((high & 0xff000000) >>> 24);
  this.bufferBuilder.append((high & 0x00ff0000) >>> 16);
  this.bufferBuilder.append((high & 0x0000ff00) >>>  8);
  this.bufferBuilder.append((high & 0x000000ff));
  this.bufferBuilder.append((low  & 0xff000000) >>> 24);
  this.bufferBuilder.append((low  & 0x00ff0000) >>> 16);
  this.bufferBuilder.append((low  & 0x0000ff00) >>>  8);
  this.bufferBuilder.append((low  & 0x000000ff));
};

Packer.prototype.pack_int8 = function(num){
  this.bufferBuilder.append(num & 0xff);
};

Packer.prototype.pack_int16 = function(num){
  this.bufferBuilder.append((num & 0xff00) >> 8);
  this.bufferBuilder.append(num & 0xff);
};

Packer.prototype.pack_int32 = function(num){
  this.bufferBuilder.append((num >>> 24) & 0xff);
  this.bufferBuilder.append((num & 0x00ff0000) >>> 16);
  this.bufferBuilder.append((num & 0x0000ff00) >>> 8);
  this.bufferBuilder.append((num & 0x000000ff));
};

Packer.prototype.pack_int64 = function(num){
  var high = Math.floor(num / Math.pow(2, 32));
  var low  = num % Math.pow(2, 32);
  this.bufferBuilder.append((high & 0xff000000) >>> 24);
  this.bufferBuilder.append((high & 0x00ff0000) >>> 16);
  this.bufferBuilder.append((high & 0x0000ff00) >>>  8);
  this.bufferBuilder.append((high & 0x000000ff));
  this.bufferBuilder.append((low  & 0xff000000) >>> 24);
  this.bufferBuilder.append((low  & 0x00ff0000) >>> 16);
  this.bufferBuilder.append((low  & 0x0000ff00) >>>  8);
  this.bufferBuilder.append((low  & 0x000000ff));
};

function _utf8Replace(m){
  var code = m.charCodeAt(0);

  if(code <= 0x7ff) return '00';
  if(code <= 0xffff) return '000';
  if(code <= 0x1fffff) return '0000';
  if(code <= 0x3ffffff) return '00000';
  return '000000';
}

function utf8Length(str){
  if (str.length > 600) {
    // Blob method faster for large strings
    return (new Blob([str])).size;
  } else {
    return str.replace(/[^\u0000-\u007F]/g, _utf8Replace).length;
  }
}

var BinaryPack$1 = /*#__PURE__*/Object.freeze({
	'default': binarypack,
	__moduleExports: binarypack
});

const RTCSessionDescription = 
// @ts-ignore
window.RTCSessionDescription || window.mozRTCSessionDescription;
const RTCPeerConnection = 
// @ts-ignore
window.RTCPeerConnection ||
    // @ts-ignore
    window.mozRTCPeerConnection ||
    // @ts-ignore
    window.webkitRTCPeerConnection;
const RTCIceCandidate = 
// @ts-ignore
window.RTCIceCandidate || window.mozRTCIceCandidate;

const DEFAULT_CONFIG = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    sdpSemantics: "unified-plan"
};
class util {
    static noop() { }
    // Ensure alphanumeric ids
    static validateId(id) {
        // Allow empty ids
        return !id || /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.test(id);
    }
    // chunks a blob.
    static chunk(bl) {
        const chunks = [];
        const size = bl.size;
        const total = Math.ceil(size / util.chunkedMTU);
        let index;
        let start = (index = 0);
        while (start < size) {
            const end = Math.min(size, start + util.chunkedMTU);
            const b = bl.slice(start, end);
            const chunk = {
                __peerData: this._dataCount,
                n: index,
                data: b,
                total: total
            };
            chunks.push(chunk);
            start = end;
            index++;
        }
        this._dataCount++;
        return chunks;
    }
    static blobToArrayBuffer(blob, cb) {
        const fr = new FileReader();
        fr.onload = function (evt) {
            // @ts-ignore
            cb(evt.target.result);
        };
        fr.readAsArrayBuffer(blob);
    }
    static blobToBinaryString(blob, cb) {
        const fr = new FileReader();
        fr.onload = function (evt) {
            // @ts-ignore
            cb(evt.target.result);
        };
        fr.readAsBinaryString(blob);
    }
    static binaryStringToArrayBuffer(binary) {
        let byteArray = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            byteArray[i] = binary.charCodeAt(i) & 0xff;
        }
        return byteArray.buffer;
    }
    static randomToken() {
        return Math.random()
            .toString(36)
            .substr(2);
    }
    static isSecure() {
        return location.protocol === "https:";
    }
}
util.CLOUD_HOST = "0.peerjs.com";
util.CLOUD_PORT = 443;
// Browsers that need chunking:
util.chunkedBrowsers = { Chrome: 1 };
util.chunkedMTU = 16300; // The original 60000 bytes setting does not work when sending data from Firefox to Chrome, which is "cut off" after 16384 bytes and delivered individually.
// Returns browser-agnostic default config
util.defaultConfig = DEFAULT_CONFIG;
// Returns the current browser.
util.browser = (function (global) {
    // @ts-ignore
    if (global.mozRTCPeerConnection) {
        return "Firefox";
    }
    // @ts-ignore
    if (global.webkitRTCPeerConnection) {
        return "Chrome";
    }
    if (global.RTCPeerConnection) {
        return "Supported";
    }
    return "Unsupported";
})(window);
// Lists which features are supported
util.supports = (function () {
    if (typeof RTCPeerConnection === "undefined") {
        return {};
    }
    let data = true;
    let audioVideo = true;
    let binaryBlob = false;
    let sctp = false;
    // @ts-ignore
    const onnegotiationneeded = !!window.webkitRTCPeerConnection;
    let pc, dc;
    try {
        pc = new RTCPeerConnection(DEFAULT_CONFIG, {
            optional: [{ RtpDataChannels: true }]
        });
    }
    catch (e) {
        data = false;
        audioVideo = false;
    }
    if (data) {
        try {
            dc = pc.createDataChannel("_PEERJSTEST");
        }
        catch (e) {
            data = false;
        }
    }
    if (data) {
        // Binary test
        try {
            dc.binaryType = "blob";
            binaryBlob = true;
        }
        catch (e) { }
        // Reliable test.
        // Unfortunately Chrome is a bit unreliable about whether or not they
        // support reliable.
        const reliablePC = new RTCPeerConnection(DEFAULT_CONFIG, {});
        try {
            const reliableDC = reliablePC.createDataChannel("_PEERJSRELIABLETEST", {});
            sctp = reliableDC.ordered;
        }
        catch (e) { }
        reliablePC.close();
    }
    // FIXME: not really the best check...
    if (audioVideo) {
        audioVideo = !!pc.addStream;
    }
    if (pc) {
        pc.close();
    }
    return {
        audioVideo: audioVideo,
        data: data,
        binaryBlob: binaryBlob,
        binary: sctp,
        reliable: sctp,
        sctp: sctp,
        onnegotiationneeded: onnegotiationneeded
    };
})();
util.pack = undefined;
util.unpack = undefined;
// Binary stuff
util._dataCount = 1;

const LOG_PREFIX = 'PeerJS: ';
/*
Prints log messages depending on the debug level passed in. Defaults to 0.
0  Prints no logs.
1  Prints only errors.
2  Prints errors and warnings.
3  Prints all logs.
*/
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["Disabled"] = 0] = "Disabled";
    LogLevel[LogLevel["Errors"] = 1] = "Errors";
    LogLevel[LogLevel["Warnings"] = 2] = "Warnings";
    LogLevel[LogLevel["All"] = 3] = "All";
})(LogLevel || (LogLevel = {}));
class Logger {
    constructor() {
        this._logLevel = LogLevel.Disabled;
    }
    get logLevel() { return this._logLevel; }
    set logLevel(logLevel) { this._logLevel = logLevel; }
    log(...args) {
        if (this._logLevel >= LogLevel.All) {
            this._print(LogLevel.All, ...args);
        }
    }
    warn(...args) {
        if (this._logLevel >= LogLevel.Warnings) {
            this._print(LogLevel.Warnings, ...args);
        }
    }
    error(...args) {
        if (this._logLevel >= LogLevel.Errors) {
            this._print(LogLevel.Errors, ...args);
        }
    }
    setLogFunction(fn) {
        this._print = fn;
    }
    _print(logLevel, ...rest) {
        const copy = [LOG_PREFIX, ...rest];
        for (let i in copy) {
            if (copy[i] instanceof Error) {
                copy[i] = "(" + copy[i].name + ") " + copy[i].message;
            }
        }
        if (logLevel >= LogLevel.All) {
            console.log(...copy);
        }
        else if (logLevel >= LogLevel.Warnings) {
            console.warn("WARNING", ...copy);
        }
        else if (logLevel >= LogLevel.Errors) {
            console.error("ERROR", ...copy);
        }
    }
}
var logger = new Logger();

var ConnectionEventType;
(function (ConnectionEventType) {
    ConnectionEventType["Open"] = "open";
    ConnectionEventType["Stream"] = "stream";
    ConnectionEventType["Data"] = "data";
    ConnectionEventType["Close"] = "close";
    ConnectionEventType["Error"] = "error";
    ConnectionEventType["IceStateChanged"] = "iceStateChanged";
})(ConnectionEventType || (ConnectionEventType = {}));
var ConnectionType;
(function (ConnectionType) {
    ConnectionType["Data"] = "data";
    ConnectionType["Media"] = "media";
})(ConnectionType || (ConnectionType = {}));
var PeerEventType;
(function (PeerEventType) {
    PeerEventType["Open"] = "open";
    PeerEventType["Close"] = "close";
    PeerEventType["Connection"] = "connection";
    PeerEventType["Call"] = "call";
    PeerEventType["Disconnected"] = "disconnected";
    PeerEventType["Error"] = "error";
})(PeerEventType || (PeerEventType = {}));
var PeerErrorType;
(function (PeerErrorType) {
    PeerErrorType["BrowserIncompatible"] = "browser-incompatible";
    PeerErrorType["Disconnected"] = "disconnected";
    PeerErrorType["InvalidID"] = "invalid-id";
    PeerErrorType["InvalidKey"] = "invalid-key";
    PeerErrorType["Network"] = "network";
    PeerErrorType["PeerUnavailable"] = "peer-unavailable";
    PeerErrorType["SslUnavailable"] = "ssl-unavailable";
    PeerErrorType["ServerError"] = "server-error";
    PeerErrorType["SocketError"] = "socket-error";
    PeerErrorType["SocketClosed"] = "socket-closed";
    PeerErrorType["UnavailableID"] = "unavailable-id";
    PeerErrorType["WebRTC"] = "webrtc";
})(PeerErrorType || (PeerErrorType = {}));
var SerializationType;
(function (SerializationType) {
    SerializationType["Binary"] = "binary";
    SerializationType["BinaryUTF8"] = "binary-utf8";
    SerializationType["JSON"] = "json";
})(SerializationType || (SerializationType = {}));
var SocketEventType;
(function (SocketEventType) {
    SocketEventType["Message"] = "message";
    SocketEventType["Disconnected"] = "disconnected";
    SocketEventType["Error"] = "error";
    SocketEventType["Close"] = "close";
})(SocketEventType || (SocketEventType = {}));
var ServerMessageType;
(function (ServerMessageType) {
    ServerMessageType["Heartbeat"] = "HEARTBEAT";
    ServerMessageType["Candidate"] = "CANDIDATE";
    ServerMessageType["Offer"] = "OFFER";
    ServerMessageType["Answer"] = "ANSWER";
    ServerMessageType["Open"] = "OPEN";
    ServerMessageType["Error"] = "ERROR";
    ServerMessageType["IdTaken"] = "ID-TAKEN";
    ServerMessageType["InvalidKey"] = "INVALID-KEY";
    ServerMessageType["Leave"] = "LEAVE";
    ServerMessageType["Expire"] = "EXPIRE"; // The offer sent to a peer has expired without response.
})(ServerMessageType || (ServerMessageType = {}));

/**
 * An abstraction on top of WebSockets to provide fastest
 * possible connection for peers.
 */
class Socket extends eventemitter3 {
    constructor(secure, host, port, path, key) {
        super();
        this.WEB_SOCKET_PING_INTERVAL = 20000; //ms
        this._disconnected = false;
        this._messagesQueue = [];
        const wsProtocol = secure ? "wss://" : "ws://";
        this._wsUrl = wsProtocol + host + ":" + port + path + "peerjs?key=" + key;
    }
    /** Check in with ID or get one from server. */
    start(id, token) {
        this._id = id;
        this._wsUrl += "&id=" + id + "&token=" + token;
        this._startWebSocket();
    }
    /** Start up websocket communications. */
    _startWebSocket() {
        if (this._socket) {
            return;
        }
        this._socket = new WebSocket(this._wsUrl);
        this._socket.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            }
            catch (e) {
                logger.log("Invalid server message", event.data);
                return;
            }
            this.emit(SocketEventType.Message, data);
        };
        this._socket.onclose = (event) => {
            logger.log("Socket closed.", event);
            this._disconnected = true;
            clearTimeout(this._wsPingTimer);
            this.emit(SocketEventType.Disconnected);
        };
        // Take care of the queue of connections if necessary and make sure Peer knows
        // socket is open.
        this._socket.onopen = () => {
            if (this._disconnected)
                return;
            this._sendQueuedMessages();
            logger.log("Socket open");
            this._scheduleHeartbeat();
        };
    }
    _scheduleHeartbeat() {
        this._wsPingTimer = setTimeout(() => { this._sendHeartbeat(); }, this.WEB_SOCKET_PING_INTERVAL);
    }
    _sendHeartbeat() {
        if (!this._wsOpen()) {
            logger.log(`Cannot send heartbeat, because socket closed`);
            return;
        }
        const message = JSON.stringify({ type: ServerMessageType.Heartbeat });
        this._socket.send(message);
        this._scheduleHeartbeat();
    }
    /** Is the websocket currently open? */
    _wsOpen() {
        return !!this._socket && this._socket.readyState == 1;
    }
    /** Send queued messages. */
    _sendQueuedMessages() {
        //Create copy of queue and clear it,
        //because send method push the message back to queue if smth will go wrong
        const copiedQueue = [...this._messagesQueue];
        this._messagesQueue = [];
        for (const message of copiedQueue) {
            this.send(message);
        }
    }
    /** Exposed send for DC & Peer. */
    send(data) {
        if (this._disconnected) {
            return;
        }
        // If we didn't get an ID yet, we can't yet send anything so we should queue
        // up these messages.
        if (!this._id) {
            this._messagesQueue.push(data);
            return;
        }
        if (!data.type) {
            this.emit(SocketEventType.Error, "Invalid message");
            return;
        }
        if (!this._wsOpen()) {
            return;
        }
        const message = JSON.stringify(data);
        this._socket.send(message);
    }
    close() {
        if (!this._disconnected && !!this._socket) {
            this._socket.close();
            this._disconnected = true;
            clearTimeout(this._wsPingTimer);
        }
    }
}

var util$1 = {
  debug: false,
  
  inherits: function(ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  },
  extend: function(dest, source) {
    for(var key in source) {
      if(source.hasOwnProperty(key)) {
        dest[key] = source[key];
      }
    }
    return dest;
  },
  pack: binarypack.pack,
  unpack: binarypack.unpack,
  
  log: function () {
    if (util$1.debug) {
      var copy = [];
      for (var i = 0; i < arguments.length; i++) {
        copy[i] = arguments[i];
      }
      copy.unshift('Reliable: ');
      console.log.apply(console, copy);
    }
  },

  setZeroTimeout: (function(global) {
    var timeouts = [];
    var messageName = 'zero-timeout-message';

    // Like setTimeout, but only takes a function argument.	 There's
    // no time argument (always zero) and no arguments (you have to
    // use a closure).
    function setZeroTimeoutPostMessage(fn) {
      timeouts.push(fn);
      global.postMessage(messageName, '*');
    }		

    function handleMessage(event) {
      if (event.source == global && event.data == messageName) {
        if (event.stopPropagation) {
          event.stopPropagation();
        }
        if (timeouts.length) {
          timeouts.shift()();
        }
      }
    }
    if (global.addEventListener) {
      global.addEventListener('message', handleMessage, true);
    } else if (global.attachEvent) {
      global.attachEvent('onmessage', handleMessage);
    }
    return setZeroTimeoutPostMessage;
  }(commonjsGlobal)),
  
  blobToArrayBuffer: function(blob, cb){
    var fr = new FileReader();
    fr.onload = function(evt) {
      cb(evt.target.result);
    };
    fr.readAsArrayBuffer(blob);
  },
  blobToBinaryString: function(blob, cb){
    var fr = new FileReader();
    fr.onload = function(evt) {
      cb(evt.target.result);
    };
    fr.readAsBinaryString(blob);
  },
  binaryStringToArrayBuffer: function(binary) {
    var byteArray = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      byteArray[i] = binary.charCodeAt(i) & 0xff;
    }
    return byteArray.buffer;
  },
  randomToken: function () {
    return Math.random().toString(36).substr(2);
  }
};

var util_1 = util$1;

/**
 * Reliable transfer for Chrome Canary DataChannel impl.
 * Author: @michellebu
 */
function Reliable(dc, debug) {
  if (!(this instanceof Reliable)) return new Reliable(dc);
  this._dc = dc;

  util_1.debug = debug;

  // Messages sent/received so far.
  // id: { ack: n, chunks: [...] }
  this._outgoing = {};
  // id: { ack: ['ack', id, n], chunks: [...] }
  this._incoming = {};
  this._received = {};

  // Window size.
  this._window = 1000;
  // MTU.
  this._mtu = 500;
  // Interval for setInterval. In ms.
  this._interval = 0;

  // Messages sent.
  this._count = 0;

  // Outgoing message queue.
  this._queue = [];

  this._setupDC();
}
// Send a message reliably.
Reliable.prototype.send = function(msg) {
  // Determine if chunking is necessary.
  var bl = util_1.pack(msg);
  if (bl.size < this._mtu) {
    this._handleSend(['no', bl]);
    return;
  }

  this._outgoing[this._count] = {
    ack: 0,
    chunks: this._chunk(bl)
  };

  if (util_1.debug) {
    this._outgoing[this._count].timer = new Date();
  }

  // Send prelim window.
  this._sendWindowedChunks(this._count);
  this._count += 1;
};

// Set up interval for processing queue.
Reliable.prototype._setupInterval = function() {
  // TODO: fail gracefully.

  var self = this;
  this._timeout = setInterval(function() {
    // FIXME: String stuff makes things terribly async.
    var msg = self._queue.shift();
    if (msg._multiple) {
      for (var i = 0, ii = msg.length; i < ii; i += 1) {
        self._intervalSend(msg[i]);
      }
    } else {
      self._intervalSend(msg);
    }
  }, this._interval);
};

Reliable.prototype._intervalSend = function(msg) {
  var self = this;
  msg = util_1.pack(msg);
  util_1.blobToBinaryString(msg, function(str) {
    self._dc.send(str);
  });
  if (self._queue.length === 0) {
    clearTimeout(self._timeout);
    self._timeout = null;
    //self._processAcks();
  }
};

// Go through ACKs to send missing pieces.
Reliable.prototype._processAcks = function() {
  for (var id in this._outgoing) {
    if (this._outgoing.hasOwnProperty(id)) {
      this._sendWindowedChunks(id);
    }
  }
};

// Handle sending a message.
// FIXME: Don't wait for interval time for all messages...
Reliable.prototype._handleSend = function(msg) {
  var push = true;
  for (var i = 0, ii = this._queue.length; i < ii; i += 1) {
    var item = this._queue[i];
    if (item === msg) {
      push = false;
    } else if (item._multiple && item.indexOf(msg) !== -1) {
      push = false;
    }
  }
  if (push) {
    this._queue.push(msg);
    if (!this._timeout) {
      this._setupInterval();
    }
  }
};

// Set up DataChannel handlers.
Reliable.prototype._setupDC = function() {
  // Handle various message types.
  var self = this;
  this._dc.onmessage = function(e) {
    var msg = e.data;
    var datatype = msg.constructor;
    // FIXME: msg is String until binary is supported.
    // Once that happens, this will have to be smarter.
    if (datatype === String) {
      var ab = util_1.binaryStringToArrayBuffer(msg);
      msg = util_1.unpack(ab);
      self._handleMessage(msg);
    }
  };
};

// Handles an incoming message.
Reliable.prototype._handleMessage = function(msg) {
  var id = msg[1];
  var idata = this._incoming[id];
  var odata = this._outgoing[id];
  var data;
  switch (msg[0]) {
    // No chunking was done.
    case 'no':
      var message = id;
      if (!!message) {
        this.onmessage(util_1.unpack(message));
      }
      break;
    // Reached the end of the message.
    case 'end':
      data = idata;

      // In case end comes first.
      this._received[id] = msg[2];

      if (!data) {
        break;
      }

      this._ack(id);
      break;
    case 'ack':
      data = odata;
      if (!!data) {
        var ack = msg[2];
        // Take the larger ACK, for out of order messages.
        data.ack = Math.max(ack, data.ack);

        // Clean up when all chunks are ACKed.
        if (data.ack >= data.chunks.length) {
          util_1.log('Time: ', new Date() - data.timer);
          delete this._outgoing[id];
        } else {
          this._processAcks();
        }
      }
      // If !data, just ignore.
      break;
    // Received a chunk of data.
    case 'chunk':
      // Create a new entry if none exists.
      data = idata;
      if (!data) {
        var end = this._received[id];
        if (end === true) {
          break;
        }
        data = {
          ack: ['ack', id, 0],
          chunks: []
        };
        this._incoming[id] = data;
      }

      var n = msg[2];
      var chunk = msg[3];
      data.chunks[n] = new Uint8Array(chunk);

      // If we get the chunk we're looking for, ACK for next missing.
      // Otherwise, ACK the same N again.
      if (n === data.ack[2]) {
        this._calculateNextAck(id);
      }
      this._ack(id);
      break;
    default:
      // Shouldn't happen, but would make sense for message to just go
      // through as is.
      this._handleSend(msg);
      break;
  }
};

// Chunks BL into smaller messages.
Reliable.prototype._chunk = function(bl) {
  var chunks = [];
  var size = bl.size;
  var start = 0;
  while (start < size) {
    var end = Math.min(size, start + this._mtu);
    var b = bl.slice(start, end);
    var chunk = {
      payload: b
    };
    chunks.push(chunk);
    start = end;
  }
  util_1.log('Created', chunks.length, 'chunks.');
  return chunks;
};

// Sends ACK N, expecting Nth blob chunk for message ID.
Reliable.prototype._ack = function(id) {
  var ack = this._incoming[id].ack;

  // if ack is the end value, then call _complete.
  if (this._received[id] === ack[2]) {
    this._complete(id);
    this._received[id] = true;
  }

  this._handleSend(ack);
};

// Calculates the next ACK number, given chunks.
Reliable.prototype._calculateNextAck = function(id) {
  var data = this._incoming[id];
  var chunks = data.chunks;
  for (var i = 0, ii = chunks.length; i < ii; i += 1) {
    // This chunk is missing!!! Better ACK for it.
    if (chunks[i] === undefined) {
      data.ack[2] = i;
      return;
    }
  }
  data.ack[2] = chunks.length;
};

// Sends the next window of chunks.
Reliable.prototype._sendWindowedChunks = function(id) {
  util_1.log('sendWindowedChunks for: ', id);
  var data = this._outgoing[id];
  var ch = data.chunks;
  var chunks = [];
  var limit = Math.min(data.ack + this._window, ch.length);
  for (var i = data.ack; i < limit; i += 1) {
    if (!ch[i].sent || i === data.ack) {
      ch[i].sent = true;
      chunks.push(['chunk', id, i, ch[i].payload]);
    }
  }
  if (data.ack + this._window >= ch.length) {
    chunks.push(['end', id, ch.length]);
  }
  chunks._multiple = true;
  this._handleSend(chunks);
};

// Puts together a message from chunks.
Reliable.prototype._complete = function(id) {
  util_1.log('Completed called for', id);
  var self = this;
  var chunks = this._incoming[id].chunks;
  var bl = new Blob(chunks);
  util_1.blobToArrayBuffer(bl, function(ab) {
    self.onmessage(util_1.unpack(ab));
  });
  delete this._incoming[id];
};

// Ups bandwidth limit on SDP. Meant to be called during offer/answer.
Reliable.higherBandwidthSDP = function(sdp) {
  // AS stands for Application-Specific Maximum.
  // Bandwidth number is in kilobits / sec.
  // See RFC for more info: http://www.ietf.org/rfc/rfc2327.txt

  // Chrome 31+ doesn't want us munging the SDP, so we'll let them have their
  // way.
  var version = navigator.appVersion.match(/Chrome\/(.*?) /);
  if (version) {
    version = parseInt(version[1].split('.').shift());
    if (version < 31) {
      var parts = sdp.split('b=AS:30');
      var replace = 'b=AS:102400'; // 100 Mbps
      if (parts.length > 1) {
        return parts[0] + replace + parts[1];
      }
    }
  }

  return sdp;
};

// Overwritten, typically.
Reliable.prototype.onmessage = function(msg) {};

var reliable = Reliable;

var Reliable$1 = /*#__PURE__*/Object.freeze({
	'default': reliable,
	__moduleExports: reliable
});

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Manages all negotiations between Peers.
 */
class Negotiator {
    constructor(connection) {
        this.connection = connection;
    }
    /** Returns a PeerConnection object set up correctly (for data, media). */
    startConnection(options) {
        const peerConnection = this._startPeerConnection();
        // Set the connection's PC.
        this.connection.peerConnection = peerConnection;
        if (this.connection.type === ConnectionType.Media && options._stream) {
            this._addTracksToConnection(options._stream, peerConnection);
        }
        // What do we need to do now?
        if (options.originator) {
            if (this.connection.type === ConnectionType.Data) {
                const dataConnection = this.connection;
                let config = {};
                if (!util.supports.sctp) {
                    config = { reliable: options.reliable };
                }
                const dataChannel = peerConnection.createDataChannel(dataConnection.label, config);
                dataConnection.initialize(dataChannel);
            }
            this._makeOffer();
        }
        else {
            this.handleSDP("OFFER", options.sdp);
        }
    }
    /** Start a PC. */
    _startPeerConnection() {
        logger.log("Creating RTCPeerConnection.");
        let optional = {};
        if (this.connection.type === ConnectionType.Data && !util.supports.sctp) {
            optional = { optional: [{ RtpDataChannels: true }] };
        }
        else if (this.connection.type === ConnectionType.Media) {
            // Interop req for chrome.
            optional = { optional: [{ DtlsSrtpKeyAgreement: true }] };
        }
        const peerConnection = new RTCPeerConnection(this.connection.provider.options.config, optional);
        this._setupListeners(peerConnection);
        return peerConnection;
    }
    /** Set up various WebRTC listeners. */
    _setupListeners(peerConnection) {
        const peerId = this.connection.peer;
        const connectionId = this.connection.connectionId;
        const connectionType = this.connection.type;
        const provider = this.connection.provider;
        // ICE CANDIDATES.
        logger.log("Listening for ICE candidates.");
        peerConnection.onicecandidate = (evt) => {
            if (evt.candidate) {
                logger.log("Received ICE candidates for:", peerId);
                provider.socket.send({
                    type: ServerMessageType.Candidate,
                    payload: {
                        candidate: evt.candidate,
                        type: connectionType,
                        connectionId: connectionId
                    },
                    dst: peerId
                });
            }
        };
        peerConnection.oniceconnectionstatechange = () => {
            switch (peerConnection.iceConnectionState) {
                case "failed":
                    logger.log("iceConnectionState is failed, closing connections to " +
                        peerId);
                    this.connection.emit(ConnectionEventType.Error, new Error("Negotiation of connection to " + peerId + " failed."));
                    this.connection.close();
                    break;
                case "closed":
                    logger.log("iceConnectionState is closed, closing connections to " +
                        peerId);
                    this.connection.emit(ConnectionEventType.Error, new Error("Negotiation of connection to " + peerId + " failed."));
                    this.connection.close();
                    break;
                case "disconnected":
                    logger.log("iceConnectionState is disconnected, closing connections to " +
                        peerId);
                    break;
                case "completed":
                    peerConnection.onicecandidate = util.noop;
                    break;
            }
            this.connection.emit(ConnectionEventType.IceStateChanged, peerConnection.iceConnectionState);
        };
        // DATACONNECTION.
        logger.log("Listening for data channel");
        // Fired between offer and answer, so options should already be saved
        // in the options hash.
        peerConnection.ondatachannel = (evt) => {
            logger.log("Received data channel");
            const dataChannel = evt.channel;
            const connection = (provider.getConnection(peerId, connectionId));
            connection.initialize(dataChannel);
        };
        // MEDIACONNECTION.
        logger.log("Listening for remote stream");
        peerConnection.ontrack = (evt) => {
            logger.log("Received remote stream");
            const stream = evt.streams[0];
            const connection = provider.getConnection(peerId, connectionId);
            if (connection.type === ConnectionType.Media) {
                const mediaConnection = connection;
                this._addStreamToMediaConnection(stream, mediaConnection);
            }
        };
    }
    cleanup() {
        logger.log("Cleaning up PeerConnection to " + this.connection.peer);
        const peerConnection = this.connection.peerConnection;
        if (!peerConnection) {
            return;
        }
        this.connection.peerConnection = null;
        //unsubscribe from all PeerConnection's events
        peerConnection.onicecandidate = peerConnection.oniceconnectionstatechange = peerConnection.ondatachannel = peerConnection.ontrack = () => { };
        const peerConnectionNotClosed = peerConnection.signalingState !== "closed";
        let dataChannelNotClosed = false;
        if (this.connection.type === ConnectionType.Data) {
            const dataConnection = this.connection;
            const dataChannel = dataConnection.dataChannel;
            if (dataChannel) {
                dataChannelNotClosed = !!dataChannel.readyState && dataChannel.readyState !== "closed";
            }
        }
        if (peerConnectionNotClosed || dataChannelNotClosed) {
            peerConnection.close();
        }
    }
    _makeOffer() {
        return __awaiter(this, void 0, void 0, function* () {
            const peerConnection = this.connection.peerConnection;
            const provider = this.connection.provider;
            try {
                const offer = yield peerConnection.createOffer(this.connection.options.constraints);
                logger.log("Created offer.");
                if (!util.supports.sctp && this.connection.type === ConnectionType.Data) {
                    const dataConnection = this.connection;
                    if (dataConnection.reliable) {
                        offer.sdp = undefined(offer.sdp);
                    }
                }
                if (this.connection.options.sdpTransform && typeof this.connection.options.sdpTransform === 'function') {
                    offer.sdp = this.connection.options.sdpTransform(offer.sdp) || offer.sdp;
                }
                try {
                    yield peerConnection.setLocalDescription(offer);
                    logger.log("Set localDescription:", offer, `for:${this.connection.peer}`);
                    let payload = {
                        sdp: offer,
                        type: this.connection.type,
                        connectionId: this.connection.connectionId,
                        metadata: this.connection.metadata,
                        browser: util.browser
                    };
                    if (this.connection.type === ConnectionType.Data) {
                        const dataConnection = this.connection;
                        payload = Object.assign({}, payload, { label: dataConnection.label, reliable: dataConnection.reliable, serialization: dataConnection.serialization });
                    }
                    provider.socket.send({
                        type: ServerMessageType.Offer,
                        payload,
                        dst: this.connection.peer
                    });
                }
                catch (err) {
                    // TODO: investigate why _makeOffer is being called from the answer
                    if (err !=
                        "OperationError: Failed to set local offer sdp: Called in wrong state: kHaveRemoteOffer") {
                        provider.emitError(PeerErrorType.WebRTC, err);
                        logger.log("Failed to setLocalDescription, ", err);
                    }
                }
            }
            catch (err_1) {
                provider.emitError(PeerErrorType.WebRTC, err_1);
                logger.log("Failed to createOffer, ", err_1);
            }
        });
    }
    _makeAnswer() {
        return __awaiter(this, void 0, void 0, function* () {
            const peerConnection = this.connection.peerConnection;
            const provider = this.connection.provider;
            try {
                const answer = yield peerConnection.createAnswer();
                logger.log("Created answer.");
                if (!util.supports.sctp && this.connection.type === ConnectionType.Data) {
                    const dataConnection = this.connection;
                    if (dataConnection.reliable) {
                        answer.sdp = undefined(answer.sdp);
                    }
                }
                if (this.connection.options.sdpTransform && typeof this.connection.options.sdpTransform === 'function') {
                    answer.sdp = this.connection.options.sdpTransform(answer.sdp) || answer.sdp;
                }
                try {
                    yield peerConnection.setLocalDescription(answer);
                    logger.log(`Set localDescription:`, answer, `for:${this.connection.peer}`);
                    provider.socket.send({
                        type: ServerMessageType.Answer,
                        payload: {
                            sdp: answer,
                            type: this.connection.type,
                            connectionId: this.connection.connectionId,
                            browser: util.browser
                        },
                        dst: this.connection.peer
                    });
                }
                catch (err) {
                    provider.emitError(PeerErrorType.WebRTC, err);
                    logger.log("Failed to setLocalDescription, ", err);
                }
            }
            catch (err_1) {
                provider.emitError(PeerErrorType.WebRTC, err_1);
                logger.log("Failed to create answer, ", err_1);
            }
        });
    }
    /** Handle an SDP. */
    handleSDP(type, sdp) {
        return __awaiter(this, void 0, void 0, function* () {
            sdp = new RTCSessionDescription(sdp);
            const peerConnection = this.connection.peerConnection;
            const provider = this.connection.provider;
            logger.log("Setting remote description", sdp);
            const self = this;
            try {
                yield peerConnection.setRemoteDescription(sdp);
                logger.log(`Set remoteDescription:${type} for:${this.connection.peer}`);
                if (type === "OFFER") {
                    yield self._makeAnswer();
                }
            }
            catch (err) {
                provider.emitError(PeerErrorType.WebRTC, err);
                logger.log("Failed to setRemoteDescription, ", err);
            }
        });
    }
    /** Handle a candidate. */
    handleCandidate(ice) {
        return __awaiter(this, void 0, void 0, function* () {
            const candidate = ice.candidate;
            const sdpMLineIndex = ice.sdpMLineIndex;
            const peerConnection = this.connection.peerConnection;
            const provider = this.connection.provider;
            try {
                yield peerConnection.addIceCandidate(new RTCIceCandidate({
                    sdpMLineIndex: sdpMLineIndex,
                    candidate: candidate
                }));
                logger.log(`Added ICE candidate for:${this.connection.peer}`);
            }
            catch (err) {
                provider.emitError(PeerErrorType.WebRTC, err);
                logger.log("Failed to handleCandidate, ", err);
            }
        });
    }
    _addTracksToConnection(stream, peerConnection) {
        logger.log(`add tracks from stream ${stream.id} to peer connection`);
        if (!peerConnection.addTrack) {
            return logger.error(`Your browser does't support RTCPeerConnection#addTrack. Ignored.`);
        }
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });
    }
    _addStreamToMediaConnection(stream, mediaConnection) {
        logger.log(`add stream ${stream.id} to media connection ${mediaConnection.connectionId}`);
        mediaConnection.addStream(stream);
    }
}

class BaseConnection extends eventemitter3 {
    constructor(peer, provider, options) {
        super();
        this.peer = peer;
        this.provider = provider;
        this.options = options;
        this._open = false;
        this.metadata = options.metadata;
    }
    get open() {
        return this._open;
    }
}

/**
 * Wraps the streaming interface between two Peers.
 */
class MediaConnection extends BaseConnection {
    constructor(peerId, provider, options) {
        super(peerId, provider, options);
        this._localStream = this.options._stream;
        this.connectionId =
            this.options.connectionId ||
                MediaConnection.ID_PREFIX + util.randomToken();
        this._negotiator = new Negotiator(this);
        if (this._localStream) {
            this._negotiator.startConnection({
                _stream: this._localStream,
                originator: true
            });
        }
    }
    get type() {
        return ConnectionType.Media;
    }
    get localStream() { return this._localStream; }
    get remoteStream() { return this._remoteStream; }
    addStream(remoteStream) {
        logger.log("Receiving stream", remoteStream);
        this._remoteStream = remoteStream;
        super.emit(ConnectionEventType.Stream, remoteStream); // Should we call this `open`?
    }
    handleMessage(message) {
        const type = message.type;
        const payload = message.payload;
        switch (message.type) {
            case ServerMessageType.Answer:
                // Forward to negotiator
                this._negotiator.handleSDP(type, payload.sdp);
                this._open = true;
                break;
            case ServerMessageType.Candidate:
                this._negotiator.handleCandidate(payload.candidate);
                break;
            default:
                logger.warn(`Unrecognized message type:${type} from peer:${this.peer}`);
                break;
        }
    }
    answer(stream, options = {}) {
        if (this._localStream) {
            logger.warn("Local stream already exists on this MediaConnection. Are you answering a call twice?");
            return;
        }
        this._localStream = stream;
        if (options && options.sdpTransform) {
            this.options.sdpTransform = options.sdpTransform;
        }
        this._negotiator.startConnection(Object.assign({}, this.options._payload, { _stream: stream }));
        // Retrieve lost messages stored because PeerConnection not set up.
        const messages = this.provider._getMessages(this.connectionId);
        for (let message of messages) {
            this.handleMessage(message);
        }
        this._open = true;
    }
    /**
     * Exposed functionality for users.
     */
    /** Allows user to close connection. */
    close() {
        if (this._negotiator) {
            this._negotiator.cleanup();
            this._negotiator = null;
        }
        this._localStream = null;
        this._remoteStream = null;
        if (this.provider) {
            this.provider._removeConnection(this);
            this.provider = null;
        }
        if (this.options && this.options._stream) {
            this.options._stream = null;
        }
        if (!this.open) {
            return;
        }
        this._open = false;
        super.emit(ConnectionEventType.Close);
    }
}
MediaConnection.ID_PREFIX = "mc_";

/**
 * Wraps a DataChannel between two Peers.
 */
class DataConnection extends BaseConnection {
    constructor(peerId, provider, options) {
        super(peerId, provider, options);
        this._buffer = [];
        this._bufferSize = 0;
        this._buffering = false;
        this._chunkedData = {};
        this.connectionId =
            this.options.connectionId || DataConnection.ID_PREFIX + util.randomToken();
        this.label = this.options.label || this.connectionId;
        this.serialization = this.options.serialization || SerializationType.Binary;
        this.reliable = this.options.reliable;
        if (this.options._payload) {
            this._peerBrowser = this.options._payload.browser;
        }
        this._negotiator = new Negotiator(this);
        this._negotiator.startConnection(this.options._payload || {
            originator: true
        });
    }
    get type() {
        return ConnectionType.Data;
    }
    get dataChannel() {
        return this._dc;
    }
    get bufferSize() { return this._bufferSize; }
    /** Called by the Negotiator when the DataChannel is ready. */
    initialize(dc) {
        this._dc = dc;
        this._configureDataChannel();
    }
    _configureDataChannel() {
        if (util.supports.sctp) {
            this.dataChannel.binaryType = "arraybuffer";
        }
        this.dataChannel.onopen = () => {
            logger.log("Data channel connection success");
            this._open = true;
            this.emit(ConnectionEventType.Open);
        };
        // Use the Reliable shim for non Firefox browsers
        if (!util.supports.sctp && this.reliable) {
            const isLoggingEnable = logger.logLevel > LogLevel.Disabled;
            this._reliable = new reliable(this.dataChannel, isLoggingEnable);
        }
        if (this._reliable) {
            this._reliable.onmessage = (msg) => {
                this.emit(ConnectionEventType.Data, msg);
            };
        }
        else {
            this.dataChannel.onmessage = (e) => {
                this._handleDataMessage(e);
            };
        }
        this.dataChannel.onclose = () => {
            logger.log("DataChannel closed for:", this.peer);
            this.close();
        };
    }
    // Handles a DataChannel message.
    _handleDataMessage(e) {
        let data = e.data;
        const datatype = data.constructor;
        const isBinarySerialization = this.serialization === SerializationType.Binary ||
            this.serialization === SerializationType.BinaryUTF8;
        if (isBinarySerialization) {
            if (datatype === Blob) {
                // Datatype should never be blob
                util.blobToArrayBuffer(data, (ab) => {
                    data = util.unpack(ab);
                    this.emit(ConnectionEventType.Data, data);
                });
                return;
            }
            else if (datatype === ArrayBuffer) {
                data = util.unpack(data);
            }
            else if (datatype === String) {
                // String fallback for binary data for browsers that don't support binary yet
                const ab = util.binaryStringToArrayBuffer(data);
                data = util.unpack(ab);
            }
        }
        else if (this.serialization === SerializationType.JSON) {
            data = JSON.parse(data);
        }
        // Check if we've chunked--if so, piece things back together.
        // We're guaranteed that this isn't 0.
        if (data.__peerData) {
            const id = data.__peerData;
            const chunkInfo = this._chunkedData[id] || {
                data: [],
                count: 0,
                total: data.total
            };
            chunkInfo.data[data.n] = data.data;
            chunkInfo.count++;
            if (chunkInfo.total === chunkInfo.count) {
                // Clean up before making the recursive call to `_handleDataMessage`.
                delete this._chunkedData[id];
                // We've received all the chunks--time to construct the complete data.
                data = new Blob(chunkInfo.data);
                this._handleDataMessage({ data: data });
            }
            this._chunkedData[id] = chunkInfo;
            return;
        }
        super.emit(ConnectionEventType.Data, data);
    }
    /**
     * Exposed functionality for users.
     */
    /** Allows user to close connection. */
    close() {
        this._buffer = [];
        this._bufferSize = 0;
        if (this._negotiator) {
            this._negotiator.cleanup();
            this._negotiator = null;
        }
        if (this.provider) {
            this.provider._removeConnection(this);
            this.provider = null;
        }
        if (!this.open) {
            return;
        }
        this._open = false;
        super.emit(ConnectionEventType.Close);
    }
    /** Allows user to send data. */
    send(data, chunked) {
        if (!this.open) {
            super.emit(ConnectionEventType.Error, new Error("Connection is not open. You should listen for the `open` event before sending messages."));
            return;
        }
        if (this._reliable) {
            // Note: reliable shim sending will make it so that you cannot customize
            // serialization.
            this._reliable.send(data);
            return;
        }
        if (this.serialization === SerializationType.JSON) {
            this._bufferedSend(JSON.stringify(data));
        }
        else if (this.serialization === SerializationType.Binary ||
            this.serialization === SerializationType.BinaryUTF8) {
            const blob = util.pack(data);
            // For Chrome-Firefox interoperability, we need to make Firefox "chunk"
            // the data it sends out.
            const needsChunking = util.chunkedBrowsers[this._peerBrowser] ||
                util.chunkedBrowsers[util.browser];
            if (needsChunking && !chunked && blob.size > util.chunkedMTU) {
                this._sendChunks(blob);
                return;
            }
            // DataChannel currently only supports strings.
            if (!util.supports.sctp) {
                util.blobToBinaryString(blob, (str) => {
                    this._bufferedSend(str);
                });
            }
            else if (!util.supports.binaryBlob) {
                // We only do this if we really need to (e.g. blobs are not supported),
                // because this conversion is costly.
                util.blobToArrayBuffer(blob, (ab) => {
                    this._bufferedSend(ab);
                });
            }
            else {
                this._bufferedSend(blob);
            }
        }
        else {
            this._bufferedSend(data);
        }
    }
    _bufferedSend(msg) {
        if (this._buffering || !this._trySend(msg)) {
            this._buffer.push(msg);
            this._bufferSize = this._buffer.length;
        }
    }
    // Returns true if the send succeeds.
    _trySend(msg) {
        if (!this.open) {
            return false;
        }
        try {
            this.dataChannel.send(msg);
        }
        catch (e) {
            this._buffering = true;
            setTimeout(() => {
                // Try again.
                this._buffering = false;
                this._tryBuffer();
            }, 100);
            return false;
        }
        return true;
    }
    // Try to send the first message in the buffer.
    _tryBuffer() {
        if (!this.open) {
            return;
        }
        if (this._buffer.length === 0) {
            return;
        }
        const msg = this._buffer[0];
        if (this._trySend(msg)) {
            this._buffer.shift();
            this._bufferSize = this._buffer.length;
            this._tryBuffer();
        }
    }
    _sendChunks(blob) {
        const blobs = util.chunk(blob);
        for (let blob of blobs) {
            this.send(blob, true);
        }
    }
    handleMessage(message) {
        const payload = message.payload;
        switch (message.type) {
            case ServerMessageType.Answer:
                this._peerBrowser = payload.browser;
                // Forward to negotiator
                this._negotiator.handleSDP(message.type, payload.sdp);
                break;
            case ServerMessageType.Candidate:
                this._negotiator.handleCandidate(payload.candidate);
                break;
            default:
                logger.warn("Unrecognized message type:", message.type, "from peer:", this.peer);
                break;
        }
    }
}
DataConnection.ID_PREFIX = "dc_";

var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class API {
    constructor(_options) {
        this._options = _options;
    }
    _buildUrl(method) {
        const protocol = this._options.secure ? "https://" : "http://";
        let url = protocol +
            this._options.host +
            ":" +
            this._options.port +
            this._options.path +
            this._options.key +
            "/" +
            method;
        const queryString = "?ts=" + new Date().getTime() + "" + Math.random();
        url += queryString;
        return url;
    }
    /** Get a unique ID from the server via XHR and initialize with it. */
    retrieveId() {
        return __awaiter$1(this, void 0, void 0, function* () {
            const url = this._buildUrl("id");
            try {
                const response = yield fetch(url);
                if (response.status !== 200) {
                    throw new Error(`Error. Status:${response.status}`);
                }
                return response.text();
            }
            catch (error) {
                logger.error("Error retrieving ID", error);
                let pathError = "";
                if (this._options.path === "/" &&
                    this._options.host !== util.CLOUD_HOST) {
                    pathError =
                        " If you passed in a `path` to your self-hosted PeerServer, " +
                            "you'll also need to pass in that same path when creating a new " +
                            "Peer.";
                }
                throw new Error("Could not get an ID from the server." + pathError);
            }
        });
    }
    /** @deprecated */
    listAllPeers() {
        return __awaiter$1(this, void 0, void 0, function* () {
            const url = this._buildUrl("peers");
            try {
                const response = yield fetch(url);
                if (response.status !== 200) {
                    if (response.status === 401) {
                        let helpfulError = "";
                        if (this._options.host === util.CLOUD_HOST) {
                            helpfulError =
                                "It looks like you're using the cloud server. You can email " +
                                    "team@peerjs.com to enable peer listing for your API key.";
                        }
                        else {
                            helpfulError =
                                "You need to enable `allow_discovery` on your self-hosted " +
                                    "PeerServer to use this feature.";
                        }
                        throw new Error("It doesn't look like you have permission to list peers IDs. " +
                            helpfulError);
                    }
                    throw new Error(`Error. Status:${response.status}`);
                }
                return response.json();
            }
            catch (error) {
                logger.error("Error retrieving list peers", error);
                throw new Error("Could not get list peers from the server." + error);
            }
        });
    }
}

/**
 * A peer who can initiate connections with other peers.
 */
class Peer extends eventemitter3 {
    constructor(id, options) {
        super();
        // States.
        this._destroyed = false; // Connections have been killed
        this._disconnected = false; // Connection to PeerServer killed but P2P connections still active
        this._open = false; // Sockets and such are not yet open.
        this._connections = new Map(); // All connections for this peer.
        this._lostMessages = new Map(); // src => [list of messages]
        // Deal with overloading
        if (id && id.constructor == Object) {
            options = id;
            id = undefined;
        }
        else if (id) {
            id = id.toString();
        }
        // Configurize options
        options = Object.assign({ debug: 0, host: util.CLOUD_HOST, port: util.CLOUD_PORT, path: "/", key: Peer.DEFAULT_KEY, token: util.randomToken(), config: util.defaultConfig }, options);
        this._options = options;
        // Detect relative URL host.
        if (options.host === "/") {
            options.host = window.location.hostname;
        }
        // Set path correctly.
        if (options.path[0] !== "/") {
            options.path = "/" + options.path;
        }
        if (options.path[options.path.length - 1] !== "/") {
            options.path += "/";
        }
        // Set whether we use SSL to same as current host
        if (options.secure === undefined && options.host !== util.CLOUD_HOST) {
            options.secure = util.isSecure();
        }
        else if (options.host == util.CLOUD_HOST) {
            options.secure = true;
        }
        // Set a custom log function if present
        if (options.logFunction) {
            logger.setLogFunction(options.logFunction);
        }
        logger.logLevel = options.debug;
        // Sanity checks
        // Ensure WebRTC supported
        if (!util.supports.audioVideo && !util.supports.data) {
            this._delayedAbort(PeerErrorType.BrowserIncompatible, "The current browser does not support WebRTC");
            return;
        }
        // Ensure alphanumeric id
        if (!util.validateId(id)) {
            this._delayedAbort(PeerErrorType.InvalidID, `ID "${id}" is invalid`);
            return;
        }
        this._api = new API(options);
        // Start the server connection
        this._initializeServerConnection();
        if (id) {
            this._initialize(id);
        }
        else {
            this._api.retrieveId()
                .then(id => this._initialize(id))
                .catch(error => this._abort(PeerErrorType.ServerError, error));
        }
    }
    get id() {
        return this._id;
    }
    get options() {
        return this._options;
    }
    get open() {
        return this._open;
    }
    get socket() {
        return this._socket;
    }
    /**
     * @deprecated
     * Return type will change from Object to Map<string,[]>
     */
    get connections() {
        const plainConnections = Object.create(null);
        for (let [k, v] of this._connections) {
            plainConnections[k] = v;
        }
        return plainConnections;
    }
    get destroyed() {
        return this._destroyed;
    }
    get disconnected() {
        return this._disconnected;
    }
    // Initialize the 'socket' (which is actually a mix of XHR streaming and
    // websockets.)
    _initializeServerConnection() {
        this._socket = new Socket(this._options.secure, this._options.host, this._options.port, this._options.path, this._options.key);
        this.socket.on(SocketEventType.Message, data => {
            this._handleMessage(data);
        });
        this.socket.on(SocketEventType.Error, error => {
            this._abort(PeerErrorType.SocketError, error);
        });
        this.socket.on(SocketEventType.Disconnected, () => {
            // If we haven't explicitly disconnected, emit error and disconnect.
            if (!this.disconnected) {
                this.emitError(PeerErrorType.Network, "Lost connection to server.");
                this.disconnect();
            }
        });
        this.socket.on(SocketEventType.Close, () => {
            // If we haven't explicitly disconnected, emit error.
            if (!this.disconnected) {
                this._abort(PeerErrorType.SocketClosed, "Underlying socket is already closed.");
            }
        });
    }
    /** Initialize a connection with the server. */
    _initialize(id) {
        this._id = id;
        this.socket.start(this.id, this._options.token);
    }
    /** Handles messages from the server. */
    _handleMessage(message) {
        const type = message.type;
        const payload = message.payload;
        const peerId = message.src;
        switch (type) {
            case ServerMessageType.Open: // The connection to the server is open.
                this.emit(PeerEventType.Open, this.id);
                this._open = true;
                break;
            case ServerMessageType.Error: // Server error.
                this._abort(PeerErrorType.ServerError, payload.msg);
                break;
            case ServerMessageType.IdTaken: // The selected ID is taken.
                this._abort(PeerErrorType.UnavailableID, `ID "${this.id}" is taken`);
                break;
            case ServerMessageType.InvalidKey: // The given API key cannot be found.
                this._abort(PeerErrorType.InvalidKey, `API KEY "${this._options.key}" is invalid`);
                break;
            case ServerMessageType.Leave: // Another peer has closed its connection to this peer.
                logger.log("Received leave message from", peerId);
                this._cleanupPeer(peerId);
                this._connections.delete(peerId);
                break;
            case ServerMessageType.Expire: // The offer sent to a peer has expired without response.
                this.emitError(PeerErrorType.PeerUnavailable, "Could not connect to peer " + peerId);
                break;
            case ServerMessageType.Offer: {
                // we should consider switching this to CALL/CONNECT, but this is the least breaking option.
                const connectionId = payload.connectionId;
                let connection = this.getConnection(peerId, connectionId);
                if (connection) {
                    connection.close();
                    logger.warn("Offer received for existing Connection ID:", connectionId);
                }
                // Create a new connection.
                if (payload.type === ConnectionType.Media) {
                    connection = new MediaConnection(peerId, this, {
                        connectionId: connectionId,
                        _payload: payload,
                        metadata: payload.metadata
                    });
                    this._addConnection(peerId, connection);
                    this.emit(PeerEventType.Call, connection);
                }
                else if (payload.type === ConnectionType.Data) {
                    connection = new DataConnection(peerId, this, {
                        connectionId: connectionId,
                        _payload: payload,
                        metadata: payload.metadata,
                        label: payload.label,
                        serialization: payload.serialization,
                        reliable: payload.reliable
                    });
                    this._addConnection(peerId, connection);
                    this.emit(PeerEventType.Connection, connection);
                }
                else {
                    logger.warn("Received malformed connection type:", payload.type);
                    return;
                }
                // Find messages.
                const messages = this._getMessages(connectionId);
                for (let message of messages) {
                    connection.handleMessage(message);
                }
                break;
            }
            default: {
                if (!payload) {
                    logger.warn(`You received a malformed message from ${peerId} of type ${type}`);
                    return;
                }
                const connectionId = payload.connectionId;
                const connection = this.getConnection(peerId, connectionId);
                if (connection && connection.peerConnection) {
                    // Pass it on.
                    connection.handleMessage(message);
                }
                else if (connectionId) {
                    // Store for possible later use
                    this._storeMessage(connectionId, message);
                }
                else {
                    logger.warn("You received an unrecognized message:", message);
                }
                break;
            }
        }
    }
    /** Stores messages without a set up connection, to be claimed later. */
    _storeMessage(connectionId, message) {
        if (!this._lostMessages.has(connectionId)) {
            this._lostMessages.set(connectionId, []);
        }
        this._lostMessages.get(connectionId).push(message);
    }
    /** Retrieve messages from lost message store */
    //TODO Change it to private
    _getMessages(connectionId) {
        const messages = this._lostMessages.get(connectionId);
        if (messages) {
            this._lostMessages.delete(connectionId);
            return messages;
        }
        return [];
    }
    /**
     * Returns a DataConnection to the specified peer. See documentation for a
     * complete list of options.
     */
    connect(peer, options = {}) {
        if (this.disconnected) {
            logger.warn("You cannot connect to a new Peer because you called " +
                ".disconnect() on this Peer and ended your connection with the " +
                "server. You can create a new Peer to reconnect, or call reconnect " +
                "on this peer if you believe its ID to still be available.");
            this.emitError(PeerErrorType.Disconnected, "Cannot connect to new Peer after disconnecting from server.");
            return;
        }
        const dataConnection = new DataConnection(peer, this, options);
        this._addConnection(peer, dataConnection);
        return dataConnection;
    }
    /**
     * Returns a MediaConnection to the specified peer. See documentation for a
     * complete list of options.
     */
    call(peer, stream, options = {}) {
        if (this.disconnected) {
            logger.warn("You cannot connect to a new Peer because you called " +
                ".disconnect() on this Peer and ended your connection with the " +
                "server. You can create a new Peer to reconnect.");
            this.emitError(PeerErrorType.Disconnected, "Cannot connect to new Peer after disconnecting from server.");
            return;
        }
        if (!stream) {
            logger.error("To call a peer, you must provide a stream from your browser's `getUserMedia`.");
            return;
        }
        options._stream = stream;
        const mediaConnection = new MediaConnection(peer, this, options);
        this._addConnection(peer, mediaConnection);
        return mediaConnection;
    }
    /** Add a data/media connection to this peer. */
    _addConnection(peerId, connection) {
        logger.log(`add connection ${connection.type}:${connection.connectionId}
       to peerId:${peerId}`);
        if (!this._connections.has(peerId)) {
            this._connections.set(peerId, []);
        }
        this._connections.get(peerId).push(connection);
    }
    //TODO should be private
    _removeConnection(connection) {
        const connections = this._connections.get(connection.peer);
        if (connections) {
            const index = connections.indexOf(connection);
            if (index !== -1) {
                connections.splice(index, 1);
            }
        }
        //remove from lost messages
        this._lostMessages.delete(connection.connectionId);
    }
    /** Retrieve a data/media connection for this peer. */
    getConnection(peerId, connectionId) {
        const connections = this._connections.get(peerId);
        if (!connections) {
            return null;
        }
        for (let connection of connections) {
            if (connection.connectionId === connectionId) {
                return connection;
            }
        }
        return null;
    }
    _delayedAbort(type, message) {
        setTimeout(() => {
            this._abort(type, message);
        }, 0);
    }
    /**
     * Destroys the Peer and emits an error message.
     * The Peer is not destroyed if it's in a disconnected state, in which case
     * it retains its disconnected state and its existing connections.
     */
    _abort(type, message) {
        logger.error("Aborting!");
        if (!this._lastServerId) {
            this.destroy();
        }
        else {
            this.disconnect();
        }
        this.emitError(type, message);
    }
    /** Emits a typed error message. */
    emitError(type, err) {
        logger.error("Error:", err);
        if (typeof err === "string") {
            err = new Error(err);
        }
        err.type = type;
        this.emit(PeerEventType.Error, err);
    }
    /**
     * Destroys the Peer: closes all active connections as well as the connection
     *  to the server.
     * Warning: The peer can no longer create or accept connections after being
     *  destroyed.
     */
    destroy() {
        if (!this.destroyed) {
            this._cleanup();
            this.disconnect();
            this._destroyed = true;
        }
    }
    /** Disconnects every connection on this peer. */
    _cleanup() {
        for (let peerId of this._connections.keys()) {
            this._cleanupPeer(peerId);
            this._connections.delete(peerId);
        }
        this.emit(PeerEventType.Close);
    }
    /** Closes all connections to this peer. */
    _cleanupPeer(peerId) {
        const connections = this._connections.get(peerId);
        if (!connections)
            return;
        for (let connection of connections) {
            connection.close();
        }
    }
    /**
     * Disconnects the Peer's connection to the PeerServer. Does not close any
     *  active connections.
     * Warning: The peer can no longer create or accept connections after being
     *  disconnected. It also cannot reconnect to the server.
     */
    disconnect() {
        setTimeout(() => {
            if (!this.disconnected) {
                this._disconnected = true;
                this._open = false;
                if (this.socket) {
                    this.socket.close();
                }
                this.emit(PeerEventType.Disconnected, this.id);
                this._lastServerId = this.id;
                this._id = null;
            }
        }, 0);
    }
    /** Attempts to reconnect with the same ID. */
    reconnect() {
        if (this.disconnected && !this.destroyed) {
            logger.log("Attempting reconnection to server with ID " + this._lastServerId);
            this._disconnected = false;
            this._initializeServerConnection();
            this._initialize(this._lastServerId);
        }
        else if (this.destroyed) {
            throw new Error("This peer cannot reconnect to the server. It has already been destroyed.");
        }
        else if (!this.disconnected && !this.open) {
            // Do nothing. We're still connecting the first time.
            logger.error("In a hurry? We're still trying to make the initial connection!");
        }
        else {
            throw new Error("Peer " +
                this.id +
                " cannot reconnect because it is not disconnected from the server!");
        }
    }
    /**
     * Get a list of available peer IDs. If you're running your own server, you'll
     * want to set allow_discovery: true in the PeerServer options. If you're using
     * the cloud server, email team@peerjs.com to get the functionality enabled for
     * your key.
     */
    listAllPeers(cb = (_) => { }) {
        this._api.listAllPeers()
            .then(peers => cb(peers))
            .catch(error => this._abort(PeerErrorType.ServerError, error));
    }
}
Peer.DEFAULT_KEY = "peerjs";

export { Peer };
