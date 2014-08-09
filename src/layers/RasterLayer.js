/*globals WebGL */

function RasterLayer(url) {"use strict";
    var gl = null, map, texture, sphereGeometry, shaderProgram;
    
    this.canvas = null;
    this.projection = null;
    this.mapScale = 1;
    this.mapCenter = {
        lon0 : 0,
        lat0 : 0
    };

    this.render = function() {
		var uniforms, adaptiveGridConf;

        if (!texture.imageLoaded || gl === null) {
            return;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "texture"), 0);
        uniforms = this.projection.getShaderUniforms();
        adaptiveGridConf = {
			useAdaptiveResolutionGrid : map.isAdaptiveResolutionGrid(),
			geometryBBox : this.visibleGeometryBoundingBoxCenteredOnLon0,
			mapScale : map.getZoomFactor(),
			startScaleLimit : map.conf.zoomLimit2
        };
        
        WebGL.draw(gl, map.isRenderingWireframe(), this.mapScale / this.refScaleFactor * this.glScale, this.mapCenter.lon0, uniforms, this.canvas, sphereGeometry, shaderProgram, adaptiveGridConf);
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
        shaderProgram = WebGL.loadShaderProgram(gl, 'shader/vs/forward.vert', 'shader/fs/forward.frag');
        texture = gl.createTexture();
        sphereGeometry = WebGL.loadGeometry(gl, map.getGeometryResolution());
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
        sphereGeometry = WebGL.loadGeometry(gl, map.getGeometryResolution());
    };
    
    this.resize = function(w, h) {
        if (gl !== null) {
            // http://www.khronos.org/registry/webgl/specs/1.0/#2.3
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    };
}