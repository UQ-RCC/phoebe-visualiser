"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron = require("electron");
const path = require("path");
const url = require("url");
// import * as ute from './utilities'
// import * as localServer from './server'
// localServer.createLocalServer();
const app = electron.app;
const browserWindow = electron.BrowserWindow;
let mainWindow;
function createWindow() {
    // Create the browser window.
    mainWindow = new browserWindow({ width: 800, height: 600 });
    // and load the index.html of the app.
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'application.html'),
        protocol: 'file:',
        slashes: true
    }));
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
    mainWindow.webContents.openDevTools();
}
const fs = require("fs");
app.on('ready', () => {
    console.log('process starting..');
    /*
    let buffer: Buffer = fs.readFileSync(`D:/data/electron cache/07/b4/07b41693-1bf6-4f29-b1a3-e4a1cdc5730b`);

    let numPoints = buffer.readInt32LE(0);
    let numIndices = buffer.readInt32LE(4);

    console.log(`points: ${numPoints}`);
    console.log(`indices: ${numIndices}`);
    for (let i = 0; i < 6; i++) {
        console.log(`${buffer.readDoubleLE(8 + (i * 8))}`);
    }

    for (let i = 0; i < 30; i += 3)
    {
        console.log(`p: ${buffer.readFloatLE(56 + (i * 4))} ${buffer.readFloatLE(56 + ((i + 1) * 4))} ${buffer.readFloatLE(56 + ((i + 2) * 4))}`);
    }

    let sn: number = 56 + (4 * numPoints * 3);
    for (let i = 0; i < 30; i += 3)
    {
        console.log(`n: ${buffer.readFloatLE(sn + (i * 4))} ${buffer.readFloatLE(sn + ((i + 1) * 4))} ${buffer.readFloatLE(sn + ((i + 2) * 4))}`);
    }

    let si: number = 56 + (4 * numPoints * 3 * 2);
    for (let i = 0; i < 30; i += 3)
    {
        console.log(`i: ${buffer.readInt32LE(si + (i * 4))} ${buffer.readInt32LE(si + ((i + 1) * 4))} ${buffer.readInt32LE(si + ((i + 2) * 4))}`);
    }


    let bb: BufferPack = new BufferPack(0, '');
    bb.setArrayBuffer(buffer.buffer);
    bb.printDeepString();
    */
    createWindow();
});
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar  
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});
let cachePath = "D:/data/electron cache";
const ute = require("./utilities");
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
        let buffer = fs.readFileSync(`${cachePath}/${this.fileName}`);
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
        console.log(`buffer: ${this.toString()}`);
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
        debug.buffIndices = [];
        for (let i = 0; i < 30; i++) {
            debug.indices.push(ute.numTo(iView.getInt32(i * 4, true)));
        }
        let foo = new Buffer(this.indexBuffer);
        for (let i = 0; i < 30; i++) {
            debug.buffIndices.push(ute.numTo(foo.readInt32LE(i * 4)));
        }
        debug.points = [];
        for (let i = 0; i < 27; i++) {
            debug.points.push(pView.getFloat32(i * 4, true));
        }
        console.log(`${JSON.stringify(debug, null, 3)}`);
    }
}
//# sourceMappingURL=main.js.map