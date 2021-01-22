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
    var splice = function (array, insert, at) {
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

        preinitialize: function () {},

        initialize: function () {},

        parse: function (response, options) {
            return response;
        },

        // Define how to uniquely identify models in the collection.
        modelId: function (attrs) {
            return attrs[this.model.prototype.idAttribute || 'id'];
        },

        // Returns `true` if the model is in the collection.
        has: function (obj) {
            return this.get(obj) != null;
        },

        // Get the model at the given index.
        at: function (index) {
            if (index < 0) {
                index += this.length;
            }
            return this.models[index];
        },

        // Add a model to the end of the collection.
        push: function (model, options) {
            return this.add(model, _.extend({
                at: this.length
            }, options));
        },

        // Remove a model from the end of the collection.
        pop: function (options) {
            var model = this.at(this.length - 1);
            return this.remove(model, options);
        },

        // Add a model, or list of models to the set. `models` may be Backbone
        // Models or raw JavaScript objects to be converted to Models, or any
        // combination of the two.
        add: function (models, options) {
            return this.set(models, _.extend({
                merge: false
            }, options, {
                add: true,
                remove: false
            }));
        },

        // Remove a model, or a list of models from the set.
        remove: function (models, options) {
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
        fetch: function (options, isPost) {
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

            promise = promise.then(function (response) {
                var method = options.set ? 'set' : 'reset';
                collection[method](response.data, options);
                deferred.resolve(collection);
            }, function (error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        // Get a model from the set by id, $modelId, model object with id or $modelId
        // properties, or an attributes object that is transformed through modelId.
        get: function (obj) {
            if (obj == null) {
                return void 0;
            }
            // this._byId[obj]
            return this._byId[obj.id] || this._byId[this.modelId(obj)] || obj.$modelId && this._byId[obj.$modelId];
        },

        set: function (models, options) {
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

        reset: function (models, options) {
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

        create: function (attrs, options) {
            options = options ? _.clone(options) : {};

            var model = this._prepareModel(attrs),
                collection = this,
                wait = options.wait,
                promise;

            if (!wait) {
                collection.add(model, options);
            }

            promise = model.save();

            promise.then(function (response) {
                if (wait) {
                    collection.add(model, options);
                    collection.add(model, options);
                }
                return model;
            }, function (error) {
                //Error
            });
            return promise;
        },

        serialize: function (options) {
            return _.map(this.models, function (model) {
                return model.serialize(options);
            });
        },

        sync: function() {
            return Collection.sync.apply(this, arguments);
        },

        // The JSON representation of a Collection is an array of the
        // models' attributes.
        toJSON: function (options) {
            return angular.toJson(this.serialize(options));
        },
    });

    // Mix in for internal use
    utils.mixIn(Collection.prototype, {
        // Internal method to create a model's ties to a collection.
        _addModelReference: function (model, options) {
            this._byId[model.$modelId] = model;

            var id = this.modelId(model);

            if (id != null) {
                this._byId[id] = model;
            }

        },

        // Internal method to sever a model's ties to a collection.
        _removeModelReference: function (model, options) {
            delete this._byId[model.$modelId];

            var id = this.modelId(model);

            if (id != null) {
                delete this._byId[id];
            }

            if (this === model.$$collection) {
                delete model.$$collection;
            }
        },

        _reset: function () {
            this.length = 0;
            this.models = [];
            this._byId = {};
        },

        // Internal method called by both remove and set.
        _removeModels: function (models, options) {
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

        _prepareModel: function (attrs, options) {
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
        _isModel: function (model) {
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
        var params = {method: type, dataType: 'json'};

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

    Collection.extend = function (protoProps, staticProps) {
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
