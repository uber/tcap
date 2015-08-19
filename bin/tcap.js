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
var FrameFilters = require('../frame-filters');
var thriftDecoder = require('../thrift/decoder.js');

module.exports = main;

if (require.main === module) {
    main(process.argv);
}

function main(argv) {

    function collect(x, xs) {
        xs.push(x);
        return xs;
    }

    var newline = '\n                             ';
    commander.version(require('../package.json').version)
        .option('-i --interface <interface>',
            'network interface interfaces ' +
            '(defaults to first with an address)', collect, [])
        .option('-p --port <port>',
            'a port to track or use "port1-port2" for a range of ports to track between port1 and port2', collect, [])
        .option('-f --filter <filter>',
            'packet filter in pcap-filter(7) syntax ' +
            '(default: all TCP packets on port 4040)')
        .option('-s --service <service-name>',
            'service name or names to show (default: all services shown), or' + newline +
            'use "~service-name" to exclude the service', collect, [])
        .option('-t --thrift <thrift>',
            'path of the directory for thrift spec files')
        .option('-1 --arg1 <arg1-method>',
            'arg1 method or methods to show ' +
            '(default: all arg1 methods shown)'  + newline +
            'use "~arg1-method" to exclude the arg1', collect, [])
        .option('--m1',
            'show arg1 name in call responses')
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

    thriftDecoder.setup(commander.thrift);

    var tracker = new TChannelTracker({
        interfaces: commander.interface.length ? commander.interface : [''],
        ports: commander.port,
        pcapFilter: commander.filter,
        filters: registerFilters(commander),
        alwaysShowFrameDump: commander.inspect,
        alwaysShowHex: commander.hex,
        bufferSize: bufferSizeMb * 1024 * 1024,
        color: commander.color
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

function registerFilters(options) {
    var filters = new FrameFilters();

    if (options.thrift) {
        // thrift depends on m1
        options.m1 = true;
    }

    // this order of registration matters
    filters.register('serviceName',
        options.service.length ? options.service : null);
    filters.register('arg1',
        options.arg1.length ? options.arg1 : null);
    filters.register('response',
        checkResponse(options.response));
    filters.register('arg1Matcher', options.m1);

    return filters;
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
