function pointsDegreeToRadian(records) {
	var i, nRecords, c = Math.PI / 180, shp;
	for ( i = 0, nRecords = records.length; i < nRecords; i += 1) {
		shp = records[i].shape;
		shp.x *= c;
		shp.y *= c;
	}
}

function linesDegreeToRadian(records) {

	var c = Math.PI / 180, nRecords, nRings, nVertices, i, j, ring, k, lon, lat, xMin, xMax, yMin, yMax, shp;
	for ( i = 0, nRecords = records.length; i < nRecords; i += 1) {
		shp = records[i].shape;
		xMin = Number.MAX_VALUE;
		xMax = -Number.MAX_VALUE;
		yMin = Number.MAX_VALUE;
		yMax = -Number.MAX_VALUE;

		for ( j = 0, nRings = shp.rings.length; j < nRings; j += 1) {
			ring = shp.rings[j];
			for ( k = 0, nVertices = ring.length; k < nVertices; k += 2) {
				lon = ring[k] * c;

				if (lon > xMax) {
					xMax = lon;
				}
				if (lon < xMin) {
					xMin = lon;
				}
				ring[k] = lon;

				lat = ring[k + 1] * c;

				// clamp to +/-PI/2
				//FIXME: is this needed or not?
				if (lat > Math.PI / 2) {
					lat = Math.PI / 2;
				} else if (lat < -Math.PI / 2) {
					lat = -Math.PI / 2;
				}

				if (lat > yMax) {
					yMax = lat;
				}
				if (lat < yMin) {
					yMin = lat;
				}
				ring[k + 1] = lat;
			}
		}
		shp.box.xMin = xMin;
		shp.box.xMax = xMax;
		shp.box.yMin = yMin;
		shp.box.yMax = yMax;
	}
}

function removePoleBox(records) {

	var EPS = 1.0e-6;

	// FIXME remove variable
	var c = Math.PI / 180, nRecords, nRings, nVertices, i, j, ring, k, lon, lat, xMin, xMax, yMin, yMax, shp, lat;
	for ( i = 0, nRecords = records.length; i < nRecords; i += 1) {
		shp = records[i].shape;

		// FIXME do the same for the north pole

		// FIXME search for two consecutive points on the pole
		
		if (Math.abs(shp.box.yMin + Math.PI / 2) < EPS) {
			
			shp.ringsWithPoleBox = [];
			
			for ( j = 0, nRings = shp.rings.length; j < nRings; j += 1) {
				ring = shp.rings[j];
				
				
				// copy original
				shp.ringsWithPoleBox[j] = ring.slice(0);
				// FIXME: use this for point-in-polygon test for the azimuthal projecion
				// FIXME optionally move this to the clipping algorithm
				for ( k = 0, nVertices = ring.length; k < nVertices; k += 2) {
					lat = ring[k + 1];
					if (Math.abs(lat + Math.PI / 2) < EPS) {
						ring.splice(k, 2);
						k -= 2;
					}
				}
				
			}
			
		}
	}
}

function loadGeoJson(data) {

	data = JSON.parse(data);

	var degToRad = Math.PI / 180;
	var geometry = [];
	var attributes = {
		fieldNames : [],
		fields : []
	};
	var i, j;
	for ( i = 0; i < data.features.length; i += 1) {
		var f = data.features[i];
		var geom = f.geometry;
		if (geom.type === "MultiLineString") {
			var xMin = Number.MAX_VALUE;
			var xMax = -Number.MAX_VALUE;
			var yMin = Number.MAX_VALUE;
			var yMax = -Number.MAX_VALUE;

			var line = {
				box : {},
				rings : [],
				type : null
			};

			var ring = [];
			var coords = geom.coordinates[0];
			for ( j = 0; j < coords.length; j += 1) {
				var pt = coords[j];
				var lon = pt[0];
				var lat = pt[1];
				if (lon > xMax) {
					xMax = lon;
				}
				if (lon < xMin) {
					xMin = lon;
				}
				if (lat > yMax) {
					yMax = lat;
				}
				if (lat < yMin) {
					yMin = lat;
				}

				ring.push(lon * Math.PI / 180);
				ring.push(lat * Math.PI / 180);
			}
			line.rings.push(ring);
			line.type = ShpType.SHAPE_POLYLINE;
			line.box.xMin = xMin * Math.PI / 180;
			line.box.xMax = xMax * Math.PI / 180;
			line.box.yMin = yMin * Math.PI / 180;
			line.box.yMax = yMax * Math.PI / 180;
			geometry.push(line);
		}
	}

	gLayer.geometry = geometry;
	gLayer.featureType = ShpType.SHAPE_POLYLINE;
	gLayer.attributes = attributes;
	map.render();
}

