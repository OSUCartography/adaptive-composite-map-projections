/*globals WebGLDebugUtils, J3DIMatrix4, Float32Array, isPowerOfTwo, nextHighestPowerOfTwo */

function WebGL() {
    "use strict";
}

WebGL.hasWebGL = function () {
    "use strict";
    try {
        var canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
};

WebGL.isPowerOfTwo = function (value) {
    return (value & (value - 1)) === 0 && value !== 0;
};

/**
 * Creates a webgl context. From webgl-utils.js
 * @param {!Canvas} canvas The canvas tag to get context from.
 * @return {!WebGLContext} The created context.
 */
WebGL.create3DContext = function (canvas, opt_attribs) {
    "use strict";
    var context,
            i,
            names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
    context = null;
    for (i = 0; i < names.length; i += 1) {
        try {
            context = canvas.getContext(names[i], opt_attribs);
        } catch (ignore) {
        }
        if (context) {
            break;
        }
    }
    return context;
};

WebGL.loadShader = function (gl, url) {
    "use strict";

    // http://www.khronos.org/message_boards/showthread.php/7170-How-to-include-shaders
    var shader,
            req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send(null);
    if (req.status !== 200/* http */ && req.status !== 0 /* local file*/) {
        throw new Error("Could not load shader at " + url);
    }

    shader = gl.createShader(url.endsWith("frag") ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
    gl.shaderSource(shader, req.responseText);

    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw gl.getShaderInfoLog(shader);
    }
    return shader;
};

/**
 * Enables anisotropic filtering extension if available.
 * Only makes sense for mip maps, which are only available for power-of-two textures
 */
WebGL.enableAnisotropicFiltering = function (gl, texture) {
    "use strict";
    var max,
            ext;
    ext = (gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('MOZ_EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'));
    if (ext !== null) {
        max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }
};

WebGL.init = function (canvas) {
    "use strict";

    // simulate lost context
    if (typeof WebGLDebugUtils !== 'undefined') {
        // http://www.khronos.org/webgl/wiki/HandlingContextLost#Use_the_context_lost_simulator_to_help_find_issues
        canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas);
        //canvas.loseContextInNCalls(50);
    }

    // parameters: http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.2.1
    var gl = WebGL.create3DContext(canvas, {
        alpha: true,
        depth: false,
        stencil: false,
        // antialiasing is not available everywhere. For example, currently not with Firefox and Chrome on Mac.
        antialias: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false
    });
    if (gl === null) {
        return null;
    }

    // test for texture mapping support
    // https://developer.mozilla.org/en-US/docs/Web/WebGL/WebGL_best_practices
    if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) <= 0) {
        return null;
    }

    if (typeof WebGLDebugUtils !== 'undefined') {
        // console.log("Creating WebGL debug context");
        // http://www.khronos.org/webgl/wiki/Debugging
        gl = WebGLDebugUtils.makeDebugContext(gl, function (err, funcName, args) {
            throw WebGLDebugUtils.glEnumToString(err) + " was caused by call to: " + funcName;
        }/*, function(functionName, args) {
         console.log("gl." + functionName + "(" + WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
         for (var ii = 0; ii < args.length; ++ii) {
         if (args[ii] === undefined) {
         console.error("undefined passed to gl." + functionName + "(" + WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
         }
         }
         }*/);
    }

    return gl;
};

/**
 * Add webglcontextlost and webglcontextrestored event handlers.
 * When the context is lost, animation loops should be cancelled, and resources, such as texture images
 * may or may not have been loaded.
 * @param {Object} canvas
 * @param {Object} contextRestoredHandler Will receive a WebGLContext as a parameter
 */
WebGL.addContextLostAndRestoredHandler = function (canvas, contextRestoredHandler) {
    "use strict";
    // only add handlers once
    // TODO make sure handlers have not already been added

    // http://www.khronos.org/webgl/wiki/HandlingContextLost
    // add a context lost handler
    canvas.addEventListener("webglcontextlost", function (event) {
        // by default the browser does not generate the context restore event.
        // prevent the default behavior, to receive the context restore event
        event.preventDefault();
    }, false);

    // re-setup all WebGL state and re-create all WebGL resources when the context is restored.
    canvas.addEventListener("webglcontextrestored", function (event) {
        //console.log("restoring context");
        contextRestoredHandler(WebGL.init(canvas));
        //console.log("context restored");
    }, false);
};

