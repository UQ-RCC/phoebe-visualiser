import { MouseManager } from "./event-managers";
import { BufferState, BufferPack} from "./frame-buffer";
import { NavController } from './nav-elements';
import * as glm from 'gl-matrix';
import * as $ from 'jquery';
import * as fs from 'fs';
import { vec3 } from "gl-matrix";

export class LightVector
{
    vLight: glm.vec3 = glm.vec3.fromValues(0,0,1);
    qCurrentRot: glm.quat = glm.quat.create();

    constructor()
    {
        this.reset();
    }

    public reset(): void
    {
        this.vLight = glm.vec3.fromValues(0,0,1);
        this.qCurrentRot = glm.quat.create();
    }

    public incRotation(qNewRotation: glm.quat): void
    {
        glm.quat.multiply(this.qCurrentRot, this.qCurrentRot, qNewRotation);
    }

    public getLightVector(): glm.vec3
    {        
        return glm.vec3.transformQuat(vec3.create(), this.vLight, this.qCurrentRot);        
    }

}

export class GLMatrix
{
    
    vCentreT: glm.vec3  = glm.vec3.create(); // Set when model loaded
    vTranslateXY: glm.vec3  = glm.vec3.create(); // Incremented by input control on xy
    vTranslateZ: glm.vec3 = glm.vec3.create(); // Incremented by input control on Z
    qCurrentRot: glm.quat = glm.quat.create(); // Increment by input control
    readonly mPerspectiveT: glm.mat4 = glm.mat4.create();

    private mWorldT: glm.mat4 = glm.mat4.create();
    mCenterT: glm.mat4 = glm.mat4.create();
    modelRadius: number;

    constructor()
    {
        glm.mat4.perspective(this.mPerspectiveT, 20.0, 640 / 480, 100, 10000); // near far setting should be calculated
    }

    initialise(bufferPack: BufferPack): void
    {
        glm.quat.identity(this.qCurrentRot);
        this.modelRadius = Math.max(bufferPack.xMag, bufferPack.yMag, bufferPack.zMag) / 2.0;
        this.vCentreT = glm.vec3.fromValues(
            (bufferPack.xMag / 2.0 + bufferPack.b[0]) * -1.0,
            (bufferPack.yMag / 2.0 + bufferPack.b[2]) * -1.0,
            (bufferPack.zMag / 2.0 + bufferPack.b[4]) * -1.0
        );
        glm.mat4.translate(this.mCenterT, this.mCenterT, this.vCentreT);
        this.vTranslateZ = glm.vec3.fromValues(0, 0, -500);
        this.vTranslateXY = glm.vec3.fromValues(0, 0, 0);
    }


    incRotation(qNewRotation: glm.quat): void
    {        
        glm.quat.multiply(this.qCurrentRot, this.qCurrentRot, qNewRotation);
    }

    incTranslationXY(vNewTranslation: glm.vec3): void
    {
        const modelCentre: number = this.vCentreT[2] + this.vTranslateZ[2]; //TODO what's this??        
        glm.vec3.add(this.vTranslateXY, this.vTranslateXY, vNewTranslation);
    }

    incTranslationZ(vNewTranslation: glm.vec3): void
    {        
        glm.vec3.add(this.vTranslateZ, this.vTranslateZ, vNewTranslation);        
    }

    getZPlane(): number
    {
        return this.vCentreT[2] + this.vTranslateZ[2];
    }

    getWorldTransform(): glm.mat4
    {
        const mWorldT = glm.mat4.create();        
        glm.mat4.translate(mWorldT, mWorldT, this.vTranslateZ);        
        glm.mat4.translate(mWorldT, mWorldT, this.vTranslateXY);        
        glm.mat4.multiply(mWorldT, mWorldT, glm.mat4.fromQuat(glm.mat4.create(), this.qCurrentRot));
        glm.mat4.translate(mWorldT, mWorldT, this.vCentreT);
        return mWorldT;
    }

}

export class GLContext
{

    private static singletonGlContext: GLContext;

    private readonly canvas: HTMLCanvasElement;
    private readonly glMatrix: GLMatrix;
    private readonly lightVector: LightVector;

