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

'use strict';
var ansi = require('chalk');
var fs = require('fs');
var path = require('path');
var thriftify = require('thriftify');

var simpleDecoder = require('./simple-decoder');

var specs = {};

function setup(dir) {
    if (!dir) {
        return;
    }

    var files = fs.readdirSync(dir);
    var fileRead = [];
    files.forEach(function eachFile(file) {
        var match = /([^\/]+)\.thrift$/.exec(file);
        if (match) {
            var spec = thriftify.readSpecSync(path.join(dir, file));
            fileRead.push(match[0]);
            Object.keys(spec.servicesAndFunctions).forEach(
                function each(service) {
                    if (specs[service]) {
                        console.log(ansi.red(
                            ansi.bold('Warning: service name conflicts on "'
                                + service + '"')));
                        return;
                    }
                    specs[service] = spec;
                });
        }
    });

    if (fileRead.length !== 0) {
        console.log('Thrift specs read: ' + fileRead.join(', '));
    } else {
        console.log(ansi.red(
            ansi.bold('Warning: no thrift spec file read from ' + dir)));
    }
}

function decode(arg3, arg1, direction) {
    if (!arg1 || !direction) {
        return simpleDecoder.decode(arg3);
    }

    arg1 = arg1.toString('utf8');
    var arg1s = arg1.split('::');
    if (arg1s.length !== 2) {
        return simpleDecoder.decode(arg3);
    }

    var spec = specs[arg1s[0]];
    if (!spec) {
        return simpleDecoder.decode(arg3);
    }

    try {
        var result = thriftify.fromBuffer(arg3, spec,
            arg1 + (direction === 'outgoing' ? '_args' : '_result'));
    } catch (e) {
        console.log(ansi.red(
            ansi.bold('Thrift error: no thrift spec file read from ' + e)));

        return simpleDecoder.decode(arg3);
    }

    return result;
}

module.exports.setup = setup;
module.exports.decode = decode;
