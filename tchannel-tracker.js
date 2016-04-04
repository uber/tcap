// Copyright (c) 2016 Uber Technologies, Inc.
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

'use strict';

var pcap = require('pcap');
var util = require('util');
var ansi = require('chalk');
var events = require('events');
var sprintf = require('sprintf-js').sprintf;
var TChannelSessionTracker = require('./tchannel-session-tracker');

module.exports = TChannelTracker;
function TChannelTracker(opts) {
    var self = this;
    events.EventEmitter.call(self, opts);

    self.pcapFilter = opts.pcapFilter || 'ip proto \\tcp';

    var ports = opts.ports.slice();
    if (ports.length) {
        self.pcapFilter += ' and (' + portFilters(ports) + ')';
    } else if (!/\bport\b/.test(self.pcapFilter)) {
        self.pcapFilter += ' and port 4040';
    }

    self.interfaces = opts.interfaces; // e.g., ['en0']
    self.alwaysShowFrameDump = opts.alwaysShowFrameDump;
    self.alwaysShowHex = opts.alwaysShowHex;
    self.bufferSize = opts.bufferSize; // in bytes
    self.nextSessionNumber = 0;

    self.filters = opts.filters;
    self.color = opts.color
}

function portFilters(ports) {
    var filter = '';
    for (var i = 0; i < ports.length; i++) {
        var port = ports[i];
        if (port.indexOf('-') === -1) {
            filter += 'port ' + port;
        } else {
            filter += 'portrange ' + port;
        }

        if (i !== ports.length - 1) {
            filter += ' or ';
        }
    }

    return filter;
}

util.inherits(TChannelTracker, events.EventEmitter);

TChannelTracker.prototype.listen = function listen() {
    var self = this;
    var listeners = {};
    self.interfaces.forEach(listenOnInterface);
    function listenOnInterface(iface) {
        var tcpTracker = new pcap.TCPTracker();
        var pcapSession = pcap.createSession(
            iface,
            self.pcapFilter,
            self.bufferSize
        );
        pcapSession.on('packet', function handleTcpPacket(rawPacket) {
            var packet = pcap.decode.packet(rawPacket);
            tcpTracker.track_packet(packet);
        });
        tcpTracker.on('session', function handleTcpSession(tcpSession) {
            self.handleTcpSession(tcpSession, iface);
        });
        listeners[iface] = {
            tcpTracker: tcpTracker,
            pcapSession: pcapSession
        };
        console.log(
            ansi.cyan('listening on interface %s with filter %s'),
            pcapSession.device_name,
            self.pcapFilter
        );
    }
};

TChannelTracker.prototype.handleTcpSession =
function handleTcpSession(tcpSession, iface) {
    var self = this;
    var sessionNumber = self.nextSessionNumber++;

    console.log(ansi.cyan(sprintf(
        'ts=%10.03f session=%s %s src=%s --> dst=%s on %s',
        Date.now() / 1000.0,
        sessionNumber,
        (tcpSession.missed_syn ? 'in progress' : 'started'),
        tcpSession.src,
        tcpSession.dst,
        iface
    )));

    var filterHandle = {};

    var incomingSessionTracker = new TChannelSessionTracker({
        sessionNumber: sessionNumber,
        direction: 'incoming',
        onTrack: !tcpSession.missed_syn,
        tcpSession: tcpSession,
        alwaysShowFrameDump: self.alwaysShowFrameDump,
        alwaysShowHex: self.alwaysShowHex,
        filterInstance: {handle: filterHandle, filters: self.filters},
        color: self.color
    });

    var outgoingSessionTracker = new TChannelSessionTracker({
        sessionNumber: sessionNumber,
        direction: 'outgoing',
        onTrack: !tcpSession.missed_syn,
        tcpSession: tcpSession,
        alwaysShowFrameDump: self.alwaysShowFrameDump,
        alwaysShowHex: self.alwaysShowHex,
        filterInstance: {handle: filterHandle, filters: self.filters},
        color: self.color
    });

    tcpSession.on('data send', handleDataSend);
    function handleDataSend(session, chunk) {
        outgoingSessionTracker.handlePacket(chunk);
    }

    tcpSession.on('data recv', handleDataRecv);
    function handleDataRecv(session, chunk) {
        incomingSessionTracker.handlePacket(chunk);
    }

    tcpSession.once('end', handleSessionEnd);
    function handleSessionEnd(session) {
        console.log(ansi.cyan(sprintf(
            'ts=%10.03f session=%s ended src=%s --> dst=%s on %s',
            Date.now() / 1000.0,
            sessionNumber,
            tcpSession.src,
            tcpSession.dst,
            iface
        )));

        tcpSession.removeListener('data send', handleDataSend);
        tcpSession.removeListener('data recv', handleDataRecv);
        incomingSessionTracker.end();
        outgoingSessionTracker.end();
    }
};
