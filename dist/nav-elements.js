"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const $ = require("jquery");
function createNavigator() {
    const navController = new NavController();
    const fileEvent = new ChooseFile(navController);
    const cameraEvent = new ScreenShot(navController);
    const videoEvent = new Video(navController);
    const processEvent = new Process(navController);
    $("#file-button").click(() => fileEvent.toggle());
    $("#camera-button").click(() => cameraEvent.toggle());
    $("#movie-button").click(() => videoEvent.toggle());
    $("#process-button").click(() => processEvent.toggle());
}
exports.createNavigator = createNavigator;
class NavController {
    constructor() {
        this.resizeables = [];
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
    }
    resize() {
        this.resizeables.forEach(r => { r.resize(); });
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
    }
    off() {
        this.selected = false;
        this.controller.deactivateElement(this);
        this.processOff();
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
        $("#file-selector").animate({ "max-width": "350px", "min-width": "250px", "padding-right": "15px" }, "fast");
    }
    processOff() {
        $("#file-button").removeClass("ap-icon-selected");
        $("#file-selector").animate({ "max-width": "0px", "min-width": "0px", "padding-right": "0px" }, "fast");
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
        $("#process").animate({ "max-width": "100%", "padding-right": "15px" }, "fast");
    }
    processOff() {
        $("#process-button").removeClass("ap-icon-selected");
        $("#process").animate({ "max-width": "0px", "padding-right": "0px" }, "fast");
    }
}
exports.Process = Process;
//# sourceMappingURL=nav-elements.js.map