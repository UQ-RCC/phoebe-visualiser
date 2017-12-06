import * as $ from "jquery";

export class NavController
{

    private static singletonNavController;
    
    readonly fileEvent: ChooseFile = new ChooseFile(this);
    readonly cameraEvent: ScreenShot = new ScreenShot(this);
    readonly videoEvent: Video = new Video(this);
    readonly processEvent: Process = new Process(this);

    private currentElement: NavElement;
    private resizeables: any[] = []

    public static getInstance(): NavController
	{
		if (!this.singletonNavController)
		{
			this.singletonNavController = new NavController();
		}
		return this.singletonNavController;
	}

    private constructor()
    {
        $("#file-button").click(() => this.fileEvent.toggle());
        $("#camera-button").click(() => this.cameraEvent.toggle());
        $("#movie-button").click(() => this.videoEvent.toggle());
        $("#process-button").click(() => this.processEvent.toggle());
    }

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
        console.log(`added a resizable to NavController`);
    }

    public resizeResizables(): void
    {
        this.resizeables.forEach(r => 
        {            
            r.resize("NavController::Event")
        });
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
        this.controller.resizeResizables();
    }

    off(): void
    {
        this.selected = false;
        this.controller.deactivateElement(this);
        this.processOff();
        this.controller.resizeResizables();
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
        $("#file-selector").animate({
            "max-width": "350px",
            "min-width": "250px",
            "padding-right": "15px" },
            {"step" : (() => {this.controller.resizeResizables()}),
            "duration" : "fast"});
    }

    processOff(): void
    {
        $("#file-button").removeClass("ap-icon-selected");
        $("#file-selector").animate({
            "max-width": "0px",
            "min-width": "0px",
            "padding-right": "0px" },
            {"step" : (() => {this.controller.resizeResizables()}),
            "duration" : "fast"});            
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
        $("#process").animate({ 
            "max-width" : "100%",
            "padding-right": "15px"},
            {"step" : (() => {this.controller.resizeResizables()}),
             "duration" : "fast"});
    }

    processOff(): void {
        $("#process-button").removeClass("ap-icon-selected");
        $("#process").animate({
            "max-width": "0px",
            "padding-right": "0px"},
            {"step" : (() => {this.controller.resizeResizables()}),
             "duration" : "fast"});
    }
}
