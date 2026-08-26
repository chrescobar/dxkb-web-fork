'use strict';

var httpProxy = require('http-proxy');
var URL = require('url').URL;

function rewriteCookie(cookie, mountPath) {
  var parts = cookie.split(';').map(function (part) { return part.trim(); });
  var rewritten = [parts[0]];
  var hasPath = false;
  var hasSameSite = false;

  parts.slice(1).forEach(function (part) {
    var name = part.split('=', 1)[0].toLowerCase();
    if (name === 'domain') return;
    if (name === 'path') {
      rewritten.push('Path=' + mountPath);
      hasPath = true;
      return;
    }
    if (name === 'samesite') {
      rewritten.push('SameSite=Lax');
      hasSameSite = true;
      return;
    }
    rewritten.push(part);
  });

  if (!hasPath) rewritten.push('Path=' + mountPath);
  if (!hasSameSite) rewritten.push('SameSite=Lax');
  return rewritten.join('; ');
}

function hasUnsafePath(rawUrl) {
  var rawPath = rawUrl.split('?')[0];
  var decoded = rawPath;
  var attempts = 0;

  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) return true;

  while (attempts < 5) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch (err) {
      return attempts === 0;
    }
    if (decoded.indexOf('\\') !== -1 || decoded.indexOf('\0') !== -1
        || decoded.split('/').some(function (segment) { return segment === '..'; })) {
      return true;
    }
    if (decoded.indexOf('%') === -1) return false;
    attempts += 1;
  }

  return /%[0-9a-f]{2}/i.test(decoded);
}

function createWorkspaceDownloadProxy(target, options) {
  var targetUrl;
  var proxy = httpProxy.createProxyServer();
  options = options || {};
  var timeout = options.timeout || 30000;
  var mountPath = options.mountPath;

  try {
    targetUrl = new URL(target);
  } catch (err) {
    throw new Error('workspaceDownloadServiceTarget must be a valid URL');
  }
  if ((targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:')
      || targetUrl.username || targetUrl.password) {
    throw new Error('workspaceDownloadServiceTarget must be an HTTP(S) URL without credentials');
  }
  target = target.replace(/\/+$/, '');

  proxy.on('proxyRes', function (proxyRes, req) {
    var cookies = proxyRes.headers['set-cookie'];
    if (cookies) {
      proxyRes.headers['set-cookie'] = cookies.map(function (cookie) {
        return rewriteCookie(cookie, mountPath);
      });
    }
    proxyRes.headers['cache-control'] = 'private, no-store';
  });

  return function workspaceDownloadProxy(req, res) {
    if (hasUnsafePath(req.url)) {
      res.status(400).send('Invalid workspace download path');
      return;
    }
    if (req.path.replace(/\/+$/, '') === '/set-cookie-auth'
        && (!req.get('authorization') || !req.get('authorization').trim())) {
      res.set('Cache-Control', 'private, no-store');
      res.status(401).send('Authorization required');
      return;
    }

    proxy.web(req, res, {
      target: target,
      changeOrigin: true,
      proxyTimeout: timeout,
      timeout: timeout
    }, function (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      var timedOut = err && (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT');
      res.status(timedOut ? 504 : 502).send(timedOut
        ? 'Workspace download service timed out' : 'Workspace download service unavailable');
    });
  };
}

module.exports = {
  createWorkspaceDownloadProxy: createWorkspaceDownloadProxy,
  hasUnsafePath: hasUnsafePath,
  rewriteCookie: rewriteCookie
};
