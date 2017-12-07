import { Segmentation } from './frame-buffer';
import * as electron from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as glm from 'gl-matrix';

const app = electron.app;
const browserWindow = electron.BrowserWindow;
let mainWindow: Electron.BrowserWindow;

function createWindow () {
    // Create the browser window.
    mainWindow = new browserWindow({width: 800, height: 600})
    
    // and load the index.html of the app.
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'application.html'),
        protocol: 'file:',
        slashes: true
    }));
    
    mainWindow.on('closed', function ()
    {        
        mainWindow = null
    });

    mainWindow.webContents.openDevTools();
    
}


import * as fs from 'fs';

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
      app.quit()
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow()
    }
});

let cachePath: string  = "D:/data/electron cache";

const enum BufferState {
    empty = "empty",
    loaded = "loaded",
    loading = "loading"
}
