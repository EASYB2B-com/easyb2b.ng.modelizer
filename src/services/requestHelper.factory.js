angular
  .module('easy.modelizer.request', [])
  .factory('requestHelper', ['$http', '$q', requestHelper]);

function requestHelper($http, $q) {

  function ajax(options) {
    var deferred = $q.defer();

    $http(_.extend({
      responseType: 'json'
    }, options)).then(function (response) {
      deferred.resolve(response);
    }, function (error) {
      deferred.reject(error);
    });

    return deferred.promise;
  }

  function Request(options) {
    var method = options.method || '',
        url = options.url,
        data = options.data || undefined;

    return ajax(_.extend({}, options, {method: method.toUpperCase(), url: url, data: data}));
  }

  _.extend(Request, {
    $q: $q,
    get: function (url, options) {
      return ajax(_.extend({}, options, {
        url: url,
        method: 'GET'
      }));
    },
    post: function (url, data, options) {
      return ajax(_.extend({}, options, {
        url: url,
        method: 'POST',
        data: data
      }));
    },
    put: function (url, data, options) {
      return ajax(_.extend({}, options, {
        url: url,
        method: 'PUT',
        data: data
      }));
    },
    patch: function (url, data, options) {
      return ajax(_.extend({}, options, {
        url: url,
        method: 'PATCH',
        data: data
      }));
    },
    delete: function (url, options) {
      return ajax(_.extend({}, options, {
        url: url,
        method: 'DELETE'
      }));
    }
  });

  return Request;
}
