/**
 * Canters, F. (2002) Small-scale Map projection Design. p. 218-220.
 * Modified Sinusoidal, equal-area.
 */
function Canters2() {"use strict";
	
	var C1 = 1.1481, C3 = -0.0753, C3x3 = 3 * C3, C5 = -0.0150, C5x5 = 5 * C5;

	this.toString = function() {
		return 'Canters Modified Sinusoidal II';
	};

	this.isEqualArea = function() {
		return true;
	};

	this.forward = function(lon, lat, xy) {
		var y2 = lat * lat;
		var y4 = y2 * y2;
		xy[0] = lon * Math.cos(lat) / (C1 + C3x3 * y2 + C5x5 * y4);
		xy[1] = lat * (C1 + C3 * y2 + C5 * y4);
	};

	this.inverse = function(x, y, lonlat) {
		// tolerance for approximating longitude and latitude
		// less than a hundreth of a second
		var TOL = 0.000000001;

		// maximum number of loops
		var MAX_LOOP = 1000;

		var HALFPI = Math.PI * 0.5;
		var counter = 0;
		var dx, dy;
		var lon = 0;
		var lat = 0;
		var xy = [];

		do {
			// forward projection
			this.forward(lon, lat, xy);
			// horizontal difference in projected coordinates
			dx = x - xy[0];
			// add half of the horizontal difference to the longitude
			lon += dx * 0.5;

			// vertical difference in projected coordinates
			if (dy == y - xy[1]) {
				// the improvement to the latitude did not change with this iteration
				// this is the case for polar latitudes
				lat = lat > 0 ? HALFPI : -HALFPI;
				dy = 0;
			} else {
				dy = y - xy[1];
			}

			// add half of the vertical difference to the latitude
			lat += dy * 0.5;

			// to guarantee stable forward projections,
			// latitude must not go beyond +/-PI/2
			if (lat < -HALFPI) {
				lat = -HALFPI;
			}
			if (lat > HALFPI) {
				lat = HALFPI;
			}

			// stop if it is not converging
			if (counter++ === MAX_LOOP) {
				lon = NaN;
				lat = NaN;
				break;
			}

			// stop when difference is small enough
		} while (dx > TOL || dx < -TOL || dy > TOL || dy < -TOL);

		if (lon > Math.PI || lon < -Math.PI || lat > HALFPI || lat < -HALFPI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		}
		lonlat[0] = lon;
		lonlat[1] = lat;
	};

	this.getOutline = function() {
		return GraticuleOutline.pseudoCylindricalOutline(this);
	};

	this.getShaderUniforms = function() {
		return {
			"projectionID" : this.getID()
		};
	};

	this.getID = function() {
		return 38426587; // random number
	};

}