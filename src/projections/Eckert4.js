function Eckert4() {"use strict";

	var C_x = 0.42223820031577120149;
	var C_y = 1.32650042817700232218;
	var C_p = 3.57079632679489661922;
	var EPS = 1.0e-7;
	var NITER = 6;
	var ONE_TOL = 1.00000000000001;
	var HALFPI = Math.PI / 2;

	this.toString = function() {
		return 'Eckert IV';
	};

	this.isEqualArea = function() {
		return true;
	};

	this.forward = function(lon, lat, xy) {

		var p, V, s, c, i;
		p = C_p * Math.sin(lat);
		V = lat * lat;
		lat *= 0.895168 + V * (0.0218849 + V * 0.00826809);
		for ( i = NITER; i > 0; --i) {
			c = Math.cos(lat);
			s = Math.sin(lat);
			lat -= V = (lat + s * (c + 2) - p) / (1 + c * (c + 2) - s * s);
			if (Math.abs(V) < EPS) {
				xy[0] = C_x * lon * (1 + Math.cos(lat));
				xy[1] = C_y * Math.sin(lat);
				return;
			}
		}
		xy[0] = C_x * lon;
		xy[1] = lat < 0 ? -C_y : C_y;
	};

	this.inverse = function(x, y, lonlat) {
		// arcsine with tolerance
		var v = y / C_y;
		var abs = Math.abs(v);
		if (abs >= 1) {
			if (abs >= ONE_TOL) {
				lonlat[0] = NaN;
				lonlat[1] = NaN;
				return;
			} else {
				y = v < 0 ? -HALFPI : HALFPI;
			}
		} else {
			y = Math.asin(v);
		}

		var c = Math.cos(y);
		var lon = x / (C_x * (1 + (c)));
		if (lon > Math.PI || lon < -Math.PI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		} else {
			lonlat[0] = lon;
		}

		// arcsine with tolerance
		v = (y + Math.sin(y) * (c + 2)) / C_p;
		if ( abs = Math.abs(v) >= 1) {
			if (abs >= ONE_TOL) {
				lonlat[0] = NaN;
				lonlat[1] = NaN;
				return;
			} else {
				lonlat[1] = v < 0 ? -HALFPI : HALFPI;
			}
		} else {
			lonlat[1] = Math.asin(v);
		}
	};

	this.getOutline = function() {
		return GraticuleOutline.pseudoCylindricalOutline(this);
	};
}