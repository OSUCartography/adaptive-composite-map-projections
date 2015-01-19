function Sinusoidal() {"use strict";

	this.toString = function() {
		return 'Sinusoidal (Equal Area)';
	};

	this.isEqualArea = function() {
		return true;
	};

	this.forward = function(lon, lat, xy) {
		xy[0] = lon * Math.cos(lat);
		xy[1] = lat;
	};

	this.inverse = function(x, y, lonlat) {
		var lon = x / Math.cos(y);
		if (lon > Math.PI || lon < -Math.PI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
		} else {
			lonlat[0] = lon;
			lonlat[1] = y;
		}
	};

	this.getOutline = function() {
		return GraticuleOutline.pointedPoleOutline(this);
	};

	this.getShaderUniforms = function() {
		return {
			"projectionID" : this.getID()
		};
	};

	this.getID = function() {
		return 54008;
	};
}