import { GLContext } from './gl-context';
import * as fs from 'fs';
import * as $ from 'jquery';
import * as jss from 'json-stringify-safe';
import { log } from 'util';
import { TimeBar } from './event-managers';
import { cachePath } from './renderer';
import { DBIO } from './database';
import { SegmentationUI } from './renderer';
import * as ute from './utilities';
import { CLIENT_RENEG_LIMIT } from 'tls';
import * as glm from 'gl-matrix';
import { WSAETIMEDOUT } from 'constants';

export const enum GlobalStatus
{
	Void = 'void',
	Queued = 'queued',
	Processing = 'processing',
	Complete = 'complete'
}

export const enum BufferState {
    empty = "empty",
    loaded = "loaded",
    loading = "loading"
}

export interface FrameRecord
{
    msec: number;
	filename: string;
    status: string;
    id: number;
}

export interface ExperimentRecord
{
    directory: string;
	frames: number;
	channels: ChannelRecord[]
}

export interface ChannelRecord
{
    id: number;
    channel_number: number;    
    name: string;
    colour_rgb: number[];
    segvalues: SegmentationRecord[];
}

export interface SegmentationRecord
{
    id: number;
    value: number;
}

//Used int OpenGL context
export class BufferPack
{
    
    arrayBuffer: ArrayBuffer;
    indexBuffer: ArrayBuffer;
    numPoints: number = 0;
    numIndices: number = 0;
    b: number[] = [];
    xMag: number;
    yMag: number;
    zMag: number;



    // IO stuff

    state: BufferState;
    frameNumber: number;
    nextBufferPack: BufferPack | null;
    fileName: string | null;

    segmentation: Segmentation;

    constructor(frameNumber: number, fileName: string | null)
    {
        this.frameNumber = frameNumber;
        this.nextBufferPack = null;
        this.fileName = fileName;
        this.state = BufferState.empty;
    }

    setSegmentation(s: Segmentation)
    {
        this.segmentation = s;
    }

    getColour(): glm.vec4
    {
        let colour: glm.vec4 = glm.vec4.fromValues(0.3, 0.3, 0.3, 1.0);
        if (this.segmentation)
        {
            glm.vec4.copy(colour, this.segmentation.channel.getColour());
        }
        return colour;
    }

    setNextBufferPack(bufferPack: BufferPack) {
        this.nextBufferPack = bufferPack;
    }

    loadBufferPack(): void
    {        
        let buffer: Buffer = fs.readFileSync(`${cachePath}/${this.fileName}`);     
        this.setArrayBuffer(buffer.buffer);
    }

    setArrayBuffer(inputBuffer: ArrayBuffer) {
        this.arrayBuffer = inputBuffer;

        let dView: DataView = new DataView(this.arrayBuffer);
        this.numPoints = dView.getInt32(0, true);
        this.numIndices = dView.getInt32(4, true);

        for (let i = 0; i < 6; i++) {
            this.b.push(dView.getFloat64(8 + (i * 8), true));
        }

        this.xMag = this.b[1] - this.b[0];
        this.yMag = this.b[3] - this.b[2];
        this.zMag = this.b[5] - this.b[4];

        var startIndices: number = 56 + (4 * this.numPoints * 3 * 2);
        //TODO: Don't use slice... present whole buffer to WebGL
        this.indexBuffer = this.arrayBuffer.slice(startIndices);
        this.arrayBuffer = this.arrayBuffer.slice(56, 56 + (4 * this.numPoints * 3 * 2));

        this.state = BufferState.loaded;
    }

    getSize(): number {
        if (!this.arrayBuffer) {
            return 0;
        }
        return this.arrayBuffer.byteLength + this.indexBuffer.byteLength;
    }

    clearBuffer(): number {
        const size: number = this.getSize();
        this.arrayBuffer = null;
        this.indexBuffer = null;
        this.state = BufferState.empty;
        return size;
    }

    toString(): string {
        return `bufferPack ${this.frameNumber}: ${this.state} [${this.xMag},${this.yMag},${this.zMag}] ${this.numIndices}`;
    }

