/*globals WebGL */

function RasterLayer(url) {"use strict";

    //RasterLayer.prototype = new AbstractLayer();
    //AbstractLayer.call(this, null /*style*/, null /*scaleVisibility*/);

    var gl = null, map, texture, sphereGeometry, shaderProgram;
    
	//Measuring time
	var stats = new Stats();
    //stats.setMode( 2 );
    //document.body.appendChild( stats.domElement );
   
	document.getElementById("FPS").appendChild( stats.domElement );

    this.canvas = null;
    this.projection = null;
    this.mapScale = 1;
    this.mapCenter = {
        lon0 : 0,
        lat0 : 0
    };

    this.render = function() {
        if (!texture.imageLoaded || gl === null) {
            return;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "texture"), 0);
        var uniforms = this.projection.getShaderUniforms();
        stats.begin();
        WebGL.draw(gl, map.isRenderingWireframe(), this.mapScale / this.refScaleFactor * this.glScale, this.mapCenter.lon0, uniforms, this.canvas, sphereGeometry, shaderProgram);
        stats.end();
		//document.getElementById("FPS").innerHTML = "<b>Rendering speed:</b> " + stats.ms() + " ms, " + stats.fps() + " fps.";
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
        sphereGeometry = WebGL.loadGeometry(gl);
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

    this.resize = function(w, h) {
        if (gl !== null) {
            // http://www.khronos.org/registry/webgl/specs/1.0/#2.3
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    };
}