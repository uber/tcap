#!/usr/bin/env node
'use strict';

var commander = require('commander');
var TChannelTracker = require('../tchannel-tracker.js');
var ansi = require('../ansi.js');

if (require.main === module) {
    main();
}

function main(arg) {

    commander.version(require('../package.json').version)
        .option('-i --interface [interface', 'network interface name for capture (defaults to first with an address)', '')
        .option('-f --filter [filter]', 'packet filter in pcap-filter(7) syntax (default: all TCP packets on port 4040)')
        .option('-b --buffer-size [mb]', 'size in MiB to buffer between libpcap and app (default: 10)')
        .option('--no-color', 'disables colors (default: not attached to a tty)')
        .parse(process.argv);

    var color = commander.color && !!process.stdout.isTTY;
    ansi.no_color = !color;

    var bufferSizeMb = commander.bufferSize || 10;

    checkUid();

    var tracker = new TChannelTracker({
        interface: commander.interface,
        filter: commander.filter,
        bufferSize: bufferSizeMb
    });
    tracker.listen();
}

function checkUid() {
    if (process.getuid() !== 0) {
        console.log(ansi.red(ansi.bold("Warning: not running with root privs, which are usually required for raw packet capture.")));
        console.log(ansi.red("Trying to open anyway..."));
    }
}
