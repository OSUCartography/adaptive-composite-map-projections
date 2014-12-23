/*globals $, AdaptiveMap, ProjectionDiagram, WebGLDebugUtils, resizeCanvasElement, formatLatitude, formatLongitude */

var map;

$(window).load(function() {
	"use strict";

	var slippyMap, diagram;

	function updateSlippyMap() {
		var w, h, centerLon, centerLat, webMapScale;

		if ( typeof map === 'undefined' || typeof slippyMap === 'undefined') {
			return;
		}

		// adjust the size of the slippy map to the adaptive map
		w = map.getCanvasWidth();
		h = map.getCanvasHeight();
		resizeCanvasElement(document.getElementById('slippyMap'), w, h);

		// allow pre-loading at smaller scales
		if (map.getZoomFactor() < MERCATOR_LIMIT_WEB_MAP_SCALE - 2) {
			return;
		}

		centerLon = map.getCentralLongitude() / Math.PI * 180;
		centerLat = map.getCentralLatitude() / Math.PI * 180;
		slippyMap.setCenter({
			lat : centerLat,
			lon : centerLon
		});

		webMapScale = MERCATOR_LIMIT_WEB_MAP_SCALE + Math.floor(map.getZoomFactor() - MERCATOR_LIMIT_2);
		webMapScale = Math.max(webMapScale, MERCATOR_LIMIT_WEB_MAP_SCALE);
		// FIXME
		//var webMapScale = toWebMapScale(canvasHeight, mapScale);
		webMapScale = Math.floor(webMapScale);
		if (webMapScale !== slippyMap.getZoom()) {
			slippyMap.setZoom(webMapScale);
		}
	}

	function writeProjectionInfo() {
		var projection, infoText, ratio, latText, lonText;

		if ( typeof map === 'undefined') {
			return;
		}

		projection = map.updateProjection();
		infoText = "<B>";
		infoText += projection.toString();
		infoText += "</B><br>";
		infoText += projection.isEqualArea() ? "Equal area" : "Not equal area";
		infoText += "<br><br>";
		infoText += "<B>Zoom Factor</B><br> " + map.getZoomFactor().toFixed(2);
		infoText += "<br>";

		ratio = map.conf.canvasHeight / map.conf.canvasWidth;

		infoText += "<br><B>Canvas Height-to-width Ratio</B><br>" + ratio.toFixed(2);
		if (ratio > 1 / formatRatioLimit) {
			infoText += " (portrait)";
		} else if (ratio < formatRatioLimit) {
			infoText += " (landscape)";
		} else {
			infoText += " (square)";
		}
		infoText += "<br>";

		latText = formatLatitude(map.conf.lat0);
		lonText = formatLongitude(map.conf.lon0);
		infoText += "<br><B>Center of the Map</B>";
		infoText += "<br>Longitude: " + lonText + "<BR>Latitude: " + latText + "<br>";

		document.getElementById('infoText').innerHTML = infoText;
	}

	function adjustVisibility() {
		if ( typeof map === 'undefined' || typeof slippyMap === 'undefined') {
			return;
		}

		var lon0, lat0, slippyMapParent, vectorMapParent;
		slippyMapParent = document.getElementById("slippyMap");
		vectorMapParent = document.getElementById("adaptiveMap");
		if (map.getZoomFactor() > MERCATOR_LIMIT_2) {
			vectorMapParent.style.visibility = 'hidden';
			slippyMapParent.style.visibility = 'visible';
			updateSlippyMap();
		} else {
			if (vectorMapParent.style.visibility === 'hidden') {
				vectorMapParent.style.visibility = 'visible';
				lon0 = slippyMap.getCenter().lon / 180 * Math.PI;
				lat0 = slippyMap.getCenter().lat / 180 * Math.PI;
				map.setCenter(lon0, lat0);
				slippyMapParent.style.visibility = 'hidden';
			}
		}
	}

	function renderMap_Diagram_InfoText(renderDiagramBackground) {
		map.render();
		diagram.renderButton(map.getZoomFactor(), map.getCentralLatitude());
		if (renderDiagramBackground) {
			diagram.render(map.conf);
		}
		//plot projection characteristics on screen
		writeProjectionInfo();
	}

	function updateZoomSlider() {
		try {
			var mapScale = Math.round(map.getZoomFactor() * 100);
			if ($("#zoom-slider").slider('value') !== mapScale) {
				$("#zoom-slider").slider({
					value : mapScale
				});
			}
		} catch (ignore) {
			// FIXME is called before the slider is initialized
		}
	}

	function diagramChangeListener(lat0, mapZoomFactor) {
		if (map.getCentralLatitude() < 0) {
			lat0 = -lat0;
		}
		map.setCentralLatitudeAndZoomFactor(lat0, mapZoomFactor);
		// adjust the zoom slider
		updateZoomSlider();
	}

	function projectionChangeListener(map) {
		var mapScale, lat0;

		mapScale = map.getZoomFactor();
		lat0 = map.getCentralLatitude();
		if (diagram) {
			diagram.renderButton(mapScale, lat0);
		}

		adjustVisibility();
		updateSlippyMap();
		writeProjectionInfo();
		updateZoomSlider();
	}

	function initSlippyMap() {
		var slippyMap, tilejson, parent = document.getElementById('slippyMap');
		if (parent !== null) {

			/*
			// xyz schema
			var template = 'http://spaceclaw.stamen.com/toner/{Z}/{X}/{Y}.png';
			var provider = new MM.TemplatedLayer(template);
			slippyMap = new MM.Map(parent, provider);
			*/

			// tms schema not natively supported by Modestmaps, use wax by mapbox
			tilejson = {
				"version" : "1.0.0",
				"scheme" : "tms",
				"tiles" : ['http://cartography.oregonstate.edu/tiles/naturalearth/{z}/{x}/{y}.png']
			};
			slippyMap = new MM.Map(parent, new wax.mm.connector(tilejson));

			slippyMap.setCenter({
				lat : 0,
				lon : 0
			}).setZoom(0);
		}

		// add event handler to slippy map that handles the transition from slippy map to the adaptive map
		slippyMap.addCallback('zoomed', function(m) {
			var slippyMapParent, vectorMapParent, lon0, lat0;

			slippyMapParent = document.getElementById("slippyMap");
			vectorMapParent = document.getElementById("adaptiveMap");

			if (m.getZoom() <= MERCATOR_LIMIT_WEB_MAP_SCALE && vectorMapParent.style.visibility === 'hidden') {
				lon0 = slippyMap.getCenter().lon / 180 * Math.PI;
				lat0 = slippyMap.getCenter().lat / 180 * Math.PI;
				map.setCenter(lon0, lat0);
				map.setZoomFactor(MERCATOR_LIMIT_2);
				vectorMapParent.style.visibility = 'visible';
				slippyMapParent.style.visibility = 'hidden';
				map.render();
				diagram.renderButton(MERCATOR_LIMIT_2, lat0);
			}
		});

		return slippyMap;
	}

	function writeMouseLonLat(lonText, latText) {
		// longitude and latitude are not correct if the map does not zoom
		if (map.isZoomToMap()) {
			var infoText = "<br><B>Pointer</B>";
			infoText += "<br>Longitude: " + lonText + "<BR>Latitude: " + latText;
			document.getElementById('textMouse').innerHTML = infoText;
		}
	}


	$("#tabs").tabs();

	$("#adaptiveMap").mousemove(function(e) {
		var canvasXY, lonLat, lon, lat;
		if ( typeof map !== 'undefined') {
			canvasXY = mouseToCanvasCoordinates(e, document.getElementById('adaptiveMap'));
			lonLat = map.canvasXY2LonLat(canvasXY.x, canvasXY.y);
			lon = adjlon(lonLat[0]);
			lat = lonLat[1];
			if (lon > Math.PI || lon < -Math.PI || lat > Math.PI / 2 || lat < -Math.PI / 2) {
				writeMouseLonLat("&ndash;", "&ndash;");
			}
			writeMouseLonLat(formatLongitude(lon), formatLatitude(lat));
		}
	});

	$("#adaptiveMap").mouseout(function(e) {
		writeMouseLonLat("&ndash;", "&ndash;");
	});

	// create map
	var w, h, mapId;
	w = $("#adaptiveMap").width();
	h = $("#adaptiveMap").height();
	map = new AdaptiveMap(document.getElementById('adaptiveMap'), w, h, null, projectionChangeListener);
	mapId = document.getElementById("mapSelectionMenu").selectedIndex;
	map.setLayers(getLayers(map)[mapId]);
	new MapEvents(map);

	slippyMap = initSlippyMap();

	// create projection diagram
	diagram = new ProjectionDiagram(document.getElementById('diagram'), diagramChangeListener);

	renderMap_Diagram_InfoText(true);

	// initialize projection selection menu
	document.getElementById('projectionSelectionMenu').onchange = function() {
		var projectionName = document.getElementById('projectionSelectionMenu').value;
		map.setSmallScaleMapProjectionName(projectionName);
		renderMap_Diagram_InfoText(true);
	};
	document.getElementById('projectionSelectionMenu').value = map.getSmallScaleMapProjectionName();

	// initilize check boxes
	document.getElementById("changeScaleCheckbox").checked = map.isZoomToMap();
	document.getElementById("rotateSmallScaleCheckbox").checked = map.isRotateSmallScale();
	document.getElementById("drawOverlayCheckbox").checked = map.isDrawingOverlay();
	document.getElementById("forwardRadioButton").checked = map.isForwardRasterProjection();
	document.getElementById("snapEquatorCheckbox").checked = map.isEquatorSnapping();
	document.getElementById("renderWireframeCheckbox").checked = map.isRenderingWireframe();
	document.getElementById("adaptiveResolutionGridCheckbox").checked = map.isAdaptiveResolutionGrid();

	// add a zoom slider
	$(function() {
		function action(event, ui) {
			if (Math.abs(ui.value / 100 - map.getZoomFactor()) > 0.01) {
				map.setZoomFactor(ui.value / 100);
				renderMap_Diagram_InfoText();
			}
		}


		$("#zoom-slider").slider({
			orientation : "vertical",
			range : "min",
			min : 0,
			max : 2000,
			value : map.getZoomFactor() * 100,
			change : action,
			slide : action
		});
	});

	// add slider for scale limits
	$(function() {
		function writeValue() {
			var txt, scaleLimits, sep = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
			scaleLimits = map.getZoomLimits(1);
			txt = scaleLimits[0].toFixed(2) + sep;
			txt += scaleLimits[1].toFixed(2) + sep;
			txt += scaleLimits[2].toFixed(2) + sep;
			txt += scaleLimits[3].toFixed(2) + sep;
			txt += scaleLimits[4].toFixed(2);
			document.getElementById('scale-limits-text').innerHTML = txt;
		}

		function action(event, ui) {
			ui.values.sort();
			map.getZoomLimits(ui.values, 100);
			writeValue();
			renderMap_Diagram_InfoText(true);
		}


		$("#scale-limits-slider").slider({
			orientation : "horizontal",
			min : 100,
			max : 1000,
			values : map.getZoomLimits(100),
			change : action,
			slide : action
		});
		writeValue();
	});

	// add slider for adjusting the location of standard parallels for conic projections
	$(function() {
		function writeValue() {
			var txt = Math.round(CONIC_STD_PARALLELS_FRACTION * 100) + '%';
			document.getElementById('std-parallels-text').innerHTML = txt;
		}

		function action(event, ui) {
			CONIC_STD_PARALLELS_FRACTION = ui.value / 100;
			writeValue();
			renderMap_Diagram_InfoText(true);
		}


		$("#std-parallels-slider").slider({
			orientation : "horizontal",
			range : "min",
			min : 0,
			max : 50,
			value : CONIC_STD_PARALLELS_FRACTION * 100,
			change : action,
			slide : action
		});
		writeValue();
	});

	// add slider for limit latitudes for cylindrical projection at large scales
	$(function() {
		function writeValue() {

			var txt, cylindricalUpperLat, cylindricalLowerLat;
			cylindricalUpperLat = map.getLargeScaleCylindricalUpperLat();
			cylindricalLowerLat = map.getLargeScaleCylindricalLowerLat();
			txt = '&plusmn;' + Math.round(cylindricalUpperLat / Math.PI * 180) + '&deg;';
			document.getElementById('cylindricalUpperLat-text').innerHTML = txt;
			txt = '&plusmn;' + Math.round(cylindricalLowerLat / Math.PI * 180) + '&deg;';
			document.getElementById('cylindricalLowerLat-text').innerHTML = txt;
		}

		function actionLower(event, ui) {
			map.setLargeScaleCylindricalLowerLat(ui.value * Math.PI / 180);
			writeValue();
			renderMap_Diagram_InfoText(true);
		}

		function actionUpper(event, ui) {
			map.setLargeScaleCylindricalUpperLat(ui.value * Math.PI / 180);
			writeValue();
			renderMap_Diagram_InfoText(true);
		}


		$("#cylindricalLowerLat-slider").slider({
			orientation : "horizontal",
			range : "min",
			min : 0,
			max : 90,
			value : map.getLargeScaleCylindricalLowerLat() / Math.PI * 180,
			change : actionLower,
			slide : actionLower
		});
		$("#cylindricalUpperLat-slider").slider({
			orientation : "horizontal",
			range : "min",
			min : 0,
			max : 90,
			value : map.getLargeScaleCylindricalUpperLat() / Math.PI * 180,
			change : actionUpper,
			slide : actionUpper
		});
		writeValue();
	});

	// add slider for limit latitudes for cylindrical projection at large scales
	$(function() {
		function writeValue() {
			var upperLat, lowerLat, txt;
			upperLat = map.getLargeScalePolarUpperLat();
			lowerLat = map.getLargeScalePolarLowerLat();
			txt = '&plusmn;' + Math.round(upperLat / Math.PI * 180) + '&deg;';
			document.getElementById('polarUpperLat-text').innerHTML = txt;
			txt = '&plusmn;' + Math.round(lowerLat / Math.PI * 180) + '&deg;';
			document.getElementById('polarLowerLat-text').innerHTML = txt;
		}

		function actionLower(event, ui) {
			map.setLargeScalePolarLowerLat(ui.value * Math.PI / 180);
			writeValue();
			renderMap_Diagram_InfoText(true);
		}

		function actionUpper(event, ui) {
			map.setLargeScalePolarUpperLat(ui.value * Math.PI / 180);
			writeValue();
			renderMap_Diagram_InfoText(true);
		}


		$("#polarUpperLat-slider").slider({
			orientation : "horizontal",
			range : "min",
			min : 0,
			max : 90,
			value : map.getLargeScalePolarUpperLat() / Math.PI * 180,
			change : actionUpper,
			slide : actionUpper
		});
		$("#polarLowerLat-slider").slider({
			orientation : "horizontal",
			range : "min",
			min : 0,
			max : 90,
			value : map.getLargeScalePolarLowerLat() / Math.PI * 180,
			change : actionLower,
			slide : actionLower
		});
		writeValue();
	});

	//add slider to adjust the grid cellsize of the adaptive resolution grid in the debug tab
	$(function() {
		function action(event, ui) {
			map.setNumberOfTrianglesAlongEquator(ui.value);
		}


		$("#geometry-resolution-slider").slider({
			orientation : "horizontal",
			range : "min",
			min : 2,
			max : 500,
			value : 500,
			change : action,
			slide : action
		});
	});

	// make map resizable
	$(document).ready(function() {
		$("#resizable_map_container").resizable({
			autoHide : false,
			minHeight : 230,
			create : function(event, ui) {
				this.style.width = this.width = map.getCanvasWidth();
				this.style.height = this.height = map.getCanvasHeight();
			},
			resize : function(event, ui) {
				var w = ui.size.width, h = ui.size.height;
				map.resizeMap(w, h);
				resizeCanvasElement(document.getElementById('slippyMap'), w, h);
				renderMap_Diagram_InfoText(true);
			}
		});
	});

	$("#rotateSmallScaleCheckbox").on("click", function() {
		map.setRotateSmallScales(this.checked);
		map.render();
		diagram.renderButton(map.getZoomFactor(), map.getCentralLatitude());
	});

	$("#changeScaleCheckbox").on("click", function() {
		map.setZoomToMap(this.checked);
	});

	$("#drawOverlayCheckbox").on("click", function() {
		map.setDrawOverlay(this.checked);
		map.render();
	});

	$("#forwardRadioButton").on("click", function() {
		map.setForwardRasterProjection(this.checked);
		map.reloadData();
		map.render();
		$("#adaptiveResolutionGridCheckbox").prop("disabled", false);
		$("#renderWireframeCheckbox").prop("disabled", false);
		$('#geometry-resolution-slider').slider({
			disabled : false
		});
	});

	$("#inverseRadioButton").on("click", function() {
		map.setForwardRasterProjection(!this.checked);
		map.reloadData();
		map.render();
		$("#adaptiveResolutionGridCheckbox").prop("disabled", true);
		$("#renderWireframeCheckbox").prop("disabled", true);
		map.setRenderWireframe(false);
		$("#renderWireframeCheckbox").prop("checked", false);
		$('#geometry-resolution-slider').slider({
			disabled : true
		});
	});

	$("#mipMapCheckbox").on("click", function() {
		map.setMipMap(this.checked);
		map.reloadData();
		map.render();
		$("#anisotropicFilteringCheckbox").prop("disabled", !this.checked);
	});
	
	$("#anisotropicFilteringCheckbox").on("click", function() {
		map.setAnisotropicFiltering(this.checked);
		map.reloadData();
		map.render();
	});

	$("#renderWireframeCheckbox").on("click", function() {
		map.setRenderWireframe(this.checked);
		map.render();
	});

	$("#adaptiveResolutionGridCheckbox").on("click", function() {
		map.setAdaptiveResolutionGrid(this.checked);
		map.render();
	});

	$("#snapEquatorCheckbox").on("click", function() {
		map.setEquatorSnapping(this.checked);
	});

	$("#mapSelectionMenu").on("change", function() {
		var mapId = this.selectedIndex;
		map.pauseVideo();
		map.setLayers(getLayers(map)[mapId]);
		map.playVideo();
		map.render();
	});

	$("#email").on("click", function() {

		var projection, email, subject, infoText, body_center, body_scale, body_projection, map_name, body_name, body_rotate, mailto_link;

		projection = map.updateProjection();

		email = "jennyb@geo.oregonstate.edu";
		subject = "Adaptive Composite Map - Problem Report";
		infoText = "Problem: [Please describe the problem here]";
		body_center = "%0A%0ACurrent Settings%0ACentral longitude: " + (map.conf.lon0 / Math.PI * 180) + "%0A Central latitude: " + (map.conf.lat0 / Math.PI * 180);
		body_scale = "%0AScale: " + map.getZoomFactor();
		body_projection = "%0AProjection: " + projection.toString();
		map_name = document.getElementById('mapSelectionMenu');
		body_name = "%0AMap: " + map_name.options[map_name.selectedIndex].text;
		body_rotate = "%0ARotation: " + map.isRotateSmallScale();
		mailto_link = "mailto:" + email + "?subject=" + subject + "&body=" + infoText + body_center + body_scale + body_projection + body_name + body_rotate;
		window.location.href = mailto_link;
	});

	$("#lostContextButton").on("click", function() {
		if ( typeof WebGLDebugUtils !== 'undefined') {
			map.getWebGLCanvas().loseContext();
		} else {
			alert("webgl-debug.js not loaded");
		}
	});

	$("#buildTime").text(adaptiveCompositeMapBuildTimeStamp);

}); 