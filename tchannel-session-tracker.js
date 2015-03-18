// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
/*global console*/
/*eslint no-console:0 max-statements: [1, 30]*/
/*jscs:disable disallowKeywords*/

'use strict';

var util = require('util');
var ansi = require('chalk');
var stream = require('stream');
var hexer = require('hexer');
var sprintf = require('sprintf-js').sprintf;
var thriftDecoder = require('./thrift/simple_decoder');
var v2 = require('tchannel/v2');

module.exports = TChannelSessionTracker;

function TChannelSessionTracker(opts) {
    var self = this;
    self.packetNumber = 0;
    self.sessionNumber = opts.sessionNumber;
    self.direction = opts.direction;
    self.tcpSession = opts.tcpSession;
    self.alwaysShowFrameDump = opts.alwaysShowFrameDump;
    self.alwaysShowHex = opts.alwaysShowHex;
    self.hexerOptions = opts.hexer || {
        prefix: '  ',
        gutter: 4, // maximum frame length is 64k so FFFF
        renderHuman: renderByte,
        nullHuman: ansi.black(ansi.bold('empty'))
    };
    self.parser = null;
    self.speculative = false;
    if (opts.onTrack) {
        self.startTracking(false);
    }
}

TChannelSessionTracker.prototype.startTracking =
function startTracking(speculative) {
    var self = this;
    self.buffer = new stream.PassThrough();
    self.parser = new v2.Reader(v2.Frame);
    self.buffer.pipe(self.parser);

    self.tracking = true;
    self.speculative = speculative;

    self.parser.on('data', handleFrame);
    function handleFrame(frame) {
        self.handleFrame(frame);
    }

    self.parser.on('error', handleError);
    function handleError(error) {
        self.handleError(error);
    }
};

TChannelSessionTracker.prototype.stopTracking =
function stopTracking() {
    var self = this;
    if (!self.tracking) {
        return;
    }
    self.buffer.end();
    self.tracking = false;
    self.parser = null;
    self.buffer = null;
};

TChannelSessionTracker.prototype.end =
function end() {
    var self = this;
    self.stopTracking();
};

TChannelSessionTracker.prototype.handlePacket =
function handlePacket(packet) {
    var self = this;
    if (self.alwaysShowHex) {
        console.log(ansi.cyan(sprintf(
            'session=%d %s %s %s packet=%s',
            self.sessionNumber,
            self.tcpSession.src,
            (self.direction === 'outgoing' ? '-->' : '<--'),
            self.tcpSession.dst,
            self.packetNumber++
        )));
        console.log(hexer(packet, self.hexerOptions));
        console.log('');
    }
    if (!self.tracking) {
        self.handleUntrackedPacket(packet);
    }
    if (self.buffer) {
        self.buffer.write(packet);
    }
};

TChannelSessionTracker.prototype.handleUntrackedPacket =
function handleUntrackedPacket(packet) {
    var self = this;
    self.startTracking(true);
};

TChannelSessionTracker.prototype.handleFrame =
function handleFrame(frame) {
    var self = this;
    var type =
        frame &&
        frame.body &&
        frame.body.type &&
        frame.body.type.toString(16);
    console.log(ansi.green(sprintf(
        'session=%d %s %s %s frame=%d type=0x%02x%s',
        self.sessionNumber,
        self.tcpSession.src,
        (self.direction === 'outgoing' ? '-->' : '<--'),
        self.tcpSession.dst,
        frame && frame.id,
        type && type.toString(16),
        (self.speculative ? ansi.yellow(' ???') : '')
    )));
    var showJson = self.alwaysShowFrameDump;
    self.inspectCommonFrame(frame);
    if (showJson) {
        console.log(ansi.yellow('frame'));
        console.log(util.inspect(frame, {colors: ansi.enabled}));
    }
    console.log('');
};

TChannelSessionTracker.prototype.handleError =
function handleError(error) {
    var self = this;
    console.log(ansi.red(sprintf(
        'session=%d %s %s %s frame parse error %s',
        self.sessionNumber,
        self.tcpSession.src,
        (self.direction === 'outgoing' ? '-->' : '<--'),
        self.tcpSession.dst,
        error.name
    )));
    console.log(ansi.red(error.message));
    console.log(hexer(error.buffer, self.hexerOptions));
    console.log('');

    self.stopTracking();
};

TChannelSessionTracker.prototype.nameByType = {
    '01': 'init request',
    '02': 'init response',
    '03': 'call request',
    '04': 'call response',
    '13': 'request continue',
    '14': 'response continue',
    'c0': 'cancel',
    'c1': 'claim',
    'd0': 'ping request',
    'd1': 'ping response',
    'ff': 'error'
};

