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

var assert = require('assert');
var Buffer = require('buffer').Buffer;

function ReadBuffer(buf) {
    assert(buf instanceof Buffer);
    this.buf = buf;
    this.begin = 0;
}

ReadBuffer.prototype.ensure = function ensure(size) {
    if (this.begin + size > this.buf.length) {
        throw new Error('insufficient buffer', {
            size: size,
            remaining: this.buf.length - this.begin
        });
    }
};

ReadBuffer.prototype.readByte = function readByte() {
    var data = this.buf.readInt8(this.begin);
    this.begin++;
    return data;
};

ReadBuffer.prototype.readI16 = function readI16() {
    var data = this.buf.readInt16BE(this.begin);
    this.begin += 2;
    return data;
};

ReadBuffer.prototype.readI32 = function readI32() {
    var data = this.buf.readInt32BE(this.begin);
    this.begin += 4;
    return data;
};

ReadBuffer.prototype.readDouble = function readDouble() {
    var data = this.buf.readDoubleBE(this.begin);
    this.begin += 8;
    return data;
};

ReadBuffer.prototype.readString = function readString(size) {
    assert(typeof size === 'number');
    this.ensure(size);

    var data = this.buf.slice(this.begin, this.begin + size);
    this.begin += size;
    return data;
};

ReadBuffer.prototype.eom = function eom() {
    return this.begin === this.buf.length;
};

module.exports.ReadBuffer = ReadBuffer;