WebGL.loadShaderProgram = function (gl, vertexShaderURL, fragmentShaderURL) {
    "use strict";
    var vertexShader,
            fragmentShader,
            shaderProgram;

    vertexShader = WebGL.loadShader(gl, vertexShaderURL);
    fragmentShader = WebGL.loadShader(gl, fragmentShaderURL);
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    gl.useProgram(shaderProgram);
    WebGL.setDefaultUniforms(gl, shaderProgram);
    return shaderProgram;
};

WebGL.setDefaultUniforms = function (gl, program) {
    "use strict";
    gl.uniform1f(gl.getUniformLocation(program, 'projectionID'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'mix1ProjectionID'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'mix2ProjectionID'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'mixWeight'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'sinLatPole'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'cosLatPole'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'meridian'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'falseNorthing'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'falseNorthing2'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'wagnerM'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'wagnerN'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'wagnerCA'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'wagnerCB'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'albersN'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'albersC'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'albersRho0'), 0);

    gl.uniform1i(gl.getUniformLocation(program, 'flagStrips'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'geometryCentralLat'), 0);
    gl.uniform2fv(gl.getUniformLocation(program, 'geometryScale'), [Math.PI, Math.PI / 2]);
};

WebGL.setUniforms = function (gl, program, scale, lon0, uniforms, canvas, adaptiveGridConf) {
    "use strict";

    var viewTransform,
            xScale,
            yScale,
            i,
            geometryBBox,
            triangleSizeRad;
    // set default uniform values that are needed, e.g. rotation on sphere
    WebGL.setDefaultUniforms(gl, program);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertexPosition'));

    gl.uniform1f(gl.getUniformLocation(program, 'meridian'), lon0);

    if (adaptiveGridConf.useAdaptiveResolutionGrid && adaptiveGridConf.mapScale > adaptiveGridConf.startScaleLimit) {
        geometryBBox = adaptiveGridConf.geometryBBox;
        gl.uniform1f(gl.getUniformLocation(program, 'geometryCentralLat'), (geometryBBox.north + geometryBBox.south) / 2);
        xScale = Math.abs(geometryBBox.east - geometryBBox.west) / 2;
        yScale = Math.abs(geometryBBox.north - geometryBBox.south) / 2;
        gl.uniform2fv(gl.getUniformLocation(program, 'geometryScale'), [xScale, yScale]);
        triangleSizeRad = 2 * Math.PI / adaptiveGridConf.nbrTrianglesAlongEquator * xScale;
    } else {
        triangleSizeRad = 2 * Math.PI / adaptiveGridConf.nbrTrianglesAlongEquator;
    }


    gl.uniform1f(gl.getUniformLocation(program, "antimeridianStripeCellSize"), triangleSizeRad * 4);

    // modelViewProjMatrix
    viewTransform = new J3DIMatrix4();
    viewTransform.scale(canvas.height / canvas.width * scale, scale, 1, 1);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'modelViewProjMatrix'), false, viewTransform.getAsFloat32Array());

    // uniforms for projections
    for (i in uniforms) {
        if (uniforms.hasOwnProperty(i)) {
            if (Array.isArray(uniforms[i])) {
                gl.uniform3f(gl.getUniformLocation(program, i), uniforms[i][0], uniforms[i][1], uniforms[i][2]);
            } else {
                gl.uniform1f(gl.getUniformLocation(program, i), uniforms[i]);
            }
        }
    }

    gl.uniform2f(gl.getUniformLocation(program, 'scaleXY'), canvas.height * scale, canvas.height * scale);
    gl.uniform2f(gl.getUniformLocation(program, 'dXY'), canvas.width / 2, canvas.height / 2);
};

/**
 * loads a tesselated "sphere". This is a grid in the range -1..1 along both axes with twice 
 * as many triangles along the x axis than along the y axis.
 */
WebGL.loadSphereGeometry = function (gl, trianglesAlongEquator) {
    "use strict";
    var vertices,
            b,
            x,
            y,
            xIdx,
            yIdx,
            startY,
            stepY,
            idxCount,
            buffer,
            geometry = {};

    b = {
        startX: -1,
        startY: -1,
        stepX: 2 / trianglesAlongEquator,
        stepY: 2 / (trianglesAlongEquator / 2),
        countX: trianglesAlongEquator,
        countY: trianglesAlongEquator / 2 + 1
    };

    vertices = new Float32Array(4 * b.countY * b.countX);
    idxCount = 0;

    //generation of one large triangle strip (S-shaped), with degenerated triangles (NO IBO, just VBO!)
    //compare url for vbo+ibo, http://dan.lecocq.us/wordpress/2009/12/25/triangle-strip-for-grids-a-construction/
    for (xIdx = 0; xIdx < b.countX; xIdx += 1) {
        x = b.startX + xIdx * b.stepX;

        if (xIdx % 2 === 0) {
            //even cols
            startY = b.startY;
            stepY = b.stepY;
        } else {
            //odd cols
            startY = -b.startY;
            stepY = -b.stepY;
        }

        for (yIdx = 0; yIdx < b.countY; yIdx += 1) {
            y = b.startY + b.stepY * yIdx;
            vertices.set([x, y, x + b.stepX, y], 4 * idxCount);
            idxCount += 1;
        }

        b.startY *= -1;
        b.stepY *= -1;
    }

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    geometry.buffer = buffer;
    geometry.vertexCount = vertices.length / 2;

    return geometry;
};

