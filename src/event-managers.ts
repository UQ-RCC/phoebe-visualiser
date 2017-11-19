
//TODO this should be an import
///<reference path='./TSM/tsm-0.7.d.ts' />

// import * as async from "async";

import { FrameController } from "./renderer";
import { log } from "util";
import { GLMatrix, GLContext } from "./gl-context";
import { Frame, BufferState, GlobalStatus, BufferPack, Segmentation } from "./frame-buffer"
import * as colorString from "color-string";
import * as $ from "jquery";

export interface ChannelRecord
{
    directory: string;
    channel: number;
    segValue: number;
    frames: number
}

import * as fs from "fs";

/*
/ When moving the scene in the xy plane; account for the depth of field and perspective projection
/ so that the object moves at the same rate as the mouse cursor located on the zero plane.
*/
class PerspectiveDrag
{
    private canvasDimension: TSM.vec2;
    private perspectiveClick: TSM.vec2;
        
    constructor(x: number, y: number)
    {
        this.canvasDimension = new TSM.vec2();
        this.setScreenDimension(x, y);
    }
    
    public setScreenDimension(x: number, y: number): void
    {
        this.canvasDimension.xy = [x, y];        
    }

    public setClickVector(x: number, y: number): void
    {
        this.perspectiveClick = new TSM.vec2([x, y]);
    }

    public getIncDrag(x: number, y: number): TSM.vec3
    {
        let perspectiveDrag = new TSM.vec3([x - this.perspectiveClick.x, -(y - this.perspectiveClick.y), 0]);
        this.perspectiveClick.xy = [x, y];
        return perspectiveDrag;
    }

    private scaleToDepth(x: number, y: number): void
    {
    }
    
}

class ArcBall
{
    private centre: TSM.vec2;
    private radiusSquared: number;
    private sphereClick: TSM.vec3;
    private sphereDrag: TSM.vec3;
    private axis: TSM.vec3;
        
    constructor(x: number, y: number)
    {
        this.centre = new TSM.vec2();
        this.radiusSquared = 0;
        this.sphereClick = new TSM.vec3();
        this.sphereDrag = new TSM.vec3();
        this.axis = new TSM.vec3();        
        this.setScreenDimension(x, y);

    }

    public setScreenDimension(x: number, y: number): void
    {
        x /= 2.0;
        y /= 2.0;
        this.centre.x = x;
        this.centre.y = y;
        this.radiusSquared = (x > y) ? x : y;
        this.radiusSquared *= this.radiusSquared;
    }

    public setClickVector(x: number, y: number): void
    {        
        let centreClick = new TSM.vec2([x, y]);
        centreClick.subtract(this.centre);
        this.sphereClick = this.mapToSphere(centreClick);        
    }

    public getIncDragRotation(x: number, y: number): TSM.quat
    {
        let centreDrag = new TSM.vec2([x, y]);
        centreDrag.subtract(this.centre);
        this.sphereDrag = this.mapToSphere(centreDrag);
        
        if (this.sphereClick.equals(this.sphereDrag))
        {
            return TSM.quat.identity.copy();
        }

        let angle: number = this.angle(this.sphereClick, this.sphereDrag);        
        this.axis = TSM.vec3.cross(this.sphereClick, this.sphereDrag);
        this.axis.normalize();
        let rotation: TSM.quat = TSM.quat.fromAxis(this.axis, angle);                
        this.sphereClick = this.sphereDrag.copy();
        return rotation;
    }

    private mapToSphere(screenVector: TSM.vec2): TSM.vec3
    {
        let sphereVector: TSM.vec3 = new TSM.vec3;
        sphereVector.x = screenVector.x;
        sphereVector.y = -screenVector.y;
        sphereVector.z = 0.0;
        let l: number = screenVector.squaredLength();
        if (l < this.radiusSquared)
        {
            sphereVector.z = Math.sqrt(this.radiusSquared - l);
        }
        sphereVector.normalize();
        return sphereVector;
    }
    
    private angle(v1: TSM.vec3, v2: TSM.vec3): number
    {   
        let cos: number = this.angleCos(v1, v2);
        cos = Math.min(cos, 1.0);
        cos = Math.max(cos, -1.0);
        return Math.acos(cos);
    }

    private angleCos(v1: TSM.vec3, v2: TSM.vec3): number
    {
        let l1: number = v1.length();
        let l2: number = v2.length();
        let d: number = TSM.vec3.dot(v1, v2);
        d = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;        
        return d / (l1 * l2);
    }
    
}

export class MouseManager
{

