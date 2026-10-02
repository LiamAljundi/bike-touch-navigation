// json-serial-bridge: bridges a serial port to browsers over WebSockets and
// serves the static pages in ./public.
//
// Only Node built-ins plus `ws` and `serialport` are used on purpose: a small
// dependency tree means far fewer security advisories to keep up with.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const { WebSocketServer, WebSocket } = require('ws');
const { SerialPort, ReadlineParser } = require('serialport');

const PUBLIC_DIR = path.join(__dirname, 'public');
const WS_PATH = '/serial';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const bold = (s) => (useColor ? '\x1b[1m' + s + '\x1b[22m' : s);
const red = (s) => (useColor ? '\x1b[31m' + s + '\x1b[39m' : s);
const log = console.log;

const USAGE = `Usage: node app.js [options] <command>

Options:
  -s, --serial <port>  Specify serial port (default: "com5")
  -p, --port <port>    Specify web server port (default: 4000)
  -b, --baud <rate>    Baud rate (default: 9600)
  -d, --debug          verbose mode
  -h, --help           output usage information

Commands:
  list                 list available serial ports
  bridge               bridge serial port to websockets`;

main();

function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        serial: { type: 'string', short: 's', default: 'com5' },
        port: { type: 'string', short: 'p', default: '4000' },
        baud: { type: 'string', short: 'b', default: '9600' },
        debug: { type: 'boolean', short: 'd', default: false },
        help: { type: 'boolean', short: 'h', default: false }
      }
    });
  } catch (e) {
    log(red(e.message));
    log(USAGE);
    process.exit(1);
  }

  const { values, positionals } = parsed;
  const command = positionals[0];
  log(bold('json-serial-bridge'));

  if (values.help || !command) {
    log(USAGE);
    return;
  }

  const options = {
    serial: values.serial,
    port: Number(values.port),
    baud: Number(values.baud),
    debug: values.debug
  };
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    log(red('Invalid web server port: ' + values.port));
    process.exit(1);
  }
  if (!Number.isInteger(options.baud) || options.baud <= 0) {
    log(red('Invalid baud rate: ' + values.baud));
    process.exit(1);
  }

  if (command === 'list') listPorts();
  else if (command === 'bridge') bridgePorts(options);
  else {
    log(red('Unknown command: ' + command));
    log(USAGE);
    process.exit(1);
  }
}

function listPorts() {
  SerialPort.list()
    .then(function (ports) {
      log('Ports:');
      let aPort = 'COM1';
      ports.forEach(function (port) {
        aPort = port.path;
        log(' ' + bold(port.path) + ' - ' + port.manufacturer);
      });
      log();
      log('Usage example: node app.js --serial ' + aPort + ' bridge');
      process.exit();
    })
    .catch(function (err) {
      log('Error, could not list ports: ' + err);
    });
}

function bridgePorts(options) {
  const server = http.createServer(function (req, res) {
    if (options.debug) log(req.method + ' ' + req.url);
    serveStatic(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  let serialPort = null;

  server.on('upgrade', function (req, socket, head) {
    let pathname = null;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (e) {}

    if (pathname !== WS_PATH || !isSameOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, function (ws) {
      ws.on('message', function (msg) {
        // Received a message via websocket (ie, from the browser)
        // send it to the serial port
        if (options.debug) log('Ws received: ' + msg);
        if (!serialPort || !serialPort.isOpen) return;
        serialPort.write(msg.toString() + '\r\n');
        serialPort.drain();
      });
      ws.on('error', function () {});
    });
  });

  log('Opening webserver on port ' + options.port + '...');
  server
    .listen(options.port)
    .on('error', function (e) {
      log(
        red(
          'Could not start webserver on port ' +
            options.port +
            ' (' +
            e.code +
            ") - is it already running?"
        )
      );
      process.exit(1);
    })
    .on('listening', function () {
      log('✅ Opened. Available at http://localhost:' + server.address().port);
      serialPort = setupSerial(options, wss);
    });
}

// Browsers always send an Origin header on WebSocket connections. Only accept
// pages served by this server, so other websites can't drive the serial port.
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // not a browser (eg a script or a microcontroller)
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function sendText(res, status, text, headers) {
  res.writeHead(
    status,
    Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers)
  );
  res.end(text);
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  let url;
  let pathname;
  try {
    url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch (e) {
    return sendText(res, 400, 'Bad request');
  }
  if (pathname.includes('\0') || pathname.startsWith('//')) {
    return sendText(res, 400, 'Bad request');
  }

  // path.join resolves any ".." segments, so check we are still inside public/
  let filePath = path.join(PUBLIC_DIR, pathname);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return sendText(res, 403, 'Forbidden');
  }

  fs.stat(filePath, function (err, stat) {
    if (!err && stat.isDirectory()) {
      if (!pathname.endsWith('/')) {
        // Redirect so relative links inside the page resolve correctly
        return sendText(res, 301, 'Moved', {
          Location: path.posix.basename(pathname) + '/' + url.search
        });
      }
      filePath = path.join(filePath, 'index.html');
      return fs.stat(filePath, function (err2, stat2) {
        sendFile(req, res, filePath, err2 ? null : stat2);
      });
    }
    sendFile(req, res, filePath, err ? null : stat);
  });
}

function sendFile(req, res, filePath, stat) {
  if (!stat || !stat.isFile()) return sendText(res, 404, 'Not found');
  res.writeHead(200, {
    'Content-Type':
      MIME_TYPES[path.extname(filePath).toLowerCase()] ||
      'application/octet-stream',
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath)
    .on('error', function () {
      res.destroy();
    })
    .pipe(res);
}

function setupSerial(options, wss) {
  // Init port
  log(
    'Opening serial port ' +
      options.serial +
      ' with baud rate ' +
      options.baud +
      '...'
  );
  const port = new SerialPort(
    { path: options.serial, baudRate: options.baud },
    function (err) {
      if (err) {
        log(red(err.message));
        process.exit();
      } else {
        log('✅ Opened. Use CTRL+C to stop.');
        if (!options.debug)
          log('Start with --debug to monitor traffic in the terminal');
      }
    }
  );

  // Listen for events
  port.on('close', function (err) {
    console.log('Port closed ' + err);
  });
  port.on('error', function (err) {
    console.log('Port error: ' + err);
  });

  // Parse data as a series of newline-separated chunks
  const parser = port.pipe(new ReadlineParser());

  // Got a chunk
  parser.on('data', function (data) {
    if (options.debug) console.log('Serial Received: ' + data);

    // Send the text we received on the serial port to all clients
    wss.clients.forEach(function (client) {
      if (client.readyState !== WebSocket.OPEN) return;
      try {
        client.send(data);
      } catch (e) {}
    });
  });

  return port;
}
