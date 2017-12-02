"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const renderer_1 = require("./renderer");
const database_1 = require("./database");
const ute = require("./utilities");
//Used int OpenGL context
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
    printDeepString() {
        let iView = new DataView(this.indexBuffer);
        let pView = new DataView(this.arrayBuffer);
        let debug = {};
        debug.numIndices = ute.numTo(this.numIndices);
        debug.byteIndices = ute.numTo(this.indexBuffer.byteLength);
        debug.numPoints = ute.numTo(this.numPoints);
        debug.byteArray = ute.numTo(this.arrayBuffer.byteLength);
        debug.indices = [];
        for (let i = 0; i < 30; i++) {
            debug.indices.push(ute.numTo(iView.getInt32(i * 4, true)));
        }
        debug.points = [];
        for (let i = 0; i < 27; i++) {
            debug.points.push(pView.getFloat32(i * 4, true));
        }
        console.log(`${JSON.stringify(debug, null, 3)}`);
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
        this.id = frameRecord.id;
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
            this.id = segmentationRecord.id;
            this.addFrames();
        }
    }
    attachUI(ui) {
        this.segmentationUI = ui;
    }
    addFrames() {
        database_1.DBIO.getInstance().queryByObject('get_seg_status', this.id.toString())
            .then(res => {
            res.forEach((row) => {
                this.frames.push(new Frame(this, row));
            });
        });
    }
    setActive(active) {
        if (this.active == active) {
            return;
        }
        this.checkFileBuffer();
        this.active = active;
        if (active) {
            //ping db to say this segmentation is active at the current frame.
            this.setCurrentFrame(this.channel.getCurrentFrame());
            //TODO before adding to pool is there anything to download? Do some checks
            this.channel.experiment.frameBuffer.xhrPool.addSegmentation(this);
        }
        else {
            database_1.DBIO.getInstance().queryByObject("deactivate_frame", this.id);
        }
    }
    delete() {
        this.setActive(false);
        database_1.DBIO.getInstance().queryByObject("delete_segmentation", this.id);
        this.channel.deleteSegmentation(this);
        if (this.segmentationUI) {
            this.segmentationUI.getChannelUI().deleteSegmentation(this);
        }
    }
    checkFileBuffer() {
        for (let frame of this.frames) {
            let cacheState = fs.existsSync(this.cachePath + "/" + frame.filename);
            if (cacheState) {
                frame.bufferState = "loaded" /* loaded */;
            }
            else {
                frame.bufferState = "empty" /* empty */;
            }
        }
    }
    setCurrentFrame(frame) {
        this.channel.setCurrentFrame(frame);
        database_1.DBIO.getInstance().queryByObject("activate_frame", this.id, frame);
    }
    getCurrentFrame() {
        return this.channel.getCurrentFrame();
    }
    // Get the next frame to load
    getNextFrame() {
        for (let i = this.channel.getCurrentFrame(); i < this.frames.length; i++) {
            let frame = this.frames[i];
            if ((frame.bufferState === "empty" /* empty */) && (frame.status == "complete")) {
                frame.bufferState = "loading" /* loading */;
                return frame;
            }
        }
        for (let i = this.channel.getCurrentFrame() - 1; i >= 0; i--) {
            let frame = this.frames[i];
            if ((frame.bufferState === "empty" /* empty */) && (frame.status == "complete")) {
                frame.bufferState = "loading" /* loading */;
                return frame;
            }
        }
        return null;
    }
    processDBMessage(message) {
        let frameID = message.segmentation_frame_id;
        this.frames.forEach(f => {
            if (f.id == frameID) {
                f.status = message.status;
                f.bufferState = "empty" /* empty */;
                if (this.segmentationUI) {
                    this.segmentationUI.fireChange(f);
                    if (this.active) {
                        this.channel.experiment.frameBuffer.xhrPool.addSegmentation(this);
                    }
                }
            }
        });
    }
    toString() {
        return JSON.stringify({ value: this.value, frames: this.frames.length }, null, 3);
    }
}
exports.Segmentation = Segmentation;
class Channel {
    constructor(experiment, channelRecord) {
        this.currentFrame = 0;
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
    setCurrentFrame(f) {
        this.currentFrame = f;
    }
    getCurrentFrame() {
        return this.currentFrame;
    }
    addNewSegmentation(segmentationRecord) {
        let segmentation = new Segmentation(this, segmentationRecord);
        this.segmentation.push(segmentation);
        return segmentation;
    }
    deleteSegmentation(s) {
        let i = this.segmentation.indexOf(s);
        if (i > -1) {
            console.log(`Deleting segmentation ${this.segmentation[i].toString()}`);
            this.segmentation.splice(i, 1);
        }
    }
    deactivateOthers(s) {
        this.segmentation.forEach(sl => {
            if (s != sl) {
                sl.setActive(false);
            }
        });
    }
    processDBMessage(message) {
        console.log(`db message: ${JSON.stringify(message)}`);
        let segmentationID = message.segmentation_id;
        if (message.status == 'deleted') {
            console.log(`we are deleting`);
        }
        this.segmentation.forEach(s => {
            if (s.id == segmentationID) {
                s.processDBMessage(message);
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
    processDBMessage(message) {
        let messageObj = JSON.parse(message);
        let channelId = messageObj.channel_id;
        this.channels.forEach(c => {
            if (c.id == channelId) {
                c.processDBMessage(messageObj);
            }
        });
    }
}
exports.Experiment = Experiment;
class XHRLoader {
    constructor(xrhPool) {
        this.xhrPool = xrhPool;
        this.req = new XMLHttpRequest();
        this.req.responseType = "arraybuffer";
        this.req.onload = () => {
            //TODO check status here...
            let inBuffer = this.req.response;
            if (inBuffer) {
                this.frame.bufferState = "loaded" /* loaded */;
                fs.writeFileSync(this.xhrPool.cachePath + "/" + this.frame.filename, Buffer.from(inBuffer));
                let ui = this.frame.segmentation.segmentationUI;
                if (ui) {
                    ui.fireChange(this.frame);
                }
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
        this.loaders.push(loader);
        this.processQueue();
    }
}
//# sourceMappingURL=frame-buffer.js.map