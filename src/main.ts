import * as electron from 'electron';
import * as path from 'path';
import * as url from 'url';
// import * as ute from './utilities'
// import * as localServer from './server'

// localServer.createLocalServer();

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

app.on('ready', () => {
    console.log('process starting..');    
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
