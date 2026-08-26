/* eslint-env jest */

'use strict';

var EventEmitter = require('events');
var fs = require('fs');
var os = require('os');
var path = require('path');
var queryLogger = require('../queryLogger');

function runMiddleware(sessionId, token, requestOverrides) {
  var req = Object.assign({
    cookies: { _querylog: sessionId },
    headers: { authorization: token },
    method: 'GET',
    originalUrl: '/genome/?eq(id,1)',
    path: '/genome/',
    query: {},
    url: '/genome/?eq(id,1)'
  }, requestOverrides);
  var res = new EventEmitter();
  res.statusCode = 200;
  res.getHeader = function () { return undefined; };
  res.write = function () {};
  res.end = function () {};

  queryLogger.middleware()(req, res, function () {});
  res.emit('finish');
}

describe('queryLogger middleware', function () {
  var logDir;

  beforeEach(function () {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-logger-'));
    queryLogger.sessionManager.init(logDir);
  });

  afterEach(function () {
    jest.restoreAllMocks();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  test('does not create a log file from a client-controlled cookie', function () {
    var appendFile = jest.spyOn(fs, 'appendFile').mockImplementation(function () {});

    runMiddleware('forged-session', 'un=test-user|token=one');

    expect(appendFile).not.toHaveBeenCalled();
  });

  test('does not append to another owner\'s active session', function () {
    var session = queryLogger.sessionManager.start('test-user', 'un=test-user|token=one');
    var appendFile = jest.spyOn(fs, 'appendFile').mockImplementation(function () {});

    runMiddleware(session.id, 'un=attacker|token=one');

    expect(appendFile).not.toHaveBeenCalled();
  });

  test('logs requests for the owner of a session', function () {
    var session = queryLogger.sessionManager.start('test-user', 'un=test-user|token=one');
    var appendFile = jest.spyOn(fs, 'appendFile').mockImplementation(function () {});

    expect(session.id).toMatch(/^[a-f0-9]{64}$/);
    expect(session.id).not.toContain('test-user');

    runMiddleware(session.id, 'un=test-user|token=one');

    expect(appendFile).toHaveBeenCalledWith(
      path.join(logDir, session.filename),
      expect.stringContaining('"path":"/genome/"'),
      expect.any(Function)
    );
  });

  test('keeps logging after the owner token is refreshed', function () {
    var session = queryLogger.sessionManager.start('test-user', 'un=test-user|token=one');
    var appendFile = jest.spyOn(fs, 'appendFile').mockImplementation(function () {});

    runMiddleware(session.id, 'un=test-user|token=two');

    expect(appendFile).toHaveBeenCalled();
  });

  test('redacts authorization tokens from URL query strings', function () {
    var session = queryLogger.sessionManager.start('test-user', 'un=test-user|token=one');
    var appendFile = jest.spyOn(fs, 'appendFile').mockImplementation(function () {});

    runMiddleware(session.id, null, {
      headers: {},
      originalUrl: '/genome/?eq(id,1)&http_authorization=owner-token&limit=10',
      query: { http_authorization: 'un=test-user|token=one' },
      url: '/genome/?eq(id,1)&http_authorization=owner-token&limit=10'
    });

    var entry = JSON.parse(appendFile.mock.calls[0][1]);
    expect(entry.query).toBe('eq(id,1)&http_authorization=[REDACTED]&limit=10');
    expect(appendFile.mock.calls[0][1]).not.toContain('un=test-user|token=one');
  });

  test('redacts authorization tokens from POST bodies', function () {
    var session = queryLogger.sessionManager.start('test-user', 'un=test-user|token=one');
    var appendFile = jest.spyOn(fs, 'appendFile').mockImplementation(function () {});

    runMiddleware(session.id, null, {
      body: Buffer.from('query=eq(id,1)&http%5Fauthorization=un%3Dtest-user%7Ctoken%3Done&limit=10'),
      headers: {},
      method: 'POST',
      originalUrl: '/genome/',
      query: {},
      url: '/genome/'
    });

    var entry = JSON.parse(appendFile.mock.calls[0][1]);
    expect(entry.query).toBe('query=eq(id,1)&http%5Fauthorization=[REDACTED]&limit=10');
    expect(appendFile.mock.calls[0][1]).not.toContain('token%3Done');
  });
});
