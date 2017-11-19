"use strict";
//TODO this should be an import
///<reference path='./tsm-0.7.d.ts' />
Object.defineProperty(exports, "__esModule", { value: true });
const gl_context_1 = require("./gl-context");
const frame_buffer_1 = require("./frame-buffer");
const colorString = require("color-string");
const $ = require("jquery");
/*
/ When moving the scene in the xy plane; account for the depth of field and perspective projection
/ so that the object moves at the same rate as the mouse cursor located on the zero plane.
*/
class PerspectiveDrag {
    constructor(x, y) {
        this.canvasDimension = new TSM.vec2();
        this.setScreenDimension(x, y);
    }
    setScreenDimension(x, y) {
        this.canvasDimension.xy = [x, y];
    }
    setClickVector(x, y) {
        this.perspectiveClick = new TSM.vec2([x, y]);
    }
    getIncDrag(x, y) {
        let perspectiveDrag = new TSM.vec3([x - this.perspectiveClick.x, -(y - this.perspectiveClick.y), 0]);
        this.perspectiveClick.xy = [x, y];
        return perspectiveDrag;
    }
    scaleToDepth(x, y) {
    }
}
class ArcBall {
    constructor(x, y) {
        this.centre = new TSM.vec2();
        this.radiusSquared = 0;
        this.sphereClick = new TSM.vec3();
        this.sphereDrag = new TSM.vec3();
        this.axis = new TSM.vec3();
        this.setScreenDimension(x, y);
    }
    setScreenDimension(x, y) {
        x /= 2.0;
        y /= 2.0;
        this.centre.x = x;
        this.centre.y = y;
        this.radiusSquared = (x > y) ? x : y;
        this.radiusSquared *= this.radiusSquared;
    }
    setClickVector(x, y) {
        let centreClick = new TSM.vec2([x, y]);
        centreClick.subtract(this.centre);
        this.sphereClick = this.mapToSphere(centreClick);
    }
    getIncDragRotation(x, y) {
        let centreDrag = new TSM.vec2([x, y]);
        centreDrag.subtract(this.centre);
        this.sphereDrag = this.mapToSphere(centreDrag);
        if (this.sphereClick.equals(this.sphereDrag)) {
            return TSM.quat.identity.copy();
        }
        let angle = this.angle(this.sphereClick, this.sphereDrag);
        this.axis = TSM.vec3.cross(this.sphereClick, this.sphereDrag);
        this.axis.normalize();
        let rotation = TSM.quat.fromAxis(this.axis, angle);
        this.sphereClick = this.sphereDrag.copy();
        return rotation;
    }
    mapToSphere(screenVector) {
        let sphereVector = new TSM.vec3;
        sphereVector.x = screenVector.x;
        sphereVector.y = -screenVector.y;
        sphereVector.z = 0.0;
        let l = screenVector.squaredLength();
        if (l < this.radiusSquared) {
            sphereVector.z = Math.sqrt(this.radiusSquared - l);
        }
        sphereVector.normalize();
        return sphereVector;
    }
    angle(v1, v2) {
        let cos = this.angleCos(v1, v2);
        cos = Math.min(cos, 1.0);
        cos = Math.max(cos, -1.0);
        return Math.acos(cos);
    }
    angleCos(v1, v2) {
        let l1 = v1.length();
        let l2 = v2.length();
        let d = TSM.vec3.dot(v1, v2);
        d = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        return d / (l1 * l2);
    }
}
class MouseManager {
    constructor(canvas, glContext, glMatrix) {
        this.lsData = glMatrix;
        this.canvas = canvas;
        this.xOffset = this.canvas.offsetLeft;
        this.yOffset = this.canvas.offsetTop;
        this.mouseDown = false;
        this.arcBall = new ArcBall(canvas.width, canvas.height);
        this.perspectiveDrag = new PerspectiveDrag(canvas.width, canvas.height);
        this.glContext = glContext;
        canvas.onmousedown = (e) => {
            canvas.focus();
            e.preventDefault(); //TODO: is this necessary? Check out proper way to implement canvas mouse behaviour.
            let x = e.pageX - this.xOffset;
            let y = e.pageY - this.yOffset;
            this.mouseDown = true;
            this.arcBall.setClickVector(x, y);
            this.perspectiveDrag.setClickVector(x, y);
            return false;
        };
        canvas.onmouseup = (e) => {
            this.mouseDown = false;
        };
        canvas.onmouseleave = (e) => {
            this.mouseDown = false;
            this.shiftDown = false;
        };
        canvas.onmousemove = (e) => {
            if (this.mouseDown) {
                e.preventDefault();
                let x = e.pageX - this.xOffset;
                let y = e.pageY - this.yOffset;
                let rot = this.arcBall.getIncDragRotation(x, y);
                let drag = this.perspectiveDrag.getIncDrag(x, y);
                if (this.shiftDown) {
                    this.lsData.incRotation(rot);
                }
                else {
                    this.lsData.incTranslationXY(drag);
                }
                this.glContext.drawScene();
            }
            return false;
        };
        canvas.onkeydown = (e) => {
            this.shiftDown = true;
        };
        canvas.onkeyup = (e) => {
            this.shiftDown = false;
        };
        canvas.onwheel = (e) => {
            this.lsData.incTranslationZ(new TSM.vec3([0, 0, e.wheelDelta]));
            this.glContext.drawScene();
        };
    }
}
exports.MouseManager = MouseManager;
//TODO pass in DocElements to get state information for pause and slider. Currently relying on global from GLContext.ts
class TimeKeep {
    constructor(drawScene) {
        //this.docElements = docElements;
        //this.slider = docElements.getTimeRange();
        //this.animState = docElements.getAnimState();
        //this.drawScene = drawScene;
        //this.slider.oninput = () =>
        //{
        //    this.frame = +this.slider.value;
        //    //drawScene(frame);
        //}
        //this.slider.onmousedown = () =>
        //{
        //    this.pause = true;
        //}
        //this.slider.onmouseup = () =>
        //{
        //    this.pause = false;
        //}
    }
}
class TimeBar {
    constructor() {
        this.frameCount = 0;
        this.segmentationRecords = []; // This needs to be a set
        this.normalisedValue = 0.0;
        this.mouseDown = false;
        this.colourLookup = new ColourLookup();
        this.canvas = document.createElement("canvas");
        this.canvas.setAttribute("class", "time-bar");
        this.context = this.canvas.getContext("2d");
        this.context = this.canvas.getContext("2d");
        this.canvas.onmousedown = (e) => { this.mouseClick(e); };
        this.canvas.onmousemove = (e) => { this.mouseMove(e); };
        this.canvas.onmouseup = (e) => { this.mouseDown = false; };
        this.canvas.onmouseleave = (e) => { this.mouseDown = false; };
        this.canvas.onkeydown = (e) => { console.log(`key: ${e.key}`); };
        window.addEventListener("resize", () => { this.resize(); });
        this.resize();
        let dynamicDiv = $("#timebars");
        let barDiv = $("<div>").addClass("time-bar-div");
        barDiv.append(this.canvas);
        dynamicDiv.append(barDiv);
    }
    setFrameCount(frameCount) {
        this.frameCount = frameCount;
        this.dataSize = this.frameCount - 1;
        this.resize();
    }
    activateSegmentation(segmentation) {
        this.segmentationRecords.push(segmentation);
        this.defaultSegmentation = segmentation;
        this.setFrameCount(segmentation.channel.experiment.frames);
    }
    deactivateSegmentation(segmentation) {
        this.defaultSegmentation = null;
        this.frameCount = 0;
        let i = this.segmentationRecords.indexOf(segmentation);
        if (i > -1) {
            this.segmentationRecords.splice(i, 1);
        }
        this.resize();
    }
    reset() {
        this.defaultSegmentation = null;
        this.frameCount = 0;
        this.segmentationRecords = [];
        this.resize();
    }
    mouseClick(e) {
        if (this.frameCount == 0) {
            return;
        }
        this.mouseDown = true;
        const x = e.offsetX;
        if (x <= this.railMin) {
            this.normalisedValue = 0.0;
        }
        else if (x >= this.railMax) {
            this.normalisedValue = 1.0;
        }
        else {
            this.normalisedValue = (x - this.railMin) / this.railMax;
        }
        const newValue = Math.floor(this.normalisedValue * this.dataSize);
        if (this.currentValue !== newValue) {
            this.currentValue = newValue;
            $("#frame").text(this.currentValue);
            if (this.defaultSegmentation) {
                // process selected frame on timebar move
                $("#frame-status").text(this.defaultSegmentation.frames[this.currentValue].status);
                this.defaultSegmentation.setCurrentFrame(this.currentValue);
                console.log(`frame ${this.currentValue} : ${this.defaultSegmentation.frames[this.currentValue].bufferState} : ${this.defaultSegmentation.frames[this.currentValue].filename}`);
                let bufferPack = new frame_buffer_1.BufferPack(this.currentValue, this.defaultSegmentation.frames[this.currentValue].filename);
                bufferPack.loadBufferPack();
                //buffer stuff
                let glContext = new gl_context_1.GLContext(bufferPack);
            }
        }
        this.draw();
    }
    mouseMove(e) {
        if (this.mouseDown) {
            this.mouseClick(e);
        }
    }
    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.railPad = this.canvas.height / 2.0; // pad set to radius of circle for now.
        this.railMin = this.railPad;
        this.railMax = this.canvas.width - this.railPad;
        this.railRange = this.canvas.width - (2 * this.railPad);
        this.railFrameWidth = this.railRange / this.dataSize;
        this.draw();
    }
    draw(xPos) {
        let centreX = this.railPad + (this.normalisedValue * this.railRange);
        if (xPos) {
            centreX = this.railPad + (xPos * this.railRange);
        }
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.defaultSegmentation) {
            this.drawBox();
            this.context.beginPath();
            this.context.arc(centreX, this.railPad, this.railPad, 0, 2 * Math.PI, false);
            this.context.fillStyle = this.colourLookup.getHexColour(".time-bar-cursor");
            this.context.fill();
            this.context.lineWidth = 2;
            this.context.strokeStyle = "#003300";
            this.context.stroke();
        }
    }
    drawBox() {
        for (let i = 0; i < this.dataSize; i++) {
            const status = this.defaultSegmentation.frames[i].status;
            const bufferState = this.defaultSegmentation.frames[i].bufferState;
            let colour = "#e0e0d1";
            switch (status) {
                case 'queued': {
                    colour = "#6699ff";
                    break;
                }
                case 'processing': {
                    colour = "#ff6600";
                    break;
                }
                case 'complete': {
                    colour = "#009900";
                    break;
                }
            }
            switch (bufferState) {
                case "empty" /* empty */: {
                    colour = this.colourLookup.getHexColour(".time-bar-uncached");
                    break;
                }
                case "loaded" /* loaded */: {
                    colour = this.colourLookup.getHexColour(".time-bar-cached");
                    break;
                }
            }
            const x = (i * this.railFrameWidth) + this.railMin;
            const y = 0;
            const width = this.railFrameWidth;
            const height = this.canvas.height;
            this.context.fillStyle = colour;
            this.context.fillRect(x, y, width, height);
        }
    }
}
exports.TimeBar = TimeBar;
class ColourLookup {
    constructor() {
        this.cp = this.colourPalate();
        this.getStyleSheetProperties();
    }
    getHexColour(selector) {
        let c = this.cp.get(selector);
        c[3] = 1;
        return colorString.to.hex(c);
    }
    colourPalate() {
        let cp = new Map();
        cp.set(".time-bar-uncached", colorString.get.rgb("maroon"));
        cp.set(".time-bar-cached", colorString.get.rgb("dodgerblue"));
        cp.set(".time-bar-cursor", colorString.get.rgb("red"));
        return cp;
    }
    getStyleSheetProperties() {
        let ssl = document.styleSheets;
        for (let i = 0; i < ssl.length; i++) {
            if (ssl.item(i).title === "application") {
                let css = ssl.item(i);
                let rules = css.rules;
                for (let j = 0; j < rules.length; j++) {
                    let rule = rules.item(j);
                    if (this.cp.get(rule.selectorText)) {
                        if (rule.style["color"]) {
                            this.cp.set(rule.selectorText, colorString.get.rgb(rule.style["color"]));
                        }
                    }
                }
                break;
            }
        }
    }
}
//# sourceMappingURL=event-managers.js.map