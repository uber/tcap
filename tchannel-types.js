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

module.exports.FrameType = {
	'InitReq': 0x01,
	'InitRes': 0x02,
	'CallReq': 0x03,
	'CallRes': 0x04,
	'CallReqContinue': 0x13,
	'CallResContinue': 0x14,
	'Cancel': 0xc0,
	'Claim': 0xc1,
	'PingReq': 0xd0,
	'PingRes': 0xd1,
	'Error': 0xff
};

var frameNameByType = [];
frameNameByType[0x01] = 'init request';
frameNameByType[0x02] = 'init response';
frameNameByType[0x03] = 'call request';
frameNameByType[0x04] = 'call response';
frameNameByType[0x13] = 'request continue';
frameNameByType[0x14] = 'response continue';
frameNameByType[0xc0] = 'cancel';
frameNameByType[0xc1] = 'claim';
frameNameByType[0xd0] = 'ping request';
frameNameByType[0xd1] = 'ping response';
frameNameByType[0xff] = 'error';
module.exports.FrameNameByType = frameNameByType;

module.exports.ErrorType = {
	'Invalid': 0x00,
	'Timeout': 0x01,
	'Cancelled': 0x02,
	'Busy': 0x03,
	'Declined': 0x04,
	'UnexpectedError': 0x05,
	'BadRequest': 0x06,
	'NetworkError': 0x07,
	'FatalProtocolError': 0xff
};

var errorNameByType = [];
errorNameByType[0x00] = 'Invalid';
errorNameByType[0x01] = 'Timeout';
errorNameByType[0x02] = 'Cancelled';
errorNameByType[0x03] = 'Busy';
errorNameByType[0x04] = 'Declined';
errorNameByType[0x05] = 'UnexpectedError';
errorNameByType[0x06] = 'BadRequest';
errorNameByType[0x07] = 'NetworkError';
errorNameByType[0xff] = 'FatalProtocolError';
module.exports.ErrorNameByType = errorNameByType;

module.exports.ResponseType = {
	'Ok': 0x00,
	'NotOk': 0x01
};

var responseNameByType = [];
responseNameByType[0x00] = 'Ok';
responseNameByType[0x01] = 'NotOk';
module.exports.ResponseNameByType = responseNameByType;
