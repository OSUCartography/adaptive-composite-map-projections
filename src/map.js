/*globals RasterLayer, VideoLayer, resizeCanvasElement */

// FIXME
var MERCATOR_LIMIT_1, MERCATOR_LIMIT_2;
var MERCATOR_LIMIT_WEB_MAP_SCALE = 6;

// distance of standard parallels from upper and lower border of map
var CONIC_STD_PARALLELS_FRACTION = 1 / 6;

// an height-to-width ratio between formatRatioLimit and 1/formatRatioLimit
// is considered to be square.
var formatRatioLimit = 0.8;

function mouseToCanvasCoordinates(e, parent) {
    // FIXME there should be a better way for this
    var node, x = e.clientX, y = e.clientY;

    // correct for scrolled document
    x += document.body.scrollLeft + document.documentElement.scrollLeft;
    y += document.body.scrollTop + document.documentElement.scrollTop;

    // correct for nested offsets in DOM
    for ( node = parent; node; node = node.offsetParent) {
        x -= node.offsetLeft;
        y -= node.offsetTop;
    }
    return {
        x : x,
        y : y
    };
}

function AdaptiveMap(parent, canvasWidth, canvasHeight, mapLayers, projectionChangeListener) {"use strict";

    // scale if map is not zoomed
    var CONSTANT_SCALE = 0.5;

    // scale limits where projections change
    var DEF_SCALE_LIMIT_1 = 1.5;
    var DEF_SCALE_LIMIT_2 = 2;
    var DEF_SCALE_LIMIT_3 = 3;
    var DEF_SCALE_LIMIT_4 = 4;
    var DEF_SCALE_LIMIT_5 = 6;

    var MERCATOR_TRANSITION_WIDTH = 0.75;

    // FIXME should not be global
    map = this;
    var layers = mapLayers;

    // if true, the center of the map and the position of standard parallels are drawn
    var drawOverlayCanvas = false;

    // FIXME scale limits should be stored in an array
    var scaleLimit1 = DEF_SCALE_LIMIT_1;
    var scaleLimit2 = DEF_SCALE_LIMIT_2;
    var scaleLimit3 = DEF_SCALE_LIMIT_3;
    var scaleLimit4 = DEF_SCALE_LIMIT_4;
    var scaleLimit5 = DEF_SCALE_LIMIT_5;

    // FIXME scale limits should be stored in an array
    this.getScaleLimits = function(factor) {
        if ( typeof factor !== "number") {
            factor = 1;
        }
        return [scaleLimit1 * factor, scaleLimit2 * factor, scaleLimit3 * factor, scaleLimit4 * factor, scaleLimit5 * factor];
    };

    // FIXME scale limits should be stored in an array
    this.setScaleLimits = function(limits, factor) {
        scaleLimit1 = limits[0] / factor;
        scaleLimit2 = limits[1] / factor;
        scaleLimit3 = limits[2] / factor;
        scaleLimit4 = limits[3] / factor;
        scaleLimit5 = limits[4] / factor;
    };

    // Latitude limit between clyindrical and conic projection at large scales
    // Use cylindrical projection between the equator and cylindricalLowerLat
    var cylindricalLowerLat = 15 * Math.PI / 180;
    // use transition between cylindricalUpperLat and cylindricalLowerLat
    var cylindricalUpperLat = 22 * Math.PI / 180;

    // use azimuthal projection if central latitude is larger (for large scales)
    var polarUpperLat = 75 * Math.PI / 180;
    // use transition between polarLowerLat and polarUpperLat
    var polarLowerLat = 60 * Math.PI / 180;

    /**
     * Use the Mercator projection if scale is larger than the value returned.
     * FIXME: MERCATOR_LIMIT_1 and MERCATOR_LIMIT_2 are not valid when
     * the small scale projection changes, as they are relative to the small-scale graticule height !?
     */

    // size of web mercator in pixels at web map scale where the transition to
    // the web mercator projection occurs
    var mercatorMapSize = Math.pow(2, 8 + MERCATOR_LIMIT_WEB_MAP_SCALE);

    // height of the adaptive map in coordinates projected with the unary sphere
    var smallScaleProjection = ProjectionFactory.getSmallScaleProjection(smallScaleMapProjectionName);
    var graticuleHeight = 2 * ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(smallScaleProjection);

    // scale factor to fill the canvas with the projected map
    var r = canvasHeight / graticuleHeight;

    // scale factor where the web mercator is used
    MERCATOR_LIMIT_2 = mercatorMapSize / (Math.PI * 2 * r);

    /**
     * scale factor where the transition towards the web mercator starts
     */
    MERCATOR_LIMIT_1 = MERCATOR_LIMIT_2 - MERCATOR_TRANSITION_WIDTH;

    // longitude and latitude of the map center in radians
    var mapCenter = {
        lon0 : 62.586903678158244 / 180 * Math.PI,
        lat0 : 16.40137942693096 / 180 * Math.PI
    };

    // maximum zoom factor
    var MAX_SCALE = 100;

    // minimum zoom factor
    var MIN_SCALE = 0.1;

    // zoom level relativ to canvas size. 1: entire map.
    var mapScale = 0.95;

    var smallScaleMapProjectionName = "Hammer";
    var rotateSmallScales = true;
    var zoomToMap = true;

    var snapEquator = true;

    function projectionChanged() {
        map.updateProjection();
        projectionChangeListener(map);
        map.render();
    }


    this.getCentralLatitude = function() {
        return mapCenter.lat0;
    };

    this.getCentralLongitude = function() {
        return mapCenter.lon0;
    };

    this.setCentralLongitude = function(lon0) {
        // FIXME test for valid values
        mapCenter.lon0 = lon0;
        projectionChangeListener(map);
        this.render();
    };

    this.setCentralLatitudeAndScale = function(lat0, scale) {
        mapCenter.lat0 = Math.max(Math.min(lat0, Math.PI / 2), -Math.PI / 2);
        mapScale = scale = Math.max(Math.min(scale, MAX_SCALE), MIN_SCALE);
        projectionChangeListener(map);
        this.render();
    };

    this.setCenter = function(lon0, lat0) {
        mapCenter.lon0 = adjlon(lon0);
        mapCenter.lat0 = Math.max(Math.min(lat0, Math.PI / 2), -Math.PI / 2);
        projectionChangeListener(map);
        this.render();
    };

    this.getMapScale = function() {
        return mapScale;
    };

    this.setMapScale = function(s) {
        mapScale = Math.max(MIN_SCALE, Math.min(s, MAX_SCALE));
        projectionChangeListener(map);
        this.render();
    };

    this.isUsingWorldMapProjection = function() {
        return mapScale < scaleLimit1;
    };

     // Compute scale factor such that the graticule fits vertically onto the canvas.
    // This defines mapScale = 1
    function referenceScaleFactor() {
        var smallScaleProjection, graticuleHeight;
        smallScaleProjection = ProjectionFactory.getSmallScaleProjection(smallScaleMapProjectionName);
        graticuleHeight = 2 * ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(smallScaleProjection);
        return canvasHeight / graticuleHeight;
    }
    
    // invert the offset and scaling applied when rendering the map layers
    this.canvasXYToUnscaledXY = function(x, y) {
        var cx, cy, scale;
        cx = canvasWidth / 2;
        cy = canvasHeight / 2;
        x -= cx;
        y = cy - y;
        scale = referenceScaleFactor() * mapScale;
        return [x / scale, y / scale];
    };

    // converts from canvas coordinates to geographic longitude and latitude.
    // the resulting geographic coordinates can be outsde of +/-PI
    this.canvasXY2LonLat = function(x, y, projection) {
        // invert the offset and scaling applied when rendering the map layers
        var pt = this.canvasXYToUnscaledXY(x, y);
        // convert to longitude / latitude
        if (!projection) {
            projection = this.updateProjection();
        }
        projection.inverse(pt[0], pt[1], pt);
        pt[0] += mapCenter.lon0;
        return pt;
    };

    // FIXME seems to be broken: apply lon0?
    this.lonLat2Canvas = function(lon, lat, proj) {
        var dy, scale, centerX, centerY, pt = [];

        if (!proj) {
            proj = map.updateProjection();
        }
        proj.forward(lon, lat, pt);

        // x = canvas.width / 2 + x * mapScale
        // y = canvas.height / 2 - dy - y * mapScale
        scale = referenceScaleFactor() * mapScale;

        dy = ( typeof proj.getFalseNorthing === 'function') ? proj.getFalseNorthing() : 0;
        centerX = canvasWidth / 2;
        centerY = canvasHeight / 2;
        pt[0] = centerX + pt[0] * scale;
        pt[1] = centerY - (pt[1] + dy) * scale;
        return pt;
    };

    this.updateProjection = function() {

        // The graticule of the transformed Lambert azimuthal projection has an invard pointing wedge
        // when w is between 0.5 and 1. To make sure this wedge is not visible, the scale limit is adjusted
        // where the transformed Lambert azimuthal projection is used.
        var scaleLimit = scaleLimit1;
        var isLandscape = (canvasHeight / canvasWidth) < formatRatioLimit;
        // FIXME add blending of scaleLimit for smooth transition after the aspect ratio of the
        // map changed (e.g. when resizing the window)
        if (!isLandscape) {
            var mapTop = this.canvasXYToUnscaledXY(canvasWidth / 2, 0)[1] * mapScale;
            var xy = [];
            TransformedLambertAzimuthal.Hammer().forward(0, Math.PI / 2, xy);
            scaleLimit = mapTop / xy[1];
        }

        this.conf = {
            mapScale : mapScale,
            lon0 : mapCenter.lon0,
            lat0 : mapCenter.lat0,
            lat1 : NaN,
            lat2 : NaN,
            scaleLimit1 : scaleLimit,
            // FIXME scaleLimit2 - scaleLimit1
            scaleLimit2 : scaleLimit + (scaleLimit2 - scaleLimit1),
            scaleLimit3 : scaleLimit3,
            scaleLimit4 : scaleLimit4,
            scaleLimit5 : scaleLimit5,
            mercatorLimit1 : MERCATOR_LIMIT_1,
            mercatorLimit2 : MERCATOR_LIMIT_2,
            centerXY : this.canvasXYToUnscaledXY(canvasWidth / 2, canvasHeight / 2),
            topPt : this.canvasXYToUnscaledXY(canvasWidth / 2, 0),
            bottomPt : this.canvasXYToUnscaledXY(canvasWidth / 2, canvasHeight),
            polarUpperLat : polarUpperLat,
            polarUpperLatDefault : polarUpperLat,
            polarLowerLat : polarLowerLat,
            mapDimension : this.canvasXYToUnscaledXY(canvasWidth, 0),
            cylindricalUpperLat : cylindricalUpperLat,
            cylindricalLowerLat : cylindricalLowerLat,
            canvasHeight : canvasHeight,
            canvasWidth : canvasWidth,
            smallScaleProjectionName : smallScaleMapProjectionName,
            referenceScaleFactor : referenceScaleFactor(),
            formatRatioLimit : formatRatioLimit,
            rotateSmallScale : rotateSmallScales
        };
        // adjust the latitude at which the azimuthal projection is used for polar areas,
        // to make sure the wedge of the Albers conic projection is not visible on the map.
        this.conf.polarUpperLat = ProjectionFactory.polarLatitudeLimitForAlbersConic(this.conf.topPt[1], mapScale, polarLowerLat, polarUpperLat);

        return ProjectionFactory.create(this.conf);
    };

    function extendRect(r, lon, lat) {
        if (lon < r.west) {
            r.west = lon;
        }
        if (lat < r.south) {
            r.south = lat;
        }
        if (lon > r.east) {
            r.east = lon;
        }
        if (lat > r.north) {
            r.north = lat;
        }
    }

    function isNorthPoleVisible(projection) {
        var poleXYCanvas = map.lonLat2Canvas(0, Math.PI / 2, projection);
        return (poleXYCanvas[0] >= 0 && poleXYCanvas[0] <= canvasWidth && poleXYCanvas[1] >= 0 && poleXYCanvas[1] <= canvasHeight);
    }

    function isSouthPoleVisible(projection) {
        var poleXYCanvas = map.lonLat2Canvas(0, -Math.PI / 2, projection);
        return (poleXYCanvas[0] >= 0 && poleXYCanvas[0] <= canvasWidth && poleXYCanvas[1] >= 0 && poleXYCanvas[1] <= canvasHeight);
    }

    function visibleGeographicBoundingBoxCenteredOnLon0(projection) {
        // FIXME
        var INC = 10,

        // bounding box
        bb = {
            west : Number.MAX_VALUE,
            south : Number.MAX_VALUE,
            east : -Number.MAX_VALUE,
            north : -Number.MAX_VALUE
        }, x, y, lonlat;

        // if a pole is visible, the complete longitude range is visible on the map
        if (isNorthPoleVisible(projection) || isSouthPoleVisible(projection)) {
            bb.west = -Math.PI + mapCenter.lon0;
            bb.east = Math.PI + mapCenter.lon0;
        }

        if (isSouthPoleVisible(projection)) {
            bb.south = -Math.PI / 2;
        }
        if (isNorthPoleVisible(projection)) {
            bb.north = Math.PI / 2;
        }

        // top and bottom border
        for ( x = 0; x < canvasWidth; x += INC) {
            lonlat = map.canvasXY2LonLat(x, 0, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
            lonlat = map.canvasXY2LonLat(x, canvasHeight, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
        }

        // left and right border
        for ( y = 0; y < canvasHeight; y += INC) {
            lonlat = map.canvasXY2LonLat(0, y, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
            lonlat = map.canvasXY2LonLat(canvasWidth, y, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
        }

        // center on central longitude
        bb.west -= mapCenter.lon0;
        bb.east -= mapCenter.lon0;

        // clamp to valid range
        if (bb.west < -Math.PI) {
            bb.west = -Math.PI;
        }
        if (bb.east > Math.PI) {
            bb.east = Math.PI;
        }
        if (bb.south < -Math.PI / 2) {
            bb.south = -Math.PI / 2;
        }
        if (bb.north > Math.PI / 2) {
            bb.north = Math.PI / 2;
        }

        return bb;
    }


    this.render = function(fastRender) {
        if (!layers) {
            return;
        }

        var projection = this.updateProjection();
        var bb = visibleGeographicBoundingBoxCenteredOnLon0(projection);

        var ctx = backgroundCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);

        var refScaleFactor = referenceScaleFactor();
        var scale = refScaleFactor * ( zoomToMap ? mapScale : CONSTANT_SCALE);

        var vectorContext = vectorCanvas.getContext('2d');
        vectorContext.setTransform(1, 0, 0, 1, 0, 0);
        vectorContext.clearRect(0, 0, vectorCanvas.width, vectorCanvas.height);

        // FIXME
        var layerID, layer;

        for ( layerID = 0; layerID < layers.length; layerID += 1) {
            //save context so that each layer can change drawing states
            vectorContext.save();

            layer = layers[layerID];
            layer.visibleGeographicBoundingBoxCenteredOnLon0 = bb;
            layer.projection = projection;

            layer.rotation = null;
            if ( typeof projection.getPoleLatitude === 'function') {
                var poleLat = projection.getPoleLatitude();
                if (poleLat !== Math.PI / 2) {
                    layer.rotation = new SphericalRotation(poleLat);
                }
            }

            layer.mapScale = scale;
            layer.relativeMapScale = mapScale;
            layer.refScaleFactor = referenceScaleFactor();
            layer.glScale = 2 * refScaleFactor / canvasHeight;
            layer.mapCenter = mapCenter;
            layer.northPoleVisible = isNorthPoleVisible(projection);
            layer.southPoleVisible = isSouthPoleVisible(projection);
            layer.map = this;
            layer.canvasWidth = canvasWidth;
            layer.canvasHeight = canvasHeight;
            layer.render(fastRender, zoomToMap);

            // restore drawing states
            vectorContext.restore();
        }

        // render overlay canvas
        var ctx = overlayCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        var cx = overlayCanvas.width / 2;
        var cy = overlayCanvas.height / 2;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.shadowColor = "gray";
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowBlur = 3;

        // mark the center of the map
        if (drawOverlayCanvas) {
            var l = 10;
            ctx.beginPath();
            ctx.moveTo(cx - l, cy);
            ctx.lineTo(cx + l, cy);
            ctx.moveTo(cx, cy - l);
            ctx.lineTo(cx, cy + l);
            ctx.stroke();
        }

        // mark standard parallels
        if (drawOverlayCanvas && !isNaN(this.conf.lat1) && !isNaN(this.conf.lat2)) {
            var pt = [];
            ctx.beginPath();
            projection.forward(0, this.conf.lat1, pt);
            ctx.moveTo(cx - l, cy - pt[1] * scale);
            ctx.lineTo(cx + l, cy - pt[1] * scale);
            projection.forward(0, this.conf.lat2, pt);
            ctx.moveTo(cx - l, cy - pt[1] * scale);
            ctx.lineTo(cx + l, cy - pt[1] * scale);
            ctx.stroke();

            // a frame around the canvas. Half of the line will be outside the canvas, so
            // use double line width.
            ctx.shadowColor = null;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
        // Draw the extension of the map if zooming is disabled.
        // With zooming enabled, this would overpaint the frame drawn above.
        // FIXME
        if (!zoomToMap) {
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.shadowBlur = 1;
            var topLeft = this.canvasXYToUnscaledXY(0, 0);
            var w = topLeft[0] * scale * 2;
            var h = topLeft[1] * scale * 2;
            ctx.globalAlpha = 0.1;
            ctx.fillRect(cx + topLeft[0] * scale, cy - topLeft[1] * scale, -w, h);
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'white';
            ctx.strokeRect(cx + topLeft[0] * scale, cy - topLeft[1] * scale, -w, h);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'black';
            ctx.strokeRect(cx + topLeft[0] * scale, cy - topLeft[1] * scale, -w, h);
        }

        // write size of the window
        if (drawOverlayCanvas) {
            var typeSize = 13;
            var txt = canvasWidth + "\u2005\u00D7\u2005" + canvasHeight;
            ctx.font = "normal normal " + typeSize + "px sans-serif";
            var metrics = ctx.measureText(txt);
            ctx.fillText(txt, canvasWidth - metrics.width - typeSize, canvasHeight - typeSize * 0.5);
        }
    };

    this.resizeMap = function(w, h) {
        var layerID;

        // FIXME remove canvasWidth and canvasHeight?
        canvasWidth = w;
        canvasHeight = h;

        resizeCanvasElement(backgroundCanvas, w, h);
        resizeCanvasElement(rasterCanvas, w, h);
        resizeCanvasElement(vectorCanvas, w, h);
        resizeCanvasElement(overlayCanvas, w, h);

        if (layers) {
            for ( layerID = 0; layerID < layers.length; layerID += 1) {
                if (layers[layerID].resize) {
                    layers[layerID].resize(w, h);
                }
            }
        }

        // apply size to parent for proper layout
        parent.style.width = w;
        parent.style.height = h;
    };

    // zoom in or out after mouse has been scrolled
    // FIXME x and y are not used
    this.zoomBy = function(s, x, y) {
        mapScale /= s;

        if (mapScale > MAX_SCALE) {
            mapScale = MAX_SCALE;
        } else if (mapScale < MIN_SCALE) {
            mapScale = MIN_SCALE;
        }

        map.render();
        projectionChangeListener(map);
    };

    function clampMapCenter() {
        mapCenter.lon0 = adjlon(mapCenter.lon0);
        var maxLat = Math.PI / 2;
        if (mapCenter.lat0 > maxLat) {
            mapCenter.lat0 = maxLat;
        } else if (mapCenter.lat0 < -maxLat) {
            mapCenter.lat0 = -maxLat;
        }
    }

    function loadMapData() {
        var layer, nLayers, i;

        //  load map layer data
        if (layers) {
            for ( i = 0, nLayers = layers.length; i < nLayers; i += 1) {
                layer = layers[i];
                if ( layer instanceof RasterLayer || layer instanceof VideoLayer) {
                    layer.canvas = rasterCanvas;
                } else {
                    layer.canvas = vectorCanvas;
                }
                layer.projection = projection;
                layer.mapScale = referenceScaleFactor() * mapScale;
                layer.mapCenter = mapCenter;
                try {
                    layer.load(map);
                } catch (e) {
                    console.log(e.name, e.message);
                }
            }
        }
    }

    var projection = this.updateProjection();

    // create a background canvas
    var backgroundCanvas = createCanvas('backgroundCanvas', parent, canvasWidth, canvasHeight);
    backgroundCanvas.style.zIndex = 1;

    // create the map canvases
    var rasterCanvas = createCanvas('rasterCanvas', parent, canvasWidth, canvasHeight);
    rasterCanvas.style.zIndex = 2;
    var vectorCanvas = createCanvas('vectorCanvas', parent, canvasWidth, canvasHeight);
    vectorCanvas.style.zIndex = 3;

    loadMapData();

    // create an overlay canvas
    var overlayCanvas = createCanvas('overlayCanvas', parent, canvasWidth, canvasHeight);
    overlayCanvas.style.zIndex = 4;

    this.resizeMap(canvasWidth, canvasHeight);

    map.render();
    projectionChangeListener(map);

    /**
     * Replace all layers of this map with a new set of layers.
     * Calls clear() of all previous layers.
     */
    this.setLayers = function(mapLayers) {
        var i, layer;
        if (layers) {
            for ( i = 0; i < layers.length; i += 1) {
                layer = layers[i];
                if ( typeof (layer.clear) === 'function') {
                    layer.clear();
                }
            }
        }
        layers = mapLayers;
        loadMapData();
    };

    this.getLargeScalePolarUpperLat = function() {
        return polarUpperLat;
    };

    this.setLargeScalePolarUpperLat = function(lat) {
        polarUpperLat = lat;
        this.render();
    };

    this.getLargeScalePolarLowerLat = function() {
        return polarLowerLat;
    };

    this.setLargeScalePolarLowerLat = function(lat) {
        polarLowerLat = lat;
        this.render();
    };

    this.getLargeScaleCylindricalLowerLat = function() {
        return cylindricalLowerLat;
    };

    this.setLargeScaleCylindricalLowerLat = function(lat) {
        cylindricalLowerLat = lat;
        this.render();
    };

    this.getLargeScaleCylindricalUpperLat = function() {
        return cylindricalUpperLat;
    };

    this.setLargeScaleCylindricalUpperLat = function(lat) {
        cylindricalUpperLat = lat;
        this.render();
    };

    this.setSmallScaleMapProjectionName = function(name) {
        smallScaleMapProjectionName = name;
        projectionChanged();
    };

    this.getSmallScaleMapProjectionName = function() {
        return smallScaleMapProjectionName;
    };

    this.setRotateSmallScales = function(rotate) {
        rotateSmallScales = rotate;
        projectionChanged();
    };

    this.isRotateSmallScale = function() {
        return rotateSmallScales;
    };

    this.isZoomToMap = function() {
        return zoomToMap;
    };

    this.setZoomToMap = function(zoom) {
        zoomToMap = zoom;
        projectionChanged();
    };

    this.isDrawingOverlay = function() {
        return drawOverlayCanvas;
    };

    this.setDrawOverlay = function(draw) {
        drawOverlayCanvas = draw;
    };

    this.isEquatorSnapping = function() {
        return snapEquator;
    };

    this.setEquatorSnapping = function(snap) {
        snapEquator = snap;
        this.render();
    };

    this.getCanvasWidth = function() {
        return canvasWidth;
    };

    this.getCanvasHeight = function() {
        return canvasHeight;
    };

    this.getWebGLCanvas = function() {
        return rasterCanvas;
    };

    this.getParent = function() {
        return parent;
    };
}