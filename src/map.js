/*globals RasterLayer, VideoLayer, resizeCanvasElement, clone, TransformedProjection, TransformedLambertAzimuthal, ProjectionFactory, Stats */

// FIXME
var MERCATOR_LIMIT_1, MERCATOR_LIMIT_2;
var MERCATOR_LIMIT_WEB_MAP_SCALE = 6;

// distance of standard parallels from upper and lower border of map
var CONIC_STD_PARALLELS_FRACTION = 1 / 6;

// an height-to-width ratio between formatRatioLimit and 1/formatRatioLimit
// is considered to be square.
var formatRatioLimit = 0.8;

function mouseToCanvasCoordinates(e, parent) {
	"use strict";
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

function AdaptiveMap(parent, canvasWidth, canvasHeight, layers, projectionChangeListener) {
	"use strict";

	// zoom factor limits where projections change
	var zoomLimit1 = 1.5, zoomLimit2 = 2, zoomLimit3 = 3, zoomLimit4 = 4, zoomLimit5 = 6,

	// zoom factor used when the debug option "Zoom Map" is deselected
	DEBUG_ZOOM_FACTOR = 0.5,

	// maximum zoom factor
	MAX_ZOOM_FACTOR = 100,

	// minimum zoom factor
	MIN_ZOOM_FACTOR = 0.05,

	// zoom factor relativ to canvas size. A value of 1 means that the map vertically fills the available canvas space.
	zoomFactor = 0.95,

	// if true, the center of the map and the position of standard parallels are drawn
	debugDrawOverlayCanvas = false,

	// if true, the map adjusts its scale
	debugZoomToMap = true,

	// if true, a wireframe is rendered for raster layers
	debugRenderWireframe = false,

	// if true, the position and extent of the geometry for raster layer are adjusted
	debugAdaptiveResolutionGrid = true,

	// if true, raster images are projected with forward transformation, otherwise with an inverse transformation
	debugForwardRasterProjection = true,
	
	// if true, mipMap is created for texture minification filtering
	debugMipMap = true,
		
	// if true, anisotropic filtering is used for texture sampling if available
	debugAnisotropicFiltering = true,
	
	// Latitude limit between clyindrical and conic projection at large scales
	// Use cylindrical projection between the equator and cylindricalLowerLat
	cylindricalLowerLat = 15 * Math.PI / 180,
	// use transition between cylindricalUpperLat and cylindricalLowerLat
	cylindricalUpperLat = 22 * Math.PI / 180,

	// use azimuthal projection if central latitude is larger (for large scales)
	polarUpperLat = 75 * Math.PI / 180,
	// use transition between polarLowerLat and polarUpperLat
	polarLowerLat = 60 * Math.PI / 180,

	// longitude and latitude of the map center in radians
	mapCenter = {
		lon0 : 0,
		lat0 : 30 / 180 * Math.PI
	},

	// resolution of geometry for raster layer
	geometryResolution = 500, smallScaleMapProjectionName = "Hammer",

	// if true, oblique world projections can be created
	rotateSmallScales = true,

	// if true, the equator snaps to its standard horizontal aspect when dragging
	snapEquator = true,

	// for measuring FPS
	stats = new Stats();
	//stats.setMode( 2 );

	// FIXME
	document.getElementById("FPS").appendChild(stats.domElement);

	// FIXME should not be global
	map = this;

	var MERCATOR_TRANSITION_WIDTH = 0.75; ( function setupMercator() {
			// FIXME: MERCATOR_LIMIT_1 and MERCATOR_LIMIT_2 are not valid when
			// the small scale projection changes, as they are relative to the small-scale graticule height !?

			var mercatorMapSize, smallScaleProjection, graticuleHeight, sf;

			// size of web mercator in pixels at web map scale where the transition to
			// the web mercator projection occurs
			mercatorMapSize = Math.pow(2, 8 + MERCATOR_LIMIT_WEB_MAP_SCALE);

			// height of the adaptive map in coordinates projected with the unary sphere
			smallScaleProjection = ProjectionFactory.getSmallScaleProjection(smallScaleMapProjectionName);
			graticuleHeight = 2 * ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(smallScaleProjection);

			// scale factor to fill the canvas with the projected map
			sf = canvasHeight / graticuleHeight;

			// scale factor where the web mercator is used
			MERCATOR_LIMIT_2 = mercatorMapSize / (Math.PI * 2 * sf);

			// scale factor where the transition towards the web mercator starts
			MERCATOR_LIMIT_1 = MERCATOR_LIMIT_2 - MERCATOR_TRANSITION_WIDTH;
		}());

	function projectionChanged() {
		map.updateProjection();
		projectionChangeListener(map);
		map.render();
	}


	this.getZoomLimits = function(factor) {
		if ( typeof factor !== "number") {
			factor = 1;
		}
		return [zoomLimit1 * factor, zoomLimit2 * factor, zoomLimit3 * factor, zoomLimit4 * factor, zoomLimit5 * factor];
	};

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

	this.setCentralLatitudeAndZoomFactor = function(lat0, zoom) {
		mapCenter.lat0 = Math.max(Math.min(lat0, Math.PI / 2), -Math.PI / 2);
		zoomFactor = Math.max(Math.min(zoom, MAX_ZOOM_FACTOR), MIN_ZOOM_FACTOR);
		projectionChangeListener(map);
		this.render();
	};

	this.setCenter = function(lon0, lat0) {
		mapCenter.lon0 = adjlon(lon0);
		mapCenter.lat0 = Math.max(Math.min(lat0, Math.PI / 2), -Math.PI / 2);
		projectionChangeListener(map);
		this.render();
	};

	this.getZoomFactor = function() {
		return zoomFactor;
	};

	this.setZoomFactor = function(s) {
		zoomFactor = Math.max(MIN_ZOOM_FACTOR, Math.min(s, MAX_ZOOM_FACTOR));
		projectionChangeListener(map);
		this.render();
	};

	this.isUsingWorldMapProjection = function() {
		return zoomFactor < zoomLimit1;
	};

	// Compute scale factor such that the graticule fits vertically onto the canvas.
	function referenceScaleFactor() {
		var smallScaleProjection, graticuleHeight;
		smallScaleProjection = ProjectionFactory.getSmallScaleProjection(smallScaleMapProjectionName);
		graticuleHeight = 2 * ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(smallScaleProjection);
		return canvasHeight / graticuleHeight;
	}

	// invert the offset and map scale applied when rendering the map layers
	this.canvasXYToUnscaledXY = function(x, y) {
		var cx, cy, scale;
		cx = canvasWidth / 2;
		cy = canvasHeight / 2;
		x -= cx;
		y = cy - y;
		scale = referenceScaleFactor() * zoomFactor;
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

		// x = canvas.width / 2 + x * zoomFactor
		// y = canvas.height / 2 - dy - y * zoomFactor
		scale = referenceScaleFactor() * zoomFactor;

		dy = ( typeof proj.getFalseNorthing === 'function') ? proj.getFalseNorthing() : 0;
		centerX = canvasWidth / 2;
		centerY = canvasHeight / 2;
		pt[0] = centerX + pt[0] * scale;
		pt[1] = centerY - (pt[1] + dy) * scale;
		return pt;
	};

	this.updateProjection = function() {

		// The graticule of the transformed Lambert azimuthal projection has an invard pointing wedge
		// when w is between 0.5 and 1. To make sure this wedge is not visible, the zoom factor limit is adjusted
		// where the transformed Lambert azimuthal projection is used.
		var zoomLimit, isLandscape, mapTop, xy;
		zoomLimit = zoomLimit1;
		isLandscape = (canvasHeight / canvasWidth) < formatRatioLimit;
		if (!isLandscape) {
			mapTop = this.canvasXYToUnscaledXY(canvasWidth / 2, 0)[1] * zoomFactor;
			xy = [];
			TransformedLambertAzimuthal.Hammer().forward(0, Math.PI / 2, xy);
			zoomLimit = mapTop / xy[1];
		}

		// FIXME this needs to be simplified
		this.conf = {
			zoomFactor : zoomFactor,
			lon0 : mapCenter.lon0,
			lat0 : mapCenter.lat0,
			lat1 : NaN,
			lat2 : NaN,
			zoomLimit1 : zoomLimit,
			// FIXME zoomLimit2 - zoomLimit1
			zoomLimit2 : zoomLimit + (zoomLimit2 - zoomLimit1),
			zoomLimit3 : zoomLimit3,
			zoomLimit4 : zoomLimit4,
			zoomLimit5 : zoomLimit5,
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
		this.conf.polarUpperLat = ProjectionFactory.polarLatitudeLimitForAlbersConic(this.conf.topPt[1], zoomFactor, polarLowerLat, polarUpperLat);

		return ProjectionFactory.create(this.conf);
	};

	function extendRect(rect, lon, lat) {
		if (lon < rect.west) {
			rect.west = lon;
		}
		if (lat < rect.south) {
			rect.south = lat;
		}
		if (lon > rect.east) {
			rect.east = lon;
		}
		if (lat > rect.north) {
			rect.north = lat;
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
		// increment in pixels
		var INC = 5,

		// bounding box
		bb = {
			west : Number.MAX_VALUE,
			south : Number.MAX_VALUE,
			east : -Number.MAX_VALUE,
			north : -Number.MAX_VALUE
		}, x, y, lonlat, southPoleVisible, northPoleVisible;

		southPoleVisible = isSouthPoleVisible(projection);
		northPoleVisible = isNorthPoleVisible(projection);

		// if a pole is visible, the complete longitude range is visible on the map
		if (northPoleVisible || southPoleVisible) {
			bb.west = -Math.PI + mapCenter.lon0;
			bb.east = Math.PI + mapCenter.lon0;
		}

		if (southPoleVisible) {
			bb.south = -Math.PI / 2;
		}
		if (northPoleVisible) {
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

		// bottom right corner (missed by the two loops above)
		lonlat = map.canvasXY2LonLat(canvasWidth, canvasHeight, projection);
		extendRect(bb, lonlat[0], lonlat[1]);

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

	//False northing is applied to projections. Inverting false northing would be
	//computationally expensive. Enlarged geometry bounding box ensures adaptive
	//geometry covers whole visible window. For 110% bounding box, percent = 1.1
	function enlargeGeometryBoundingBox(geometryBB, percent) {
		var latCenter = (geometryBB.north + geometryBB.south) / 2;
		var range = (geometryBB.north - geometryBB.south) / 2;

		geometryBB.north = latCenter + percent * range;
		geometryBB.south = latCenter - percent * range;
		geometryBB.east *= (percent - 1) / 2 + 1;
		geometryBB.west *= (percent - 1) / 2 + 1;

		// clamp to valid range
		if (geometryBB.west < -Math.PI) {
			geometryBB.west = -Math.PI;
		}
		if (geometryBB.east > Math.PI) {
			geometryBB.east = Math.PI;
		}
		if (geometryBB.south < -Math.PI / 2) {
			geometryBB.south = -Math.PI / 2;
		}
		if (geometryBB.north > Math.PI / 2) {
			geometryBB.north = Math.PI / 2;
		}

		return geometryBB;
	}


	this.render = function(fastRender) {
		if (!Array.isArray(layers)) {
			return;
		}

		stats.begin();

		var projection = this.updateProjection();
		var bb = visibleGeographicBoundingBoxCenteredOnLon0(projection);

		//Geometry projection is different then projection of the map. To create adaptive grid,
		//right (geometry) bounding box needs to be defined and passed to the shaders.
		//Geometry projections differs only in central latitude.
		var poleLatitude = Math.PI / 2, geometryLat0 = 0;
		//cloning projection configurations
		var geometryConf = clone(this.conf);

		//Detecting different polar latitude
		if ( typeof projection.getPoleLat !== 'undefined') {
			poleLatitude = Math.PI - projection.getPoleLat();
		}
		geometryLat0 = geometryConf.lat0 + Math.PI / 2 - poleLatitude;
		//Computing geometry central latitude

		//geometryLat0 is not in right quadrant for negative central latitudes
		//Fixing geometryLat0 for intermediate latitudes (negative central latitude)
		if (geometryLat0 > Math.PI / 2) {
			geometryLat0 = Math.PI - geometryLat0;
		}
		//Fixing geometryLat0 for polar areas (negative central latitude)
		if (geometryLat0 < -Math.PI / 2) {
			geometryLat0 = 2 * Math.PI - geometryLat0;
		}

		//Assigning geometry central latitude to configurations
		geometryConf.lat0 = geometryLat0;

		//Computing geometry bounding box
		var geometryProjection = ProjectionFactory.create(geometryConf);
		var geometryBB = visibleGeographicBoundingBoxCenteredOnLon0(geometryProjection);

		//Due to different false northing values, it is more efficient to simply enlarged
		//geometry bounding box for 10%, in each direction 5%.
		if (zoomFactor >= this.conf.zoomLimit2 && zoomFactor <= this.conf.zoomLimit5) {
			geometryBB = enlargeGeometryBoundingBox(geometryBB, 1.1);
		}

		var ctx = backgroundCanvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);

		var refScaleFactor = referenceScaleFactor();
		var scale = refScaleFactor * ( debugZoomToMap ? zoomFactor : DEBUG_ZOOM_FACTOR);

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
			layer.visibleGeometryBoundingBoxCenteredOnLon0 = geometryBB;

			layer.projection = projection;

			layer.rotation = null;
			if ( projection instanceof TransformedProjection) {
				var poleLat = projection.getPoleLat();
				if (poleLat !== Math.PI / 2) {
					layer.rotation = new SphericalRotation(poleLat);
				}
			}

			layer.mapScale = scale;
			layer.zoomFactor = zoomFactor;
			layer.refScaleFactor = referenceScaleFactor();
			layer.glScale = 2 * refScaleFactor / canvasHeight;
			layer.mapCenter = mapCenter;
			layer.northPoleVisible = isNorthPoleVisible(projection);
			layer.southPoleVisible = isSouthPoleVisible(projection);
			layer.map = this;
			layer.canvasWidth = canvasWidth;
			layer.canvasHeight = canvasHeight;
			layer.render(fastRender, debugZoomToMap);

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
		if (debugDrawOverlayCanvas) {
			var l = 10;
			ctx.beginPath();
			ctx.moveTo(cx - l, cy);
			ctx.lineTo(cx + l, cy);
			ctx.moveTo(cx, cy - l);
			ctx.lineTo(cx, cy + l);
			ctx.stroke();
		}

		// mark standard parallels
		if (debugDrawOverlayCanvas && !isNaN(this.conf.lat1) && !isNaN(this.conf.lat2)) {
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
		if (!debugZoomToMap) {
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
		if (debugDrawOverlayCanvas) {
			var typeSize = 13;
			var txt = canvasWidth + "\u2005\u00D7\u2005" + canvasHeight;
			ctx.font = "normal normal " + typeSize + "px sans-serif";
			var metrics = ctx.measureText(txt);
			ctx.fillText(txt, canvasWidth - metrics.width - typeSize, canvasHeight - typeSize * 0.5);
		}

		stats.end();
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

		if (Array.isArray(layers)) {
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
		zoomFactor /= s;

		if (zoomFactor > MAX_ZOOM_FACTOR) {
			zoomFactor = MAX_ZOOM_FACTOR;
		} else if (zoomFactor < MIN_ZOOM_FACTOR) {
			zoomFactor = MIN_ZOOM_FACTOR;
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
		if (Array.isArray(layers)) {
			for ( i = 0, nLayers = layers.length; i < nLayers; i += 1) {
				layer = layers[i];
				if ( layer instanceof RasterLayer || layer instanceof VideoLayer) {
					layer.canvas = rasterCanvas;
				} else {
					layer.canvas = vectorCanvas;
				}
				layer.projection = projection;
				layer.zoomFactor = zoomFactor;
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
		if (Array.isArray(layers)) {
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
		return debugZoomToMap;
	};

	this.setZoomToMap = function(zoom) {
		debugZoomToMap = zoom;
		projectionChanged();
	};

	this.isDrawingOverlay = function() {
		return debugDrawOverlayCanvas;
	};

	this.setDrawOverlay = function(draw) {
		debugDrawOverlayCanvas = draw;
	};

	this.isRenderingWireframe = function() {
		return debugRenderWireframe;
	};

	this.setRenderWireframe = function(wireframe) {
		debugRenderWireframe = wireframe;
	};

	this.isAdaptiveResolutionGrid = function() {
		return debugAdaptiveResolutionGrid;
	};

	this.setAdaptiveResolutionGrid = function(adaptiveresolutiongrid) {
		debugAdaptiveResolutionGrid = adaptiveresolutiongrid;
	};

	this.isForwardRasterProjection = function() {
		return debugForwardRasterProjection;
	};

	this.setForwardRasterProjection = function(forwardRasterProjection) {
		debugForwardRasterProjection = forwardRasterProjection;
	};

	this.isMipMap = function() {
		return debugMipMap;
	};

	this.setMipMap= function(mipMap) {
		debugMipMap = mipMap;
	};
	
	this.isAnistropicFiltering = function() {
		return debugAnisotropicFiltering;
	};

	this.setAnisotropicFiltering = function(anisotropicFiltering) {
		debugAnisotropicFiltering = anisotropicFiltering;
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

	this.getGeometryResolution = function() {
		return geometryResolution;
	};

	this.setGeometryResolution = function(resolution) {
		var layer, nLayers, i;
		
		geometryResolution = resolution;
		
		if (Array.isArray(layers)) {
			for ( i = 0, nLayers = layers.length; i < nLayers; i += 1) {
				layer = layers[i];
				if ( typeof layer.adjustTesselationDensity === 'function') {
					layer.adjustTesselationDensity();
				}
			}
		}
		this.render();
	};

	this.reloadGeometry = function() {
		var layer, nLayers, i;
		if (Array.isArray(layers)) {
			for ( i = 0, nLayers = layers.length; i < nLayers; i += 1) {
				layer = layers[i];
				if ( typeof layer.reloadGeometry === 'function') {
					layer.reloadGeometry();
				}
			}
		}
	};
}