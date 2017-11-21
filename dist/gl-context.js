"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_managers_1 = require("./event-managers");
const glm = require("gl-matrix");
const $ = require("jquery");
class GLMatrix {
    constructor() {
        this.vCentreT = glm.vec3.create(); // Set when model loaded
        this.vTranslateXY = glm.vec3.create(); // Incremented by input control on xy
        this.vTranslateZ = glm.vec3.create(); // Incremented by input control on Z
        this.qCurrentRot = glm.quat.create(); // Increment by input control
        this.mPerspectiveT = glm.mat4.create();
        this.mWorldT = glm.mat4.create();
        this.mCenterT = glm.mat4.create();
        console.log(`Initialize GLMatrix`);
        // glm.quat.identity(this.qCurrentRot);
        // this.modelRadius = Math.max(bufferPack.xMag, bufferPack.yMag, bufferPack.zMag) / 2.0;
        // this.vCentreT = glm.vec3.fromValues(
        //     (bufferPack.xMag / 2.0 + bufferPack.b[0]) * -1.0,
        //     (bufferPack.yMag / 2.0 + bufferPack.b[2]) * -1.0,
        //     (bufferPack.zMag / 2.0 + bufferPack.b[4]) * -1.0
        // );
        glm.mat4.perspective(this.mPerspectiveT, 20.0, 640 / 480, 100, 10000); // near far setting should be calculated
        //this.mCenterT = glm.mat4.identity.copy();
        //this.mCenterT = glm.mat4.create();
        //this.mCenterT.translate(this.vCentreT);
        // glm.mat4.translate(this.mCenterT, this.mCenterT, this.vCentreT);
        // this.vTranslateZ = glm.vec3.fromValues(0, 0, -500);
        // this.vTranslateXY = glm.vec3.fromValues(0, 0, 0);
    }
    initialise(bufferPack) {
        glm.quat.identity(this.qCurrentRot);
        this.modelRadius = Math.max(bufferPack.xMag, bufferPack.yMag, bufferPack.zMag) / 2.0;
        this.vCentreT = glm.vec3.fromValues((bufferPack.xMag / 2.0 + bufferPack.b[0]) * -1.0, (bufferPack.yMag / 2.0 + bufferPack.b[2]) * -1.0, (bufferPack.zMag / 2.0 + bufferPack.b[4]) * -1.0);
        glm.mat4.translate(this.mCenterT, this.mCenterT, this.vCentreT);
        this.vTranslateZ = glm.vec3.fromValues(0, 0, -500);
        this.vTranslateXY = glm.vec3.fromValues(0, 0, 0);
    }
    incRotation(qNewRotation) {
        glm.quat.multiply(this.qCurrentRot, this.qCurrentRot, qNewRotation);
        console.log(`rotating...`);
    }
    incTranslationXY(vNewTranslation) {
        const modelCentre = this.vCentreT[2] + this.vTranslateZ[2]; //TODO what's this??        
        glm.vec3.add(this.vTranslateXY, this.vTranslateXY, vNewTranslation);
    }
    incTranslationZ(vNewTranslation) {
        glm.vec3.add(this.vTranslateZ, this.vTranslateZ, vNewTranslation);
    }
    getZPlane() {
        return this.vCentreT[2] + this.vTranslateZ[2];
    }
    getWorldTransform() {
        const mWorldT = glm.mat4.create();
        glm.mat4.translate(mWorldT, mWorldT, this.vTranslateZ);
        glm.mat4.translate(mWorldT, mWorldT, this.vTranslateXY);
        glm.mat4.multiply(mWorldT, mWorldT, glm.mat4.fromQuat(glm.mat4.create(), this.qCurrentRot));
        glm.mat4.translate(mWorldT, mWorldT, this.vCentreT);
        return mWorldT;
    }
}
exports.GLMatrix = GLMatrix;
class GLContext {
    constructor() {
        // width and height of viewport and canvas drawing buffer;
        this.width = 0;
        this.height = 0;
        this.horizAspect = 1;
        this.drawCount = 0;
        this.canvas = $("#canvas").get(0);
        this.glMatrix = new GLMatrix();
        this.gl = this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl");
        if (!this.gl) {
            alert("Unable to initialize WebGL. Your browser may not support it.");
            console.log("Unable to initialize WebGL. Your browser may not support it.");
        }
        const ext = this.gl.getExtension("OES_element_index_uint");
        if (!ext) {
            alert("OES_element_index_uint is missing");
            console.log("OES_element_index_uint is missing");
            return;
        }
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.initBuffers();
        this.initShaders();
        this.resize();
        const mm = new event_managers_1.MouseManager(this.canvas, this, this.glMatrix);
        window.addEventListener("resize", () => { this.resize(); });
        //const timeKeeper: TimeKeep = new TimeKeep(xRange, this.drawScene, this.glMatrix);  // xRange is the slider
        //timeKeeper.start();
    }
    static getInstance() {
        if (!this.singletonGlContext) {
            this.singletonGlContext = new GLContext();
        }
        return this.singletonGlContext;
    }
    setBufferPack(bufferPack) {
        //reinitialise if new bufferPack
        if (!this.currentBufferPack) {
            this.glMatrix.initialise(bufferPack);
        }
        this.currentBufferPack = bufferPack;
        this.drawScene("GLContext::setBufferPack");
    }
    clear() {
        this.currentBufferPack = null;
        this.drawScene("GLContext::clear");
    }
    resize() {
        if ((this.width !== this.canvas.clientWidth) || (this.height !== this.canvas.clientHeight)) {
            this.width = this.canvas.clientWidth;
            this.height = this.canvas.clientHeight;
            this.horizAspect = this.height / this.width;
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            this.gl.viewport(0, 0, this.width, this.height); // Change to this...
            this.drawScene("GLContext::resize");
        }
    }
    drawScene(from) {
        this.drawCount++;
        console.log(`draw count: ${this.drawCount} (${from})`);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        if (this.currentBufferPack) {
            //TODO near far need to be set depending on scene--this is in the bufferpack as well check
            const mPerspective = glm.mat4.perspective(glm.mat4.create(), 45, this.width / this.height, 10, 3000.0);
            this.setMatrixUniforms(mPerspective, this.glMatrix.getWorldTransform()); //<-- Set uniforms here.
            this.transferBuffers(this.currentBufferPack); // Call when new has been set.
            //TODO buffer attributes should not be set every draw call!!
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
            this.gl.vertexAttribPointer(this.vertexPositionAttribute, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.vertexAttribPointer(this.normalAttribute, 3, this.gl.FLOAT, false, 0, this.currentBufferPack.numPoints * 4 * 3);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
            this.gl.drawElements(this.gl.TRIANGLES, this.currentBufferPack.numIndices, this.gl.UNSIGNED_INT, 0);
        }
    }
    transferBuffers(lsData) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, lsData.arrayBuffer, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, lsData.indexBuffer, this.gl.DYNAMIC_DRAW);
    }
    initBuffers() {
        this.arrayBufferId = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
        this.indexBufferId = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
    }
    initShaders() {
        const fragmentShader = this.getShader("shader-fs", null);
        const vertexShader = this.getShader("shader-vs", null);
        this.shaderProgram = this.gl.createProgram();
        this.gl.attachShader(this.shaderProgram, vertexShader);
        this.gl.attachShader(this.shaderProgram, fragmentShader);
        this.gl.linkProgram(this.shaderProgram);
        if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
            alert("Unable to initialize the shader program: where the heck is my shader variable");
        }
        this.gl.useProgram(this.shaderProgram);
        this.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition");
        this.gl.enableVertexAttribArray(this.vertexPositionAttribute);
        this.normalAttribute = this.gl.getAttribLocation(this.shaderProgram, "aNormal");
        this.gl.enableVertexAttribArray(this.normalAttribute);
    }
    //TODO fix these any types
    getShader(id, type) {
        const shaderScript = document.getElementById(id); //TODO reference to global document. Maybe change to use DocElements
        if (!shaderScript) {
            return null;
        }
        const theSource = shaderScript.text;
        //TODO get rid of the type parameter as we pick it up from the mime type.
        if (!type) {
            if (shaderScript.type === "x-shader/x-fragment") {
                type = this.gl.FRAGMENT_SHADER;
            }
            else if (shaderScript.type === "x-shader/x-vertex") {
                type = this.gl.VERTEX_SHADER;
            }
            else {
                return null; // Unknown shader type
            }
        }
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, theSource);
        // Compile the shader program
        this.gl.compileShader(shader);
        // See if it compiled successfully
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            alert("An error occurred compiling the shaders: " + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
    setMatrixUniforms(perspectiveMatrix, mvMatrix) {
        const pUniform = this.gl.getUniformLocation(this.shaderProgram, "uPMatrix");
        //this.gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.all()));
        this.gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix));
        const mvUniform = this.gl.getUniformLocation(this.shaderProgram, "uMVMatrix");
        //this.gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix.all()));
        this.gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix));
    }
}
exports.GLContext = GLContext;
//# sourceMappingURL=gl-context.js.map