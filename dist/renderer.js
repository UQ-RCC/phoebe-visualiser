"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("../config.json");
const navControl = require("./nav-elements");
const ute = require("./utilities");
const db = require("./database");
const event_managers_1 = require("./event-managers");
const gl_context_1 = require("./gl-context");
const frame_buffer_1 = require("./frame-buffer");
const $ = require("jquery");
let ioPool = new ute.IOPool(5, ute.DummyGetter);
let dbIO = db.DBIO.getInstance();
let dir = '20151201_Stow/TimeLapse1_minusLPS_Rab13JF646/matlab_decon/raw_files';
let treeQuery = 'tree';
exports.cachePath = config.cache;
$(document).ready(() => {
    console.log(`Electron Version: ${process.versions.electron}`);
    popTree();
    navControl.createNavigator();
    db.DBIO.getInstance().dbListen();
});
function popTree() {
    dbIO.getTree(exports.cachePath).then(data => {
        let setController = new SetController(data.frameBuffer);
        $("#nav-tree").jstree({
            "core": {
                "multiple": false,
                "animation": false,
                "themes": {
                    "dots": false
                },
                "data": data.tree
            },
            "plugins": ["types"],
            "types": {
                "default": {
                    "icon": "fa fa-file fa-fw"
                },
                "f-open": {
                    "icon": "fa fa-folder-open fa-fw"
                },
                "f-closed": {
                    "icon": "fa fa-folder fa-fw"
                }
            }
        });
        $("#nav-tree").on("changed.jstree", (e, data) => {
            const entry = data.instance.get_node(data.selected[0]).original;
            if (entry.hasOwnProperty("record")) {
                const record = entry.record;
                setController.setExperiment(record);
            }
        });
        $("#nav-tree").on("open_node.jstree", (event, data) => {
            data.instance.set_type(data.node, "f-open");
        });
        $("#nav-tree").on("close_node.jstree", (event, data) => {
            data.instance.set_type(data.node, "f-closed");
        });
        $("#nav-tree").on("select_node.jstree", (e, data) => {
            data.instance.toggle_node(data.node);
        });
    });
}
class SegmentationUI {
    constructor(s, c) {
        //DOM elements
        this.segSpan = $("<span>").addClass("segmentation-properties");
        this.channelUI = c;
        this.segmentation = s;
        this.segSpan.text(this.segmentation.value);
        this.segSpan.click(() => {
            this.segSpan.toggleClass("segmentation-properties-on");
            if (this.segSpan.hasClass("segmentation-properties-on")) {
                this.setActive(true);
            }
            else {
                this.setActive(false);
            }
        });
        s.attachUI(this);
    }
    setActive(a) {
        this.active = a;
        if (this.active) {
            this.segSpan.addClass("segmentation-properties-on");
            this.segmentation.setActive(true);
            this.channelUI.segmentationActivated(this.segmentation, true);
        }
        else {
            this.segSpan.removeClass("segmentation-properties-on");
            this.segmentation.setActive(false);
            this.channelUI.segmentationActivated(this.segmentation, false);
        }
    }
    getSegmentationDiv() {
        return this.segSpan;
    }
    getSegmentation() {
        return this.segmentation;
    }
    fireChange(frame) {
        if (this.active) {
            this.channelUI.getSetController().getDefaultTimeBar().resize();
            this.channelUI.getSetController().getDefaultTimeBar().displayCurrentFrame();
        }
    }
}
exports.SegmentationUI = SegmentationUI;
class ChannelUI {
    constructor(c, sc) {
        // DOM elements
        this.channelDiv = $(`<div>`).addClass("channel");
        this.segSpan = $(`<span>`);
        this.segAddButton = $(`<i>`).addClass("fa fa-plus-circle");
        this.segLabelSpan = $(`<span>`);
        this.segInput = $(`<input type="number">`).addClass("seg-input-value");
        this.segValuesSpan = $("<span>"); //.data("channel", channel.name).data("directory", record.directory);
        this.segmentationUI = [];
        this.setController = sc;
        this.channel = c;
        this.segSpan.attr('channel', this.channel.name);
        this.segLabelSpan.append(" " + this.channel.name + " ");
        this.segInput.width(0).hide();
        this.segInput.focusout(() => { this.segInput.hide().width(0); });
        this.segInput.keypress((event) => {
            if (event.which === 13) {
                if (this.segInput.val().length > 0) {
                    let segmentation = this.channel.addNewSegmentation({ id: null, value: this.segInput.val() });
                    this.addSegmentation(segmentation);
                }
                this.segInput.hide().width(0);
            }
        });
        this.segAddButton.click(() => {
            this.segInput.show();
            this.segInput.animate({ "width": "50px" }, "fast");
            this.segInput.focus();
        });
        this.segSpan.append(this.segAddButton); //TODO fluent this up
        this.segSpan.append(this.segLabelSpan);
        this.segSpan.append(this.segInput);
        this.segSpan.append(this.segValuesSpan);
        this.channelDiv.append(this.segSpan);
        this.channel.segmentation.forEach(s => {
            this.addSegmentation(s);
        });
    }
    getSetController() {
        return this.setController;
    }
    getChannelDiv() {
        return this.channelDiv;
    }
    addSegmentation(s) {
        console.log(`ChannelUI added segmentation ${s.value}`);
        let segUI = new SegmentationUI(s, this);
        this.addSegmentationUI(segUI);
    }
    addSegmentationUI(ui) {
        this.segmentationUI.push(ui);
        this.segValuesSpan.append(ui.getSegmentationDiv());
    }
    deactivateOther(s) {
        this.segmentationUI.forEach(sl => {
            if (s !== sl.getSegmentation()) {
                sl.setActive(false);
            }
        });
    }
    segmentationActivated(s, a) {
        if (a) {
            this.deactivateOther(s);
        }
        this.setController.segmentationActivated(s, a);
    }
}
class SetController {
    constructor(frameBuffer) {
        this.channelUIs = [];
        this.defaultTimeBar = new event_managers_1.TimeBar();
        this.frameBuffer = frameBuffer;
    }
    getDefaultTimeBar() {
        return this.defaultTimeBar;
    }
    // Set experiment from tree click event
    setExperiment(record) {
        //TODO clear up existing segmentations...
        this.defaultTimeBar.reset();
        let experiment = this.frameBuffer.setActiveExperiment(record);
        this.frames = experiment.frames;
        $("#frames").text(`${this.frames}`);
        let channels = experiment.channels;
        $(".channel").remove();
        let channelListDiv = $("#channel-info");
        //TODO clean up old channelUIs (keeps growing).
        experiment.channels.forEach(channel => {
            let channelUI = new ChannelUI(channel, this);
            this.channelUIs.push(channelUI);
            channelListDiv.append(channelUI.getChannelDiv());
        });
        gl_context_1.GLContext.getInstance().reinitialiseGLMatrix();
        gl_context_1.GLContext.getInstance().clear();
    }
    segmentationActivated(s, a) {
        if (a) {
            this.defaultTimeBar.activateSegmentation(s);
        }
        else {
            this.defaultTimeBar.deactivateSegmentation(s);
        }
    }
}
class FrameController {
    constructor(directory, fileNames) {
        this.currentFrame = 0;
        this.size = 0;
        this.frames = [];
        // timeBar: TimeBar;
        this.localCacheSize = 0;
        this.windowWidth = 30;
        this.maxBufferSize = (1024 ^ 3);
        this.size = Object.keys(fileNames).length;
        for (let i = 0; i < this.size; i++) {
            const record = fileNames[i]; //TODO this required no implicit any fix it.
            const bufferPack = new frame_buffer_1.BufferPack(i, directory + "/" + record.file_name);
            if (i > 1) {
                this.frames[i - 1].setNextBufferPack(bufferPack);
            }
            this.frames.push(bufferPack);
        }
        this.setFrame(0);
        // this.timeBar = new TimeBar(this);
    }
    reset() {
        for (let i = 0; i < this.size; i++) {
            console.log(`resetting frame ${i}`);
            this.frames[i].clearBuffer();
        }
    }
    setFrame(newFrame) {
        const bufferPack = this.frames[newFrame];
        loadWindow(bufferPack, 10, this);
        if (bufferPack.state === "loaded" /* loaded */) {
            console.log(`pre draw scene`);
            this.glContext.drawScene("FrameController::setFrame");
            console.log(`post draw scene`);
        }
        this.currentFrame = newFrame;
    }
    fileLoaded(bufferPack) {
        this.localCacheSize += bufferPack.getSize();
        // this.timeBar.draw();
        if (!this.glContext) {
            this.glContext = gl_context_1.GLContext.getInstance();
        }
        if (this.currentFrame === bufferPack.frameNumber) {
            this.glContext.drawScene("FrameController::fileLoaded"); //TODO perhaps pass the buffer pack itself in
        }
    }
    getFileName(index) {
        return this.frames[index].fileName;
    }
    isLoaded(index) {
        return (this.frames[index].state === "loaded" /* loaded */);
    }
    getState(index) {
        return (this.frames[index].state);
    }
    setState(index, state) {
        this.frames[index].state = state;
    }
    getCurrentBufferPack() {
        return this.frames[this.currentFrame];
    }
    clearFurthestFrom(frame) {
        let minFrame = frame;
        for (let i = 0; ((i <= frame) && (minFrame === frame)); i++) {
            if (this.frames[i].state === "loaded" /* loaded */) {
                minFrame = i;
            }
        }
        let maxFrame = frame;
        for (let i = this.size - 1; ((i >= frame) && (maxFrame === frame)); i--) {
            if (this.frames[i].state === "loaded" /* loaded */) {
                maxFrame = i;
            }
        }
        if ((minFrame === maxFrame) && (maxFrame === frame)) {
            //That's odd? We have a singularity
            return;
        }
        if ((frame - minFrame) >= (maxFrame - frame)) {
            this.localCacheSize -= this.frames[minFrame].clearBuffer();
        }
        else {
            this.localCacheSize -= this.frames[maxFrame].clearBuffer();
        }
    }
    getLocalCacheSize() {
        return this.localCacheSize;
    }
}
exports.FrameController = FrameController;
function loadWindow(bufferPack, remainingFrames, frameController) {
    const maxBufferSize = (1024 ** 3) * 3;
    if ((bufferPack === null) || (remainingFrames === 0)) {
        return;
    }
    // If a loader is already working on this one go to the next bufferpack.
    if ((bufferPack.state === "loaded" /* loaded */) || (bufferPack.state === "loading" /* loading */)) {
        loadWindow(bufferPack.nextBufferPack, remainingFrames - 1, frameController);
        return;
    }
    bufferPack.state = "loading" /* loading */;
    const oReq = new XMLHttpRequest();
    oReq.open("GET", bufferPack.fileName, true);
    oReq.responseType = "arraybuffer";
    oReq.onload = () => {
        // Check if this didn't get loaded in other process anyway
        if (bufferPack.state === "loaded" /* loaded */) {
            return;
        }
        const arrayBuffer = oReq.response;
        if (arrayBuffer) {
            while (frameController.getLocalCacheSize() > maxBufferSize) {
                frameController.clearFurthestFrom(bufferPack.frameNumber);
            }
            bufferPack.setArrayBuffer(arrayBuffer);
            frameController.fileLoaded(bufferPack);
            loadWindow(bufferPack.nextBufferPack, remainingFrames - 1, frameController);
        }
    };
    oReq.send();
}
//# sourceMappingURL=renderer.js.map