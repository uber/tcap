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
    // TODO accept ports as arguments and compose a default filter
    self.filter = opts.filter || 'ip proto \\tcp and port 4040';
    self.interface = opts.interface; // e.g., en0
    self.alwaysShowJson = opts.alwaysShowJson;
    self.alwaysShowHex = opts.alwaysShowHex;
    self.bufferSize = opts.bufferSize; // in bytes
    self.nextSessionNumber = 0;
}

util.inherits(TChannelTracker, events.EventEmitter);

TChannelTracker.prototype.listen = function listen() {
    // TODO support listening on multiple interfaces
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
    console.log(
        ansi.cyan('listening on interface %s with filter %s'),
        self.pcapSession.device_name,
        self.filter
    );
};

TChannelTracker.prototype.handleTcpSession =
function handleTcpSession(tcpSession) {
    var self = this;
    var sessionNumber = self.nextSessionNumber++;

    if (tcpSession.missed_syn) {
        console.log(
            ansi.cyan('session missed src=%s --> dst=%s'),
            tcpSession.src,
            tcpSession.dst
        );
        return;
    }

    console.log(
        ansi.cyan('session=%s started src=%s --> dst=%s'),
        sessionNumber,
        tcpSession.src,
        tcpSession.dst
    );

    var tchannelSessionTracker = new TChannelSessionTracker({
        sessionNumber: sessionNumber,
        tcpSession: tcpSession,
        alwaysShowJson: self.alwaysShowJson,
        alwaysShowHex: self.alwaysShowHex
    });

    var incoming = new stream.PassThrough();
    var outgoing = new stream.PassThrough();

    var incomingReader = new tchannel.Parser(tchannel.Frame);
    var outgoingReader = new tchannel.Parser(tchannel.Frame);

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
            ansi.cyan('session=%s ended src=%s --> dst=%s'),
            sessionNumber,
            tcpSession.src,
            tcpSession.dst
        );

        tcpSession.removeListener('data send', handleDataSend);
        tcpSession.removeListener('data recv', handleDataRecv);
        incoming.end();
        outgoing.end();
    }

};
