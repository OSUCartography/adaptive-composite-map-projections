/*globals WebGL */

function RasterLayer(url) {
	"use strict";
	var gl = null, map, texture, geometry, shaderProgram;

	this.canvas = null;
	this.projection = null;
	this.mapScale = 1;
	this.mapCenter = {
		lon0 : 0,
		lat0 : 0
	};

	this.render = function() {
		var drawMode, uniforms, scale, adaptiveGridConf;

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
		scale = this.mapScale / this.refScaleFactor * this.glScale;
		if (map.isForwardRasterProjection()) {
			drawMode = map.isRenderingWireframe() ? gl.LINE_STRIP : gl.TRIANGLE_STRIP;
		} else {
			drawMode = map.isRenderingWireframe() ? gl.LINE_STRIP : gl.TRIANGLES;
		}
		WebGL.draw(gl, drawMode, scale, this.mapCenter.lon0, uniforms, this.canvas, geometry, shaderProgram, adaptiveGridConf);
	};

	this.clear = function() {
		if (gl !== null) {
			WebGL.clear(gl);
			gl.deleteTexture(texture);
			gl.deleteProgram(shaderProgram);
			WebGL.deleteGeometry(gl, geometry);
		}
	};

	function loadData(gl) {
		var vertexShaderName, fragmentShaderName;
		
		gl.clearColor(0, 0, 0, 0);
		if (map.isForwardRasterProjection()) {
			vertexShaderName = 'shader/vs/forward.vert';
			fragmentShaderName = 'shader/fs/forward.frag';
		} else {
			vertexShaderName = 'shader/vs/inverse.vert';
			fragmentShaderName = 'shader/fs/inverse.frag';
		}
		shaderProgram = WebGL.loadShaderProgram(gl, vertexShaderName, fragmentShaderName);
		texture = gl.createTexture();
		if (map.isForwardRasterProjection()) {
			geometry = WebGL.loadSphereGeometry(gl, map.getGeometryResolution());
		} else {
			geometry = WebGL.loadRectangleGeometry(gl);
		}
		WebGL.loadStaticTexture(gl, url, map, texture);
		if (map.isAnistropicFiltering()) {
			WebGL.enableAnisotropicFiltering(gl, texture);
		}
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

	this.adjustTesselationDensity = function() {
		if (map.isForwardRasterProjection()) {
			geometry = WebGL.loadSphereGeometry(gl, map.getGeometryResolution());
		}
	};
	
	this.reloadGeometry = function() {
		this.clear();
		loadData(gl);
	};

	this.resize = function(w, h) {
		if (gl !== null) {
			// http://www.khronos.org/registry/webgl/specs/1.0/#2.3
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		}
	};
}