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
/*global console, process*/
/*eslint no-console:0 max-statements: [1, 30]*/

'use strict';

var stream = require('stream');
var pcap = require('pcap');
var util = require('util');
var events = require('events');
var hexer = require('hexer');

module.exports = TChannelTracker;
function TChannelTracker(opts) {
    var self = this;
    events.EventEmitter.call(self, opts);
    self.filter = opts.filter || 'ip proto \\tcp and port 4040';
    self.interface = opts.interface; // e.g., en0
    self.bufferSize = opts.bufferSize; // in bytes
    self.nextSessionNumber = 0;
}

util.inherits(TChannelTracker, events.EventEmitter);

TChannelTracker.prototype.listen = function listen() {
    var self = this;
    self.tcpTracker = new pcap.TCPTracker();
    self.pcapSession = pcap.createSession(
        self.interface,
        self.filter,
        self.bufferSize
    );
    self.pcapSession.on('packet', function handleTcpPacket(rawPacket) {
        var packet = pcap.decode.packet(rawPacket);
        self.tcpTracker.track_packet(packet);
    });
    self.tcpTracker.on('session', function handleTcpSession(tcpSession) {
        self.handleTcpSession(tcpSession);
    });
    console.log('listening', self.pcapSession.device_name);
};

TChannelTracker.prototype.handleTcpSession =
function handleTcpSession(tcpSession) {
    var self = this;
    var sessionNumber = self.nextSessionNumber++;

    console.log('session started', sessionNumber);
    // console.log('session', tcpSession);

    var incoming = new stream.PassThrough();
    var outgoing = new stream.PassThrough();

    var incomingHexer = new hexer.Transform();
    var outgoingHexer = new hexer.Transform();

    incoming.pipe(incomingHexer).pipe(process.stdout);
    outgoing.pipe(outgoingHexer).pipe(process.stdout);

    if (tcpSession.missed_syn) {
        return;
    }

    tcpSession.on('data send', handleDataSend);
    function handleDataSend(session, chunk) {
        console.log('sent on session', sessionNumber);
        outgoing.write(chunk);
        outgoingHexer.reset();
    }

    tcpSession.on('data recv', handleDataRecv);
    function handleDataRecv(session, chunk) {
        console.log('received on session', sessionNumber);
        incoming.write(chunk);
        incomingHexer.reset();
    }

    tcpSession.once('end', handleSessionEnd);
    function handleSessionEnd(session) {
        console.log('session ended', sessionNumber);
        tcpSession.removeListener('data send', handleDataSend);
        tcpSession.removeListener('data recv', handleDataRecv);
        incoming.end();
        outgoing.end();
    }

    if (self.verbose) {
        tcpSession.on('retransmit', handleRetransmit);
        tcpSession.on('reset', handleReset);
        tcpSession.on('syn retry', handleRetry);
    }

    function handleRetransmit(session, direction, sequenceNumber) {
    }

    function handleReset(session) {
    }

    function handleRetry(session) {
    }
};