    printDeepString(): void
    {

        let iView = new DataView(this.indexBuffer);
        let pView = new DataView(this.arrayBuffer);

        let debug: any = {};    
        debug.numIndices = ute.numTo(this.numIndices);
        debug.byteIndices = ute.numTo(this.indexBuffer.byteLength);
        debug.numPoints = ute.numTo(this.numPoints);
        debug.byteArray = ute.numTo(this.arrayBuffer.byteLength);
        debug.indices = [];

        for (let i = 0; i < 30; i++)
        {
            debug.indices.push(ute.numTo(iView.getInt32(i * 4, true)));
        }

        debug.points = [];
        for (let i = 0; i < 27; i++)
        {
            debug.points.push(pView.getFloat32(i * 4, true));
        }
        
        console.log(`${JSON.stringify(debug,null,3)}`);

    }
    
}

export class Frame
{
    segmentation: Segmentation;	
	bufferState: BufferState = BufferState.empty; // State in local app.
    channel: number;    
    filename: string;    
    status: string;    
    msec: number;
    id: number;
    
	buffer: string; // Is this a buffer status??
	// bufferPack: BufferPack;
	nextFrame: Frame | null;
    
    constructor(segmentation: Segmentation, frameRecord: FrameRecord)
    {        
        this.segmentation = segmentation;
        this.msec = frameRecord.msec;
        this.filename = frameRecord.filename;
        this.status = frameRecord.status;
        this.id = frameRecord.id;
	}

	getFilePath(): string
	{
		return this.filename;
	}

	setBuffer(): void
	{
	}

    mapGlobalState(state: string): GlobalStatus
    {
        switch (state)
        {
            case 'queued': return GlobalStatus.Void;
            case 'processing': return GlobalStatus.Processing;			
            case 'complete': return GlobalStatus.Complete;			
            default: return GlobalStatus.Void;
        }
    }

}

export class FrameBuffer
{
    db: DBIO;
    cachePath: string
    currentExperiment: Experiment | null;
    experiments: Map<string, Experiment>;
    xhrPool: XHRPool;

    constructor(cachePath: string, db: DBIO)
    {
        this.experiments = new Map<string, Experiment>();
        this.db = db;
        this.cachePath = cachePath;
        this.xhrPool = new XHRPool(5, cachePath);
        try
        {
            fs.mkdirSync(cachePath);
        }
        catch (e)
        {
        }
    }

    public addExperiment(record: ExperimentRecord): void
    {
        this.experiments.set(record.directory, new Experiment(record, this));
    }

    // Set active experiment on tree is click
    public setActiveExperiment(record: ExperimentRecord): Experiment
    {
        let experiment = this.experiments.get(record.directory);
        this.currentExperiment = experiment;     
        return experiment;
    }

    public syncSegmentation(segmentation: Segmentation)
    {
        this.db.queryByObject('seg_status')
        .then(res =>
        {
           console.log(`${JSON.stringify(res,null,3)}`);
        });
    }

    public print(): void
    {
        if (this.experiments)
        {
            console.log('frame buffer:');
            this.experiments.forEach((v, k) => {console.log(`${k} : ${v.directory} ${v.frames}`);});
        }
        else
        {
            console.log('empty frame buffer');
        }
    }

}

export class Segmentation
{
    channel: Channel;
    id: number;
    name: string;
    value: number;
    frames: Frame[] = [];
    private active: boolean = false; // active in timeBar    
    cachePath: string;
    segmentationUI: SegmentationUI;
    
    constructor(channel: Channel, segmentationRecord: SegmentationRecord)    
    {

        this.channel = channel;
        this.value = segmentationRecord.value;
        this.cachePath = channel.experiment.frameBuffer.cachePath;
        
        if (!segmentationRecord.id)
        {
            DBIO.getInstance().queryByObject('enqueue_segmentation_job', this.channel.id, this.value)
            .then(res =>
            {                
                segmentationRecord.id = res[0].v_segmentation_id;
                this.id = segmentationRecord.id;
                this.addFrames();
            });
        }
        else
        {
            this.id = segmentationRecord.id
            this.addFrames();
        }

    }

    attachUI(ui: SegmentationUI)
    {
        this.segmentationUI = ui;
    }

    private addFrames(): void
    {        
        DBIO.getInstance().queryByObject('get_seg_status', this.id.toString())
        .then(res =>
        {
            res.forEach((row) =>
            {                
                this.frames.push(new Frame(this, row));
            })        
        });
    }