function wfsReaderCrossServer() {

	var webAddress = "http://cartography.geo.oregonstate.edu:8085/geoserver/ows";
	var wfsRequest = "?service=WFS&version=1.0.0&request=GetFeature&typeName=";
	var layerName = "naturalearth:ne_110m_rivers_lake_centerlines";
	var JSONP_GEOSERVER = "&outputFormat=json&format_options=callback:loadGeoJson";

	var geoJsonUrl = webAddress + wfsRequest + layerName + JSONP_GEOSERVER;
	$.ajax({
		url : geoJsonUrl,
		dataType : 'jsonp'
	});
}

function wfsReader(url) {
	var url = "http://cartography.geo.oregonstate.edu:8085/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=naturalearth:ne_110m_rivers_lake_centerlines&outputFormat=json";
	loadData(url, loadGeoJson);
}

function shapefileReader(url, layerLoadCallback) {

	var geometry, featureType, attributes;

	function onShpFail() {
		throw ('Failed to load geometry of shapefile at ' + url);
	}

	function onDbfFail() {
		throw ('Failed to load attributes of shapefile at ' + url);
	}

	function onShpComplete(oHTTP) {
		var i, shpFile = new ShpFile(oHTTP.binaryResponse);

		// convert geometry from degrees to radians
		var shapeType = shpFile.header.shapeType;
		if (shapeType === ShpType.SHAPE_POLYGON || shapeType == ShpType.SHAPE_POLYLINE) {
			linesDegreeToRadian(shpFile.records);
			removePoleBox(shpFile.records);
		} else if (shapeType === ShpType.SHAPE_POINT) {
			pointsDegreeToRadian(shpFile.records);
		}
		geometry = [];
		for ( i = 0, nShapes = shpFile.records.length; i < nShapes; i += 1) {
			geometry.push(shpFile.records[i].shape);
		}
		featureType = shpFile.header.shapeType;
		if (attributes) {
			layerLoadCallback(geometry, featureType, attributes);
		}
	}

	function onDbfComplete(oHTTP) {
		var fieldID, recordID, dbfFile = new DbfFile(oHTTP.binaryResponse);
		attributes = {
			fieldNames : [],
			fields : []
		};

		for ( fieldID = 0, nFields = dbfFile.header.fields.length; fieldID < nFields; fieldID += 1) {
			var fieldName = dbfFile.header.fields[fieldID].name;
			attributes.fieldNames.push(fieldName);
			var column = [];
			for ( recordID = 0, nRecords = dbfFile.header.recordCount; recordID < nRecords; recordID += 1) {
				column.push(dbfFile.records[recordID].values[fieldName]);
			}
			attributes.fields.push(column);
		}

		if (geometry) {
			layerLoadCallback(geometry, featureType, attributes);
		}
	}

	new BinaryAjax(url + '.shp', onShpComplete, onShpFail);
	new BinaryAjax(url + '.dbf', onDbfComplete, onDbfFail);
}

