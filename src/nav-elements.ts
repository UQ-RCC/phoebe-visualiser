import * as $ from "jquery";

export function createNavigator(): void
{
    const navController: NavController = new NavController();
    const fileEvent: ChooseFile = new ChooseFile(navController);
    const cameraEvent: ScreenShot = new ScreenShot(navController);
    const videoEvent: Video = new Video(navController);
    const processEvent: Process = new Process(navController);
    $("#file-button").click(() => fileEvent.toggle());
    $("#camera-button").click(() => cameraEvent.toggle());
    $("#movie-button").click(() => videoEvent.toggle());
    $("#process-button").click(() => processEvent.toggle());
}

export class NavController
{

    private currentElement: NavElement;
    private resizeables: any[] = []

    activateElement(newElement: NavElement): void
    {
        if (this.currentElement)
        {
            this.currentElement.off();
        }
        this.currentElement = newElement;
    }

    deactivateElement(element: NavElement): void
    {
        if (this.currentElement === element)
        {
            this.currentElement = null;
        }
        else
        {
            throw new Error("NavController state is messed up");
        }
    }

    addResizable(resizable: any): void
    {
        this.resizeables.push(resizable);
    }

    private resize(): void
    {
        this.resizeables.forEach(r => {r.resize()});
    }

}

export abstract class NavElement
{
    protected readonly controller: NavController;
    protected selected: boolean = false;

    constructor(controller: NavController)
    {
        this.controller = controller;
    }

    on(): void
    {
        this.selected = true;
        this.controller.activateElement(this);
        this.processOn();
    }

    off(): void
    {
        this.selected = false;
        this.controller.deactivateElement(this);
        this.processOff();
    }

    toggle(): void
    {
        if (this.selected)
        {
            this.off();
        }
        else
        {
            this.on();
        }
    }

    abstract processOn(): void;
    abstract processOff(): void;
}

export class ChooseFile extends NavElement
{

    processOn(): void
    {
        $("#file-button").addClass("ap-icon-selected");
        //$("#file-selector").animate({ "max-width": "100%", "padding-right": "15px" }, "fast");
        $("#file-selector").animate({ "max-width": "350px", "min-width": "250px", "padding-right": "15px" }, "fast");
    }

    processOff(): void
    {
        $("#file-button").removeClass("ap-icon-selected");
        $("#file-selector").animate({ "max-width": "0px", "min-width": "0px", "padding-right": "0px" }, "fast");
    }

}

export class ScreenShot extends NavElement
{
    processOn(): void
    {
        $("#camera-button").addClass("ap-icon-selected");
    }

    processOff(): void
    {
        $("#camera-button").removeClass("ap-icon-selected");
    }
}

export class Video extends NavElement
{
    processOn(): void {
        $("#movie-button").addClass("ap-icon-selected");
    }

    processOff(): void {
        $("#movie-button").removeClass("ap-icon-selected");
    }
}

export class Process extends NavElement
{
    processOn(): void {
        $("#process-button").addClass("ap-icon-selected");
        $("#process").animate({ "max-width": "100%", "padding-right": "15px" }, "fast");
    }

    processOff(): void {
        $("#process-button").removeClass("ap-icon-selected");
        $("#process").animate({ "max-width": "0px", "padding-right": "0px" }, "fast");
    }
}
