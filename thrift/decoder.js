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
var Thrift = require('thriftrw').Thrift;
var TStructRW = require('thriftrw/tstruct').TStructRW;

var simpleDecoder = require('./simple-decoder');

var functions = {};

function setup(dir) {
    if (!dir) {
        return;
    }

    var files = fs.readdirSync(dir);
    var fileRead = [];
    files.forEach(function eachFile(file) {
        var match = /([^\/]+)\.thrift$/.exec(file);
        if (match) {
            var thrift = new Thrift({
                entryPoint: path.join(dir, file),
                allowFilesystemAccess: true
            });
            fileRead.push(match[0]);
            Object.keys(thrift.services).forEach(function each(serviceName) {
                var service = thrift.models[serviceName];
                service.functions.forEach(function (f) {
                    functions[f.fullName] = f;
                });
            });
        }
    });

    if (fileRead.length !== 0) {
        console.log('Thrift IDLS read: ' + fileRead.join(', '));
        console.log('Thrift procedures found: ' + Object.keys(functions).join(', '));
    } else {
        console.log(ansi.red(
            ansi.bold('Warning: no thrift IDL file read from ' + dir)));
    }
}

function decode(arg3, arg1, direction) {
    if (!arg1 || !direction) {
        return simpleDecode(arg3);
    }

    var thrift = functions[arg1];
    if (!thrift) {
        return simpleDecode(arg3);
    }

    var rw = direction === 'outgoing' ? thrift.args.rw : thrift.result.rw;
    var result = rw.fromBuffer(arg3);
    if (result.err) {
        console.log(ansi.red(
            ansi.bold('thrift error: could not decode with given IDL: ' + result.err)));
        return simpleDecode(arg3);
    }
    return result.value;

}

function simpleDecode(arg3) {
    return simpleDecoder.decode(arg3);
    // TODO use thriftrw instead and delete the special decoder
}

module.exports.setup = setup;
module.exports.decode = decode;
