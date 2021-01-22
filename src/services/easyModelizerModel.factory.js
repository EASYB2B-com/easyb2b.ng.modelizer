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

    if (options.parse){
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

    preinitialize: function () {},

    initialize: function () {},

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function () {
      return !this.has(this.idAttribute);
    },

    has: function (attr) {
      return this[attr] != null;
    },

    parse: function (response) {
      return response;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this);
    },

    // Set a hash of model attributes on the object, firing `"change"`. This is
    // the core primitive operation of a model, updating the data and notifying
    // anyone who needs to know about the change in state. The heart of the beast.
    set: function (attrs, options) {
      attrs = attrs ? (attrs instanceof Model ? attrs.getAttributes() : _.clone(attrs)) : {};
      options = options || {};

      var model = _.extend(this, attrs);

      if (options.keepOriginal) {
        model._setOriginal();
      }
      return model;
    },

    url: function () {
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

    save: function (options) {
      options = _.clone(_.extend({parse: true}, options));

      var model = this,
          promise,
          url;

      var method = model.isNew() ? 'post' : (options.patch ? 'patch' : 'put');

      var data = method === 'patch' ? model.serialize({changedOnly: true}) : model.serialize();

      url = options.url || _.result(model, 'url');

      // transform data before submitting to backend
      if (model.transformOnSave && _.isFunction(model.transformOnSave)) {
        data = model.transformOnSave(data, options);
      }

      _.extend(options, {url: url, data: data, method: method});

      promise = this.request(options).then(function(response) {
        var serverAttrs = options.parse ? model.parse(response.data, options) : response.data;

        if(!options.parse) {
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
    destroy: function (options) {
      /*if (this.$destroyed) {
        return promiseHelper.setFuture($q.reject(this), this);
      }*/

      options = options ? _.clone(options) : {};
      var model = this;

      var removeFromCollections = function () {
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

      var promise = this.request.delete(url, options).then(function () {
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
    hasChanged: function (field, ignoreAttributes) {
      var model = this,
          diff = model.getChangedAttributes(ignoreAttributes);

      if (!field  && diff !== false) {
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
    getAttributes: function (options) {
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
        if (propDesc && ((propDesc.get && !propDesc.set && !options.includeComputed) ||(propDesc.set && !propDesc.get))) {
          continue;
        }

        attrs[propNames[i]] = model[propNames[i]];
      }

      return attrs;
    },

    // Get only changed attributes
    getChangedAttributes: function (ignoreAttributes) {
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
    serialize: function (options) {
      options = options || {};

      var modelAttrs = options.changedOnly ? this.getChangedAttributes(options) : this.getAttributes(options);

      // Leave basic properties and objects arrays as is
      // and appropriately handle nested models and
      // collections serialization.
      for (var attrName in modelAttrs) {
        if (modelAttrs.hasOwnProperty(attrName)) {
          var attr = modelAttrs[attrName];

          if (attr && (attr instanceof Model /*|| attr instanceof Collection*/) && attr.serialize) {
            modelAttrs[attrName] = attr.serialize(_.extend({}, options, {
              changedOnly: false
            }));
          }
        }
      }

      return modelAttrs;
    },

    toJSON: function (options) {
        return angular.toJson(this.serialize(options));
    },
  });

  // Internal helpers
  utils.mixIn(Model.prototype, {
    // Set the remote state of the object
    _setOriginal: function (attrs, options) {
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
  Model.diff = function (source, target, ignoreAttributes) {
    var diff = {};

    ignoreAttributes = ignoreAttributes || [];

    _.each(source, function (value, key) {

      if (_.has(source, key) && ignoreAttributes.indexOf(key) === -1) {
        if (_.isFunction(value)) {
          return true;
        }

        if (_.isObject(value) && !_.isEqual(value, target[key])) {
          if (!_.isDate(value)) {
            var local = Model.diff(value, target[key], ignoreAttributes);
            if(!_.isEmpty(local)) {
              diff[key] = local;
            }
          } else {
            var d1 = new Date(value),
                d2 = new Date(target[key]);
            if(!_.isEqual(d1, d2)) {
              diff[key] = value;
            }
          }
        }

        if (value && !_.isObject(value) && !_.isEqual(value, target[key])) {
          return (diff[key] = value);
        }

        // both are falsy, than there are no changes
        if(_.isEmpty(value) && !_.isEmpty(target[key])) {
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

  Model.extend = function (protoProps, staticProps) {
    protoProps.name = protoProps.name || 'Model';
    return utils.extend.call(this, protoProps, staticProps);
  };


  return Model;
}
