/**
 * easyb2b-ng-modelizer
 * @link 
 * @version v0.1.8
 * @license MIT
 */
;
(function() {
  "use strict";

  /**
   * @ngdoc module
   * @name easy-modelizer
   * @description
   *
   * The `blocks.resource` module provides a restful functionality for fethcing data from rest endpoints
   */

  angular
    .module('easy.modelizer', ['easy.modelizer.collection', 'easy.modelizer.model', 'easy.modelizer.utils']);

  angular
    .module('easy.modelizer.collection', ['easy.modelizer.model', 'easy.modelizer.utils', 'easy.modelizer.request'])
    .service('easyModelizerCollection', ['easyModelizerModel', 'easyModelizerUtils', 'requestHelper', easyModelizerCollection]);

  function easyModelizerCollection(Model, utils, Request) {
    function Collection(models, options) {
      /*options || (options = {});
      this.preinitialize.apply(this, arguments);
      if (options.model) {
        this.model = options.model;
      }*/
      this._reset();
      /*
      this.initialize.apply(this, arguments);
      if (models) {
        this.reset(models, _.extend({silent: true}, options));
      }*/
    }

    // Splices `insert` into `array` at index `at`.
    var splice = function(array, insert, at) {
      at = Math.min(Math.max(at, 0), array.length);
      var tail = Array(array.length - at);
      var length = insert.length;
      var i;
      for (i = 0; i < tail.length; i++) {
        tail[i] = array[i + at];
      }
      for (i = 0; i < length; i++) {
        array[i + at] = insert[i];
      }
      for (i = 0; i < tail.length; i++) {
        array[i + length + at] = tail[i];
      }
    };

    // Mix in
    utils.mixIn(Collection.prototype, {
      model: Model,

      idAttribute: 'id',

      preinitialize: function() {},

      initialize: function() {},

      parse: function(response, options) {
        return response;
      },

      // Define how to uniquely identify models in the collection.
      modelId: function(attrs) {
        return attrs[this.model.prototype.idAttribute || 'id'];
      },

      // Returns `true` if the model is in the collection.
      has: function(obj) {
        return this.get(obj) != null;
      },

      // Get the model at the given index.
      at: function(index) {
        if (index < 0) {
          index += this.length;
        }
        return this.models[index];
      },

      // Add a model to the end of the collection.
      push: function(model, options) {
        return this.add(model, _.extend({
          at: this.length
        }, options));
      },

      // Remove a model from the end of the collection.
      pop: function(options) {
        var model = this.at(this.length - 1);
        return this.remove(model, options);
      },

      // Add a model, or list of models to the set. `models` may be Backbone
      // Models or raw JavaScript objects to be converted to Models, or any
      // combination of the two.
      add: function(models, options) {
        return this.set(models, _.extend({
          merge: false
        }, options, {
          add: true,
          remove: false
        }));
      },

      // Remove a model, or a list of models from the set.
      remove: function(models, options) {
        options = _.extend({}, options);
        var singular = !_.isArray(models);
        models = singular ? [models] : models.slice();
        var removed = this._removeModels(models, options);
        /*if (!options.silent && removed.length) {
          options.changes = {added: [], merged: [], removed: removed};
          this.trigger('update', this, options);
        }*/
        return singular ? removed[0] : removed;
      },

      // Fetch from server
      fetch: function(options, isPost) {
        var deferred = Request.$q.defer();

        options = _.extend({
          parse: true
        }, options);

        var collection = this;

        var url = options.url || _.result(collection, 'url') || utils.urlError();

        var promise;

        if (!isPost) {
          promise = this.request.get(url, options);
        } else {
          // fetch by post
          promise = this.request.post(url, options.data, options);
        }

        promise = promise.then(function(response) {
          var method = options.set ? 'set' : 'reset';
          collection[method](response.data, options);
          deferred.resolve(collection);
        }, function(error) {
          deferred.reject(error);
        });

        return deferred.promise;
      },

      // Get a model from the set by id, $modelId, model object with id or $modelId
      // properties, or an attributes object that is transformed through modelId.
      get: function(obj) {
        if (obj == null) {
          return void 0;
        }
        // this._byId[obj]
        return this._byId[obj.id] || this._byId[this.modelId(obj)] || obj.$modelId && this._byId[obj.$modelId];
      },

      set: function(models, options) {
        if (models == null) {
          return;
        }

        options = _.extend({}, {
          add: true,
          remove: true,
          merge: true
        }, options);

        if (options.parse && !this._isModel(models)) {
          models = this.parse(models, options) || [];
        }

        var singular = !_.isArray(models);
        models = singular ? [models] : models.slice();
        var at = options.at,
          toAdd = [],
          toRemove = [],
          modelMap = {};

        var add = options.add;
        var merge = options.merge;
        var remove = options.remove;

        // Turn bare objects into model references, and prevent invalid models
        // from being added.
        var model, i;

        for (i = 0; i < models.length; i++) {
          model = models[i];

          // If a duplicate is found, prevent it from being added and
          // optionally merge it into the existing model.
          var existing = this.get(model);
          if (existing) {
            if (merge && model !== existing) {
              var attrs = this._isModel(model) ? model.getAttributes() : model;
              if (options.parse) {
                attrs = existing.parse(attrs, options);
              }
              existing.set(attrs, options);
            }
            if (!modelMap[existing.$modelId]) {
              modelMap[existing.$modelId] = true;
            }
            models[i] = existing;

            // If this is a new, valid model, push it to the `toAdd` list.
          } else if (add) {
            model = models[i] = this._prepareModel(model, options);

            if (model) {
              toAdd.push(model);
              this._addModelReference(model, options);
              modelMap[model.$modelId] = true;
            }
          }
        }

        // Remove stale models.
        if (remove) {
          for (i = 0; i < this.length; i++) {
            model = this.models[i];
            if (!modelMap[model.$modelId]) {
              toRemove.push(model);
            }
          }

          if (toRemove.length) {
            this._removeModels(toRemove, options);
          }
        }

        // update `length` and splice in new models.
        if (toAdd.length) {
          splice(this.models, toAdd, at == null ? this.length : at);
          this.length = this.models.length;
        }

        // Return the added (or merged) model (or models).
        return singular ? models[0] : models;
      },

      reset: function(models, options) {
        options = options ? _.clone(options) : {};

        for (var i = 0; i < this.models.length; i++) {
          this._removeModelReference(this.models[i], options);
        }

        this._reset();

        models = this.add(models, _.extend({
          silent: true
        }, options));

        return models;
      },

      create: function(attrs, options) {
        options = options ? _.clone(options) : {};

        var model = this._prepareModel(attrs),
          collection = this,
          wait = options.wait,
          promise;

        if (!wait) {
          collection.add(model, options);
        }

        promise = model.save();

        promise.then(function(response) {
          if (wait) {
            collection.add(model, options);
            collection.add(model, options);
          }
          return model;
        }, function(error) {
          //Error
        });
        return promise;
      },

      serialize: function(options) {
        return _.map(this.models, function(model) {
          return model.serialize(options);
        });
      },

      sync: function() {
        return Collection.sync.apply(this, arguments);
      },

      // The JSON representation of a Collection is an array of the
      // models' attributes.
      toJSON: function(options) {
        return angular.toJson(this.serialize(options));
      },
    });

    // Mix in for internal use
    utils.mixIn(Collection.prototype, {
      // Internal method to create a model's ties to a collection.
      _addModelReference: function(model, options) {
        this._byId[model.$modelId] = model;

        var id = this.modelId(model);

        if (id != null) {
          this._byId[id] = model;
        }

      },

      // Internal method to sever a model's ties to a collection.
      _removeModelReference: function(model, options) {
        delete this._byId[model.$modelId];

        var id = this.modelId(model);

        if (id != null) {
          delete this._byId[id];
        }

        if (this === model.$$collection) {
          delete model.$$collection;
        }
      },

      _reset: function() {
        this.length = 0;
        this.models = [];
        this._byId = {};
      },

      // Internal method called by both remove and set.
      _removeModels: function(models, options) {
        var removed = [];
        for (var i = 0; i < models.length; i++) {
          var model = this.get(models[i]);
          if (!model) {
            continue;
          }

          var index = this.indexOf(model);
          this.models.splice(index, 1);
          this.length--;

          // Remove references before triggering 'remove' event to prevent an
          // infinite loop. #3693
          delete this._byId[model.$modelId];
          var id = this.modelId(model);
          if (id != null) {
            delete this._byId[id];
          }
          removed.push(model);
          this._removeModelReference(model, options);
        }
        return removed;
      },

      _prepareModel: function(attrs, options) {
        if (this._isModel(attrs)) {
          if (!attrs.$$collection) {
            attrs.$$collection = this;
          }
          return attrs;
        }
        options = options ? _.clone(options) : {};

        options.$$collection = this;

        var model = new this.model(attrs, options);

        return model;
      },

      // Method for checking whether an object should be considered a model for
      // the purposes of adding to the collection.
      _isModel: function(model) {
        return model instanceof Model;
      },
    });

    Collection.sync = function(method, model, options) {
      var type = methodMap[method];

      // Default options, unless specified.
      /*_.defaults(options || (options = {}), {
          emulateHTTP: Backbone.emulateHTTP,
          emulateJSON: Backbone.emulateJSON
      });*/

      // Default JSON-request options.
      var params = {
        method: type,
        dataType: 'json'
      };

      // Ensure that we have a URL.
      if (!options.url) {
        params.url = _.result(model, 'url') || urlError();
      }

      // Ensure that we have the appropriate request data.
      if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
        params.contentType = 'application/json';
        params.data = JSON.stringify(options.attrs || model.toJSON(options));
      }

      // Don't process data on a non-GET request.
      if (params.type !== 'GET' && !options.emulateJSON) {
        params.processData = false;
      }

      // Pass along `textStatus` and `errorThrown` from jQuery.
      var error = options.error;
      options.error = function(xhr, textStatus, errorThrown) {
        options.textStatus = textStatus;
        options.errorThrown = errorThrown;
        if (error) error.call(options.context, xhr, textStatus, errorThrown);
      };

      // Make the request, allowing the user to override any Ajax options.
      var promise = options.xhr = this.request(_.extend(params, options));
      return promise;
    };

    // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
    var methodMap = {
      'create': 'POST',
      'update': 'PUT',
      'patch': 'PATCH',
      'delete': 'DELETE',
      'read': 'GET'
    };

    // Underscore methods that we want to implement on the Collection.
    // 90% of the core usefulness of Backbone Collections is actually implemented
    // right here:
    var collectionMethods = {
      forEach: 3,
      each: 3,
      map: 3,
      collect: 3,
      reduce: 0,
      foldl: 0,
      inject: 0,
      reduceRight: 0,
      foldr: 0,
      find: 3,
      detect: 3,
      filter: 3,
      select: 3,
      reject: 3,
      every: 3,
      all: 3,
      some: 3,
      any: 3,
      include: 3,
      includes: 3,
      contains: 3,
      invoke: 0,
      max: 3,
      min: 3,
      toArray: 1,
      size: 1,
      first: 3,
      head: 3,
      take: 3,
      initial: 3,
      rest: 3,
      tail: 3,
      drop: 3,
      last: 3,
      without: 0,
      difference: 0,
      indexOf: 3,
      shuffle: 1,
      lastIndexOf: 3,
      isEmpty: 1,
      chain: 1,
      sample: 3,
      partition: 3,
      groupBy: 3,
      countBy: 3,
      sortBy: 3,
      indexBy: 3,
      findIndex: 3,
      findLastIndex: 3
    };

    // Mix in each Underscore method as a proxy to `Collection#models`.
    utils.addUnderscoreMethods(Collection, collectionMethods, 'models');

    Collection.extend = function(protoProps, staticProps) {
      var modelName = '';
      if (_.has(protoProps, 'model')) {
        modelName = utils.fnName(protoProps.model);
        if (!_.has(protoProps, 'url')) {
          protoProps.url = protoProps.model.prototype.urlRoot;
        }
      }
      protoProps.name = modelName + 'Collection';
      return utils.extend.call(this, protoProps, staticProps);
    };

    Collection.request = Collection.prototype.request = Request;

    return Collection;
  }

  angular
    .module('easy.modelizer.model', ['easy.modelizer.utils', 'easy.modelizer.request'])
    .service('easyModelizerModel', ['$injector', 'easyModelizerUtils', 'requestHelper', easyModelizerModel]);

  function easyModelizerModel($injector, utils, Request) {
    var _reservedProperties = [
      '$$hashKey',
      '$id',
      '$modelId',
      '$original',
      '$selected',
      '$destroyed',
      '$$collection',
      'idAttribute',
      'metadata',
      'urlRoot',
      '__super__'
    ];

    function Model(attributes, options) {
      var attrs = attributes || {};
      options = options || {};

      this.preinitialize.apply(this, arguments);

      this.$modelId = _.uniqueId(this.uidPrefix);

      // preserves original state of the model
      this.$original = null;

      if (options.$$collection) {
        this.$$collection = options.$$collection;
      }

      if (options.parse) {
        attrs = this.parse(attrs, options) || {};
      }

      var defaults = _.result(this, 'defaults');
      attrs = _.defaults(_.extend({}, defaults, attrs), defaults);

      this.set(attrs, options);

      this.initialize.apply(this, arguments);

      // Keep original state intact on initialization if options say to do so
      if (options.keepOriginal) {
        this._setOriginal();
      }
    }

    // Mix in
    utils.mixIn(Model.prototype, {
      idAttribute: 'id',

      uidPrefix: 'model_',

      preinitialize: function() {},

      initialize: function() {},

      // A model is new if it has never been saved to the server, and lacks an id.
      isNew: function() {
        return !this.has(this.idAttribute);
      },

      has: function(attr) {
        return this[attr] != null;
      },

      parse: function(response) {
        return response;
      },

      // Create a new model with identical attributes to this one.
      clone: function() {
        return new this.constructor(this);
      },

      // Set a hash of model attributes on the object, firing `"change"`. This is
      // the core primitive operation of a model, updating the data and notifying
      // anyone who needs to know about the change in state. The heart of the beast.
      set: function(attrs, options) {
        attrs = attrs ? (attrs instanceof Model ? attrs.getAttributes() : _.clone(attrs)) : {};
        options = options || {};

        var model = _.extend(this, attrs);

        if (options.keepOriginal) {
          model._setOriginal();
        }
        return model;
      },

      url: function() {
        var base =
          _.result(this, 'urlRoot') ||
          _.result(this.$$collection, 'url') ||
          utils.urlError();

        if (this.isNew()) {
          return base;
        }

        var id = this[this.idAttribute];
        return base.replace(/[^\/]$/, '$&/') + encodeURIComponent(id);
      },

      fetch: function(options, isPost) {
        options = _.extend({
          parse: true
        }, options);

        var model = this,
          url = options.url || _.result(this, 'url') || utils.urlError(),
          promise;

        if (!isPost) {
          promise = this.request.get(url, options);
        } else {
          // fetch by post
          promise = this.request.post(url, options.data, options);
        }

        promise = promise.then(function(response) {
          var attrs = options.parse ? model.parse(response.data, options) : response;
          model.set(attrs, options);
          return model;
        }, function(error) {
          // Error
          return model.request.$q.reject(error);
        });

        return promise;
      },

      save: function(options) {
        options = _.clone(_.extend({
          parse: true
        }, options));

        var model = this,
          promise,
          url;

        var method = model.isNew() ? 'post' : (options.patch ? 'patch' : 'put');

        var data = method === 'patch' ? model.serialize({
          changedOnly: true
        }) : model.serialize();

        url = options.url || _.result(model, 'url');

        // transform data before submitting to backend
        if (model.transformOnSave && _.isFunction(model.transformOnSave)) {
          data = model.transformOnSave(data, options);
        }

        _.extend(options, {
          url: url,
          data: data,
          method: method
        });

        promise = this.request(options).then(function(response) {
          var serverAttrs = options.parse ? model.parse(response.data, options) : response.data;

          if (!options.parse) {
            return serverAttrs;
          }

          // Update model with server attrs
          model.set(serverAttrs, options);

          return model;
        }, function(error) {
          // Error
          return model.request.$q.reject(error);
        });

        return promise;
      },

      // Destroy this model on the server if it was ever persisted.
      // Optimistically removes the model from its collections, if there are any.
      // Provide `wait: true` as option to make it wait for server to
      // respond with success before removing from referenced collections.
      // Provide `keepInCollections: true` to prevent deleting model from
      // collections (might be useful for "undo" scenarios)
      destroy: function(options) {
        /*if (this.$destroyed) {
          return promiseHelper.setFuture($q.reject(this), this);
        }*/

        options = options ? _.clone(options) : {};
        var model = this;

        var removeFromCollections = function() {
          if (model.$$collection) {
            model.$$collection.remove(model);
            delete model.$$collection;
          }

          model.$$collection = null;
        };


        if (this.isNew()) {
          if (!options.keepInCollections) {
            removeFromCollections();
          }
          return $q.when(false);
        }

        if (!options.wait && !options.keepInCollections) {
          removeFromCollections();
        }

        var url = options.url || _.result(model, 'url');

        var promise = this.request.delete(url, options).then(function() {
          if (options.wait && !options.keepInCollections) {
            removeFromCollections();
          }
          model.$destroyed = true;

          return model;
        }, function(error) {
          // Error
          return model.request.$q.reject(error);
        });

        return promise;
      },

      /**
       * This method check if the model data has changed.
       * Is also possible to check a specific field for changes as well
       *
       * @return Boolean   true/false
       */
      hasChanged: function(field, ignoreAttributes) {
        var model = this,
          diff = model.getChangedAttributes(ignoreAttributes);

        if (!field && diff !== false) {
          return Object.keys(diff).length > 0;
        } else if (diff[field]) {
          return !!diff[field];
        } else {
          return false;
        }
      },

      /**
       * Get a flattened object containing all the actual attributes values (including getters and computed properties).
       * Useful for JSON serialization. Provide `includeComputed: true` to also include computed properties
       * (either explicitly defined as "computed" or those having getters only) into resulting object.
       */
      getAttributes: function(options) {
        options = options || {};

        var model = this,
          attrs = {};
        // Dropping some system properties that might present on instance
        var propNames = _.difference(Object.getOwnPropertyNames(model), _reservedProperties);

        for (var i = 0; i < propNames.length; i++) {
          var propDesc = Object.getOwnPropertyDescriptor(model, propNames[i]);

          // Properties that cannot be set are considered "computed"
          // and there is special options param to handle this
          // and if that is falsy - skip the property.
          // Setter-only properties are not included in any case.
          if (propDesc && ((propDesc.get && !propDesc.set && !options.includeComputed) || (propDesc.set && !propDesc.get))) {
            continue;
          }

          attrs[propNames[i]] = model[propNames[i]];
        }

        return attrs;
      },

      // Get only changed attributes
      getChangedAttributes: function(ignoreAttributes) {
        var attrs = {};
        if (this.$original) {
          var diff = Model.diff(this.getAttributes(), this.$original, ignoreAttributes);
          for (var attr in diff) {
            if (diff.hasOwnProperty(attr)) {
              attrs[attr] = diff[attr];
            }
          }
        }
        return attrs;
      },


      /**
       * Helper method to "serialize" a model. Serialization in this case results in the object that is ready to get
       * "stringified" to JSON directly. It does so by flattening of all properties, including nested models and collections.
       * Note: This method doesn't transform model to JSON, use `toJSON` method for that purpose.
       */
      serialize: function(options) {
        options = options || {};

        var modelAttrs = options.changedOnly ? this.getChangedAttributes(options) : this.getAttributes(options);

        // Leave basic properties and objects arrays as is
        // and appropriately handle nested models and
        // collections serialization.
        for (var attrName in modelAttrs) {
          if (modelAttrs.hasOwnProperty(attrName)) {
            var attr = modelAttrs[attrName];

            if (attr && (attr instanceof Model /*|| attr instanceof Collection*/ ) && attr.serialize) {
              modelAttrs[attrName] = attr.serialize(_.extend({}, options, {
                changedOnly: false
              }));
            }
          }
        }

        return modelAttrs;
      },

      toJSON: function(options) {
        return angular.toJson(this.serialize(options));
      },
    });

    // Internal helpers
    utils.mixIn(Model.prototype, {
      // Set the remote state of the object
      _setOriginal: function(attrs, options) {
        /*if (!attrs && attrs !== false) {
          attrs = this.serialize(options);
        }*/

        // Omit reserved property from cloned object
        //this.$original = _.cloneDeep(this.getAttributes()
        this.$original = angular.copy(this.getAttributes());
      },
    });

    // Difference between model when it was loaded from server and current state
    // of the model. This method is just for internal use.
    Model.diff = function(source, target, ignoreAttributes) {
      var diff = {};

      ignoreAttributes = ignoreAttributes || [];

      _.each(source, function(value, key) {

        if (_.has(source, key) && ignoreAttributes.indexOf(key) === -1) {
          if (_.isFunction(value)) {
            return true;
          }

          if (_.isObject(value) && !_.isEqual(value, target[key])) {
            if (!_.isDate(value)) {
              var local = Model.diff(value, target[key], ignoreAttributes);
              if (!_.isEmpty(local)) {
                diff[key] = local;
              }
            } else {
              var d1 = new Date(value),
                d2 = new Date(target[key]);
              if (!_.isEqual(d1, d2)) {
                diff[key] = value;
              }
            }
          }

          if (value && !_.isObject(value) && !_.isEqual(value, target[key])) {
            return (diff[key] = value);
          }

          // both are falsy, than there are no changes
          if (_.isEmpty(value) && !_.isEmpty(target[key])) {
            return (diff[key] = value);
          }
        } else {
          return true;
        }
      });
      return diff;
    };

    // Request handler
    Model.request = Model.prototype.request = Request;

    Model.extend = function(protoProps, staticProps) {
      protoProps.name = protoProps.name || 'Model';
      return utils.extend.call(this, protoProps, staticProps);
    };


    return Model;
  }

  angular
    .module('easy.modelizer.utils', [])
    .factory('easyModelizerUtils', [easyModelizerUtils]);

  function easyModelizerUtils() {
    function extend(protoProps, staticProps) {
      var parent = this,
        className = protoProps.name,
        child;

      // The constructor function for the new subclass is either defined by you
      // (the "constructor" property in your `extend` definition), or defaulted
      // by us to simply call the parent constructor.
      if (protoProps && _.has(protoProps, 'constructor')) {
        child = protoProps.constructor;
      } else {
        //child =  function() { return parent.apply(this, arguments); };
        /*jshint -W054 */
        child = new Function('p', 'return function ' + className + '() { return p.apply(this, arguments); }')(parent);
      }

      // Add static properties to the constructor function, if supplied.
      _.extend(child, parent, staticProps);

      // Set the prototype chain to inherit from `parent`, without calling
      // `parent`'s constructor function and add the prototype properties.
      child.prototype = _.create(parent.prototype, protoProps);
      child.prototype.__super__ = parent;
      child.prototype.constructor = child;

      // Set a convenience property in case the parent's prototype is needed
      // later.
      child.__super__ = parent.prototype;

      return child;
    }

    function mixIn(modelClass, methods) {
      return _.extend(modelClass, methods);
    }

    function urlError() {
      throw new Error('A "url" property or function must be specified');
    }

    function fnName(fun) {
      var ret = fun.toString();
      ret = ret.substr('function '.length);
      ret = ret.substr(0, ret.indexOf('('));
      return ret ? ret.trim() : ret;
    }

    // Proxy Backbone class methods to Underscore functions, wrapping the model's
    // `attributes` object or collection's `models` array behind the scenes.
    //
    // collection.filter(function(model) { return model.get('age') > 10 });
    // collection.each(this.addView);
    //
    // `Function#apply` can be slow so we use the method's arg count, if we know it.
    var _addMethod = function(length, method, attribute) {
      switch (length) {
        case 1:
          return function() {
            return _[method](this[attribute]);
          };
        case 2:
          return function(value) {
            return _[method](this[attribute], value);
          };
        case 3:
          return function(iteratee, context) {
            return _[method](this[attribute], _cb(iteratee, this), context);
          };
        case 4:
          return function(iteratee, defaultVal, context) {
            return _[method](this[attribute], _cb(iteratee, this), defaultVal, context);
          };
        default:
          return function() {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(this[attribute]);
            return _[method].apply(_, args);
          };
      }
    };

    var addUnderscoreMethods = function(Class, methods, attribute) {
      _.each(methods, function(length, method) {
        if (_[method]) {
          Class.prototype[method] = _addMethod(length, method, attribute);
        }
      });
    };

    // Support `collection.sortBy('attr')` and `collection.findWhere({id: 1})`.
    function _cb(iteratee, instance) {
      if (_.isFunction(iteratee)) {
        return iteratee;
      }

      if (_.isObject(iteratee) && !instance._isModel(iteratee)) {
        return _modelMatcher(iteratee);
      }

      if (_.isString(iteratee)) {
        return function(model) {
          return model.get(iteratee);
        };
      }
      return iteratee;
    }

    function _modelMatcher(attrs) {
      var matcher = _.matches(attrs);
      return function(model) {
        return matcher(model.attributes);
      };
    }

    // revealing pattern
    return {
      mixIn: mixIn,
      extend: extend,
      fnName: fnName,
      urlError: urlError,
      addUnderscoreMethods: addUnderscoreMethods
    };
  }

  angular
    .module('easy.modelizer.request', [])
    .factory('requestHelper', ['$http', '$q', requestHelper]);

  function requestHelper($http, $q) {

    function ajax(options) {
      var deferred = $q.defer();

      $http(_.extend({
        responseType: 'json'
      }, options)).then(function(response) {
        deferred.resolve(response);
      }, function(error) {
        deferred.reject(error);
      });

      return deferred.promise;
    }

    function Request(options) {
      var method = options.method || '',
        url = options.url,
        data = options.data || undefined;

      return ajax(_.extend({}, options, {
        method: method.toUpperCase(),
        url: url,
        data: data
      }));
    }

    _.extend(Request, {
      $q: $q,
      get: function(url, options) {
        return ajax(_.extend({}, options, {
          url: url,
          method: 'GET'
        }));
      },
      post: function(url, data, options) {
        return ajax(_.extend({}, options, {
          url: url,
          method: 'POST',
          data: data
        }));
      },
      put: function(url, data, options) {
        return ajax(_.extend({}, options, {
          url: url,
          method: 'PUT',
          data: data
        }));
      },
      patch: function(url, data, options) {
        return ajax(_.extend({}, options, {
          url: url,
          method: 'PATCH',
          data: data
        }));
      },
      delete: function(url, options) {
        return ajax(_.extend({}, options, {
          url: url,
          method: 'DELETE'
        }));
      }
    });

    return Request;
  }
}());