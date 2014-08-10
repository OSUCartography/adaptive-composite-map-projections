/*globals WebGL */

function RasterLayerInverseProjection(url) {"use strict";
    var gl = null, map, texture, sphereGeometry, shaderProgram;
    
    this.canvas = null;
    this.projection = null;
    this.mapScale = 1;
    this.mapCenter = {
        lon0 : 0,
        lat0 : 0
    };

    this.render = function() {
		var uniforms, scale;

        if (!texture.imageLoaded || gl === null) {
            return;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "texture"), 0);
        uniforms = this.projection.getShaderUniforms();
        scale = this.mapScale / this.refScaleFactor * this.glScale;
        WebGL.drawInverseProjection(gl, scale, this.mapCenter.lon0, uniforms, this.canvas, sphereGeometry, shaderProgram);       
    };

    this.clear = function() {
        if (gl !== null) {
            WebGL.clear(gl);
            gl.deleteTexture(texture);
            gl.deleteProgram(shaderProgram);
            WebGL.deleteGeometry(gl, sphereGeometry);
        }
    };

    function loadData(gl) {
        gl.clearColor(0, 0, 0, 0);
        shaderProgram = WebGL.loadShaderProgram(gl, 'shader/vs/inverse.vert', 'shader/fs/inverse.frag');
        texture = gl.createTexture();
        sphereGeometry = WebGL.loadInverseProjectionGeometry(gl);
        WebGL.loadStaticTexture(gl, url, map, texture);
        WebGL.enableAnisotropicFiltering(gl, texture);
    }

    this.load = function(m) {
        map = m;
        gl = WebGL.init(this.canvas);
        if (gl === null) {
            throw new Error("WebGL is not available. Firefox or Chrome is required.");
        }
        WebGL.addContextLostAndRestoredHandler(this.canvas, loadData);
        loadData(gl);
    };

	this.reloadGeometry = function(){
        sphereGeometry = WebGL.loadInverseProjectionGeometry(gl);
    };
    
    this.resize = function(w, h) {
        if (gl !== null) {
            // http://www.khronos.org/registry/webgl/specs/1.0/#2.3
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    };
}