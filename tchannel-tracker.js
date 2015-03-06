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

'use strict';

var stream = require('stream');
var pcap = require('pcap');
var util = require('util');
var ansi = require('chalk');
var events = require('events');
var tchannel = require('tchannel/v2');
var TChannelSessionTracker = require('./tchannel-session-tracker');

module.exports = TChannelTracker;
function TChannelTracker(opts) {
    var self = this;
    events.EventEmitter.call(self, opts);

    self.filter = opts.filter || 'ip proto \\tcp';

    var ports = opts.ports.slice();
    if (ports.length) {
        self.filter += ' and (' + ports.map(portPredicate).join(' or ') + ')';
    } else if (!/\bport\b/.test(self.filter)) {
        self.filter += ' and port 4040';
    }

    self.interfaces = opts.interfaces; // e.g., ['en0']
    self.alwaysShowJson = opts.alwaysShowJson;
    self.alwaysShowHex = opts.alwaysShowHex;
    self.bufferSize = opts.bufferSize; // in bytes
    self.nextSessionNumber = 0;
}

function portPredicate(port) {
    return 'port ' + port;
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
            self.filter,
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
            self.filter
        );
    }
};

TChannelTracker.prototype.handleTcpSession =
function handleTcpSession(tcpSession, iface) {
    var self = this;
    var sessionNumber = self.nextSessionNumber++;

    if (tcpSession.missed_syn) {
        console.log(
            ansi.cyan('session missed src=%s --> dst=%s on %s'),
            tcpSession.src,
            tcpSession.dst,
            iface
        );
        return;
    }

    console.log(
        ansi.cyan('session=%s started src=%s --> dst=%s on %s'),
        sessionNumber,
        tcpSession.src,
        tcpSession.dst,
        iface
    );

    var tchannelSessionTracker = new TChannelSessionTracker({
        sessionNumber: sessionNumber,
        tcpSession: tcpSession,
        alwaysShowJson: self.alwaysShowJson,
        alwaysShowHex: self.alwaysShowHex
    });

    var incoming = new stream.PassThrough();
    var outgoing = new stream.PassThrough();

    var incomingReader = new tchannel.Reader(tchannel.Frame);
    var outgoingReader = new tchannel.Reader(tchannel.Frame);

    incoming.pipe(incomingReader);
    outgoing.pipe(outgoingReader);

    tcpSession.on('data send', handleDataSend);
    function handleDataSend(session, chunk) {
        tchannelSessionTracker.inspectPacket(chunk, 'outgoing');
        outgoing.write(chunk);
    }

    tcpSession.on('data recv', handleDataRecv);
    function handleDataRecv(session, chunk) {
        tchannelSessionTracker.inspectPacket(chunk, 'incoming');
        incoming.write(chunk);
    }

    incomingReader.on('data', handleIncomingData);
    function handleIncomingData(frame) {
        tchannelSessionTracker.inspectFrame(frame, 'incoming');
    }

    outgoingReader.on('data', handleOutgoingData);
    function handleOutgoingData(frame) {
        tchannelSessionTracker.inspectFrame(frame, 'outgoing');
    }

    incomingReader.on('error', handleIncomingError);
    function handleIncomingError(error) {
        tchannelSessionTracker.inspectError(error, 'incoming');
    }

    outgoingReader.on('error', handleOutgoingError);
    function handleOutgoingError(error) {
        tchannelSessionTracker.inspectError(error, 'outgoing');
    }

    tcpSession.once('end', handleSessionEnd);
    function handleSessionEnd(session) {
        console.log(
            ansi.cyan('session=%s ended src=%s --> dst=%s on %s'),
            sessionNumber,
            tcpSession.src,
            tcpSession.dst,
            iface
        );

        tcpSession.removeListener('data send', handleDataSend);
        tcpSession.removeListener('data recv', handleDataRecv);
        incoming.end();
        outgoing.end();
    }

};
