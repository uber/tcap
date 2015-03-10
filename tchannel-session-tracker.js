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
var tchannel = require('tchannel/v2');
var thriftDecoder = require('./thrift/simple_decoder');

module.exports = TChannelSessionTracker;

function TChannelSessionTracker(opts) {
    var self = this;
    self.packetNumber = 0;
    self.sessionNumber = opts.sessionNumber;
    self.direction = opts.direction;
    self.tcpSession = opts.tcpSession;
    self.alwaysShowJson = opts.alwaysShowJson;
    self.alwaysShowHex = opts.alwaysShowHex;
    self.parser = null;
    self.speculative = null;
    if (opts.onTrack) {
        self.startTracking(false);
    }
}

TChannelSessionTracker.prototype.startTracking =
function startTracking(speculative) {
    var self = this;
    self.buffer = new stream.PassThrough();
    self.parser = new tchannel.Reader(tchannel.Frame);
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
}

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
        console.log(hex(packet, {prefix: '  '}));
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

    console.log(ansi.yellow(sprintf(
        'session=%d %s %s %s packet=%s not tracked',
        self.sessionNumber,
        self.tcpSession.src,
        (self.direction === 'outgoing' ? '-->' : '<--'),
        self.tcpSession.dst,
        self.packetNumber++
    )));
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
    var showJson = self.alwaysShowJson;
    if (self.inspectByType[type]) {
        showJson = showJson || self[self.inspectByType[type]](frame);
    } else {
        showJson = true;
    }
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
    console.log(hex(error.buffer));
    console.log('');

    self.stopTracking();
};

TChannelSessionTracker.prototype.inspectByType = {
    1: 'inspectInitRequest',
    2: 'inspectInitResponse',
    3: 'inspectCallRequest',
    4: 'inspectCallResponse'
    // 13: 'inspectRequestContinue',
    // 14: 'inspectResponseContinue',
    // c0: 'inspectCancel',
    // c1: 'inspectClaim',
    // d0: 'inspectPingRequest',
    // d1: 'inspectPingResponse',
    // ff: 'inspectError'
};

TChannelSessionTracker.prototype.inspectInitRequest =
function inspectInitRequest(frame) {
    var self = this;
    var body = frame.body;
    console.log(sprintf(
        'INIT REQUEST version=%s',
        body.version
    ));
    self.inspectHeaders(body.headers);
};

TChannelSessionTracker.prototype.inspectInitResponse =
function inspectInitResponse(frame) {
    var self = this;
    var body = frame.body;
    console.log(sprintf(
        'INIT RESPONSE version=%s',
        body.version
    ));
    self.inspectHeaders(body.headers);
};

TChannelSessionTracker.prototype.inspectCallRequest =
function inspectCallRequest(frame) {
    var self = this;
    var body = frame.body;
    var service = JSON.stringify(body.service.toString('utf8'));
    if (!body.service.length) {
        service = ansi.red(service);
    }
    console.log(sprintf(
        'CALL REQUEST service=%s ttl=%s flags=0x%02x',
        service,
        body.ttl,
        body.flags
    ));
    self.inspectHeaders(body.headers);
    self.inspectBody(body);
};

TChannelSessionTracker.prototype.inspectCallResponse =
function inspectCallResponse(frame) {
    var self = this;
    var body = frame.body;
    console.log(sprintf(
        'CALL RESPONSE flags=0x%02x',
        body.flags
    ));
    self.inspectHeaders(body.headers);
    self.inspectBody(body);
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
    self.inspectArgument('arg1', body.arg1);
    self.inspectArgument('arg2', body.arg2);
    self.inspectArgument('arg3', body.arg3);
    self.inspectThrift(body.arg3) || self.inspectJSON(body.arg3);
};

TChannelSessionTracker.prototype.inspectArgument =
function inspectArgument(name, argument) {
    console.log(ansi.yellow(name));
    console.log(hex(argument));
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

function hex(value) {
    return hexer(value, {
        prefix: '  ',
        gutter: 4, // maximum frame length is 64k so FFFF
        renderHuman: renderByte,
        nullHuman: ansi.black(ansi.bold('empty'))
    });
}

function renderByte(c) {
    if (c > 0x1f && c < 0x7f) {
        return String.fromCharCode(c);
    } else {
        return ansi.bold(ansi.black('.'));
    }
}
