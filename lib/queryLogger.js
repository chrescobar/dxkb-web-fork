'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var querystring = require('querystring');
var zlib = require('zlib');

function getUsername(token) {
  if (!token) return null;

  var parts = token.replace(/^(OAuth|Bearer)\s+/i, '').split('|');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].indexOf('un=') === 0) return parts[i].slice(3);
  }
  return null;
}

var sessionManager = {
  logDir: null,
  sessions: new Map(),

  init: function (logDir) {
    this.logDir = logDir;
    this.sessions.clear();
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (err) {
      console.error('queryLogger: failed to create log directory:', err.message);
    }
  },

  start: function (username, token) {
    if (!token || getUsername(token) !== username) {
      throw new Error('Valid authentication token required');
    }

    var ts = new Date().toISOString().replace(/[:.]/g, '-');
    var filename = encodeURIComponent(username).replace(/\./g, '%2E') + '-' + ts + '.jsonl';
    var logDir = path.resolve(this.logDir);
    var filePath = path.resolve(logDir, filename);
    if (path.dirname(filePath) !== logDir) {
      throw new Error('Invalid query log filename');
    }
    fs.writeFileSync(filePath, '');

    var id = crypto.randomBytes(32).toString('hex');
    this.sessions.set(id, {
      filename: filename,
      owner: username
    });
    return { id: id, filename: filename };
  },

  getActive: function (id, token) {
    if (!id || !token) return null;

    var session = this.sessions.get(id);
    if (!session) return null;

    if (session.owner !== getUsername(token)) return null;

    try {
      fs.accessSync(path.join(this.logDir, session.filename), fs.constants.W_OK);
      return session;
    } catch (e) {
      this.sessions.delete(id);
      return null;
    }
  },

  stop: function (id, token) {
    if (!this.getActive(id, token)) return false;
    return this.sessions.delete(id);
  }
};

function appendEntry(filePath, entry) {
  var line = JSON.stringify(entry) + '\n';
  fs.appendFile(filePath, line, function (err) {
    if (err) {
      console.error('queryLogger: write error for ' + filePath + ':', err.message);
    }
  });
}

function redactAuthorization(query) {
  return query.split('&').map(function (parameter) {
    var separator = parameter.indexOf('=');
    var name = separator === -1 ? parameter : parameter.slice(0, separator);

    try {
      name = decodeURIComponent(name.replace(/\+/g, ' '));
    } catch (e) {
      return parameter;
    }

    if (name === 'http_authorization' && separator !== -1) {
      return parameter.slice(0, separator + 1) + '[REDACTED]';
    }
    return parameter;
  }).join('&');
}

function getRequestToken(req) {
  if (req.headers.authorization) return req.headers.authorization;
  if (req.query && req.query.http_authorization) return req.query.http_authorization;

  var queryStart = req.originalUrl.indexOf('?');
  if (queryStart !== -1) {
    var urlToken = querystring.parse(req.originalUrl.slice(queryStart + 1)).http_authorization;
    if (urlToken) return urlToken;
  }

  if (!req.body) return null;
  if (!Buffer.isBuffer(req.body)) return req.body.http_authorization;

  return querystring.parse(req.body.toString('utf-8')).http_authorization;
}

function middleware() {
  return function queryLogMiddleware(req, res, next) {
    var id = req.cookies && req.cookies._querylog;
    if (!id || !sessionManager.logDir) {
      return next();
    }

    var session = sessionManager.getActive(id, getRequestToken(req));
    if (!session) {
      return next();
    }

    var filePath = path.join(sessionManager.logDir, session.filename);

    var startTime = Date.now();
    var entry = {
      ts: new Date(startTime).toISOString(),
      method: req.method,
      path: req.path,
      accept: req.headers['accept'] || '',
      range: req.headers['range'] || '',
      contentType: req.headers['content-type'] || ''
    };

    if (req.method === 'POST' && req.body) {
      entry.query = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : String(req.body);
    } else {
      entry.query = req.url.indexOf('?') !== -1 ? req.url.slice(req.url.indexOf('?') + 1) : '';
    }
    entry.query = redactAuthorization(entry.query);

    var isDownload = req.originalUrl.indexOf('http_download=true') !== -1;
    var chunks = [];
    var totalSize = 0;
    var maxSize = 5 * 1024 * 1024;

    if (!isDownload) {
      var originalWrite = res.write;
      var originalEnd = res.end;

      res.write = function (chunk) {
        if (chunk && totalSize < maxSize) {
          var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buf);
          totalSize += buf.length;
        }
        return originalWrite.apply(res, arguments);
      };

      res.end = function (chunk) {
        if (chunk && totalSize < maxSize) {
          var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buf);
          totalSize += buf.length;
        }
        return originalEnd.apply(res, arguments);
      };
    }

    res.on('finish', function () {
      entry.status = res.statusCode;
      entry.contentRange = res.getHeader('content-range') || res.getHeader('x-content-range') || '';
      entry.elapsed = Date.now() - startTime;

      if (isDownload) {
        entry.download = true;
        appendEntry(filePath, entry);
      } else {
        var raw = Buffer.concat(chunks);
        entry.responseTruncated = totalSize > maxSize;

        var encoding = res.getHeader('content-encoding');
        if (encoding === 'gzip' || encoding === 'deflate') {
          var decompress = encoding === 'gzip' ? zlib.gunzip : zlib.inflate;
          decompress(raw, function (err, decoded) {
            if (err) {
              entry.response = raw.toString('utf-8');
              entry.decompressError = err.message;
            } else {
              entry.response = decoded.toString('utf-8');
            }
            appendEntry(filePath, entry);
          });
        } else {
          entry.response = raw.toString('utf-8');
          appendEntry(filePath, entry);
        }
      }
    });

    next();
  };
}

module.exports = {
  sessionManager: sessionManager,
  middleware: middleware
};
