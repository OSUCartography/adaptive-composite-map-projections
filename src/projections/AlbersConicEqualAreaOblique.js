function AlbersConicEqualAreaOblique(dy) {"use strict";
	
	var c, rho0, n, n2;
	var HALFPI = Math.PI / 2;
	var EPS10 = 1.0e-10;
	var lat0, lat1, lat2;

	// position of pole
	var sinLatPole = 1;
	var cosLatPole = 0;
	var poleLat = HALFPI;

	this.toString = function() {
		return 'Albers Conic Equal Area Oblique (&Phi;\u2081=' + formatLatitude(this.lat1) + ' &Phi;\u2082=' + formatLatitude(this.lat2) + ', pole at ' + formatLatitude(poleLat) + ")";
	};

	this.isEqualArea = function() {
		return true;
	};

	this.getPoleLat = function() {
		return poleLat;
	};

	this.initialize = function(conf) {

		this.lat0 = conf.lat0;
		this.lat1 = conf.lat1;
		this.lat2 = conf.lat2;

		var lat0 = conf.lat0;
		var lat1 = conf.lat1;
		var lat2 = conf.lat2;
		
		if (Math.abs(lat1 + lat2) < EPS10) {
			// FIXME
			console.log("standard latitudes of Albers conic too close to equator");
			n = NaN;
			return;
		}
		var cosPhi1 = Math.cos(lat1);
		var sinPhi1 = Math.sin(lat1);
		var secant = Math.abs(lat1 - lat2) >= EPS10;
		if (secant) {
			n = 0.5 * (sinPhi1 + Math.sin(lat2));
		} else {
			n = sinPhi1;
		}
		n2 = 2 * n;
		c = cosPhi1 * cosPhi1 + n2 * sinPhi1;
		rho0 = Math.sqrt(c - n2 * Math.sin(lat0)) / n;
		poleLat = conf.poleLat;
		sinLatPole = Math.sin(poleLat);
		cosLatPole = Math.cos(poleLat);
	};

	this.forward = function(lon, lat, xy) {

		// oblique transformation on sphere
		var sinLon = Math.sin(lon);
		var cosLon = Math.cos(lon);
		var sinLat = Math.sin(lat);
		var cosLat = Math.cos(lat);
		var cosLat_x_cosLon = cosLat * cosLon;
		lon = adjlon(aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat));
		sinLat = sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon;

		// make sure sinLat is in valid range of +/-1
		if (sinLat > 1) {
			sinLat = 1;
		} else if (sinLat < -1) {
			sinLat = -1;
		}

		// projection with normal aspect applied to rotated coordinates
		var rho = c - n2 * sinLat;
		if (rho < 0) {
			xy[0] = NaN;
			xy[1] = NaN;
			console.log("Albers Conic NaN2: " + rho + " " + absSinLat + " " + lon / Math.PI * 180 + " " + lat / Math.PI * 180);
			// FIXME
			return;
		}
		rho = Math.sqrt(rho) / n;
		var n_x_lon = n * lon;
		xy[0] = rho * Math.sin(n_x_lon);
		xy[1] = rho0 - rho * Math.cos(n_x_lon);
	};

	this.inverse = function(x, y, lonlat) {

		var rho, phi, lon;
		var sinLon, cosLon, sinLat, cosLat;
		y -= dy;
		y = rho0 - y;
		rho = Math.sqrt(x * x + y * y);
		if (rho === 0) {
			// lon = 0
			sinLon = 0;
			cosLon = 1;
			// lat = +/- PI/2
			cosLat = 0;
			sinLat = n > 0 ? 1 : -1;
		} else {
			phi = rho * n;
			phi = (c - phi * phi) / n2;
			if (Math.abs(phi) <= 1) {
				cosLat = Math.sqrt(1 - phi * phi);
				sinLat = phi;
			} else {
				// lat = +/- PI/2
				cosLat = 0;
				sinLat = phi < 0 ? -1 : 1;
			}
			if (n < 0) {
				lon = Math.atan2(-x, -y) / n;
			} else {
				lon = Math.atan2(x, y) / n;
			}
			sinLon = Math.sin(lon);
			cosLon = Math.cos(lon);
		}

		// oblique transformation on sphere
		var cosLat_x_cosLon = cosLat * cosLon;
		lonlat[0] = aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon - cosLatPole * sinLat);
		lonlat[1] = aasin(sinLatPole * sinLat + cosLatPole * cosLat_x_cosLon);
	};

	this.getOutline = function() {
		var albers = new AlbersConicEqualArea();
		albers.initialize({
			lat0 : this.lat0,
			lat1 : this.lat1,
			lat2 : this.lat2
		});
		return albers.getOutline();
	};

	this.getShaderUniforms = function() {
		var invertedPoleLat, sinP, cosP;
		
		invertedPoleLat = Math.PI - poleLat;
		sinP = Math.sin(invertedPoleLat);
		cosP = Math.cos(invertedPoleLat);
       	return {
			"projectionID" : this.getID(),
			"albersC" : c,
			"albersRho0" : rho0,
			"albersN" : n,
			"sinLatPole" : sinP,
			"cosLatPole" : cosP,
			"falseNorthing" : dy
		};
	};

	this.getID = function() {
		return 11;
	};

	this.getFalseNorthing = function() {
		return dy;
	};
}