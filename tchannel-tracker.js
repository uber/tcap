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
    self.pcapSession = pcap.createSession(self.interface, self.filter, self.bufferSize);
    self.pcapSession.on('packet', function (rawPacket) {
        var packet = pcap.decode.packet(rawPacket);
        self.tcpTracker.track_packet(packet);
    });
    self.tcpTracker.on('session', function (tcpSession) {
        self.handleTcpSession(tcpSession);
    });
    console.log('listening', self.pcapSession.device_name);
};

TChannelTracker.prototype.handleTcpSession = function handleTcpSession(tcpSession) {
    var self = this;
    var sessionNumber = self.nextSessionNumber++;

    console.log('session started', sessionNumber);
    //console.log('session', tcpSession);

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
    };

    tcpSession.on('data recv', handleDataRecv);
    function handleDataRecv(session, chunk) {
        console.log('received on session', sessionNumber);
        incoming.write(chunk);
        incomingHexer.reset();
    }

    tcpSession.once('end', function (session) {
        console.log('session ended', sessionNumber);
        tcpSession.removeListener('data send', handleDataSend);
        tcpSession.removeListener('data recv', handleDataRecv);
        incoming.end();
        outgoing.end();
    });

    if (self.verbose) {
        tcpSession.on('retransmit', function (session, direction, sequenceNumber) {
        });
        tcpSession.on('reset', function (session) {
        });
        tcpSession.on('syn retry', function (session) {
        });
    }
};