    canvas: HTMLCanvasElement;
    lsData: GLMatrix;
    arcBall: ArcBall;
    perspectiveDrag: PerspectiveDrag;
    glContext: GLContext;
    xOffset: number;
    yOffset: number;
    mouseDown: Boolean;
    shiftDown: Boolean;
    
    constructor(canvas: HTMLCanvasElement, glContext: GLContext, glMatrix: GLMatrix)
    {
        this.lsData = glMatrix;
        this.canvas = canvas;        
        this.xOffset = this.canvas.offsetLeft;
        this.yOffset = this.canvas.offsetTop;        
        this.mouseDown = false;
        this.arcBall = new ArcBall(canvas.width, canvas.height);
        this.perspectiveDrag = new PerspectiveDrag(canvas.width, canvas.height);
        this.glContext = glContext;

        canvas.onmousedown = (e: MouseEvent) =>
        {
            canvas.focus();
            e.preventDefault(); //TODO: is this necessary? Check out proper way to implement canvas mouse behaviour.
            let x = e.pageX - this.xOffset;
            let y = e.pageY - this.yOffset;
            this.mouseDown = true;            
            this.arcBall.setClickVector(x, y);
            this.perspectiveDrag.setClickVector(x, y);            
            return false;
        }

        canvas.onmouseup = (e: MouseEvent) =>
        {
            this.mouseDown = false;            
        }

        canvas.onmouseleave = (e: MouseEvent) =>
        {
            this.mouseDown = false;           
            this.shiftDown = false; 
        }

        canvas.onmousemove = (e: MouseEvent) =>
        {
            if (this.mouseDown)
            {
                e.preventDefault();
                let x = e.pageX - this.xOffset;
                let y = e.pageY - this.yOffset;                
                let rot: TSM.quat = this.arcBall.getIncDragRotation(x, y);
                let drag: TSM.vec3 = this.perspectiveDrag.getIncDrag(x, y);
                if (this.shiftDown)
                {
                    this.lsData.incRotation(rot);
                }
                else
                {
                    this.lsData.incTranslationXY(drag);
                }
                this.glContext.drawScene();
            }
            return false;
        }

        canvas.onkeydown = (e: KeyboardEvent) =>
        {
            this.shiftDown = true;
        }

        canvas.onkeyup = (e: KeyboardEvent) =>
        {
            this.shiftDown = false;
        }

        canvas.onwheel = (e: WheelEvent) =>
        {
            this.lsData.incTranslationZ(new TSM.vec3([0, 0, e.wheelDelta]));
            this.glContext.drawScene();
        }
        
    }
}

//TODO pass in DocElements to get state information for pause and slider. Currently relying on global from GLContext.ts
class TimeKeep
{
    //readonly slider: HTMLInputElement;
    readonly animState: HTMLInputElement;
    readonly drawScene: Function;    
    private pause: boolean;
    private animStop: boolean;
    private frame: number; //TODO this needs to be shared with GLContext
    
    constructor(drawScene: Function)
    {
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

    //start()
    //{        
    //    setInterval(() =>
    //    {
    //        if (this.animStop)
    //        {
    //            return;
    //        }
    //        if (this.pause)
    //        {
    //            return;
    //        }
    //        let value = +this.slider.value;
    //        if (value === docElements.totalFrames - 1)
    //        {
    //            value = 0;
    //        }
    //        else
    //        {
    //            value++;
    //        }
    //        this.slider.value = value.toString();
    //        this.drawScene(value);  
    //    }, 200);
    //}
    
}

export class TimeBar {

    private frameCount: number = 0;
    private canvas: HTMLCanvasElement;    
    private segmentationRecords: Segmentation[] = []; // This needs to be a set
    private defaultSegmentation: Segmentation | null;
    
    readonly context: CanvasRenderingContext2D;    
    private normalisedValue: number = 0.0;
    private railMin: number;
    private railMax: number;
    private railRange: number;
    private railPad: number;
    private railFrameWidth: number;
    private mouseDown: boolean = false;
    private dataSize: number; // [0 - number of frames)
    private currentValue: number; //TODO change to currentFrame...

    private colorEmpty: string;
    private colorLoaded: string;
    private colourLookup: ColourLookup = new ColourLookup();
    
    constructor()
    {

        this.canvas = document.createElement("canvas");
        this.canvas.setAttribute("class", "time-bar");
        this.context = this.canvas.getContext("2d");
        this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
        this.canvas.onmousedown = (e: MouseEvent) => { this.mouseClick(e); };
        this.canvas.onmousemove = (e: MouseEvent) => { this.mouseMove(e); };
        this.canvas.onmouseup = (e: MouseEvent) => { this.mouseDown = false };
        this.canvas.onmouseleave = (e: MouseEvent) => { this.mouseDown = false };
        this.canvas.onkeydown = (e: KeyboardEvent) => { console.log(`key: ${e.key}`) };
        
        window.addEventListener("resize", () => { this.resize(); });
        this.resize();
        
        let dynamicDiv: JQuery = $("#timebars");
        let barDiv: JQuery = $("<div>").addClass("time-bar-div");
        barDiv.append(this.canvas);
        dynamicDiv.append(barDiv);

        
    }