    private initGLMatrixInitialised;
    
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
    
    public static getInstance(): GLContext
    {
        if (!this.singletonGlContext)
        {
            this.singletonGlContext = new GLContext();
            NavController.getInstance().addResizable(this.singletonGlContext);
        }
        return this.singletonGlContext;
    }

   private constructor()
    {
        this.canvas = $("#canvas").get(0) as HTMLCanvasElement;
        this.glMatrix = new GLMatrix();
        this.lightVector = new LightVector();
        this.initGLMatrixInitialised = false;

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
        
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.initBuffers();
        this.initShaders();
        this.resize("GLContext::Constructor");
        const mm: MouseManager = new MouseManager(this.canvas, this, this.glMatrix, this.lightVector);
        window.addEventListener("resize", () => { this.resize("Window::Event"); });

        //const timeKeeper: TimeKeep = new TimeKeep(xRange, this.drawScene, this.glMatrix);  // xRange is the slider
        //timeKeeper.start();

    }

    reinitialiseGLMatrix(): void
    {
        this.initGLMatrixInitialised = false;
    }

    resetScene(): void
    {
        this.initGLMatrixInitialised = false;
        this.lightVector.reset();
        this.setBufferPack(this.currentBufferPack);
    }

    setBufferPack(bufferPack: BufferPack): void
    {        
        this.currentBufferPack = bufferPack;        
        if (bufferPack)
        {
            if (!this.initGLMatrixInitialised)
            {
                this.glMatrix.initialise(bufferPack);
                this.initGLMatrixInitialised = true;
            }
            this.transferBuffers(this.currentBufferPack);            
        }
        this.drawScene("GLContext::setBufferPack");
    }

    clear(): void
    {        
        this.currentBufferPack = null;
        this.drawScene("GLContext::clear");
    }

    resize(called: string): void
    {
        if ((this.width !== this.canvas.clientWidth) || (this.height !== this.canvas.clientHeight))
        {
            
            this.width = this.canvas.clientWidth;
            this.height = this.canvas.clientHeight;
            this.horizAspect = this.height / this.width;
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            this.gl.viewport(0, 0, this.width, this.height); // Change to this...
            this.drawScene("GLContext::resize");
            console.log(`  TGL canvas: ${this.canvas.width} x ${this.canvas.height}`);
        }
    }

    drawScene(from: string): void
    {
        this.drawCount++;        
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        if (this.currentBufferPack)
        {
            //TODO near far need to be set depending on scene--this is in the bufferpack as well check
            const mPerspective = glm.mat4.perspective(glm.mat4.create(), 45, this.width / this.height, 10, 3000.0);

            
            const tempColour: glm.vec4 = glm.vec4.fromValues(1,0,0,1);
            
            this.setMatrixUniforms(mPerspective, this.glMatrix.getWorldTransform(), this.lightVector.getLightVector(), tempColour); //<-- Set uniforms here.
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
            this.gl.vertexAttribPointer(this.vertexPositionAttribute, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.vertexAttribPointer(this.normalAttribute, 3, this.gl.FLOAT, false, 0, this.currentBufferPack.numPoints * 4 * 3);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
            this.gl.drawElements(this.gl.TRIANGLES, this.currentBufferPack.numIndices, this.gl.UNSIGNED_INT, 0);
        }

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

    private setMatrixUniforms(perspectiveMatrix: glm.mat4, mvMatrix: glm.mat4, lightVector: glm.vec3, colourVector: glm.vec4): void
    {
        const pUniform = this.gl.getUniformLocation(this.shaderProgram, "uPMatrix");        
        this.gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix));

        const mvUniform = this.gl.getUniformLocation(this.shaderProgram, "uMVMatrix");        
        this.gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix));

        const vlUniform = this.gl.getUniformLocation(this.shaderProgram, "uVLight");
        this.gl.uniform3fv(vlUniform, new Float32Array(lightVector));

        const vCUniform = this.gl.getUniformLocation(this.shaderProgram, "uColour");        
        this.gl.uniform4fv(vCUniform, new Float32Array(colourVector));

    }

    toString(): string
    {
        return "Gl Context";
    }

}