function AbstractLayer(style, scaleVisibility) {"use strict";

	this.style = style;

	// interpolated scale-dependent line width. Use instead of this.style.lineWidth
	this.lineWidth = null;

	this.applyStyle = function(ctx) {
		var p;

		if (this.style instanceof Object) {
			for (p in this.style) {
				if (this.style.hasOwnProperty(p) && !p.startsWith('AM_')) {
					ctx[p] = this.style[p];
				}
			}
		}

		if (style.hasOwnProperty("lineWidth")) {
			// interpolate scale-dependent line width if a series of values is specified
			this.lineWidth = AbstractLayer.getScaleInterpolatedValue(style.lineWidth, "width", this.zoomFactor);
			ctx.lineWidth = this.lineWidth / this.mapScale;
		}
	};
	
	this.getVerticalShift = function() {
		if (typeof this.projection.getFalseNorthing === 'function') {
			return this.projection.getFalseNorthing();
		} else {
			return 0;
		}
	};
	
	this.setupTransformation = function(ctx, canvasWidth, canvasHeight) {
		// setup a transformation corresponding to
		// x = canvas.width / 2 + x * mapScale
		// y = canvas.height / 2 - dy - y * mapScale
		var dy = this.getVerticalShift() * this.mapScale;
		ctx.setTransform(this.mapScale, 0, 0, -this.mapScale, this.canvas.width / 2, this.canvas.height / 2 - dy);
	};

	this.isVisible = function() {
		if ( scaleVisibility instanceof Object === false) {
			return true;
		}
		if (this.zoomFactor < scaleVisibility.layerMinScale || this.zoomFactor >= scaleVisibility.layerMaxScale) {
			return false;
		}
		return true;
	};

	/**
	 * Returns whether a point in geographic coordinates is inside the bounding box around the viewport
	 *  in geographic coordinates. This is not a rectangle on the map, but a quadrilateral on the sphere, which surrounds the map.
	 */
	this.isPointInGeographicBoundingBox = function(lon, lat) {
		var viewPortBB = this.visibleGeographicBoundingBoxCenteredOnLon0, lon0 = this.mapCenter.lon0;
		lon = adjlon(lon - lon0);
		return !(lat > viewPortBB.north || lat < viewPortBB.south || lon > viewPortBB.east || lon < viewPortBB.west);
	};

	this.load = function(m) {
	};

	this.drawCircle = function(ctx, xy, r) {
		ctx.beginPath();
		ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2, false);
		ctx.closePath();
	};

	/**
	 * Linearly interpolates a value with scale. The value is defined by a series of
	 * scale - value pairs stored in an array.
	 */
	AbstractLayer.getScaleInterpolatedValue = function(values, valName, zoomFactor) {

		var rec1, rec2, i, w;

		// interpolate dimension with scale
		if (Array.isArray(values)) {
			if (values.length === 0) {
				return undefined;
			}
			if (values.length === 1) {
				return values[0][valName];
			}

			// map scale is larger than the largest scale in the input array
			if (zoomFactor > values[values.length - 1].scale) {
				return values[values.length - 1][valName];
			}

			// interpolate value
			for ( i = values.length - 2; i >= 0; i -= 1) {
				rec1 = values[i];
				if (zoomFactor >= rec1.scale) {
					rec2 = values[i + 1];
					w = (zoomFactor - rec1.scale) / (rec2.scale - rec1.scale);
					return (1 - w) * rec1[valName] + w * rec2[valName];
				}
			}
		}

		return values;
	};

	this.getAttributeFieldID = function(fieldName) {
		var i, nFieldNames;
		for ( i = 0, nFieldNames = this.attributes.fieldNames.length; i < nFieldNames; i += 1) {
			if (this.attributes.fieldNames[i] === fieldName) {
				return i;
			}
		}
		return -1;
	};

	this.getAttributeField = function(fieldName) {
		var fieldID = this.getAttributeFieldID(fieldName);
		if (fieldID >= 0) {
			return this.attributes.fields[fieldID];
		}
		return null;
	};
	
}