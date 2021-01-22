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
      case 1: return function() {
        return _[method](this[attribute]);
      };
      case 2: return function(value) {
        return _[method](this[attribute], value);
      };
      case 3: return function(iteratee, context) {
        return _[method](this[attribute], _cb(iteratee, this), context);
      };
      case 4: return function(iteratee, defaultVal, context) {
        return _[method](this[attribute], _cb(iteratee, this), defaultVal, context);
      };
      default: return function() {
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
