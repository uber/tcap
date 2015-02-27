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

if (require.main === module) {
    main();
}

function main(arg) {

    commander.version(require('../package.json').version)
        .option('-i --interface [interface',
            'network interface name for capture ' +
            '(defaults to first with an address)', '')
        .option('-f --filter [filter]',
            'packet filter in pcap-filter(7) syntax ' +
            '(default: all TCP packets on port 4040)')
        .option('-b --buffer-size [mb]',
            'size in MiB to buffer between libpcap and app ' +
            '(default: 10)')
        // handled by chalk module:
        .option('--color',
            'enables colors if not connected to a tty.')
        .option('--no-color',
            'disables colors if connected to a tty.')
        .parse(process.argv);

    var bufferSizeMb = commander.bufferSize || 10;

    checkUid();

    var tracker = new TChannelTracker({
        interface: commander.interface,
        filter: commander.filter,
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