    setActive(active: boolean)
    {
        if (this.active == active)
        {
            return;
        }
        this.checkFileBuffer();
        this.active = active;        
        if (active)
        {
            //ping db to say this segmentation is active at the current frame.
            this.setCurrentFrame(this.channel.getCurrentFrame());
            //TODO before adding to pool is there anything to download? Do some checks
            this.channel.experiment.frameBuffer.xhrPool.addSegmentation(this);
        }
        else
        {
            DBIO.getInstance().queryByObject("deactivate_frame", this.id);
        }
    }

    isActive(): boolean
    {
        return this.active;
    }

    delete()
    {
        this.setActive(false);
        DBIO.getInstance().queryByObject("delete_segmentation", this.id)
        this.channel.deleteSegmentation(this);
        if (this.segmentationUI)
        {
            this.segmentationUI.getChannelUI().deleteSegmentation(this);
        }
    }

    checkFileBuffer()
    {        
        for (let frame of this.frames)
        {   
            let cacheState: boolean = fs.existsSync(this.cachePath + "/" + frame.filename);            
            if (cacheState)
            {
                frame.bufferState = BufferState.loaded;
            }
            else
            {
                frame.bufferState = BufferState.empty;
            }
        }     
    }
    
    setCurrentFrame(frame: number)
    {
        this.channel.setCurrentFrame(frame);
        DBIO.getInstance().queryByObject("activate_frame", this.id, frame);
    }

    getCurrentFrame() : number
    {
        return this.channel.getCurrentFrame();
    }

    // Get the next frame to load
    getNextFrame(): Frame | null
    {        
        for (let i = this.channel.getCurrentFrame(); i < this.frames.length; i++)
        {
            let frame = this.frames[i];
            if ((frame.bufferState === BufferState.empty) && (frame.status == "complete"))
            {   
                frame.bufferState = BufferState.loading;
                return frame;
            }
        }
        for (let i = this.channel.getCurrentFrame() - 1; i >= 0; i--)
        {
            let frame = this.frames[i];
            if ((frame.bufferState === BufferState.empty) && (frame.status == "complete"))
            {
                frame.bufferState = BufferState.loading;
                return frame;
            }
        }
        return null;
    }

    processDBMessage(message: any)
    {
        let frameID = message.segmentation_frame_id;
        this.frames.forEach(f =>            
        {            
            if (f.id == frameID)
            {
                f.status = message.status;
                f.bufferState = BufferState.empty;
                if (this.segmentationUI)
                {
                    this.segmentationUI.fireChange(f);
                    if (this.active)
                    {
                        this.channel.experiment.frameBuffer.xhrPool.addSegmentation(this);
                    }
                }
            }
        })
    }

    toString(): string
    {
        return JSON.stringify({value: this.value, frames: this.frames.length},null,3);
    }

}

export class Channel
{
    experiment: Experiment;
    id: number;
    name: string;
    channelNumber: number;
    segmentation: Segmentation[];
    private currentFrame: number = 0;
    private colour: number[] = [127, 127, 200, 1.0];

    constructor(experiment: Experiment, channelRecord: ChannelRecord)
    {        
        this.segmentation = [];
        this.experiment = experiment;
        this.id = channelRecord.id;
        this.name = channelRecord.name;
        this.channelNumber = channelRecord.channel_number; 
        this.colour[0] = channelRecord.colour_rgb[0];
        this.colour[1] = channelRecord.colour_rgb[1];
        this.colour[2] = channelRecord.colour_rgb[2];
        if (channelRecord.segvalues)
        {
            channelRecord.segvalues.forEach(s => 
            {
                this.segmentation.push(new Segmentation(this, s));
            });
        }
    }

    public setCurrentFrame(f: number)
    {
        this.currentFrame = f;
    }

    public getCurrentFrame(): number
    {
        return this.currentFrame;
    }

    public addNewSegmentation(segmentationRecord: SegmentationRecord): Segmentation
    {
        let segmentation = new Segmentation(this, segmentationRecord)
        this.segmentation.push(segmentation);
        return segmentation;
    }

    public deleteSegmentation(s: Segmentation)
    {
        let i = this.segmentation.indexOf(s);
        if (i > -1)
        {            
            this.segmentation.splice(i,1);         
        }
    }

    public deactivateOthers(s: Segmentation)
    {
        this.segmentation.forEach(sl =>
        {
            if (s != sl)
            {
                sl.setActive(false);
            }
        });
    }

