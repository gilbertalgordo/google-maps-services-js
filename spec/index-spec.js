var apiKey = process.env.GOOGLE_MAPS_API_KEY;
var Promise = require('q').Promise;

describe('index.js:', () => {
  var theTime;
  var fakeSetTimeout = (callback, duration) => {
    setImmediate(() => {
      theTime += duration;
      callback();
    });
  };

  var init, requestAndSucceed, requestAndFail, requestTimes;
  beforeEach(() => {
    theTime = 1000000;
    requestTimes = [];

    init = require('../lib/index').init;

    requestAndSucceed = jasmine.createSpy('requestAndSucceed')
        .and.callFake((url, callback) => {
          requestTimes.push(theTime);
          callback(undefined, {
            status: 200,
            body: '{"hello": "world"}'
          });
        });

    requestAndFail = jasmine.createSpy('requestAndFail')
        .and.callFake((url, callback) => {
          requestTimes.push(theTime);
          callback(null, {status: 500});
        });
  });

  describe('parsing the body as JSON', () => {
    it('populates the response.json property', done => {
      init(apiKey, {makeUrlRequest: requestAndSucceed})
      .geocode({address: 'Sydney Opera House'}, (err, response) => {
        expect(err).toBe(null);
        expect(response).toEqual({
          status: 200,
          body: '{"hello": "world"}',
          json: {hello: 'world'}
        });
        done();
      });
    });

    it('reports parse errors', done => {
      init(apiKey, {makeUrlRequest: (url, callback) => {
        callback(null, {status: 200, body: 'not valid JSON'});
      }})
      .geocode({address: 'Sydney Opera House'}, (err, response) => {
        expect(err).toMatch(/SyntaxError/);
        done();
      });
    });
  });

  describe('retrying failing requests', () => {
    it('retries the requests using retryOptions given to the method', done => {
      theTime = 0;
      init(apiKey, {
        makeUrlRequest: requestAndFail,
        setTimeout: fakeSetTimeout,
        getTime: () => theTime
      })
      .geocode({
        address: 'Sydney Opera House',
        retryOptions: {
          timeout: 5500,
          interval: 1000,
          increment: 1,
          jitter: 1e-100
        }
      }, (err, response) => {
        expect(err).toMatch(/timeout/);
        expect(requestTimes).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
        done();
      });
    });

    it('retries the requests using retryOptions given to the service', done => {
      theTime = 0;
      init(apiKey, {
        makeUrlRequest: requestAndFail,
        retryOptions: {
          timeout: 5500,
          interval: 1000,
          increment: 1,
          jitter: 1e-100
        },
        setTimeout: fakeSetTimeout,
        getTime: () => theTime
      })
      .geocode({address: 'Sydney Opera House'}, (err, response) => {
        expect(err).toMatch(/timeout/);
        expect(requestTimes).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
        done();
      });
    });
  });

  it('cancels when .cancel() is called immediately', done => {
    init(apiKey, {makeUrlRequest: requestAndSucceed})
    .geocode({address: 'Sydney Opera House'}, (err, response) => {
      expect(err).toMatch(/cancelled/);
      expect(requestAndSucceed).not.toHaveBeenCalled();
      done();
    })
    .cancel();
  });

  describe('using .asPromise()', () => {
    it('delivers responses', done => {
      init(apiKey, {Promise: Promise, makeUrlRequest: requestAndSucceed})
      .geocode({address: 'Sydney Opera House'})
      .asPromise()
      .then(response => {
        expect(response).toEqual({
          status: 200,
          body: '{"hello": "world"}',
          json: {hello: 'world'}
        });
      })
      .then(done, fail);
    });

    it('delivers errors', done => {
      init(apiKey, {Promise: Promise, makeUrlRequest: (url, callback) => {
        callback('error', null);
      }})
      .geocode({address: 'Sydney Opera House'})
      .asPromise()
      .then(fail, error => {
        expect(error).toEqual('error');
        done();
      })
    });
  });
});