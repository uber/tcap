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
/*global console*/
/*eslint no-console:0 max-statements: [1, 30]*/

'use strict';
var assert = require('assert');

//
// TODO
// 1. handle the conflicts between filters
// 2. add filter on arg2 and arg3
// 3. add option to allow customizing the sizes of arg2 and arg3 being shown
//
var TChannelFrame = require('tchannel/v2/index');
var FrameTypes = TChannelFrame.Types;


function inclusiveValidate(filters, filterName) {
    var inclusive;
    var exclusive;
    for (var i = 0; i < filters.length; i++) {
        var name = filters[i];
        if (name.indexOf('~') === 0) {
            exclusive = true;
        } else {
            inclusive = true;
        }

        assert(!exclusive || !inclusive, filterName + ' cannot have a mix of inclusives and exclusives');
    }

    return inclusive;
}

module.exports = TChannelFrameFilters;
function TChannelFrameFilters() {
    var self = this;

    self.filters = {};
    self.filters.serviceName = new ServicerNameFilter();
    self.filters.arg1 = new Arg1Filter();
    self.filters.arg1Matcher = new Arg1Matcher();
    self.filters.response = new ResponseFilter();

    self.usedFilters = [];
}

TChannelFrameFilters.prototype.register = function register(name, filter) {
    var self = this;

    var handler = self.filters[name];
    if (!handler) {
        return;
    }

    if (handler.take(filter)) {
        self.usedFilters.push(handler);
    }
};

TChannelFrameFilters.prototype.apply = function apply(handle, frame) {
    var self = this;

    if ((!frame || !frame.body || !frame.body.type) &&
        self.usedFilters.length > 0) {
        return false;
    }

    return self.usedFilters.every(
        function applyFilter(handler) {
            return handler.process(handle, frame);
        });
};

TChannelFrameFilters.prototype.count = function count() {
    var self = this;
    return self.usedFilters.length;
};

function shouldRemove(frame) {
    if ((frame.body.type === FrameTypes.CallResponse) ||
        (frame.body.type === FrameTypes.CallResponseCont && !frame.flag)) {
        return true;
    }

    return false;
}

//
// the filter on service name
//
function ServicerNameFilter() {}

ServicerNameFilter.prototype.take = function take(filter) {
    var self = this;

    if (!filter || !filter.length) {
        return false;
    } else {
        self.serviceNames = filter;

        // validate
        self.inclusive = inclusiveValidate(self.serviceNames, 'Service name filters');
        return true;
    }
};

ServicerNameFilter.prototype.process = function process(handle, frame) {
    var self = this;
    var inclusive = !!self.inclusive;
    var serviceName = frame.body.service;
    if (serviceName && !inclusive) {
        serviceName = '~' + serviceName;
    }

    if (!handle.serviceName) {
        handle.serviceName = {};
    }

    var ids = handle.serviceName;
    if (!serviceName) {
        if (!ids[frame.id]) {
            return !inclusive;
        }

        if (shouldRemove(frame)) {
            delete ids[frame.id];
        }

        return inclusive;
    }

    if (self.serviceNames.indexOf(serviceName) < 0) {
        return !inclusive;
    }

    ids[frame.id] = true;

    return inclusive;
};

//
// the filter on arg1
//
function Arg1Filter() {}

Arg1Filter.prototype.take = function take(filter) {
    var self = this;

    if (!filter || !filter.length) {
        return false;
    } else {
        self.arg1Methods = {};
        self.inclusive = inclusiveValidate(filter, 'Arg1 filters');
        filter.forEach(function arr2obj(name) {
            self.arg1Methods[name] = true;
        });

        return true;
    }
};

Arg1Filter.prototype.process = function process(handle, frame) {
    var self = this;
    var inclusive = !!self.inclusive;

    // arg1 only applies to the following types
    if (frame.body.type !== FrameTypes.CallRequest &&
        frame.body.type !== FrameTypes.CallResponse &&
        frame.body.type !== FrameTypes.CallRequestCont &&
        frame.body.type !== FrameTypes.CallResponseCont) {
        return !inclusive;
    }

    if (!handle.arg1) {
        handle.arg1 = {};
    }

    if (!frame.body.args) {
        // filter out frames not related
        return !inclusive;
    }

    var ids = handle.arg1;
    if (ids[frame.id]) {
        if (shouldRemove(frame)) {
            delete ids[frame.id];
        }

        return inclusive;
    }

    var name = frame.body.args[0];
    if (!inclusive) {
        name = '~' + name;
    }

    if (!self.arg1Methods[name]) {
        return !inclusive;
    }

    ids[frame.id] = true;

    return inclusive;
};

//
// the filter on responses
//
function ResponseFilter() {}

ResponseFilter.prototype.take = function take(filter) {
    var self = this;

    if (!filter || !filter.length) {
        return false;
    } else {
        self.responseStatuses = filter;
        return true;
    }
};

ResponseFilter.prototype.process = function process(handle, frame) {
    var self = this;
    if (!handle.responses) {
        handle.responses = [];
    }

    // we only track pairs starting with CallRequest for now.
    // we may need to consider other requests for error scenarios.
    if (frame.body.type === FrameTypes.CallRequest) {
        handle.responses[frame.id] = [];
    } else if (!handle.responses[frame.id]) {
        return false;
    }

    // push the frame into the array if it is a request or cont.
    if (frame.body.type === FrameTypes.CallRequest ||
        frame.body.type === FrameTypes.CallRequestCont ||
        frame.body.flag) {
        handle.responses[frame.id].push(
            handle.sessionTracker.handleFrameNoFilter(frame));

        return false;
    }

    // if the status is tracked
    if (!self.responseStatuses[frame.body.type] &&
        !(frame.body.code == null || self.responseStatuses[frame.body.code])) {
        delete handle.responses[frame.id];
        return false;
    }

    // print frames
    handle.responses[frame.id] = handle.responses[frame.id] || [];
    handle.responses[frame.id].forEach(function log(str) {
        console.log(str);
    });

    // return true for the last frame to be printed
    return true;
};

//
// the pair matcher on arg1
//
function Arg1Matcher() {}

Arg1Matcher.prototype.take = function take(filter) {
    if (!filter) {
        return false;
    }

    return true;
};

// should alway return true, since this isn't a filter
Arg1Matcher.prototype.process = function process(handle, frame) {
    // arg1 only applies to the following types
    if (frame.body.type !== FrameTypes.CallRequest &&
        frame.body.type !== FrameTypes.CallResponse &&
        frame.body.type !== FrameTypes.CallRequestCont &&
        frame.body.type !== FrameTypes.CallResponseCont) {
        return true;
    }

    if (!handle.arg1Matcher) {
        handle.arg1Matcher = {};
    }

    if (!frame.body.args) {
        return true;
    }

    var ids = handle.arg1Matcher;
    if (ids[frame.id]) {
        frame.body.args[0] = ids[frame.id];
        if (shouldRemove(frame)) {
            delete ids[frame.id];
        }

        return true;
    }

    ids[frame.id] = frame.body.args[0];

    return true;
};