TChannelSessionTracker.prototype.inspectCommonFrame =
function inspectCommonFrame(frame) {
    var self = this;
    if (!frame.body) {
        console.log(ansi.yellow(sprintf(
            'unexpected shape'
        )));
        // TODO unexpected frame shape
        return;
    }
    self.inspectBanner(frame.body, frame);
    self.inspectHeaders(frame.body.headers);
    self.inspectTracing(frame.body.tracing);
    self.inspectBody(frame.body);
};

TChannelSessionTracker.prototype.inspectTracing =
function inspectTracing(tracing) {
    if (tracing) {
        var spanid = tracing.slice(0, 7);
        var parentid = tracing.slice(8, 15);
        var traceid = tracing.slice(16, 23);
        var traceflags = tracing.slice(24, 25);

        console.log(
            'tracing: spanid: ' + spanid.toString('hex') + ' ' +
            'parentid: ' + parentid.toString('hex') + ' ' +
            'traceid: ' + traceid.toString('hex') + ' ' +
            'traceflags: ' + traceflags.toString('hex')
        );
    }
};

TChannelSessionTracker.prototype.inspectBanner =
function inspectBanner(body, frame) {
    var self = this;
    if (!body) {
        // TODO
        return;
    }
    var parts = [];

    // type, e.g., CALL REQUEST
    self.addFrameTypeName(parts, body);

    if (typeof frame.id === 'number') {
        parts.push(sprintf('id=0x%04x (%d)', frame.id, frame.id));
    }

    // e.g., version=2
    if (body.version) {
        parts.push(sprintf('version=%d', body.version));
    }

    self.addServiceName(parts, body);

    // e.g., flags=0x01 continued
    if (body.flags !== undefined) {
        parts.push(sprintf('flags=0x%02x', body.flags));
    }
    if (body.flags) {
        if (body.flags & 0x01) {
            parts.push('continued');
        }
    }

    // e.g., ttl=60
    if (body.ttl) {
        parts.push(sprintf('ttl=0x%04x (%d)', body.ttl, body.ttl));
    }

    // if (body.tracing) {
    //     // TODO
    // }

    // if (body.csum) {
    //     // TODO
    // }

    console.log(parts.join(' '));
};

TChannelSessionTracker.prototype.addFrameTypeName =
function addFrameTypeName(parts, body) {
    var self = this;
    var type = sprintf('%02x', body.type);
    if (self.nameByType[type]) {
        parts.push(self.nameByType[type].toUpperCase());
    } else {
        parts.push(ansi.red(sprintf(
            'UNRECOGNIZED FRAME TYPE %d',
            body.type
        )));
    }
};

TChannelSessionTracker.prototype.addServiceName =
function addServiceName(parts, body) {
    // e.g., service="teapot"
    if (body.service !== undefined) {
        var service = JSON.stringify(body.service.toString('utf8'));
        if (!body.service.length) {
            service = ansi.red(service);
        }
        parts.push(sprintf('service=%s', service));
    }
};

TChannelSessionTracker.prototype.inspectHeaders =
function inspectHeaders(headers) {
    if (!headers) {
        return;
    }
    var keys = Object.keys(headers);
    if (keys.length) {
        console.log(ansi.yellow('headers'));
        keys.forEach(function eachKey(key) {
            console.log('  %s: %s', ansi.yellow(key), headers[key]);
        });
    }
};

TChannelSessionTracker.prototype.inspectBody =
function inspectBody(body) {
    var self = this;
    if (!body) {
        return;
    }
    self.inspectArgument('arg1', body.arg1);
    self.inspectArgument('arg2', body.arg2);
    self.inspectArgument('arg3', body.arg3);
    if (!self.inspectThrift(body.arg3)) {
        self.inspectJSON(body.arg3);
    }
    if (body.flags & 0x01) {
        console.log(ansi.yellow('to be continued...'));
    }
};

TChannelSessionTracker.prototype.inspectArgument =
function inspectArgument(name, argument) {
    var self = this;
    if (!argument) {
        return;
    }
    console.log(ansi.yellow(name));
    console.log(hexer(argument, self.hexerOptions));
};

TChannelSessionTracker.prototype.inspectThrift =
function inspectThrift(buf) {
    try {
        var data = thriftDecoder.decode(buf);
        console.log(ansi.yellow('arg3 as thrift'));
        console.log(util.inspect(data, {colors: true, depth: Infinity}));
        return true;
    } catch (e) {
    }
};

TChannelSessionTracker.prototype.inspectJSON =
function inspectJSON(buf) {
    try {
        var data = JSON.parse(buf.toString('utf8'));
        console.log(ansi.yellow('arg3 as json'));
        console.log(util.inspect(data, {colors: true, depth: Infinity}));
        return true;
    } catch (e) {
    }
};

function renderByte(c) {
    if (c > 0x1f && c < 0x7f) {
        return String.fromCharCode(c);
    } else {
        return ansi.bold(ansi.black('.'));
    }
}
