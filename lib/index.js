/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const assert = require('assert');
const {EventEmitter} = require('events');

let _installed = false;
let _emitter = new EventEmitter();
let _idPool = 0;
const _events = [];


exports.install = function () {
    if (!_installed) {
        for (const name of Object.keys(fs)) {
            const element = fs[name];
            if (typeof element === 'function') {
                wrapFunction(fs, name);
            }
        }
        _installed = true;
    }
}

exports.addEventListener = function (listener) {
    _emitter.addListener('events', listener);
}

let handle;
function _emitEvent() {
    clearTimeout(handle);
    handle = setTimeout(function () {
        _emitter.emit('events');
    }, 15);
}

exports.uninstall = function () {
    if (_installed) {
        for (const name of Object.keys(fs)) {
            if (name.startsWith('no-monitor-')) {
                fs[name.substr(11)] = fs[name];
                delete fs[name];
            }
        }
        _events.length = 0;
        _installed = false;
    }
};


exports.events = _events;

exports.processEvents = function (events) {
    assert.ok(Array.isArray(events));
    assert.ok(events.length % 3 === 0);

    const map = new Map();

    // match start & end ticks
    // compute event duration 
    for (let i = 0; i < events.length; i += 3) {
        const id = events[i];

        if (!map.has(id)) {
            map.set(id, {
                id,
                start: 1e9 * events[i + 1][0] + events[i + 1][1],
                name: events[i + 2][0],
                path: events[i + 2][1],
                children: []
            });
        } else {
            const data = map.get(id);
            data.end = 1e9 * events[i + 1][0] + events[i + 1][1];
            data.duration = (data.end - data.start) / 1e6;
        }
    }

    // sort by start
    const values = [...map.values()].sort((a, b) => {
        if (a.id < b.id) {
            return -1;
        } else if (a.id > b.id) {
            return 1;
        } else {
            return 0;
        }
    });

    return values;
}

exports.consumeEventsToConsole = function () {
    const values = exports.processEvents(exports.events);
    exports.events.length = 0;

    for (const value of values) {
        const indent = ['.', '.', '.', '.'];
        if (value.name.indexOf('Sync') >= 0) {
            indent[0] = '🚩';
            if (value.duration > 5) {
                indent[1] = '🐌';
            }
        } else if (value.duration > 10) {
            indent[0] = '⏱';
        }
        console.log(`${indent.join('')}\t${value.duration}ms: ${value.name}("${value.path}"...) [from:${value.start}, to:${value.end}]`);
    }
}

function t_callback(name, arguments) {

    const id = _idPool++;
    _events.push(id, process.hrtime(), [name, arguments[0]]);

    const origCallback = arguments[arguments.length - 1];

    arguments[arguments.length - 1] = function () {
        _events.push(id, process.hrtime(), undefined);
        _emitEvent();
        return origCallback.apply(undefined, arguments);
    }
}

function wrapFunction(fs, name) {

    const origFunction = fs[name];

    fs[`no-monitor-${name}`] = origFunction;

    fs[name] = function () {

        if (typeof arguments[arguments.length - 1] === 'function') {
            t_callback(name, arguments);
            return origFunction.apply(fs, arguments)

        } else {
            const id = _idPool++;
            _events.push(id, process.hrtime(), [name, arguments[0]]);
            try {
                return origFunction.apply(fs, arguments);
            } finally {
                _events.push(id, process.hrtime(), undefined);
                _emitEvent();
            }
        }
    }
}
