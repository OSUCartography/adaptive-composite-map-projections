/**
 * A polynomial version of the Robinson projection.
 * Canters, F., Decleir, H. 1989. The world in perspective – A directory of world map projections. Chichester, John Wiley and Sons: p. 143.
 */

function Robinson() {"use strict";

	this.toString = function() {
		return 'Robinson';
	};
	
	this.isEqualArea = function() {
		return false;
	};
	
	this.forward = function(lon, lat, xy) {
		var lat2 = lat * lat;
		xy[0] = lon * (0.8507 - lat2 * (0.1450 + lat2 * 0.0104));
		xy[1] = lat * (0.9642 - lat2 * (0.0013 + lat2 * 0.0129));
	};

	this.inverse = function(x, y, lonlat) {
		var MAX_Y = 2.177373642906054896455689671878, MAX_ITERATION = 50, EPS = 1e-7, yc, tol, y2, y4, f, fder, iterationCounter;

		if (y > MAX_Y) {
			yc = Math.PI / 2;
		} else if (y < -MAX_Y) {
			yc = -Math.PI / 2;
		} else {
			iterationCounter = 0;
			// compute latitude with Newton's method
			yc = y;
			do {
				if (iterationCounter > MAX_ITERATION) {
					lonlat[0] = NaN;
					lonlat[1] = NaN;
					return;
				}

				y2 = yc * yc;
				f = (yc * (0.9642 - y2 * (0.0013 + y2 * 0.0129))) - y;
				fder = 0.9642 - y2 * (0.0013 * 3 + y2 * 0.0129 * 5);
				yc -= tol = f / fder;

				iterationCounter += 1;
			} while (Math.abs(tol) > EPS);
		}

		if (yc > Math.PI / 2 || yc < -Math.PI / 2) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		}
		lonlat[1] = yc;

		// compute longitude
		y2 = yc * yc;
		x /= 0.8507 - y2 * (0.1450 + y2 * 0.0104);
		if (x > Math.PI || x < -Math.PI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
		} else {
			lonlat[0] = x;
		}
	};

	this.getOutline = function() {
		return GraticuleOutline.pseudoCylindricalOutline(this);
	};

	this.getShaderUniforms = function() {
		return {
			"projectionID" : this.getID(),
		};
	};

	this.getID = function() {
		return 54030;
	};

}