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

var ReadBuffer = require('./transport').ReadBuffer;

var TYPE = {
    STOP: 0,
    VOID: 1,
    BOOL: 2,
    BYTE: 3,
    DOUBLE: 4,
    I16: 6,
    I32: 8,
    I64: 10,
    STRING: 11,
    STRUCT: 12,
    MAP: 13,
    SET: 14,
    LIST: 15
};

function readString(reader) {
    var size = reader.readI32();
    return reader.readString(size).toString('utf8');
}

function readMap(reader) {
    var result = {};
    var ktypeid = reader.readByte();
    var vtypeid = reader.readByte();
    var size = reader.readI32();
    for (var i = 0; i < size; i++) {
        var key = read(reader, ktypeid);
        var val = read(reader, vtypeid);
        result[key] = val;
    }
    return result;
}

function readList(reader) {
    var result = [];
    var etypeid = reader.readByte();
    var size = reader.readI32();
    for (var i = 0; i < size; i++) {
        var ele = read(reader, etypeid);
        result.push(ele);
    }
    return result;
}

function readStruct(reader) {
    /* eslint no-constant-condition:[0] */
    var result = {};
    while (true) {
        var ftypeid = reader.readByte();
        if (ftypeid === TYPE.STOP) {
            return result;
        }
        var fid = reader.readI16();
        var field = read(reader, ftypeid);
        result[fid] = field;
    }
    return result;
}

function read(reader, typeid) {
    /* eslint complexity:[2, 20] */
    switch (typeid) {
        case TYPE.BOOL:
        case TYPE.BYTE:
            return reader.readByte();
        case TYPE.I16:
            return reader.readI16();
        case TYPE.I32:
            return reader.readI32();
        case TYPE.I64:
            return reader.readString(8);
        case TYPE.DOUBLE:
            return reader.readDouble();
        case TYPE.STRING:
            return readString(reader);
        case TYPE.STRUCT:
            return readStruct(reader);
        case TYPE.MAP:
            return readMap(reader);
        case TYPE.LIST:
        case TYPE.SET:
            return readList(reader);
        default:
            throw new Error('invalid type', {typeid: typeid});
    }
}

function decode(buf) {
    var reader = new ReadBuffer(buf);
    var struct = read(reader, TYPE.STRUCT);
    if (!reader.eom()) {
        throw new Error('more data after struct stops');
    }
    return struct;
}

module.exports.read = read;
module.exports.decode = decode;
