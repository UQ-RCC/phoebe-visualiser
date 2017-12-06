"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const glm = require("gl-matrix");
const gl_context_1 = require("./gl-context");
const frame_buffer_1 = require("./frame-buffer");
const ute = require("./utilities");
const colorString = require("color-string");
const $ = require("jquery");
/*
/ When moving the scene in the xy plane; account for the depth of field and perspective projection
/ so that the object moves at the same rate as the mouse cursor located on the zero plane.
*/
class PerspectiveDrag {
    constructor(x, y) {
        this.canvasDimension = glm.vec2.create();
        this.setScreenDimension(x, y);
    }
    setScreenDimension(x, y) {
        //this.canvasDimension.xy = [x, y];        
        glm.vec2.set(this.canvasDimension, x, y);
    }
    setClickVector(x, y) {
        this.perspectiveClick = glm.vec2.fromValues(x, y);
    }
    getIncDrag(x, y) {
        let perspectiveDrag = glm.vec3.fromValues(x - this.perspectiveClick[0], -(y - this.perspectiveClick[1]), 0);
        glm.vec2.set(this.perspectiveClick, x, y);
        return perspectiveDrag;
    }
    scaleToDepth(x, y) {
    }
}
class ArcBall {
    constructor(x, y) {
        this.canvas = $("#canvas").get(0);
        this.centre = glm.vec2.create();
        this.radiusSquared = 0;
        this.sphereClick = glm.vec3.create();
        this.sphereDrag = glm.vec3.create();
        this.axis = glm.vec3.create();
        this.setScreenDimension(x, y);
        window.addEventListener("resize", () => {
            this.setScreenDimension(this.canvas.clientWidth, this.canvas.clientHeight);
        });
    }
    setScreenDimension(x, y) {
        x /= 2.0;
        y /= 2.0;
        this.centre[0] = x;
        this.centre[1] = y;
        this.radiusSquared = (x > y) ? x : y;
        this.radiusSquared *= this.radiusSquared;
    }
    setClickVector(x, y) {
        let centreClick = glm.vec2.fromValues(x, y);
        glm.vec2.subtract(centreClick, centreClick, this.centre);
        this.sphereClick = this.mapToSphere(centreClick);
    }
    getIncDragRotation(x, y) {
        let centreDrag = glm.vec2.fromValues(x, y);
        glm.vec2.subtract(centreDrag, centreDrag, this.centre);
        this.sphereDrag = this.mapToSphere(centreDrag);
        if (glm.vec3.equals(this.sphereClick, this.sphereDrag)) {
            return glm.quat.create();
        }
        let angle = this.angle(this.sphereClick, this.sphereDrag);
        glm.vec3.cross(this.axis, this.sphereClick, this.sphereDrag);
        glm.vec3.normalize(this.axis, this.axis);
        let rotation = glm.quat.setAxisAngle(glm.quat.create(), this.axis, angle);
        this.sphereClick = glm.vec3.clone(this.sphereDrag);
        return rotation;
    }
    mapToSphere(screenVector) {
        let sphereVector = glm.vec3.create();
        sphereVector[0] = screenVector[0];
        sphereVector[1] = -screenVector[1];
        sphereVector[2] = 0.0;
        let l = glm.vec2.squaredLength(screenVector);
        if (l < this.radiusSquared) {
            sphereVector[2] = Math.sqrt(this.radiusSquared - l);
        }
        glm.vec3.normalize(sphereVector, sphereVector);
        return sphereVector;
    }
    angle(v1, v2) {
        let cos = this.angleCos(v1, v2);
        cos = Math.min(cos, 1.0);
        cos = Math.max(cos, -1.0);
        return Math.acos(cos);
    }
    angleCos(v1, v2) {
        let l1 = glm.vec3.length(v1);
        let l2 = glm.vec3.length(v2);
        let d = glm.vec3.dot(v1, v2);
        d = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
        return d / (l1 * l2);
    }
}
class MouseManager {
    constructor(canvas, glContext, glMatrix, lightVec) {
        this.glMatrix = glMatrix;
        this.lightVector = lightVec;
        this.canvas = canvas;
        this.mouseDown = false;
        this.lightControl = false;
        this.arcBall = new ArcBall(canvas.width, canvas.height);
        this.lightBall = new ArcBall(canvas.width, canvas.height);
        this.perspectiveDrag = new PerspectiveDrag(canvas.width, canvas.height);
        this.glContext = glContext;
        $("#debug-lvec").text(ute.prettyVec3(this.lightVector.getLightVector()));
        canvas.onmousedown = (e) => {
            canvas.focus();
            e.preventDefault(); //TODO: is this necessary? Check out proper way to implement canvas mouse behaviour.
            let x = e.pageX - this.canvas.offsetLeft;
            let y = e.pageY - this.canvas.offsetTop;
            $("#debug-aoffset-mouse").text(`${this.canvas.offsetLeft},${this.canvas.offsetTop}`);
            $("#debug-raw-mouse").text(`${e.pageX},${e.pageY}`);
            $("#debug-mouse").text(`${x},${y}`);
            this.mouseDown = true;
            this.arcBall.setClickVector(x, y);
            this.perspectiveDrag.setClickVector(x, y);
            return false;
        };
        $("#global-app").keydown((e) => {
            let c = String.fromCharCode(e.which);
            switch (c) {
                case "R":
                    this.glContext.resetScene();
                    $("#debug-lvec").text(`${ute.prettyVec3(this.lightVector.getLightVector())}`);
                    break;
                case "L":
                    if (e.shiftKey) {
                        this.lightVector.reset();
                        this.glContext.drawScene("MouseManager::keydown");
                        this.lightControl = false;
                    }
                    else {
                        this.lightControl = true;
                    }
                    break;
            }
        });
        $("#global-app").keyup(() => {
            this.lightControl = false;
        });
        canvas.onmouseup = (e) => {
            this.mouseDown = false;
        };
        canvas.onmouseleave = (e) => {
            this.mouseDown = false;
        };
        canvas.onmousemove = (e) => {
            if (this.mouseDown) {
                e.preventDefault();
                let x = e.pageX - this.canvas.offsetLeft;
                let y = e.pageY - this.canvas.offsetTop;
                $("#debug-mouse").text(`${x},${y}`);
                let rot = this.arcBall.getIncDragRotation(x, y);
                let lightRot = this.arcBall.getIncDragRotation(x, y);
                let drag = this.perspectiveDrag.getIncDrag(x, y);
                if (e.shiftKey) {
                    this.glMatrix.incRotation(rot);
                }
                else if (this.lightControl) {
                    this.lightVector.incRotation(rot);
                    $("#debug-lvec").text(`${ute.prettyVec3(this.lightVector.getLightVector())}`);
                }
                else {
                    this.glMatrix.incTranslationXY(drag);
                }
                this.glContext.drawScene("MouseManager::onmousemove");
            }
            return false;
        };
        canvas.onwheel = (e) => {
            let factor = e.shiftKey ? 20 : 2;
            this.glMatrix.incTranslationZ(glm.vec3.fromValues(0, 0, e.wheelDelta / factor));
            this.glContext.drawScene("MouseManager::onwheel");
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
        this.currentValue = segmentation.channel.getCurrentFrame();
        this.displayCurrentFrame();
        this.setFrameCount(segmentation.channel.experiment.frames);
        this.resize();
    }
    deactivateSegmentation(segmentation) {
        this.defaultSegmentation = null;
        this.frameCount = 0;
        let i = this.segmentationRecords.indexOf(segmentation);
        if (i > -1) {
            this.segmentationRecords.splice(i, 1);
        }
        gl_context_1.GLContext.getInstance().clear();
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
                this.displayCurrentFrame();
            }
        }
        this.draw();
    }
    mouseMove(e) {
        if (this.mouseDown) {
            this.mouseClick(e);
        }
    }
    displayCurrentFrame() {
        let frame = this.defaultSegmentation.frames[this.currentValue];
        if (frame.bufferState == "loaded" /* loaded */) {
            let bufferPack = new frame_buffer_1.BufferPack(this.currentValue, frame.filename);
            bufferPack.loadBufferPack();
            gl_context_1.GLContext.getInstance().setBufferPack(bufferPack);
        }
        else {
            gl_context_1.GLContext.getInstance().setBufferPack(null);
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
                    colour = this.colourLookup.getHexColour(".time-bar-queued");
                    break;
                }
                case 'processing': {
                    colour = this.colourLookup.getHexColour(".time-bar-processing");
                    break;
                }
                case 'complete': {
                    colour = "#009900";
                    break;
                }
            }
            if (status == 'complete') {
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
        cp.set(".time-bar-processing", colorString.get.rgb("red"));
        cp.set(".time-bar-queued", colorString.get.rgb("red"));
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