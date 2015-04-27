#!/usr/bin/env node
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
'use strict';
/*global process, console*/
/*eslint no-console:0*/

var commander = require('commander');
var TChannelTracker = require('../tchannel-tracker.js');
var ansi = require('chalk');
var TChannelFrame = require('tchannel/v2/index');
var FrameTypes = TChannelFrame.Types;
var TchannelTypes = require('../tchannel-types');
var ResponseType = TchannelTypes.ResponseType;

module.exports = main;

if (require.main === module) {
    main(process.argv);
}

function main(argv) {

    function collect(x, xs) {
        xs.push(x);
        return xs;
    }

    commander.version(require('../package.json').version)
        .option('-i --interface <interface>',
            'network interface interfaces ' +
            '(defaults to first with an address)', collect, [])
        .option('-p --port <port>',
            'a port or ports to track', collect, [])
        .option('-f --filter <filter>',
            'packet filter in pcap-filter(7) syntax ' +
            '(default: all TCP packets on port 4040)')
        .option('-s --service <service-name>',
            'service name or names to show ' +
            '(default: all services shown)', collect, [])
        .option('-1 --arg1 <arg1-method>',
            'arg1 method or methods to show ' +
            '(default: all arg1 methods shown)', collect, [])
        .option('-r --response <response>',
            'responses to show: O[K], N[otOk], E[rror] ' +
            '(default: all shown)', collect, [])
        .option('-b --buffer-size <mb>',
            'size in MiB to buffer between libpcap and app ' +
            '(default: 10)')
        .option('-x --hex',
            'show hex dumps for all packets')
        .option('--inspect',
            'show JSON dumps for all parsed frames')
        // handled by chalk module:
        .option('--color',
            'enables colors if not connected to a tty.')
        .option('--no-color',
            'disables colors if connected to a tty.')
        .parse(argv);

    var bufferSizeMb = commander.bufferSize || 10;

    checkUid();

    var tracker = new TChannelTracker({
        interfaces: commander.interface.length ? commander.interface : [''],
        ports: commander.port,
        filter: commander.filter,
        serviceNames: commander.service.length ? commander.service : null,
        arg1Methods: commander.arg1.length ? commander.arg1 : null,
        responseStatuses: checkResponse(commander.response),
        alwaysShowFrameDump: commander.inspect,
        alwaysShowHex: commander.hex,
        bufferSize: bufferSizeMb * 1024 * 1024
    });
    tracker.listen();
}

function checkUid() {
    if (process.getuid() !== 0) {
        console.log(ansi.red(ansi.bold('Warning: not running with root privs,' +
            ' which are usually required for raw packet capture.')));
        console.log(ansi.red('Trying to open anyway...'));
    }
}

function checkResponse(response) {
    response = response.length ? response : null;
    if (!response) {
        return null;
    }

    var res = [];
    response.forEach(function createRSTable(name) {
        switch (name.toLowerCase()) {
            case 'o':
            case 'ok':
                res[ResponseType.Ok] = 'Ok';
                break;
            case 'n':
            case 'notok':
                res[ResponseType.NotOk] = 'NotOk';
                break;
            case 'e':
            case 'error':
                res[FrameTypes.ErrorResponse] = 'Error';
                break;
            default:
                console.log(ansi.red(
                ansi.bold('Warning: wrong response status ' +
                          'in command options: \'-r ' +
                          name + '\'')));
                break;
        }
    });

    return res;
}


