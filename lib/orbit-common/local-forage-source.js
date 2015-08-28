import Orbit from 'orbit/main';
import { assert } from 'orbit/lib/assert';
import { extend } from 'orbit/lib/objects';
import MemorySource from './memory-source';


var supportsLocalStorage = function() {
  try {
    return 'localStorage' in window && window['localStorage'] !== null;
  } catch(e) {
    return false;
  }
};

/**
 Source for storing data with local forage (https://github.com/mozilla/localForage)

 @class LocalForageSource
 @extends MemorySource
 @namespace OC
 @param {OC.Schema} schema
 @param {Object}    [options]
 @constructor
 */
var LocalForageSource = MemorySource.extend({
  init: function(schema, options) {
    assert('Your browser does not support local storage!', supportsLocalStorage()); //needed as final fallback
    assert('No valid local forage object given', options['localforage'] !== undefined);
    assert('Local forage requires Orbit.Promise be defined', Orbit.Promise);

    this._super.apply(this, arguments);

    options = options || {};
    this.saveDataCallback = options['saveDataCallback'];
    this.loadDataCallback = options['loadDataCallback'];
    this.namespace = options['namespace'] || 'orbit'; // local storage key
    this._autosave = options['autosave'] !== undefined ? options['autosave'] : true;
    this.webSQLSize = options['webSQLSize'] !== undefined ? options['webSQLSize'] : 4980736;
    var autoload = options['autoload'] !== undefined ? options['autoload'] : true;
    this.localforage = options['localforage'];

    this.localforage.config({
      name        : 'orbitjs',
      version     : 1.0,
      size        : this.webSQLSize,
      storeName   : this.namespace,
      description : 'orbitjs localforage adapter'
    });

    this._isDirty = false;

    this.on('didTransform', function(operation) {
      return this._saveData(operation).then(function() {
        if (options.saveDataCallback) setTimeout(_this.saveDataCallback, 0);
      });
    }, this);

    if (autoload) this.load().then(function() {
      if (options.loadDataCallback) setTimeout(options.callback, 0);
    });
  },

  load: function() {
    var _this = this;
    return _this.localforage.keys().then(function(keys) {
      if (keys.length === 0) {
        _this.reset(_this.retrieve());
      }

      return new Orbit.Promise.all(keys.map(keyToPromise));

      function keyToPromise(key) {
        return _this.localforage.getItem(key).then(saveToCache.bind(_this, key));
      }

      function saveToCache(key, object) {
        var path = key.split('/');
        _this._cache._doc._data[path[1]][path[2]] = object;
      }
    });
  },

  enableAutosave: function() {
    if (!this._autosave) {
      this._autosave = true;
      if (this._isDirty) this._saveData();
    }
  },

  disableAutosave: function() {
    if (this._autosave) {
      this._autosave = false;
    }
  },

  /////////////////////////////////////////////////////////////////////////////
  // Internals
  /////////////////////////////////////////////////////////////////////////////

  _saveData: function(operation) {
    var _this = this; //bind not supported in older browsers
    var key = [this.namespace, operation.path[0], operation.path[1]].join('/');
    var data = this.retrieve([operation.path[0], operation.path[1]]);
    return this.localforage.setItem(key, data).then(function() {
      _this._isDirty = false;
    });
  }
});

export default LocalForageSource;