    setFrameCount(frameCount: number): void
    {
        this.frameCount = frameCount;        
        this.dataSize = this.frameCount - 1;
        this.resize();
    }

    activateSegmentation(segmentation: Segmentation): void
    {         
        this.segmentationRecords.push(segmentation);
        this.defaultSegmentation = segmentation;
        this.setFrameCount(segmentation.channel.experiment.frames);
    }

    deactivateSegmentation(segmentation: Segmentation): void
    {
        this.defaultSegmentation = null;
        this.frameCount = 0;
        let i = this.segmentationRecords.indexOf(segmentation);
        if (i > -1)
        {
            this.segmentationRecords.splice(i, 1);
        }
        this.resize();
    }

    reset()
    {
        this.defaultSegmentation = null;
        this.frameCount = 0;
        this.segmentationRecords = [];
        this.resize();
    }

    private mouseClick(e: MouseEvent)
    {        
        if (this.frameCount == 0)
        {
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
        else
        {
            this.normalisedValue = (x - this.railMin) / this.railMax;
        }
        const newValue: number = Math.floor(this.normalisedValue * this.dataSize);
        if (this.currentValue !== newValue) {
            this.currentValue = newValue;            
            $("#frame").text(this.currentValue);            
            if (this.defaultSegmentation)
            {
                // process selected frame on timebar move
                $("#frame-status").text(this.defaultSegmentation.frames[this.currentValue].status);
                this.defaultSegmentation.setCurrentFrame(this.currentValue);
                console.log(`frame ${this.currentValue} : ${this.defaultSegmentation.frames[this.currentValue].bufferState} : ${this.defaultSegmentation.frames[this.currentValue].filename}`);
                let bufferPack: BufferPack = new BufferPack(this.currentValue, this.defaultSegmentation.frames[this.currentValue].filename);
                bufferPack.loadBufferPack();                
                let glContext: GLContext = new GLContext(bufferPack);
            }
        }
        this.draw();
    }

    private mouseMove(e: MouseEvent) {
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

    draw(xPos?: number) {        
        let centreX: number = this.railPad + (this.normalisedValue * this.railRange);
        if (xPos)
        {
            centreX = this.railPad + (xPos * this.railRange);
        }
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.defaultSegmentation)
        {
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

    private drawBox(): void
    {
        
        for (let i: number = 0; i < this.dataSize; i++)
        {
            const status: string = this.defaultSegmentation.frames[i].status;
            const bufferState: BufferState = this.defaultSegmentation.frames[i].bufferState;                
            let colour: string = "#e0e0d1";
            switch (status)
            {		
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

            switch (bufferState)
            {
                case BufferState.empty: {
                    colour = this.colourLookup.getHexColour(".time-bar-uncached");
                    break;
                }
                case BufferState.loaded: {
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


class ColourLookup
{

    private cp: Map<string, number[]>

    constructor()
    {
        this.cp = this.colourPalate();
        this.getStyleSheetProperties();
    }

    public getHexColour(selector: string): string | null
    {
        let c = this.cp.get(selector);
        c[3] = 1;
        return colorString.to.hex(c);
    }

    private colourPalate(): Map<string, number[]>
    {
        let cp: Map<string, number[]> = new Map();
        cp.set(".time-bar-uncached", colorString.get.rgb("maroon"));
        cp.set(".time-bar-cached", colorString.get.rgb("dodgerblue"));
        cp.set(".time-bar-cursor", colorString.get.rgb("red"));
        return cp;
    }

    private getStyleSheetProperties()
    {
        let ssl: StyleSheetList = document.styleSheets;
        for (let i = 0; i < ssl.length; i++)
        {
            if (ssl.item(i).title === "application")
            {
                let css: CSSStyleSheet = ssl.item(i) as CSSStyleSheet;
                let rules: CSSRuleList = css.rules;                
                for (let j = 0; j < rules.length; j++)
                {
                    let rule: CSSStyleRule = rules.item(j) as CSSStyleRule;
                    if (this.cp.get(rule.selectorText))
                    {
                        if (rule.style["color"])
                        {
                            this.cp.set(rule.selectorText, colorString.get.rgb(rule.style["color"]));                            
                        }
                    }                    
                }                
                break;
            }
        }        
    }

}

