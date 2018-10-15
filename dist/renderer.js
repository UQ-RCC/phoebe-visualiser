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
var miniColors = require("../node_modules/@claviska/jquery-minicolors/jquery.minicolors.js");
let ioPool = new ute.IOPool(5, ute.DummyGetter);
let dbIO;
let dir = '20151201_Stow/TimeLapse1_minusLPS_Rab13JF646/matlab_decon/raw_files';
let treeQuery = 'tree';
exports.cachePath = config.cache;
function login() {
    dbIO = db.DBIO.login($("#fname").val(), $("#pword").val());
    dbIO.login().then(() => {
        $("#menu-bar").hide();
        popTree();
        navControl.NavController.getInstance();
    }).catch((e) => {
        $("#db-login").hide();
        $("#db-reject").show();
    });
}
$(document).ready(() => {
    $("#fname").val("nickc");
    $("#pword").val("password");
    $("#ok-button").click(e => {
        login();
    });
    $("#fname, #pword").keypress(function (event) {
        if (event.which === 13) {
            login();
        }
    });
    $("#fail-button").click(e => { $("#db-login").show(); $("#db-reject").hide(); });
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
        this.segSpan.attr('tabindex', 1);
        this.segSpan.attr('value', s.value);
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
        this.segSpan.keydown((e) => {
            // Don't allow tab keys
            if (e.which = 9) {
                e.preventDefault();
            }
        });
        this.segSpan.keyup((e) => {
            console.log(`seg span : ${e.which}`);
            if (e.which == 46) {
                if (this.segmentation.isActive()) {
                    this.segmentation.delete();
                }
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
    getSegmentationSpan() {
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
    getChannelUI() {
        return this.channelUI;
    }
}
exports.SegmentationUI = SegmentationUI;
class ChannelUI {
    constructor(c, sc) {
        // DOM elements    
        this.segAddButton = $(`<i>`).addClass("fa fa-plus-circle");
        this.segLabelSpan = $(`<span>`);
        this.segInput = $(`<input type="number">`).addClass("seg-input-value");
        this.segValuesSpan = $("<span>");
        this.segColourButton = $(`<i>`).addClass("fa fa-circle");
        this.segColourSpan = $(`<span>`);
        this.channelRow = $('<tr>').addClass("channel-row");
        this.segmentationUI = [];
        this.setController = sc;
        this.channel = c;
        this.segLabelSpan.append(this.channel.name);
        this.segInput.width(0).hide();
        this.segInput.focusout(() => { this.segInput.hide().width(0); });
        this.segInput.keypress((event) => {
            if (event.which === 13) {
                if (this.segInput.val().length > 0) {
                    let newVal = this.segInput.val();
                    let i = this.segmentationUI.map(sui => sui.getSegmentation().value).indexOf(newVal);
                    if (i == -1) {
                        let segmentation = this.channel.addNewSegmentation({ id: null, value: this.segInput.val() });
                        this.addSegmentation(segmentation);
                    }
                    this.segInput.val("");
                }
                this.segInput.hide().width(0);
            }
        });
        this.segAddButton.click(() => {
            this.segInput.show();
            this.segInput.animate({ "width": "50px" }, "fast");
            this.segInput.focus();
        });
        this.segColourSpan.addClass(`channel-${c.channelNumber}`);
        switch (this.channel.channelNumber) {
            case 0:
                {
                    this.segColourSpan.val('rgb(191, 47, 47)');
                    break;
                }
                ;
            case 1: {
                this.segColourSpan.val('rgb(47, 217, 120)');
                break;
            }
            default: {
                this.segColourSpan.val('rgb(47, 47, 200)');
                break;
            }
        }
        this.segColourSpan.val(c.getColourRGB());
        this.channelRow
            .append($('<td>').addClass("channel-data").append(this.segAddButton))
            .append($('<td>').addClass("channel-data").append(this.segLabelSpan))
            .append($('<td>').addClass("channel-value-data").append(this.segInput).append(this.segValuesSpan))
            .append($('<td>').addClass("channel-data").append(this.segColourSpan));
        this.channel.segmentation.forEach(s => {
            this.addSegmentation(s);
        });
    }
    getSetController() {
        return this.setController;
    }
    getChannelRow() {
        return this.channelRow;
    }
    addSegmentation(s) {
        let segUI = new SegmentationUI(s, this);
        this.addSegmentationUI(segUI);
    }
    deleteSegmentation(s) {
        let i = this.segmentationUI.map(ui => ui.getSegmentation()).indexOf(s);
        if (i > -1) {
            this.segmentationUI[i].setActive(false);
            this.segmentationUI.splice(i, 1);
            this.segValuesSpan.children(`span[value='${s.value}']`).remove();
        }
    }
    addSegmentationUI(ui) {
        this.segmentationUI.push(ui);
        this.segmentationUI.sort((e1, e2) => { return e1.getSegmentation().value - e2.getSegmentation().value; });
        this.segmentationUI.forEach(e => { this.segValuesSpan.append(e.getSegmentationSpan()); });
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
class ExperimentUI {
    constructor(experiment, setController) {
        this.expTable = $('<table>');
        this.channelUIs = [];
        this.experiment = experiment;
        this.experiment.channels.forEach(c => {
            let channelUI = new ChannelUI(c, setController);
            this.expTable.append(channelUI.getChannelRow());
            this.channelUIs.push(channelUI);
        });
        $("#experiment-info").children().remove();
        $("#experiment-info").append(this.expTable);
        this.experiment.channels.forEach(c => {
            let num = c.channelNumber;
            $(`.channel-${num}`).minicolors({
                inline: false,
                control: 'hue',
                opacity: true,
                position: 'top right',
                format: 'rgb',
                change: (rgb, opacity) => {
                    c.setColour(rgb);
                },
                theme: 'default'
            });
        });
    }
}
class SetController {
    constructor(frameBuffer) {
        this.channelUIs = [];
        this.defaultTimeBar = new event_managers_1.TimeBar();
        this.frameBuffer = frameBuffer;
        db.DBIO.getInstance().dbListen(this);
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
            //let channelUI: ChannelUI = new ChannelUI(channel, this);
            //this.channelUIs.push(channelUI);
            //channelListDiv.append(channelUI.getChannelDiv());
        });
        this.experimentUI = new ExperimentUI(experiment, this);
        gl_context_1.GLContext.getInstance().reinitialiseGLMatrix();
        gl_context_1.GLContext.getInstance().clear();
        this.currentExperiment = experiment;
    }
    segmentationActivated(s, a) {
        if (a) {
            this.defaultTimeBar.activateSegmentation(s);
        }
        else {
            this.defaultTimeBar.deactivateSegmentation(s);
        }
    }
    processDBMessage(message) {
        if (this.currentExperiment) {
            this.currentExperiment.processDBMessage(message);
        }
    }
}
exports.SetController = SetController;
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
            this.glContext.drawScene("FrameController::setFrame");
        }
        this.currentFrame = newFrame;
    }
    fileLoaded(bufferPack) {
        this.localCacheSize += bufferPack.getSize();
        // this.timeBar.draw();
        if (!this.glContext) //TODO fix this is a kludge
         {
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