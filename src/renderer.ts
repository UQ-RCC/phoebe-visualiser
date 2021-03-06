import * as jss from 'json-stringify-safe';
import { SocketIO } from './database';
import * as config from '../config.json';
import * as navControl from './nav-elements';
import * as ute from './utilities';
import * as db from './database';
import { TimeBar, ChannelRecord } from "./event-managers";
import { GLContext, GLMatrix } from "./gl-context";
import {
    BufferPack,
    BufferState,
    Channel,
    Experiment,
    ExperimentRecord,
    Frame,
    FrameBuffer,
    FrameRecord,
    Segmentation,
    SegmentationRecord,
} from './frame-buffer';

import * as $ from 'jquery';
import * as path from 'path';
import { log } from 'util';
import { LOADIPHLPAPI } from 'dns';

var miniColors = require("../node_modules/@claviska/jquery-minicolors/jquery.minicolors.js");

let ioPool = new ute.IOPool(5, ute.DummyGetter);
let dbIO: db.DBIO;
let dir = '20151201_Stow/TimeLapse1_minusLPS_Rab13JF646/matlab_decon/raw_files';
let treeQuery = 'tree';
export let cachePath = (config as any).cache;

$(document).ready(() =>
{
    $("#ok-button").click(e => {        
        dbIO = db.DBIO.login($("#fname").val() as string, $("#pword").val() as string);
        dbIO.testConnection().then(() => 
        {
            $("#menu-bar").hide();
            popTree();
            navControl.NavController.getInstance();
        }).catch((e) => 
        {
            $("#db-login").hide();
            $("#db-reject").show();            
        })
    })

    $("#fail-button").click(e => {$("#db-login").show(); $("#db-reject").hide();})

});

