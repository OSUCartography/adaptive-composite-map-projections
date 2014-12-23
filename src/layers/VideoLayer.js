/*globals WebGL */
function VideoLayer(videoDOMElement, map) {
	"use strict";

	var gl = null,
	    shaderProgram,
	    geometry = [],
	    texture = null,
	// a timer is needed to trigger rendering each frame
	// timeupdate events sent by movie would not be frequent enough for a smooth animation
	    timer;
	this.canvas = null;
	this.projection = null;
	this.mapScale = 1;
	this.mapCenter = {
		lon0 : 0,
		lat0 : 0
	};

	function initTexture() {
		texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		// repeat mode is required for inverse projection
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

		/*
		 // mipmaps for video textures seems not to be supported by Firefox (even with power of two video textures)
		 // mipmaps are only available for power of two dimensions
		 // not having mipmaps for video is not a huge problem
		 var w = videoDOMElement.videoWidth, h = videoDOMElement.videoHeight,
		 useMipMap = map.isMipMap() && WebGL.isPowerOfTwo(w) && WebGL.isPowerOfTwo(h);
		 gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, useMipMap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
		 if (useMipMap) {
		 gl.generateMipmap(gl.TEXTURE_2D);
		 }
		 */
	}

	function updateTexture() {
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoDOMElement);
	}


	this.render = function() {
		var drawMode,
		    uniforms,
		    scale,
		    adaptiveGridConf,
		    onlyRenderVideo = (this.onlyRenderVideo === undefined);

		// render() is calling itself in a rendering loop, and render() is also called when the projection changes.
		// To avoid multiple concurrent rendering loops, the current loop has to be stopped.
		window.cancelAnimationFrame(timer);

		if (gl === null || videoDOMElement.readyState < 2) {
			return;
		}

		if (texture !== null) {
			updateTexture();

			uniforms = this.projection.getShaderUniforms();
			adaptiveGridConf = {
				useAdaptiveResolutionGrid : map.isAdaptiveResolutionGrid(),
				geometryBBox : this.visibleGeometryBoundingBoxCenteredOnLon0,
				mapScale : map.getZoomFactor(),
				startScaleLimit : map.conf.zoomLimit2,
				nbrTrianglesAlongEquator : map.getNumberOfTrianglesAlongEquator()
			};
			scale = this.mapScale / this.refScaleFactor * this.glScale;
			if (map.isForwardRasterProjection()) {
				drawMode = map.isRenderingWireframe() ? gl.LINE_STRIP : gl.TRIANGLE_STRIP;
			} else {
				drawMode = map.isRenderingWireframe() ? gl.LINE_STRIP : gl.TRIANGLES;
			}
			WebGL.draw(gl, drawMode, scale, this.mapCenter.lon0, uniforms, this.canvas, geometry, shaderProgram, adaptiveGridConf);
		}

		// if video is paused, don't render next frame
		if (!videoDOMElement.paused) {
			timer = window.requestAnimationFrame(function() {
				map.render(false, true);
			});
		}
	};

	this.clear = function() {
		window.cancelAnimationFrame(timer);
		timer = null;
		if (gl !== null) {
			WebGL.clear(gl);
			gl.deleteTexture(texture);
			gl.deleteProgram(shaderProgram);
			WebGL.deleteGeometry(gl, geometry);
		}
	};

	function loadData(gl) {
		var vertexShaderName,
		    fragmentShaderName;
		gl.clearColor(0, 0, 0, 0);
		if (map.isForwardRasterProjection()) {
			vertexShaderName = 'shader/vs/forward.vert';
			fragmentShaderName = 'shader/fs/forward.frag';
		} else {
			vertexShaderName = 'shader/vs/inverse.vert';
			fragmentShaderName = 'shader/fs/inverse.frag';
		}
		shaderProgram = WebGL.loadShaderProgram(gl, vertexShaderName, fragmentShaderName);

		if (map.isForwardRasterProjection()) {
			geometry = WebGL.loadSphereGeometry(gl, map.getNumberOfTrianglesAlongEquator());
		} else {
			geometry = WebGL.loadRectangleGeometry(gl);
		}

		videoDOMElement.setAttribute("playsinline", "");
		videoDOMElement.setAttribute("webkit-playsinline", "");

		initTexture();
		gl.uniform1i(gl.getUniformLocation(shaderProgram, "texture"), 0);

		if (map.isAnistropicFiltering()) {
			WebGL.enableAnisotropicFiltering(gl, texture);
		}
	}


	this.load = function(m) {
		map = m;
		gl = WebGL.init(this.canvas);
		if (gl === null) {
			throw new Error("WebGL is not available.");
		}
		loadData(gl);
		
		// stop rendering when movie ended
		videoDOMElement.addEventListener("ended", function() {
			window.cancelAnimationFrame(timer);
		}, true);

		// stop rendering when movie is paused
		videoDOMElement.addEventListener("pause", function() {
			window.cancelAnimationFrame(timer);
		}, true);

		// start rendering when movie starts playing
		videoDOMElement.addEventListener("playing", function() {
			map.render(false);
		}, true);

		// movie "seeked" to another time
		videoDOMElement.addEventListener("seeked", function() {
			if (videoDOMElement.paused) {
				map.render(false);
			}
		}, true);
	};

	this.reloadData = function() {
		this.clear();
		loadData(gl);
	};

	this.reloadGeometry = function() {
		geometry = WebGL.loadSphereGeometry(gl, map.getNumberOfTrianglesAlongEquator());
	};

	this.resize = function(w, h) {
		if (gl !== null) {
			// http://www.khronos.org/registry/webgl/specs/1.0/#2.3
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		}
	};

	this.play = function() {
		if (videoDOMElement.paused) {
			videoDOMElement.play();
		}
	};

	this.pause = function() {
		if (!videoDOMElement.paused) {
			videoDOMElement.pause();
		}
	};
}