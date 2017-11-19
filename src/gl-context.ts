
import { MouseManager } from "./event-managers";
import { BufferState, BufferPack} from "./frame-buffer";
import * as $ from "jquery";
///<reference path='./tsm-0.7.d.ts' />

export class GLMatrix
{
    
    vCentreT: TSM.vec3; // Set when model loaded
    vTranslateXY: TSM.vec3; // Incremented by input control on xy
    vTranslateZ: TSM.vec3; // Incremented by input control on Z
    qCurrentRot: TSM.quat; // Increment by input control
    mPerspectiveT: TSM.mat4;

    private mWorldT: TSM.mat4;
    mCenterT: TSM.mat4;
    modelRadius: number;

    constructor(bufferPack: BufferPack)
    {

        console.log(`Initialize GLMatrix`);
        this.qCurrentRot = TSM.quat.identity.copy();
        this.modelRadius = Math.max(bufferPack.xMag, bufferPack.yMag, bufferPack.zMag) / 2.0;
        this.vCentreT = new TSM.vec3([
            (bufferPack.xMag / 2.0 + bufferPack.b[0]) * -1.0,
            (bufferPack.yMag / 2.0 + bufferPack.b[2]) * -1.0,
            (bufferPack.zMag / 2.0 + bufferPack.b[4]) * -1.0
        ]);

        this.mPerspectiveT = TSM.mat4.perspective(20.0, 640 / 480, 100, 10000);  //TODO looks a bit suspect.
        this.mCenterT = TSM.mat4.identity.copy();
        this.mCenterT.translate(this.vCentreT);
        this.vTranslateZ = new TSM.vec3([0, 0, -750]);
        this.vTranslateXY = new TSM.vec3([0, 0, 0]);

    }

    incRotation(qNewRotation: TSM.quat): void
    {
        this.qCurrentRot = qNewRotation.multiply(this.qCurrentRot);
    }

    incTranslationXY(vNewTranslation: TSM.vec3): void
    {
        const modelCentre: number = this.vCentreT.z + this.vTranslateZ.z;
        this.vTranslateXY.add(vNewTranslation);
    }

    incTranslationZ(vNewTranslation: TSM.vec3): void
    {
        this.vTranslateZ.add(vNewTranslation);
    }

    getZPlane(): number
    {
        return this.vCentreT.z + this.vTranslateZ.z;
    }

    getWorldTransform(): TSM.mat4
    {
        const mWorldT = TSM.mat4.identity.copy();
        mWorldT.translate(this.vTranslateZ);
        mWorldT.translate(this.vTranslateXY);
        mWorldT.multiply(this.qCurrentRot.toMat4());
        mWorldT.translate(this.vCentreT);
        return mWorldT;
    }

}

export class GLContext
{
	
    private readonly canvas: HTMLCanvasElement;
    private readonly glMatrix: GLMatrix;
    
    private readonly gl: WebGLRenderingContext;
    private arrayBufferId: WebGLBuffer;
    private indexBufferId: WebGLBuffer;
    private shaderProgram: WebGLProgram;
    private vertexPositionAttribute: number;
    private normalAttribute: number;

    private currentBufferPack: BufferPack;

    // width and height of viewport and canvas drawing buffer;
    private width: number = 0;
    private height: number = 0;
    private horizAspect: number = 1;
	private drawCount: number = 0;

    constructor(bufferPack: BufferPack)
    {
        // this.canvas = this.docElements.canvas; //TODO fix this...
        this.currentBufferPack = bufferPack;
    
        this.glMatrix = new GLMatrix(this.currentBufferPack); //TODO bad coding get init parameters from FrameController instead

        this.gl = this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl");
        if (!this.gl)
        {
            alert("Unable to initialize WebGL. Your browser may not support it.");
            console.log("Unable to initialize WebGL. Your browser may not support it.");
        }

        const ext = this.gl.getExtension("OES_element_index_uint");
        if (!ext)
        {
            alert("OES_element_index_uint is missing");
            console.log("OES_element_index_uint is missing");
            return;
        }
        
        let ramConst: number = 0x9048;
        let totalNvidiaRam: number = this.gl.getParameter(ramConst);
        console.log(`video "${ramConst}" =  ${totalNvidiaRam}`);

        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.initBuffers();
        this.initShaders();
        this.resize();
        const mm: MouseManager = new MouseManager(this.canvas, this, this.glMatrix); //TODO sort out if better way of doing this. MM handle never used...
        window.addEventListener("resize", () => { this.resize(); });
        //const timeKeeper: TimeKeep = new TimeKeep(xRange, this.drawScene, this.glMatrix);  // xRange is the slider
        //timeKeeper.start();

        console.log("bufferpack created");
        

    }

