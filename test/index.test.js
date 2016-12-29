/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


const assert = require('assert');
const fsMonitor = require('../lib/index');

describe('fs-monitor', function () {

    it('install', function () {

        fsMonitor.install();

        let counter = 0;
        for (const name of Object.keys(require('fs'))) {
            if (name.startsWith('no-monitor-')) {
                counter += 1;
            }
        }
        assert.ok(counter > 0)
    });

    it('uninstall', function () {

        fsMonitor.uninstall();

        let counter = 0;
        for (const name of Object.keys(require('fs'))) {
            if (name.startsWith('no-monitor-')) {
                counter += 1;
            }
        }
        assert.ok(counter === 0)
    });

    it('measure', function () {

        fsMonitor.install();
        const data = require('fs').readFileSync(__filename);
        assert.ok(data);
        assert.ok(fsMonitor.events.length > 0);

        fsMonitor.uninstall();
    });

    it('measureAsync', function (done) {

        fsMonitor.install();
        const data = require('fs').readFile(__filename, function (err, data) {
            assert.ok(data);
            assert.ok(fsMonitor.events.length > 0);
            fsMonitor.uninstall();
            done();
        });
    });

    it('measureAsync, II', function (done) {
        const fs = require('fs');
        const origReadFile = fs.readFile;
        fs.readFile = function (path, delay, callback) {
            setTimeout(function () {
                origReadFile.call(fs, path, callback);
            }, delay)
        };
        fsMonitor.install();

        fs.readFile(__filename, 300, function (err, data) {
            assert.ok(data);


            assert.ok(fsMonitor.events.length > 0);

            const ticks = fsMonitor.processEvents(fsMonitor.events);
            assert.equal(ticks.length, 1);

            const [tick] = ticks;
            assert.equal(tick.name, 'readFile');
            assert.ok(tick.duration > 300);

            fsMonitor.uninstall();
            fs.readFile = origReadFile;
            done();
        })
    });

    it('measureAsync, parallel', function () {

        const fs = require('fs');
        const origReadFile = fs.readFile;
        fs.readFile = function (path, delay, callback) {
            setTimeout(function () {
                callback(undefined, String(delay))
            }, delay)
        };

        fsMonitor.install();

        return Promise.all([
            new Promise(resolve => fs.readFile(__filename, 1000, function (err, data) { resolve(data) })),
            new Promise(resolve => fs.readFile(__filename, 100, function (err, data) { resolve(data) })),
        ]).then(([a, b]) => {
            assert.ok(a, '1000');
            assert.ok(b, '100');

            const ticks = fsMonitor.processEvents(fsMonitor.events);
            assert.equal(ticks.length, 2);

            const [first, second] = ticks;
            assert.equal(first.name, 'readFile');
            assert.ok(first.duration >= 1000);
            assert.ok(second.duration >= 100 && second.duration < 1000);

            fsMonitor.uninstall();
            fs.readFile = origReadFile;

            // console.log(ticks);
        });
    });
});
