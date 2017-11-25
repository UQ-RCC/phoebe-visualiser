"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const numeral = require("numeral");
const request = require("request");
// Parse object and convert numeric properties to formatted MB strings
function numToMB(o) {
    if (typeof o == 'number') {
        return numeral(o / 1024 ** 2).format('0, 0.00') + 'MB';
    }
    if (Array.isArray(o)) {
        let out = [];
        o.map(v => out.push(numToMB(v)));
        return out;
    }
    else {
        let out = new Object();
        for (let p in o) {
            let pd = Object.getOwnPropertyDescriptor(o, p);
            if (typeof pd.value === 'number') {
                pd.value = numeral(pd.value / 1024 ** 2).format('0, 0.00') + 'MB';
            }
            Object.defineProperty(out, p, pd);
        }
        return out;
    }
}
exports.numToMB = numToMB;
function numTo(o) {
    if (typeof o == 'number') {
        return numeral(o).format('0,');
    }
    if (Array.isArray(o)) {
        let out = [];
        o.map(v => out.push(numToMB(v)));
        return out;
    }
    else {
        let out = new Object();
        for (let p in o) {
            let pd = Object.getOwnPropertyDescriptor(o, p);
            if (typeof pd.value === 'number') {
                pd.value = numeral(pd.value).format('0,');
            }
            Object.defineProperty(out, p, pd);
        }
        return out;
    }
}
exports.numTo = numTo;
class AbstractGetter {
    constructor(xhrPool, id) {
        this.ioPool = xhrPool;
        this.id = id;
    }
    getID() {
        return this.id;
    }
}
class RequestGetter extends AbstractGetter {
    getBuffer(key) {
        request({ url: this.key, encoding: null }, (error, response, body) => {
        });
    }
}
class DummyGetter extends AbstractGetter {
    constructor() {
        super(...arguments);
        this.bufferSize = (1024 ** 2) * 150;
    }
    getBuffer(key) {
        let sleep = Math.floor(Math.random() * 1000);
        setTimeout(() => {
            this.ioPool.addBuffer(Buffer.alloc(this.bufferSize), key);
            console.log(`${key}, ${sleep}, ${this.id}, ${os.freemem()}`);
            this.ioPool.returnHandler(this);
        }, sleep);
    }
}
exports.DummyGetter = DummyGetter;
class XHRArrayGetter extends AbstractGetter {
    constructor(ioPool, id) {
        super(ioPool, id);
        this.req = new XMLHttpRequest();
        this.req.responseType = "arraybuffer";
        this.req.onload = () => {
            let inBuffer = this.req.response;
            if (inBuffer) {
                // this.xhrPool.addBuffer(inBuffer.slice(0), this.key);
                inBuffer = null;
                ioPool.returnHandler(this);
            }
        };
    }
    getBuffer(key) {
        this.key = key;
        this.req.open("GET", key, true);
        this.req.send();
    }
}
class IOPool {
    constructor(handlers, handler) {
        this.maxSize = (1024 ** 3) * 3;
        this.handlerClass = handler;
        this.bufferMap = new Map();
        this.requests = [];
        this.handlers = [];
        this.totalByteLength = 0;
        for (let i = 0; i < handlers; i++) {
            this.handlers.push(this.create(this.handlerClass, i));
        }
    }
    create(c, id) {
        return new c(this, id);
    }
    addReqest(address) {
        this.requests.push(address);
        this.process();
    }
    process() {
        let handler = this.handlers.pop();
        if (handler) {
            let req = this.requests.shift();
            if (req) {
                handler.getBuffer(req);
            }
            else {
                this.handlers.push(handler);
            }
        }
    }
    getBufferMap() {
        return this.bufferMap;
    }
    returnHandler(handler) {
        let before = this.handlers.length;
        this.handlers.push(handler);
        this.process();
    }
    addBuffer(buffer, key) {
        if (buffer.byteLength + this.totalByteLength > this.maxSize) {
            //this.deleteRandomBuffers(buffer.byteLength);
        }
        this.totalByteLength += buffer.byteLength;
        this.bufferMap.set(key, buffer);
    }
    deleteRandomBuffers(size) {
        if (this.bufferMap.size > 0) {
            const index = Math.floor((Math.random() * this.bufferMap.size));
            const key = Array.from(this.bufferMap.keys())[index];
            size -= this.bufferMap.get(key).byteLength;
            this.totalByteLength -= this.bufferMap.get(key).byteLength;
            let ab = this.bufferMap.get(key);
            ab = null;
            this.bufferMap.delete(key);
            if (size > 0) {
                this.deleteRandomBuffers(size);
            }
        }
    }
}
exports.IOPool = IOPool;
function prettyVec3(v) {
    return `[${numeral(v[0]).format('0.000')}, ${numeral(v[1]).format('0.000')}, ${numeral(v[2]).format('0.000')}]`;
}
exports.prettyVec3 = prettyVec3;
//# sourceMappingURL=utilities.js.map