    resize(): void
    {
        if ((this.width !== this.canvas.clientWidth) || (this.height !== this.canvas.clientHeight))
        {
            this.width = this.canvas.clientWidth;
            this.height = this.canvas.clientHeight;
            this.horizAspect = this.height / this.width;
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            this.gl.viewport(0, 0, this.width, this.height); // Change to this...
            this.drawScene();
        }
        
    }

    drawScene(newBufferPack?: BufferPack): void
    {
        if (newBufferPack)
        {
            this.currentBufferPack = newBufferPack;
            this.transferBuffers(this.currentBufferPack);
        }

        // docElements.updateFrame(this.currentBufferPack.frameNumber);
        this.drawCount++;
        
        
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        const mPerspective: TSM.mat4 = TSM.mat4.perspective(45, this.width / this.height, 10, 3000.0); //TODO near far need to be set depending on scene.
        this.setMatrixUniforms(mPerspective, this.glMatrix.getWorldTransform()); //<-- Set uniforms here.

        //TODO buffer attributes should not be set every draw call!!
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
        this.gl.vertexAttribPointer(this.vertexPositionAttribute, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.vertexAttribPointer(this.normalAttribute, 3, this.gl.FLOAT, false, 0, this.currentBufferPack.numPoints * 4 * 3);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
        this.gl.drawElements(this.gl.TRIANGLES, this.currentBufferPack.numIndices, this.gl.UNSIGNED_INT, 0);

    }

    private transferBuffers(lsData: BufferPack)
    {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, lsData.arrayBuffer, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, lsData.indexBuffer, this.gl.DYNAMIC_DRAW);
    }

    private initBuffers(): void
    {
        this.arrayBufferId = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
        this.indexBufferId = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
    }

    private initShaders(): void
    {
        const fragmentShader: WebGLShader = this.getShader("shader-fs", null);
        const vertexShader: WebGLShader = this.getShader("shader-vs", null);
        this.shaderProgram = this.gl.createProgram();
        this.gl.attachShader(this.shaderProgram, vertexShader);
        this.gl.attachShader(this.shaderProgram, fragmentShader);
        this.gl.linkProgram(this.shaderProgram);

        if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS))
        {
            alert("Unable to initialize the shader program: where the heck is my shader variable");
        }

        this.gl.useProgram(this.shaderProgram);
        this.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition");
        this.gl.enableVertexAttribArray(this.vertexPositionAttribute);
        this.normalAttribute = this.gl.getAttribLocation(this.shaderProgram, "aNormal");
        this.gl.enableVertexAttribArray(this.normalAttribute);

    }

    //TODO fix these any types
    private getShader(id: any, type: any): WebGLShader
    {
        const shaderScript: HTMLScriptElement = document.getElementById(id) as HTMLScriptElement; //TODO reference to global document. Maybe change to use DocElements
        if (!shaderScript)
        {
            return null;
        }

        const theSource: string = shaderScript.text;

        //TODO get rid of the type parameter as we pick it up from the mime type.
        if (!type)
        {
            if (shaderScript.type === "x-shader/x-fragment")
            {
                type = this.gl.FRAGMENT_SHADER;
            } else if (shaderScript.type === "x-shader/x-vertex")
            {
                type = this.gl.VERTEX_SHADER;
            } else
            {
                return null; // Unknown shader type
            }
        }
        const shader: WebGLShader = this.gl.createShader(type);
        this.gl.shaderSource(shader, theSource);

        // Compile the shader program
        this.gl.compileShader(shader);

        // See if it compiled successfully
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS))
        {
            alert("An error occurred compiling the shaders: " + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;

    }

    private setMatrixUniforms(perspectiveMatrix: TSM.mat4, mvMatrix: TSM.mat4): void
    {
        const pUniform = this.gl.getUniformLocation(this.shaderProgram, "uPMatrix");
        this.gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.all()));

        const mvUniform = this.gl.getUniformLocation(this.shaderProgram, "uMVMatrix");
        this.gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix.all()));
    }

}