function popTree(): void
{    
    dbIO.getTree(cachePath).then(data =>
    {

        let setController: SetController = new SetController(data.frameBuffer);

        $("#nav-tree").jstree({
            "core": {
                "multiple": false,
                "animation": false,
                "themes": {
                    "dots": false
                },
                "data": data.tree
            },
            "plugins" : ["types"],
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
        
        $("#nav-tree").on("changed.jstree", (e, data) =>
        {        
            const entry: any = data.instance.get_node(data.selected[0]).original;
            if (entry.hasOwnProperty("record"))
            {
                const record: any = entry.record;
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

export class SegmentationUI
{

    //DOM elements
    private segSpan: JQuery = $("<span>").addClass("segmentation-properties");

    //State
    private active: boolean;    
    private segmentation: Segmentation;
    private channelUI: ChannelUI;

    constructor(s: Segmentation, c: ChannelUI)
    {
        this.channelUI = c;
        this.segmentation = s;
        this.segSpan.attr('tabindex', 1);
        this.segSpan.attr('value', s.value);        

        this.segSpan.text(this.segmentation.value);
        this.segSpan.click(() =>
        {            
            this.segSpan.toggleClass("segmentation-properties-on");
            if (this.segSpan.hasClass("segmentation-properties-on"))
            {
                this.setActive(true);                
            }
            else
            {
                this.setActive(false);                
            }
        });
        
        this.segSpan.keydown((e) =>
        {
            // Don't allow tab keys
            if (e.which = 9)
            {
                e.preventDefault();
            }
        });

        this.segSpan.keyup((e) => 
        {
            console.log(`seg span : ${e.which}`);
            if (e.which == 46)
            {      
                if (this.segmentation.isActive())
                {
                    this.segmentation.delete();
                }
            }            
        })
        s.attachUI(this);
    }

    setActive(a: boolean)
    {
        this.active = a;
        if (this.active)
        {
            this.segSpan.addClass("segmentation-properties-on");
            this.segmentation.setActive(true);
            this.channelUI.segmentationActivated(this.segmentation, true);
        }
        else
        {
            this.segSpan.removeClass("segmentation-properties-on");
            this.segmentation.setActive(false);
            this.channelUI.segmentationActivated(this.segmentation, false);
        }
    }

    getSegmentationSpan(): JQuery
    {
        return this.segSpan;
    }

    getSegmentation(): Segmentation
    {
        return this.segmentation;
    }

    fireChange(frame?: Frame): void
    {
        if (this.active)
        {
            this.channelUI.getSetController().getDefaultTimeBar().resize();
            this.channelUI.getSetController().getDefaultTimeBar().displayCurrentFrame();
        }
    }

    getChannelUI(): ChannelUI
    {
        return this.channelUI;
    }

}

class ChannelUI
{
    // DOM elements    
    private segAddButton: JQuery = $(`<i>`).addClass("fa fa-plus-circle");
    private segLabelSpan: JQuery = $(`<span>`);
    private segInput: JQuery = $(`<input type="number">`).addClass("seg-input-value");
    private segValuesSpan: JQuery = $("<span>");
    private segColourButton: JQuery = $(`<i>`).addClass("fa fa-circle");
    private segColourSpan: JQuery = $(`<span>`);

    private channelRow: JQuery = $('<tr>').addClass("channel-row");

    private setController: SetController;
    private segmentationUI: SegmentationUI[] = [];s
    private channel: Channel

    constructor(c: Channel, sc: SetController)
    {        
        this.setController = sc;
        this.channel = c;        
        this.segLabelSpan.append(this.channel.name);

        this.segInput.width(0).hide();
        this.segInput.focusout(() => { this.segInput.hide().width(0); });
        this.segInput.keypress((event) =>

        {
            if (event.which === 13)
            {
                if ((this.segInput.val() as string).length > 0)
                {
                    let newVal = this.segInput.val() as number;
                    let i = this.segmentationUI.map(sui => sui.getSegmentation().value).indexOf(newVal);
                    if (i == -1)
                    {
                        let segmentation = this.channel.addNewSegmentation({id: null, value: this.segInput.val() as number});
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
        
        switch (this.channel.channelNumber)
        {
            case 0: {
                this.segColourSpan.val('rgb(191, 47, 47)');
                break
            };
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
        })

    }

    getSetController(): SetController
    {
        return this.setController;
    }

    getChannelRow(): JQuery
    {
        return this.channelRow;
    }

    addSegmentation(s: Segmentation)
    {
        let segUI: SegmentationUI = new SegmentationUI(s, this); 
        this.addSegmentationUI(segUI);
    }

    deleteSegmentation(s: Segmentation)
    {
        let  i = this.segmentationUI.map(ui => ui.getSegmentation()).indexOf(s);
        if (i > -1)
        {
            this.segmentationUI[i].setActive(false);
            this.segmentationUI.splice(i, 1);
            this.segValuesSpan.children(`span[value='${s.value}']`).remove();
        }        
    }

    addSegmentationUI(ui: SegmentationUI): void
    {
        this.segmentationUI.push(ui);
        this.segmentationUI.sort((e1, e2) => {return e1.getSegmentation().value - e2.getSegmentation().value});        
        this.segmentationUI.forEach(e => {this.segValuesSpan.append(e.getSegmentationSpan())}); 
    }

    deactivateOther(s: Segmentation)
    {
        this.segmentationUI.forEach(sl =>
        {
            if (s !== sl.getSegmentation())
            {
                sl.setActive(false);
            }
        });
    }

    segmentationActivated(s: Segmentation, a: boolean)
    {
        if (a)
        {
            this.deactivateOther(s);
        }
        this.setController.segmentationActivated(s, a);
    }

}

class ExperimentUI
{
    private experiment: Experiment
    private channelTable: HTMLTableElement;
    private expTable: JQuery = $('<table>');
    private channelUIs: ChannelUI[] = [];

    constructor(experiment: Experiment, setController: SetController)
    {
        this.experiment = experiment;
        this.experiment.channels.forEach(c =>
        {           
            let channelUI: ChannelUI = new ChannelUI(c, setController);
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
        })
       

    }

}

export class SetController
{
    private frames: number;
    private readonly defaultTimeBar: TimeBar;
    private frameBuffer: FrameBuffer;
    private channelUIs: ChannelUI[] = [];
    private currentExperiment: Experiment;
    private experimentUI: ExperimentUI;
    
    constructor(frameBuffer: FrameBuffer)
    {
        this.defaultTimeBar = new TimeBar();
        this.frameBuffer = frameBuffer;
        db.DBIO.getInstance().dbListen(this);
    }

    getDefaultTimeBar(): TimeBar
    {
        return this.defaultTimeBar;
    }

    // Set experiment from tree click event
	setExperiment(record: ExperimentRecord)
	{
        //TODO clear up existing segmentations...

        this.defaultTimeBar.reset();
        let experiment = this.frameBuffer.setActiveExperiment(record);
        this.frames = experiment.frames;
        $("#frames").text(`${this.frames}`);
        let channels = experiment.channels;
        $(".channel").remove(); 
        let channelListDiv: JQuery = $("#channel-info");
        
        //TODO clean up old channelUIs (keeps growing).
        experiment.channels.forEach(channel => 
        {
            //let channelUI: ChannelUI = new ChannelUI(channel, this);
            //this.channelUIs.push(channelUI);
            //channelListDiv.append(channelUI.getChannelDiv());
        });

        this.experimentUI = new ExperimentUI(experiment, this);
        
        GLContext.getInstance().reinitialiseGLMatrix();
        GLContext.getInstance().clear();
        this.currentExperiment = experiment;

    }

    segmentationActivated(s: Segmentation, a: boolean)
    {
        if (a)
        {            
            this.defaultTimeBar.activateSegmentation(s);
        }
        else
        {
            this.defaultTimeBar.deactivateSegmentation(s);
        }
    }

    processDBMessage(message: any)
    {
        if (this.currentExperiment)
        {
            this.currentExperiment.processDBMessage(message);
        }        
    }

}

export class FrameController
{
    currentFrame: number = 0;
    size: number = 0;
    frames: BufferPack[] = [];
    glContext: GLContext;
    // timeBar: TimeBar;
    private localCacheSize: number = 0;    
    private windowWidth: number = 30;
    private maxBufferSize: number = (1024 ^ 3);

    constructor(directory: string, fileNames: JSON) {
        
        this.size = Object.keys(fileNames).length;
        for (let i: number = 0; i < this.size; i++) {
            const record: any = fileNames[i]; //TODO this required no implicit any fix it.
            const bufferPack: BufferPack = new BufferPack(i, directory + "/" + record.file_name);
            if (i > 1) {
                this.frames[i - 1].setNextBufferPack(bufferPack);
            }
            this.frames.push(bufferPack);
        }
        this.setFrame(0);
        // this.timeBar = new TimeBar(this);
    }

    reset() {
        for (let i: number = 0; i < this.size; i++) {
            console.log(`resetting frame ${i}`);
            this.frames[i].clearBuffer();
        }
    }

    setFrame(newFrame: number) {
        const bufferPack: BufferPack = this.frames[newFrame];
        loadWindow(bufferPack, 10, this);
        if (bufferPack.state === BufferState.loaded)
        {            
            this.glContext.drawScene("FrameController::setFrame");         
        }
        this.currentFrame = newFrame;
    }

    fileLoaded(bufferPack: BufferPack) {
        this.localCacheSize += bufferPack.getSize();        
        // this.timeBar.draw();
        if (!this.glContext) //TODO fix this is a kludge
        {
            this.glContext = GLContext.getInstance();
        }
        if (this.currentFrame === bufferPack.frameNumber)
        {
            this.glContext.drawScene("FrameController::fileLoaded"); //TODO perhaps pass the buffer pack itself in
        }
    }

    getFileName(index: number): string {
        return this.frames[index].fileName;
    }

    isLoaded(index: number): boolean {
        return (this.frames[index].state === BufferState.loaded);
    }

    getState(index: number): BufferState {
        return (this.frames[index].state);
    }

    setState(index: number, state: BufferState): void {
        this.frames[index].state = state;
    }

    getCurrentBufferPack(): BufferPack {
        return this.frames[this.currentFrame];
    }

    clearFurthestFrom(frame: number): void {
        let minFrame: number = frame;
        for (let i: number = 0; ((i <= frame) && (minFrame === frame)); i++) {
            if (this.frames[i].state === BufferState.loaded) {
                minFrame = i;
            }
        }
        let maxFrame: number = frame;
        for (let i: number = this.size - 1; ((i >= frame) && (maxFrame === frame)); i--) {
            if (this.frames[i].state === BufferState.loaded) {
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

    getLocalCacheSize(): number {
        return this.localCacheSize;
    }

}

function loadWindow(bufferPack: BufferPack, remainingFrames: number, frameController: FrameController) {
    const maxBufferSize: number = (1024 ** 3) * 3;

    if ((bufferPack === null) || (remainingFrames === 0)) {
        return;
    }

    // If a loader is already working on this one go to the next bufferpack.
    if ((bufferPack.state === BufferState.loaded) || (bufferPack.state === BufferState.loading)) {
        loadWindow(bufferPack.nextBufferPack, remainingFrames - 1, frameController);
        return;
    }

    bufferPack.state = BufferState.loading;
    const oReq: XMLHttpRequest = new XMLHttpRequest();
    oReq.open("GET", bufferPack.fileName, true);
    oReq.responseType = "arraybuffer";
    oReq.onload = () => {
        // Check if this didn't get loaded in other process anyway
        if (bufferPack.state === BufferState.loaded) {
            return;
        }
        const arrayBuffer: ArrayBuffer = oReq.response;
        if (arrayBuffer) {
            while (frameController.getLocalCacheSize() > maxBufferSize) {
                frameController.clearFurthestFrom(bufferPack.frameNumber);
            }
            bufferPack.setArrayBuffer(arrayBuffer);
            frameController.fileLoaded(bufferPack);
            loadWindow(bufferPack.nextBufferPack, remainingFrames - 1, frameController);
        }
    }
    oReq.send();
}



