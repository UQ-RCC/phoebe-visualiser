"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_managers_1 = require("./event-managers");
const nav_elements_1 = require("./nav-elements");
const glm = require("gl-matrix");
const $ = require("jquery");
const gl_matrix_1 = require("gl-matrix");
const util = require("util");
class LightVector {
    constructor() {
        this.vLight = glm.vec3.fromValues(0, 0, 1);
        this.qCurrentRot = glm.quat.create();
        this.reset();
    }
    reset() {
        this.vLight = glm.vec3.fromValues(0, 0, 1);
        this.qCurrentRot = glm.quat.create();
    }
    incRotation(qNewRotation) {
        glm.quat.multiply(this.qCurrentRot, this.qCurrentRot, qNewRotation);
    }
    getLightVector() {
        return glm.vec3.transformQuat(gl_matrix_1.vec3.create(), this.vLight, this.qCurrentRot);
    }
}
exports.LightVector = LightVector;
class GLMatrix {
    constructor() {
        this.vCentreT = glm.vec3.create(); // Set when model loaded
        this.vTranslateXY = glm.vec3.create(); // Incremented by input control on xy
        this.vTranslateZ = glm.vec3.create(); // Incremented by input control on Z
        this.qCurrentRot = glm.quat.create(); // Increment by input control
        this.mPerspectiveT = glm.mat4.create();
        this.mWorldT = glm.mat4.create();
        this.mCenterT = glm.mat4.create();
        glm.mat4.perspective(this.mPerspectiveT, 20.0, 640 / 480, 100, 10000); // near far setting should be calculated
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
class TexturePack {
    constructor() {
        this.vertexBuf = [];
        this.show = false;
    }
    setBuffer(w, h, d) {
        let z = d / 2;
        this.vertexBuf = [0, 0, z, 0, h, z, w, h, 0];
    }
    getBuffer() {
        return this.vertexBuf;
    }
    getNormal() {
        return [0, 0, -1, 0, 0, -1, 0, 0, -1];
    }
}
class GLContext {
    constructor() {
        // width and height of viewport and canvas drawing buffer;
        this.width = 0;
        this.height = 0;
        this.horizAspect = 1;
        this.drawCount = 0;
        this.dcount = 0;
        this.texturePack = new TexturePack();
        this.canvas = $("#canvas").get(0);
        this.glMatrix = new GLMatrix();
        this.lightVector = new LightVector();
        this.initGLMatrixInitialised = false;
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
        this.initTextShader();
        this.resize("GLContext::Constructor");
        const mm = new event_managers_1.MouseManager(this.canvas, this, this.glMatrix, this.lightVector);
        window.addEventListener("resize", () => { this.resize("Window::Event"); });
        //const timeKeeper: TimeKeep = new TimeKeep(xRange, this.drawScene, this.glMatrix);  // xRange is the slider
        //timeKeeper.start();
    }
    static getInstance() {
        if (!this.singletonGlContext) {
            this.singletonGlContext = new GLContext();
            nav_elements_1.NavController.getInstance().addResizable(this.singletonGlContext);
        }
        return this.singletonGlContext;
    }
    reinitialiseGLMatrix() {
        this.initGLMatrixInitialised = false;
    }
    resetScene() {
        this.initGLMatrixInitialised = false;
        this.lightVector.reset();
        this.setBufferPack(this.currentBufferPack);
    }
    drawImageTexture(width, height, depth) {
        console.log(`GLContext drawing image texture ${width} ${height} ${depth}`);
        this.texturePack.setBuffer(width, height, depth);
        this.texturePack.show = true;
        this.drawScene("GLContext::drawImageTexture");
    }
    setBufferPack(bufferPack) {
        if (bufferPack) {
            console.log(`buffer pack set [${bufferPack.xMag} ${bufferPack.yMag} ${bufferPack.zMag}]`);
        }
        else {
            console.log(`null buffer pack`);
        }
        this.currentBufferPack = bufferPack;
        if (bufferPack) {
            if (!this.initGLMatrixInitialised) {
                this.glMatrix.initialise(bufferPack);
                this.initGLMatrixInitialised = true;
            }
            this.transferBuffers(this.currentBufferPack);
        }
        this.drawScene("GLContext::setBufferPack");
    }
    setTexturePack(texture) {
    }
    clear() {
        this.currentBufferPack = null;
        this.drawScene("GLContext::clear");
    }
    resize(called) {
        if ((this.width !== this.canvas.clientWidth) || (this.height !== this.canvas.clientHeight)) {
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
    drawScene(from) {
        this.drawCount++;
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        if (this.currentBufferPack) {
            this.gl.useProgram(this.shaderProgram);
            this.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition");
            this.gl.enableVertexAttribArray(this.vertexPositionAttribute);
            this.normalAttribute = this.gl.getAttribLocation(this.shaderProgram, "aNormal");
            this.gl.enableVertexAttribArray(this.normalAttribute);
            //TODO near far need to be set depending on scene--this is in the bufferpack as well check
            const mPerspective = glm.mat4.perspective(glm.mat4.create(), 45, this.width / this.height, 10, 3000.0);
            const chanColour = this.currentBufferPack.getColour();
            this.setMatrixUniforms(this.shaderProgram, mPerspective, this.glMatrix.getWorldTransform(), this.lightVector.getLightVector(), chanColour); //<-- Set uniforms here.
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.arrayBufferId);
            this.gl.vertexAttribPointer(this.vertexPositionAttribute, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.vertexAttribPointer(this.normalAttribute, 3, this.gl.FLOAT, false, 0, this.currentBufferPack.numPoints * 4 * 3);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBufferId);
            this.gl.drawElements(this.gl.TRIANGLES, this.currentBufferPack.numIndices, this.gl.UNSIGNED_INT, 0);
        }
        if (this.texturePack.show == true) {
            this.gl.useProgram(this.textProgram);
            this.vertexPositionAttribute = this.gl.getAttribLocation(this.textProgram, "aVertexPosition");
            this.gl.enableVertexAttribArray(this.vertexPositionAttribute);
            console.log(`draw triangle`);
            const mPerspective = glm.mat4.perspective(glm.mat4.create(), 45, this.width / this.height, 10, 3000.0);
            //const chanColour: glm.vec4 = this.currentBufferPack.getColour();
            let v4 = glm.vec4.fromValues(0.8, 0.8, 0.8, 1.0);
            this.setMatrixUniforms(this.textProgram, mPerspective, this.glMatrix.getWorldTransform(), this.lightVector.getLightVector(), v4); //<-- Set uniforms here.
            //let textBuffID: WebGLBuffer;
            let textBuf = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, textBuf);
            this.gl.vertexAttribPointer(this.vertexPositionAttribute, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.texturePack.getBuffer()), this.gl.STATIC_DRAW);
            this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
            console.log(`${this.dcount++} : ${util.inspect(this.texturePack.getBuffer())}`);
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
        // this.gl.useProgram(this.shaderProgram);
        // this.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition");
        // this.gl.enableVertexAttribArray(this.vertexPositionAttribute);
        // this.normalAttribute = this.gl.getAttribLocation(this.shaderProgram, "aNormal");
        // this.gl.enableVertexAttribArray(this.normalAttribute);
    }
    initTextShader() {
        const fragmentShader = this.getShader("shader-fs-text", null);
        const vertexShader = this.getShader("shader-vs", null);
        this.textProgram = this.gl.createProgram();
        this.gl.attachShader(this.textProgram, vertexShader);
        this.gl.attachShader(this.textProgram, fragmentShader);
        this.gl.linkProgram(this.textProgram);
        if (!this.gl.getProgramParameter(this.textProgram, this.gl.LINK_STATUS)) {
            alert("Unable to initialize the texture shader program");
        }
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
    setMatrixUniforms(shaderProgram, perspectiveMatrix, mvMatrix, lightVector, colourVector) {
        const pUniform = this.gl.getUniformLocation(shaderProgram, "uPMatrix");
        this.gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix));
        const mvUniform = this.gl.getUniformLocation(shaderProgram, "uMVMatrix");
        this.gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix));
        const vlUniform = this.gl.getUniformLocation(shaderProgram, "uVLight");
        this.gl.uniform3fv(vlUniform, new Float32Array(lightVector));
        const vCUniform = this.gl.getUniformLocation(shaderProgram, "uColour");
        this.gl.uniform4fv(vCUniform, new Float32Array(colourVector));
    }
    toString() {
        return "Gl Context";
    }
}
exports.GLContext = GLContext;
//# sourceMappingURL=gl-context.js.map