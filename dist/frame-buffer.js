"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const renderer_1 = require("./renderer");
const database_1 = require("./database");
//Used for OpenGL context
class BufferPack {
    constructor(frameNumber, fileName) {
        this.numPoints = 0;
        this.numIndices = 0;
        this.b = [];
        this.frameNumber = frameNumber;
        this.nextBufferPack = null;
        this.fileName = fileName;
        this.state = "empty" /* empty */;
    }
    setNextBufferPack(bufferPack) {
        this.nextBufferPack = bufferPack;
    }
    loadBufferPack() {
        let buffer = fs.readFileSync(`${renderer_1.cachePath}/${this.fileName}`);
        this.setArrayBuffer(buffer.buffer);
    }
    setArrayBuffer(inputBuffer) {
        this.arrayBuffer = inputBuffer;
        let dView = new DataView(this.arrayBuffer);
        this.numPoints = dView.getInt32(0, true);
        this.numIndices = dView.getInt32(4, true);
        for (let i = 0; i < 6; i++) {
            this.b.push(dView.getFloat64(8 + (i * 8), true));
        }
        this.xMag = this.b[1] - this.b[0];
        this.yMag = this.b[3] - this.b[2];
        this.zMag = this.b[5] - this.b[4];
        var startIndices = 56 + (4 * this.numPoints * 3 * 2);
        //TODO: Don't use slice... present whole buffer to WebGL
        this.indexBuffer = this.arrayBuffer.slice(startIndices);
        this.arrayBuffer = this.arrayBuffer.slice(56, 56 + (4 * this.numPoints * 3 * 2));
        this.state = "loaded" /* loaded */;
        console.log(`buffer: ${this.toString()}`);
    }
    getSize() {
        if (!this.arrayBuffer) {
            return 0;
        }
        return this.arrayBuffer.byteLength + this.indexBuffer.byteLength;
    }
    clearBuffer() {
        const size = this.getSize();
        this.arrayBuffer = null;
        this.indexBuffer = null;
        this.state = "empty" /* empty */;
        return size;
    }
    toString() {
        return `bufferPack ${this.frameNumber}: ${this.state} [${this.xMag},${this.yMag},${this.zMag}] ${this.numIndices}`;
    }
}
exports.BufferPack = BufferPack;
class Frame {
    constructor(segmentation, frameRecord) {
        this.bufferState = "empty" /* empty */; // State in local app.
        this.segmentation = segmentation;
        this.msec = frameRecord.msec;
        this.filename = frameRecord.filename;
        this.status = frameRecord.status;
    }
    getFilePath() {
        return this.filename;
    }
    setBuffer() {
    }
    mapGlobalState(state) {
        switch (state) {
            case 'queued': return "void" /* Void */;
            case 'processing': return "processing" /* Processing */;
            case 'complete': return "complete" /* Complete */;
            default: return "void" /* Void */;
        }
    }
}
exports.Frame = Frame;
class FrameBuffer {
    constructor(cachePath, db) {
        this.experiments = new Map();
        this.db = db;
        this.cachePath = cachePath;
        this.xhrPool = new XHRPool(5, cachePath);
        try {
            fs.mkdirSync(cachePath);
        }
        catch (e) {
        }
    }
    addExperiment(record) {
        this.experiments.set(record.directory, new Experiment(record, this));
    }
    // Set active experiment on tree is click
    setActiveExperiment(record) {
        let experiment = this.experiments.get(record.directory);
        this.currentExperiment = experiment;
        return experiment;
    }
    syncSegmentation(segmentation) {
        this.db.queryByObject('seg_status')
            .then(res => {
            console.log(`${JSON.stringify(res, null, 3)}`);
        });
    }
    print() {
        if (this.experiments) {
            console.log('frame buffer:');
            this.experiments.forEach((v, k) => { console.log(`${k} : ${v.directory} ${v.frames}`); });
        }
        else {
            console.log('empty frame buffer');
        }
    }
}
exports.FrameBuffer = FrameBuffer;
class Segmentation {
    constructor(channel, segmentationRecord) {
        this.frames = [];
        this.active = false; // active in timeBar
        this.currentFrame = 0;
        this.channel = channel;
        this.value = segmentationRecord.value;
        this.cachePath = channel.experiment.frameBuffer.cachePath;
        if (!segmentationRecord.id) {
            database_1.DBIO.getInstance().queryByObject('enqueue_segmentation_job', this.channel.id, this.value)
                .then(res => {
                segmentationRecord.id = res[0].v_segmentation_id;
                this.id = segmentationRecord.id;
                this.addFrames();
            });
        }
        else {
            console.log(`loading seg data...`);
            this.id = segmentationRecord.id;
            this.addFrames();
        }
    }
    addFrames() {
        database_1.DBIO.getInstance().queryByObject('get_seg_status', this.id.toString())
            .then(res => {
            res.forEach((row) => {
                this.frames.push(new Frame(this, row));
            });
        });
    }
    // Active in timebar should be determined in timebar attached.
    setActive(active) {
        this.active = active;
        if (active) {
            this.setCurrentFrame(this.currentFrame);
        }
        else {
            database_1.DBIO.getInstance().queryByObject("deactivate_frame", this.id);
        }
        this.channel.experiment.frameBuffer.xhrPool.addSegmentation(this);
        this.checkFileBuffer();
    }
    checkFileBuffer() {
        let timeIt = performance.now();
        for (let frame of this.frames) {
            let cacheState = fs.existsSync(this.cachePath + "/" + frame.filename);
            if (cacheState) {
                frame.bufferState = "loaded" /* loaded */;
            }
        }
        timeIt = performance.now() - timeIt;
    }
    setCurrentFrame(frame) {
        this.currentFrame = frame;
        database_1.DBIO.getInstance().queryByObject("activate_frame", this.id, this.currentFrame);
    }
    // Get the next frame to load
    getNextFrame() {
        for (let i = this.currentFrame; i < this.frames.length; i++) {
            let frame = this.frames[i];
            if (frame.bufferState === "empty" /* empty */) {
                frame.bufferState = "loading" /* loading */;
                return frame;
            }
        }
        for (let i = this.currentFrame - 1; i >= 0; i--) {
            let frame = this.frames[i];
            if (frame.bufferState === "empty" /* empty */) {
                frame.bufferState = "loading" /* loading */;
                return frame;
            }
        }
        return null;
    }
    toString() {
        return JSON.stringify({ value: this.value, frames: this.frames.length }, null, 3);
    }
}
exports.Segmentation = Segmentation;
class Channel {
    constructor(experiment, channelRecord) {
        this.segmentation = [];
        this.experiment = experiment;
        this.id = channelRecord.id;
        this.name = channelRecord.name;
        this.channelNumber = channelRecord.channel_number;
        if (channelRecord.segvalues) {
            channelRecord.segvalues.forEach(s => {
                this.segmentation.push(new Segmentation(this, s));
            });
        }
    }
    addNewSegmentation(segmentationRecord) {
        let segmentation = new Segmentation(this, segmentationRecord);
        this.segmentation.push(segmentation);
        return segmentation;
    }
    deactivateOthers(s) {
        this.segmentation.forEach(sl => {
            if (s != sl) {
                sl.setActive(false);
            }
        });
    }
}
exports.Channel = Channel;
class Experiment {
    constructor(experimentRecord, frameBuffer) {
        this.frameBuffer = frameBuffer;
        this.channels = [];
        this.directory = experimentRecord.directory;
        this.frames = experimentRecord.frames;
        if (experimentRecord.channels) {
            experimentRecord.channels.forEach(c => {
                this.channels.push(new Channel(this, c));
            });
        }
    }
}
exports.Experiment = Experiment;
class XHRLoader {
    constructor(xrhPool) {
        this.xhrPool = xrhPool;
        this.req = new XMLHttpRequest();
        this.req.responseType = "arraybuffer";
        this.req.onload = () => {
            let inBuffer = this.req.response;
            if (inBuffer) {
                this.frame.bufferState = "loaded" /* loaded */;
                fs.writeFileSync(this.xhrPool.cachePath + "/" + this.frame.filename, Buffer.from(inBuffer));
                //this.frame.segmentation.refreshTimeBar();
            }
            this.xhrPool.returnLoader(this);
        };
    }
    load(frame) {
        const address = `http://phoebe.rcc.uq.edu.au:1337/${frame.filename}`;
        this.frame = frame;
        this.req.open("GET", address, true);
        this.req.send();
    }
}
class XHRPool {
    constructor(numLoaders, cachePath) {
        this.loaders = [];
        this.requestQueue = [];
        this.cachePath = cachePath;
        for (let i = 0; i < numLoaders; i++) {
            this.loaders.push(new XHRLoader(this));
        }
    }
    addSegmentation(request) {
        // add segmentation to front of queue
        // (moves it to front if already in queue and not already in front).
        const i = this.requestQueue.indexOf(request);
        if (i > 0) {
            this.requestQueue.splice(i, 1);
        }
        if (i != 0) {
            this.requestQueue.unshift(request);
        }
        this.processQueue();
    }
    processQueue() {
        //put in logic to delete stuff from the queue when completed.
        if (this.requestQueue.length === 0) {
            return;
        }
        let nextFrame = this.requestQueue[0].getNextFrame();
        if (!nextFrame) {
            return;
        }
        let loader = this.loaders.pop();
        if (!loader) {
            return;
        }
        loader.load(nextFrame);
    }
    returnLoader(loader) {
        console.log(`loader returned: ${loader.frame.filename}`);
        this.loaders.push(loader);
        this.processQueue();
    }
}
//# sourceMappingURL=frame-buffer.js.map