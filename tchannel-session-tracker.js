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
var EOL = require('os').EOL;
var ansi = require('chalk');
var stream = require('stream');
var hexer = require('hexer');
var sprintf = require('sprintf-js').sprintf;
var thriftDecoder = require('./thrift/simple_decoder');
var v2 = require('tchannel/v2');
var bufrw = require('bufrw');
var ChunkReader = require('bufrw/stream/chunk_reader');
var ErrorResponse = require('tchannel/v2/error_response');
var CodeErrors = ErrorResponse.CodeErrors;
var TChannelFrame = require('tchannel/v2/index');
var FrameTypes = TChannelFrame.Types;
var TchannelTypes = require('./tchannel-types');
var FrameNameByType = TchannelTypes.FrameNameByType;
var ResponseNameByType = TchannelTypes.ResponseNameByType;

module.exports = TChannelSessionTracker;

function TChannelSessionTracker(opts) {
    var self = this;
    self.packetNumber = 0;
    self.sessionNumber = opts.sessionNumber;
    self.filterInstance = opts.filterInstance;
    self.filterInstance.handle.sessionTracker = self;
    self.direction = opts.direction;
    self.tcpSession = opts.tcpSession;
    self.alwaysShowFrameDump = opts.alwaysShowFrameDump;
    self.alwaysShowHex = opts.alwaysShowHex;
    self.hexerOptions = opts.hexer || {
        prefix: '  ',
        gutter: 4, // maximum frame length is 64k so FFFF
        colored: true,
        nullHuman: ansi.black(ansi.bold('empty')),
        // headSep is neccessary to overwrite the hexer default
        headSep: ansi.cyan(': ')
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

    self.reader = new ChunkReader(bufrw.UInt16BE, v2.Frame.RW);

    self.buffer.pipe(self.reader);

    self.tracking = true;
    self.speculative = speculative;

    self.reader.on('data', handleFrame);
    function handleFrame(frame) {
        self.handleFrame(frame);
    }

    self.reader.on('error', handleError);
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

    if (!self.filterInstance.filters.apply(self.filterInstance.handle, frame)) {
        // if this frame should be filtered out
        return;
    }

    console.log(self.handleFrameNoFilter(frame));
};

TChannelSessionTracker.prototype.handleFrameNoFilter =
function handleFrameNoFilter(frame) {
    var self = this;
    var type =
        frame &&
        frame.body &&
        frame.body.type;
    var parts = [];
    parts.push(util.format(ansi.green(sprintf(
        'session=%d %s %s %s frame=%d type=0x%02x%s%s',
        self.sessionNumber,
        self.tcpSession.src,
        (self.direction === 'outgoing' ? '-->' : '<--'),
        self.tcpSession.dst,
        frame && frame.id,
        type,
        (frame.body.type !== FrameTypes.CallResponse ? '' :
            ResponseNameByType[frame.body.code] ?
                ' ' + ResponseNameByType[frame.body.code] :
                ''),
        (self.speculative ? ansi.yellow(' ???') : '')
    ))));
    var showJson = self.alwaysShowFrameDump;
    parts = parts.concat(self.inspectCommonFrame(frame));
    if (showJson) {
        parts.push(util.format(ansi.yellow('frame')));
        parts.push(util.format(util.inspect(frame, {colors: ansi.enabled})));
    }

    parts.push('');
    return parts.join(EOL);
};

TChannelSessionTracker.prototype.handleError =
function handleError(error) {
    var self = this;

    if (self.filterInstance.filters.count() > 0) {
        return self.stopTracking();
    }

    console.log(ansi.red(sprintf(
        'session=%d %s %s %s frame parse error',
        self.sessionNumber,
        self.tcpSession.src,
        (self.direction === 'outgoing' ? '-->' : '<--'),
        self.tcpSession.dst
    )));
    console.log(bufrw.formatError(error, {
        color: true,
        markColor: function markColor(str) {
            return ansi.red.bold(str);
        },
        hexerOptions: self.hexerOptions
    }));

    self.stopTracking();
};

TChannelSessionTracker.prototype.inspectCommonFrame =
function inspectCommonFrame(frame) {
    var self = this;
    var parts = [];
    if (!frame.body) {
        parts.push(util.format(ansi.yellow(sprintf(
            'unexpected shape'
        ))));
        // TODO unexpected frame shape
        return parts;
    }
    parts = parts.concat(self.inspectBanner(frame.body, frame));
    parts = parts.concat(self.inspectHeaders(frame.body.headers));
    parts = parts.concat(self.inspectTracing(frame.body.tracing));
    parts = parts.concat(self.inspectMessage(frame.body.message));
    parts = parts.concat(self.inspectBody(frame.body));
    return parts;
};

TChannelSessionTracker.prototype.inspectTracing =
function inspectTracing(tracing) {
    if (tracing) {
        return [sprintf(
            'tracing: spanid=%s parentid=%s traceid=%s flags=0x%02x',
            tracing.spanid.toString('hex'),
            tracing.parentid.toString('hex'),
            tracing.traceid.toString('hex'),
            tracing.flags
        )];
    }

    return [];
};

TChannelSessionTracker.prototype.inspectBanner =
function inspectBanner(body, frame) {
    var self = this;
    if (!body) {
        // TODO
        return [];
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

    if (body.csum) {
        self.addCsum(parts, body.csum);
    }

    return [parts.join(' ')];
};

TChannelSessionTracker.prototype.addFrameTypeName =
function addFrameTypeName(parts, body) {
    if (FrameNameByType[body.type]) {
        var suffix = '';
        if (body.type === ErrorResponse.TypeCode) {
            if (CodeErrors[body.code]) {
                suffix = '[' + CodeErrors[body.code].codeName + ']';
            } else {
                suffix = '[Unknown]';
            }
        }
        parts.push(FrameNameByType[body.type].toUpperCase() + suffix);
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

TChannelSessionTracker.prototype.addCsum =
function addCsum(parts, csum) {
    if (csum.type === 0x00) {
        parts.push(sprintf('csum=none'));
    } else if (csum.type === 0x01) {
        parts.push(sprintf('csum=0x%04x (crc32)', csum.val));
    } else if (csum.type === 0x02) {
        parts.push(sprintf('csum=0x%04x (farmhash)', csum.val));
    }
};

TChannelSessionTracker.prototype.inspectHeaders =
function inspectHeaders(headers) {
    var parts = [];
    if (!headers) {
        return parts;
    }
    var keys = Object.keys(headers);
    if (keys.length) {
        parts.push(ansi.yellow('headers'));
        keys.forEach(function eachKey(key) {
            parts.push(util.format('  %s: %s',
                ansi.yellow(key), headers[key]));
        });
    }
    return parts;
};

TChannelSessionTracker.prototype.inspectBody =
function inspectBody(body) {
    var self = this;
    var parts = [];
    if (!body) {
        return parts;
    }
    if (body.args) {
        for (var i = 0; i < body.args.length; i++) {
            parts = parts.concat(
                self.inspectArgument('args[' + i + ']', body.args[i]));
        }
    }
    if (body.flags & 0x01) {
        parts = parts.push(ansi.yellow('to be continued...'));
    } else if (body.args && body.args[2]) {
        // TODO argstream accumulate and parse
        var as = self.inspectThrift(body.args[2]);
        as = as || self.inspectJSON(body.args[2]);
        parts = parts.concat(as);
    }

    return parts;
};

TChannelSessionTracker.prototype.inspectMessage =
function inspectMessage(message) {
    var self = this;
    if (!message) {
        return [];
    }

    return self.inspectArgument('message', message);
};

TChannelSessionTracker.prototype.inspectArgument =
function inspectArgument(name, argument) {
    var self = this;
    var parts = [];
    if (!argument) {
        return parts;
    }
    parts.push(ansi.yellow(name));
    parts.push(hexer(argument, self.hexerOptions));

    return parts;
};

TChannelSessionTracker.prototype.inspectThrift =
function inspectThrift(buf) {
    try {
        var data = thriftDecoder.decode(buf);
        var parts = [ansi.yellow('arg3 as thrift')];
        parts.push(util.inspect(data, {colors: true, depth: Infinity}));
        return parts;
    } catch (e) {
        return null;
    }
};

TChannelSessionTracker.prototype.inspectJSON =
function inspectJSON(buf) {
    try {
        var data = JSON.parse(buf.toString('utf8'));
        var parts = [ansi.yellow('arg3 as json')];
        parts.push(util.inspect(data, {colors: true, depth: Infinity}));
        return parts;
    } catch (e) {
        return [];
    }
};
