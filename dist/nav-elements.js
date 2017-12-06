"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const $ = require("jquery");
class NavController {
    constructor() {
        this.fileEvent = new ChooseFile(this);
        this.cameraEvent = new ScreenShot(this);
        this.videoEvent = new Video(this);
        this.processEvent = new Process(this);
        this.resizeables = [];
        $("#file-button").click(() => this.fileEvent.toggle());
        $("#camera-button").click(() => this.cameraEvent.toggle());
        $("#movie-button").click(() => this.videoEvent.toggle());
        $("#process-button").click(() => this.processEvent.toggle());
    }
    static getInstance() {
        if (!this.singletonNavController) {
            this.singletonNavController = new NavController();
        }
        return this.singletonNavController;
    }
    activateElement(newElement) {
        if (this.currentElement) {
            this.currentElement.off();
        }
        this.currentElement = newElement;
    }
    deactivateElement(element) {
        if (this.currentElement === element) {
            this.currentElement = null;
        }
        else {
            throw new Error("NavController state is messed up");
        }
    }
    addResizable(resizable) {
        this.resizeables.push(resizable);
        console.log(`added a resizable to NavController`);
    }
    resizeResizables() {
        this.resizeables.forEach(r => {
            r.resize("NavController::Event");
        });
    }
}
exports.NavController = NavController;
class NavElement {
    constructor(controller) {
        this.selected = false;
        this.controller = controller;
    }
    on() {
        this.selected = true;
        this.controller.activateElement(this);
        this.processOn();
        this.controller.resizeResizables();
    }
    off() {
        this.selected = false;
        this.controller.deactivateElement(this);
        this.processOff();
        this.controller.resizeResizables();
    }
    toggle() {
        if (this.selected) {
            this.off();
        }
        else {
            this.on();
        }
    }
}
exports.NavElement = NavElement;
class ChooseFile extends NavElement {
    processOn() {
        $("#file-button").addClass("ap-icon-selected");
        //$("#file-selector").animate({ "max-width": "100%", "padding-right": "15px" }, "fast");
        $("#file-selector").animate({
            "max-width": "350px",
            "min-width": "250px",
            "padding-right": "15px"
        }, { "step": (() => { this.controller.resizeResizables(); }),
            "duration": "fast" });
    }
    processOff() {
        $("#file-button").removeClass("ap-icon-selected");
        $("#file-selector").animate({
            "max-width": "0px",
            "min-width": "0px",
            "padding-right": "0px"
        }, { "step": (() => { this.controller.resizeResizables(); }),
            "duration": "fast" });
    }
}
exports.ChooseFile = ChooseFile;
class ScreenShot extends NavElement {
    processOn() {
        $("#camera-button").addClass("ap-icon-selected");
    }
    processOff() {
        $("#camera-button").removeClass("ap-icon-selected");
    }
}
exports.ScreenShot = ScreenShot;
class Video extends NavElement {
    processOn() {
        $("#movie-button").addClass("ap-icon-selected");
    }
    processOff() {
        $("#movie-button").removeClass("ap-icon-selected");
    }
}
exports.Video = Video;
class Process extends NavElement {
    processOn() {
        $("#process-button").addClass("ap-icon-selected");
        $("#process").animate({
            "max-width": "100%",
            "padding-right": "15px"
        }, { "step": (() => { this.controller.resizeResizables(); }),
            "duration": "fast" });
    }
    processOff() {
        $("#process-button").removeClass("ap-icon-selected");
        $("#process").animate({
            "max-width": "0px",
            "padding-right": "0px"
        }, { "step": (() => { this.controller.resizeResizables(); }),
            "duration": "fast" });
    }
}
exports.Process = Process;
//# sourceMappingURL=nav-elements.js.map