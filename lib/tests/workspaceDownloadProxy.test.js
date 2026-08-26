/* eslint-env jest */

'use strict';

var express = require('express');
var http = require('http');
var workspaceDownloadProxy = require('../workspaceDownloadProxy');

function listen(server) {
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve(server.address().port);
    });
  });
}

function request(port, path, options) {
  options = options || {};
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        resolve({
          body: Buffer.concat(chunks),
          headers: res.headers,
          status: res.statusCode
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('workspace download proxy', function () {
  var upstream;
  var upstreamPort;
  var server;
  var serverPort;
  var upstreamHandler;
  var mountPath = '/custom/workspace-download';

  beforeEach(async function () {
    upstreamHandler = function (req, res) { res.end('ok'); };
    upstream = http.createServer(function (req, res) { upstreamHandler(req, res); });
    upstreamPort = await listen(upstream);

    var app = express();
    app.set('trust proxy', 1);
    app.use(mountPath,
      workspaceDownloadProxy.createWorkspaceDownloadProxy(
        'http://127.0.0.1:' + upstreamPort + mountPath,
        { timeout: 1000, mountPath: mountPath }
      ));
    server = http.createServer(app);
    serverPort = await listen(server);
  });

  afterEach(function () {
    return Promise.all([
      new Promise(function (resolve) { server.close(resolve); }),
      new Promise(function (resolve) { upstream.close(resolve); })
    ]);
  });

  test('requires and forwards authorization for cookie authentication', async function () {
    var missing = await request(serverPort, '/custom/workspace-download/set-cookie-auth', {
      method: 'POST'
    });
    expect(missing.status).toBe(401);
    expect(missing.headers['cache-control']).toBe('private, no-store');

    var missingWithSlash = await request(
      serverPort,
      '/custom/workspace-download/set-cookie-auth/',
      { method: 'POST' }
    );
    expect(missingWithSlash.status).toBe(401);

    upstreamHandler = function (req, res) {
      expect(req.url).toBe('/custom/workspace-download/set-cookie-auth');
      expect(req.headers.authorization).toBe('Bearer secret-token');
      res.statusCode = 204;
      res.end();
    };
    var authorized = await request(serverPort, '/custom/workspace-download/set-cookie-auth', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' }
    });
    expect(authorized.status).toBe(204);
  });

  test('routes and rewrites cookies at the configured non-default mount path', async function () {
    upstreamHandler = function (req, res) {
      expect(req.url).toBe('/custom/workspace-download/set-cookie-auth');
      res.setHeader('Set-Cookie', [
        'session=one; Domain=.bv-brc.org; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=60',
        'preference=two; Domain=bv-brc.org; Expires=Wed, 21 Oct 2030 07:28:00 GMT'
      ]);
      res.end('authorized');
    };

    var response = await request(serverPort, '/custom/workspace-download/set-cookie-auth', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' }
    });

    expect(response.headers['set-cookie']).toEqual([
      'session=one; Path=/custom/workspace-download; HttpOnly; Secure; SameSite=Lax; Max-Age=60',
      'preference=two; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/custom/workspace-download; SameSite=Lax'
    ]);
  });

  test('retains Secure regardless of the effective request protocol', async function () {
    upstreamHandler = function (req, res) {
      res.setHeader('Set-Cookie', 'session=one; Secure; HttpOnly');
      res.end('authorized');
    };

    var httpResponse = await request(serverPort, '/custom/workspace-download/set-cookie-auth', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' }
    });
    var httpsResponse = await request(serverPort, '/custom/workspace-download/set-cookie-auth', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'X-Forwarded-Proto': 'https'
      }
    });

    expect(httpResponse.headers['set-cookie'][0]).toContain('; Secure;');
    expect(httpsResponse.headers['set-cookie'][0]).toContain('; Secure;');
  });

  test('forwards cookies, encoded paths, queries, status, headers, and body', async function () {
    var body = Buffer.from([0, 1, 2, 255]);
    upstreamHandler = function (req, res) {
      expect(req.url).toBe('/custom/workspace-download/view/user/file%20%2525%23.txt?download=1&x=a%26b');
      expect(req.headers.cookie).toBe('session=abc');
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="result.bin"');
      res.end(body);
    };

    var response = await request(serverPort,
      '/custom/workspace-download/view/user/file%20%2525%23.txt?download=1&x=a%26b',
      {
        headers: { Cookie: 'session=abc' }
      });

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-disposition']).toBe('attachment; filename="result.bin"');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual(body);
  });

  test.each([
    '/custom/workspace-download/view/%2e%2e/private',
    '/custom/workspace-download/view/%252e%252e/private',
    '/custom/workspace-download/view/%5cprivate'
  ])('rejects traversal path %s', async function (path) {
    var response = await request(serverPort, path);
    expect(response.status).toBe(400);
  });
});
