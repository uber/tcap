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
var events = require('events');
var tchannel = require('tchannel/v2');

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

    if (tcpSession.missed_syn) {
        console.log('missed session in progress');
        return;
    }

    console.log('session started', sessionNumber);

    var incoming = new stream.PassThrough();
    var outgoing = new stream.PassThrough();

    var incomingReader = new tchannel.Parser(tchannel.Frame);
    var outgoingReader = new tchannel.Parser(tchannel.Frame);

    incoming.pipe(incomingReader);
    outgoing.pipe(outgoingReader);

    incomingReader.on('data', inspectFrame);
    outgoingReader.on('data', inspectFrame);
    incomingReader.on('error', inspectError);
    outgoingReader.on('error', inspectError);

    tcpSession.on('data send', handleDataSend);
    function handleDataSend(session, chunk) {
        console.log('sent on session', sessionNumber);
        outgoing.write(chunk);
    }

    tcpSession.on('data recv', handleDataRecv);
    function handleDataRecv(session, chunk) {
        console.log('received on session', sessionNumber);
        incoming.write(chunk);
    }

    tcpSession.once('end', handleSessionEnd);
    function handleSessionEnd(session) {
        console.log('session ended', sessionNumber);
        tcpSession.removeListener('data send', handleDataSend);
        tcpSession.removeListener('data recv', handleDataRecv);
        incoming.end();
        outgoing.end();
    }

};

function inspectFrame(frame) {
    console.log(frame);
}

function inspectError(error) {
    console.error(error);
}