    processDBMessage(message: any)
    {        
        let segmentationID = message.segmentation_id;
        if (message.status == 'deleted')
        {
            // console.log(`from db : we are deleting -- do it here`);
        }
        this.segmentation.forEach(s =>
        {            
            if (s.id == segmentationID)
            {         
                s.processDBMessage(message);
            }
        });
    }

    setColour(rgbaString: string): void
    {
        let parseString = rgbaString.match(/[0-9]*\.?([0-9]+)/g);
        this.colour[0] = +parseString[0];
        this.colour[1] = +parseString[1];
        this.colour[2] = +parseString[2];
        this.colour[3] = +parseString[3];
        GLContext.getInstance().drawScene("Channel::SetColour");
        
    }

    getColour(): glm.vec4
    {
        return glm.vec4.fromValues(this.colour[0] / 255, this.colour[1] / 255, this.colour[2] / 255, this.colour[3]);
    }

    getColourRGB(): string
    {
        return `rgb(${this.colour[0]}, ${this.colour[1]}, ${this.colour[2]}`;
    }   

}

export class Experiment
{
    directory: string;
    frames: number
    channels: Channel[];
    frameBuffer: FrameBuffer;

    constructor(experimentRecord: ExperimentRecord, frameBuffer: FrameBuffer)
    {
        this.frameBuffer = frameBuffer;
        this.channels = [];
        this.directory = experimentRecord.directory;
        this.frames = experimentRecord.frames;
        if (experimentRecord.channels)
        {
            experimentRecord.channels.forEach(c =>
            {
                this.channels.push(new Channel(this, c));           
            });
        }
    }

    processDBMessage(message: any)
    {        
        let messageObj: any = JSON.parse(message);        
        let channelId = messageObj.channel_id;
        this.channels.forEach(c =>
        {
            if (c.id == channelId)
            {
                c.processDBMessage(messageObj);
            }
        })
    }

}

class XHRLoader
{
    private readonly xhrPool;
    private readonly req: XMLHttpRequest;
    public frame: Frame;
    
    constructor(xrhPool: XHRPool)
    {        
        this.xhrPool = xrhPool;
        this.req = new XMLHttpRequest();
        this.req.responseType = "arraybuffer";
        this.req.onload = () =>
        {
            //TODO check status here...
            let inBuffer: ArrayBuffer = this.req.response;
            if (inBuffer)
            {
                this.frame.bufferState = BufferState.loaded;
                fs.writeFileSync(this.xhrPool.cachePath + "/" + this.frame.filename, Buffer.from(inBuffer));
                let ui: SegmentationUI = this.frame.segmentation.segmentationUI;
                if (ui)
                {
                    ui.fireChange(this.frame);
                }                                
            }
            else
            {
                this.frame.bufferState = BufferState.empty;
            }
            this.xhrPool.returnLoader(this);
        }
    }

    load(frame: Frame)
    {
        const address = `http://phoebe.rcc.uq.edu.au:1337/${frame.filename}`;
        this.frame = frame;
        this.req.open("GET", address, true);
        this.req.send();
    }

}

class XHRPool
{
    private loaders: XHRLoader[] = [];
    private requestQueue: Segmentation[] = []
    public cachePath: string;

    constructor(numLoaders: number, cachePath: string)
    {
        this.cachePath = cachePath;
        for (let i = 0; i < numLoaders; i++)
        {
            this.loaders.push(new XHRLoader(this));
        }
    }

    addSegmentation(request: Segmentation): void
    {
        // add segmentation to front of queue
        // (moves it to front if already in queue and not already in front).
        const i = this.requestQueue.indexOf(request);
        if (i > 0)
        {
            this.requestQueue.splice(i, 1);
        }
        if (i != 0)
        {
            this.requestQueue.unshift(request);
        }
        this.processQueue();
    }

    processQueue(): void
    {

        //put in logic to delete stuff from the queue when completed.

        if (this.requestQueue.length === 0)
        {
            return;
        }
        
        let nextFrame = this.requestQueue[0].getNextFrame();
        if (!nextFrame)
        {
            return;
        }
        
        let loader = this.loaders.pop();
        if (!loader)
        {
            return;
        }

        loader.load(nextFrame);
    }

    returnLoader(loader: XHRLoader): void
    {
        this.loaders.push(loader);
        this.processQueue();
    }

}