/**
 * loads a 2D rectangle covering the entire viewport
 */
WebGL.loadRectangleGeometry = function (gl) {
    "use strict";
    var vertices,
            buffer,
            geometry = {};

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    vertices = [-1, -1, +1, -1, +1, +1, +1, +1, -1, +1, -1, -1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    geometry.buffer = buffer;
    geometry.itemSize = 2;
    // FIXME not used
    geometry.vertexCount = 6;
    return geometry;
};

WebGL.deleteGeometry = function (gl, geometry) {
    "use strict";
    gl.deleteBuffer(geometry.buffer);
};

// Scale up a texture image to the next higher power of two dimension.
// Or scale down if the texture image is too large
// http://www.khronos.org/webgl/wiki/WebGL_and_OpenGL_Differences
WebGL.scaleTextureImage = function (gl, image) {
    "use strict";
    var canvas,
            maxSize,
            w = image.width,
            h = image.height;

    maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // max size of Canvas element
    // http://stackoverflow.com/questions/6081483/maximum-size-of-a-canvas-element
    // maxSize = Math.min(maxSize, 8196);

    // require a minimum texture size
    if (maxSize < 64) {
        return null;
    }

    if (!isPowerOfTwo(w) || !isPowerOfTwo(h)) {
        w = nextHighestPowerOfTwo(w);
        h = nextHighestPowerOfTwo(h);
    }

    // scale down if too large
    while (w > maxSize || h > maxSize) {
        w /= 2;
        h /= 2;
    }

    // scale image if dimensions must change
    if (w !== image.width || h !== image.height) {
        console.log("Scaling texture from " + image.width + "x" + image.height + " to " + w + "x" + h + " (maximum texture size is " + maxSize + ")");
        canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(image, 0, 0, w, h);
        image = canvas;
    }

    return image;
};

// FIXME
// texture is lost if the WebGL context is lost
// therefore don't attach any data to texture, such as texture.imageLoaded
// also should store a reference to the loaded image somewhere to avoid reloading it multiple times.
WebGL.loadStaticTexture = function (gl, url, map, texture) {
    "use strict";
    var useMipMap = map.isMipMap(),
            image = new Image();

    // FIXME
    texture.imageLoaded = false;
    image.onload = function () {
        // make power two dimensions or reduce size
        image = WebGL.scaleTextureImage(gl, image);
        if (image === null) {
            throw new Error("Invalid texture");
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        // repeat mode is required for inverse projection
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // mip maps are only available for power of two dimensions
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, useMipMap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        if (useMipMap) {
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        texture.imageLoaded = true;
        map.render();
    };

    // trigger image loading
    image.src = url;
};

WebGL.clear = function (gl) {
    "use strict";
    gl.clear(gl.COLOR_BUFFER_BIT);
};

WebGL.draw = function (gl, drawMode, scale, lon0, uniforms, canvas, geometry, shaderProgram, adaptiveGridConf) {
    "use strict";
    var vertexPositionAttribute;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(shaderProgram);
    WebGL.setUniforms(gl, shaderProgram, scale, lon0, uniforms, canvas, adaptiveGridConf);
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
    vertexPositionAttribute = gl.getAttribLocation(shaderProgram, 'vertexPosition');
    gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexPositionAttribute);
    gl.drawArrays(drawMode, 0, geometry.vertexCount);
};

WebGL.drawInverseProjection = function (gl, drawMode, scale, lon0, uniforms, canvas, geometry, shaderProgram) {
    "use strict";
    var vertexPositionAttribute;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(shaderProgram);
    WebGL.setUniforms(gl, shaderProgram, scale, lon0, uniforms, canvas);

    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
    vertexPositionAttribute = gl.getAttribLocation(shaderProgram, 'vertexPosition');
    gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexPositionAttribute);
    gl.drawArrays(drawMode, 0, geometry.vertexCount);
};
