var express = require('express');
var router = express.Router();
var httpProxy = require('http-proxy');

// Create a proxy server instance first
// ws: true
const proxy = httpProxy.createProxyServer({
    target: 'http://localhost:3019/',  // Next.js server address
    changeOrigin: true,
    autoRewrite: true,
    followRedirects: true,
});

proxy.on('error', function (err, req, res) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error');
});

// Route handler using the proxy
router.all('*', function (req, res) {
   // req.url = req.url.replace('\/v2','');
   console.log('proxying to Next.js:', req.url);
   req.url = '/v2' + req.url
   proxy.web(req, res);
});

module.exports = router;